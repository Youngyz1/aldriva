# Events Security

This document summarizes the security properties that the Events implementation currently depends on.

Related docs:

- [Architecture](./architecture.md)
- [Database Schema](./database-schema.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Event Team RBAC](./event-team-rbac.md)
- [Payments](./payments.md)
- [Future Roadmap](./future-roadmap.md)

## Security Model Summary

Events uses three layers of protection:

1. authentication
2. authorization
3. data-layer constraints and atomic functions

The important rule is that the frontend is not treated as the security boundary.

## Security Properties

| Threat | Protection | Where enforced | Relevant tests |
| --- | --- | --- | --- |
| Unauthenticated dashboard access | `getCurrentUser`, `getDashboardContext`, and route-level redirects | `lib/auth.ts`, server components, dashboard API context | `scratch/test_navigation_and_staff_access.mjs` |
| Suspended-user access | profile status check before dashboard access | `lib/auth.ts`, `lib/dashboard-api.ts` | inspection only |
| Ticket lookup enumeration | guest lookup rate limit plus buyer-email match | `app/api/my-tickets/route.ts`, `lib/rate-limit.ts` | `scratch/test_phase2_relocation_and_security.mjs` |
| Wrong-event check-in | event ID match before scan RPC | `app/api/verify-ticket/route.ts` | `scratch/test_phase4_scanner_and_dashboard.mjs` |
| Duplicate scan | atomic `check_in_ticket(...)` update on `ticket_instances` | `db/migration_79_ticket_instances.sql` | `scratch/test_migration_79.mjs` |
| Replay of webhook delivery | idempotent payment fulfillment and unique payment intent index | `app/api/webhooks/stripe/route.ts`, `db/migration_72_ledger_credit_rpcs.sql`, `db/schema.sql` | `scratch/test_phase3_multi_ticket_checkout.mjs` |
| Invitation impersonation | invitation email must match the signed-in user email exactly | `app/api/events/team/accept/route.ts` | `scratch/test_phase2_relocation_and_security.mjs` |
| Invitation token leakage | token column is not readable by anon/authenticated roles | `db/migration_76_event_team_and_invitations.sql` | inspection only |
| QR reuse after check-in | instance status changes to `used` and the RPC rejects reuse | `db/migration_79_ticket_instances.sql` | `scratch/test_phase4_scanner_and_dashboard.mjs` |
| Refunding a used ticket | refund RPC rejects used instances | `db/migration_79_ticket_instances.sql` | `scratch/test_migration_79.mjs` |
| Ledger mutation | append-only trigger blocks update and delete | `db/migration_71_recipient_ledger_entries.sql` | inspection only |

## Authentication

### Signed-in users

Signed-in users are resolved through Supabase Auth.

Important helpers:

- `lib/auth.ts` for current user and profile checks
- `lib/dashboard-context.ts` for organizer-scoped dashboard access
- `lib/dashboard-api.ts` for API routes that need organizer scoping

### Guest users

Guest order lookup is intentionally public, but it is not anonymous in the sense of being free to query any order.

It requires:

- order ID or QR code
- buyer email

It is rate-limited and validated on the server.

## Authorization

### Organizer access

Organizer access is based on:

- direct ownership
- delegated organizer membership

### Event access

Event access is based on:

- direct event creation
- organizer ownership
- delegated organizer membership
- event team membership

The helper `hasEventOrOrganizerAccess(...)` is the shared rule set.

### Event-manager versus scanner access

The scanner route requires scanner-capable access.

The check-in analytics route requires event-manager access.

The event-team management route also requires event-manager access.

## RLS

### Confirmed policy surfaces

- `events` has public read and owner-based mutation behavior
- `organizers` has public read and owner-based mutation behavior
- `entity_members` is owner/member/admin scoped
- `event_team_members` and `event_team_invitations` are event-scoped
- `ticket_instances` is buyer-email plus event-team plus admin scoped
- `ticket_checkins` is organizer and event-manager scoped
- `recipient_ledger_entries` is owner/admin scoped
- `payment_reconciliation_failures` is admin scoped

### Policy gaps that need re-verification

The reviewed migration set did not surface an explicit policy body for:

- `ticket_orders`
- `venue_layouts`
- `seats`

That does not mean the live database lacks policies. It means the reviewed exports did not confirm them.

If you change these tables, verify the live policy surface before assuming browser writes will still work.

## QR Security

QR codes are opaque identifiers, not dynamic secrets.

Security comes from:

- event ownership checks
- scan permission checks
- instance status checks
- atomic state changes

There is no offline trust mode in the current implementation.

## Staff Invitation Security

Invitation security depends on:

- token secrecy
- email-match verification
- expiry enforcement
- atomic accept and revoke updates

The token column is protected from direct client reads in the reviewed migration.

## Rate Limiting

The current app-level rate limiter is used for:

- payment intent creation
- guest order lookup

The guest lookup budget is the important Events-specific control because it reduces QR/order enumeration risk.

## Concurrency Safety

The ticket-check-in path is safe under concurrent scans because the state change happens in a single database update conditioned on `status = 'valid'`.

That is the core protection against duplicate check-ins.

## Refund Restrictions

The refund RPC refuses:

- missing tickets
- used tickets
- already-refunded tickets
- cancelled tickets

That prevents a successful scan from being silently refunded through the ticket-instance primitive.

## Test Coverage Notes

The most relevant verification scripts are:

- `scratch/test_phase2_relocation_and_security.mjs`
- `scratch/test_phase4_scanner_and_dashboard.mjs`
- `scratch/test_navigation_and_staff_access.mjs`
- `scratch/test_migration_79.mjs`

They cover:

- guest lookup security
- invitation acceptance
- scanner authorization
- wrong-event rejection
- duplicate check-in rejection

## Open Concerns

- The seat and venue-layout policy surface was not confirmed in the reviewed migrations.
- Free-ticket and NOWPayments ticket flows still use order-level fulfillment.
- The attendee roster remains order-centric, so it does not fully mirror instance-level attendance behavior.
- Offline scanning is not present.

