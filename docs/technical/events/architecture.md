# Aldriva Events Architecture

## Scope

This document explains how Events works across the frontend, API layer, database, payment flow, QR handling, check-in, and event-team authorization.

Related docs:

- [Database Schema](./database-schema.md)
- [Ticket Instances](./ticket-instances.md)
- [QR System](./qr-system.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Event Team RBAC](./event-team-rbac.md)
- [API Reference](./api-reference.md)
- [Payments](./payments.md)
- [Security](./security.md)
- [Future Roadmap](./future-roadmap.md)

## End-to-End Flow

```mermaid
flowchart LR
  A[Event created] --> B[Ticket tiers configured]
  B --> C[Attendee purchases ticket]
  C --> D[Payment confirmed]
  D --> E[Ticket order created]
  E --> F[Individual ticket instances created]
  F --> G[Unique QR codes generated]
  G --> H[Ticket email and portal access]
  H --> I[Event staff scans QR code]
  I --> J[Aldriva verifies ticket]
  J --> K[Atomic check-in]
  K --> L[Audit entry written]
  L --> M[Attendance dashboard updates]
```

## Frontend Surface

The Events user experience is split across a small number of focused pages:

| File | Role |
| --- | --- |
| `app/events/[slug]/page.tsx` | Public event page and ticket entry point. |
| `app/events/[slug]/TicketCheckout.tsx` | Ticket purchase UI, seat selection, payment method selection, and checkout handoff. |
| `app/events/my-tickets/page.tsx` | Public ticket portal for account tickets and guest order lookup. |
| `app/my-tickets/page.tsx` | Legacy redirect to `/events/my-tickets`. |
| `app/create-event/page.tsx` | Event creation flow used by organizers. |
| `app/dashboard/events/page.tsx` | Organizer event dashboard. |
| `app/dashboard/events/[id]/scan/page.tsx` | Event door scanner entry point. |
| `app/dashboard/events/[id]/scan/ScannerClient.tsx` | Camera scanner, QR parsing, manual entry fallback, and result UI. |
| `app/dashboard/events/[id]/checkins/page.tsx` | Event check-in analytics view. |
| `app/dashboard/events/[id]/team/page.tsx` | Event team management view. |
| `app/events/team/accept/page.tsx` | Invitation acceptance landing page. |

The UI uses server components for access gating and client components for interactive flows. The ticket checkout, scanner, and team pages all defer to shared authorization helpers instead of embedding ad hoc role checks.

## Backend Surface

The important server-side entry points are:

| File | Role |
| --- | --- |
| `app/api/create-payment-intent/route.ts` | Stripe PaymentIntent setup for paid ticket checkout. |
| `app/api/checkout/route.ts` | Free-ticket direct checkout and legacy Stripe Checkout session flow. |
| `app/api/webhooks/stripe/route.ts` | Payment fulfillment for Stripe-based ticket purchases. |
| `app/api/crypto/create-payment/route.ts` | NOWPayments invoice creation for crypto purchases. |
| `app/api/crypto/webhook/route.ts` | NOWPayments confirmation handler. |
| `app/api/crypto/status/route.ts` | Public status probe for crypto payments. |
| `app/api/my-tickets/route.ts` | Logged-in ticket lookup and guest order lookup. |
| `app/api/send-ticket/route.ts` | Ticket email renderer. |
| `app/api/verify-ticket/route.ts` | QR lookup and scan/check-in endpoint. |
| `app/api/events/[id]/checkins/route.ts` | Event check-in analytics. |
| `app/api/events/[id]/team/*` | Event team membership and invitation routes. |
| `app/api/dashboard/events/*` | Organizer event dashboard endpoints. |
| `app/api/dashboard/attendees/*` | Organizer attendee roster and bulk actions. |
| `app/api/seats/route.ts` | Seat map retrieval and temporary seat reservation. |

Most privileged reads and writes use service-role clients on the server. The browser only talks to public pages and a small number of routes that are intentionally designed for unauthenticated use, such as the public checkout and the ticket portal.

## Event Lifecycle

1. An organizer creates or edits an event.
2. Ticket tiers are configured on the event.
3. If assigned seating is used, the venue layout and seats are created.
4. An attendee selects a ticket and completes payment.
5. Stripe or NOWPayments confirms the payment.
6. The fulfillment layer creates a ticket order.
7. For Stripe-based paid purchases, the order fans out into individual ticket instances.
8. Each instance receives its own QR code.
9. Ticket email and ticket portal records are generated.
10. Event staff scan the QR code at entry.
11. Aldriva verifies that the ticket belongs to the event and is still valid.
12. A successful scan atomically marks the ticket as used and writes an audit record.
13. The check-in dashboard summarizes sold, checked-in, and not-arrived tickets.

## Architectural Invariants

### Ticket independence

Each scannable ticket must remain independently identifiable. A multi-ticket purchase is not a single shared QR code.

### Event isolation

A ticket for one event must not be accepted for another event.

### Atomic check-in

Two simultaneous scans of the same ticket must not both succeed.

### Used tickets

A successful check-in must prevent the same ticket from being checked in again.

### Order vs instance

An order represents the purchase. A ticket instance represents one admission entitlement.

### Authorization is server-side

Frontend visibility is not the security boundary. Server routes and database policies must still enforce access rules.

### Idempotent fulfillment

Payment fulfillment must tolerate duplicate webhook delivery without creating duplicate ticket rows or duplicate ledger entries.

## Important Code Locations

| File | Why it matters |
| --- | --- |
| `lib/event-auth.ts` | Event and organizer authorization helper used by pages and APIs. |
| `lib/entity-auth.ts` | Organizer-scoped roles such as owner, admin, manager, editor, finance, and viewer. |
| `lib/dashboard-api.ts` | Dashboard auth context, including auto-binding of pending event invites. |
| `lib/dashboard-data.ts` | Aggregation logic for dashboard events, attendees, and attendance views. |
| `db/migration_76_event_team_and_invitations.sql` | Event-team schema and role policy foundation. |
| `db/migration_79_ticket_instances.sql` | Ticket instance model, check-in RPC, refund RPC, and audit wiring. |
| `db/migration_80c_multi_tier_instances.sql` | Multi-tier Stripe fulfillment and per-instance QR generation. |
| `scratch/test_migration_79.mjs` | Verifies the ticket-instance migration and atomic check-in behavior. |
| `scratch/test_phase3_multi_ticket_checkout.mjs` | Verifies multi-tier checkout and instance fan-out. |
| `scratch/test_phase4_scanner_and_dashboard.mjs` | Verifies scanner behavior and attendance analytics. |

## Current Limitations

- Free-ticket checkout still uses the direct order flow in `app/api/checkout/route.ts`.
- NOWPayments crypto ticket purchases still use the direct order flow in `app/api/crypto/create-payment/route.ts`.
- The attendee roster is still order-centric, while the check-in dashboard is instance-centric.
- The current code path does not expose a public offline-scanning mode.
- The schema includes `entrance_id` on event-team records, but there is no current product workflow for entrance assignment.

