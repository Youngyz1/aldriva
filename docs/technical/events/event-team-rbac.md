# Event Team RBAC

This document covers how event staff access works.

Related docs:

- [Architecture](./architecture.md)
- [Database Schema](./database-schema.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Attendance](./attendance.md)
- [API Reference](./api-reference.md)
- [Security](./security.md)

## Role Layers

There are two role layers in the Events system:

1. organizer-scoped roles
2. event-scoped roles

They are distinct and should not be merged mentally.

## Organizer-Scoped Roles

These roles live in `entity_members` and are resolved by `lib/entity-auth.ts`.

| Role | Meaning |
| --- | --- |
| `owner` | Full organizer owner access. |
| `admin` | High-trust organizer access. |
| `manager` | Day-to-day organizer management access. |
| `editor` | Content-writing access. |
| `finance` | Reserved for financial visibility decisions. |
| `viewer` | Read-only access. |

Current write tiers:

- `ENTITY_ROLES_CONTENT_WRITE = owner, admin, manager, editor`
- `ENTITY_ROLES_MANAGE = owner, admin, manager`

## Event-Scoped Roles

These roles live in `event_team_members` and are resolved by `lib/event-auth.ts`.

| Role | Meaning |
| --- | --- |
| `event_manager` | Can manage the event team and view check-in analytics. |
| `ticket_scanner` | Can scan tickets at entry. |

Current access tiers:

- `EVENT_TEAM_ROLES_MANAGE = event_manager`
- `EVENT_TEAM_ROLES_SCANNER = event_manager, ticket_scanner`

## How Access Is Determined

`hasEventOrOrganizerAccess(userId, eventId, minEventRoles)` is the core helper.

It returns true when the user is any of the following:

1. the direct event creator
2. the organizer owner
3. a delegated organizer member with content-write access
4. an active event team member with one of the requested event roles

This means event access is not purely event-team based. Organizer ownership also matters.

## Invitation Workflow

### Create invitation

`app/api/events/[id]/team/invite/route.ts` creates or updates a pending invitation.

Rules:

- the inviter must be able to manage the event
- role must be `event_manager` or `ticket_scanner`
- email must be valid
- a 64-character token is generated
- a pending invitation is reused if one already exists for the same email and event

### Accept invitation

`app/api/events/team/accept/route.ts` accepts the invitation.

Rules:

- the user must be signed in
- the signed-in email must exactly match the invited email
- the invitation must still be pending
- the invitation must not be expired
- the status flip is atomic
- the event membership row is upserted into `event_team_members`

### Resend invitation

`app/api/events/[id]/team/invitations/[inviteId]/resend/route.ts` rotates the token and resets the invite to pending.

### Cancel invitation

`app/api/events/[id]/team/invitations/[inviteId]/route.ts` marks the pending invite as revoked.

### Remove member

`app/api/events/[id]/team/members/[memberId]/route.ts` marks an active member as removed.

## Auto-Binding of Pending Invitations

`lib/dashboard-api.ts` calls `bindPendingEventInvitations(...)` when a signed-in user is resolved.

That means:

- if a user signs in with the email that matches a pending invite
- and the invite has not expired

the system can automatically activate the membership without waiting for a manual reaccept flow.

## Permission Boundaries

### Event Manager

An event manager can:

- manage team members
- manage invitations
- view attendance/check-in analytics
- use the scanner

### Ticket Scanner

A ticket scanner can:

- use the scanner page
- check in tickets where the route allows scanner-level access

A ticket scanner cannot manage team membership.

### Organizer owner and delegated organizer roles

Organizer owners and content-write delegated members can manage event pages and, through shared auth helpers, can act with organizer-level access on events they control.

## Current Limitations

- The schema includes `entrance_id` on event-team tables, but no current product workflow assigns or uses entrances.
- There is no separate role for "door lead" or "gate supervisor".
- There is no event-scoped "finance" permission in the current event-team role set.

## Important Code Locations

| File | Why it matters |
| --- | --- |
| `lib/event-auth.ts` | Shared event authorization helper and invitation auto-binding. |
| `lib/entity-auth.ts` | Organizer-scoped role resolution. |
| `app/api/events/[id]/team/invite/route.ts` | Staff invitation creation and email delivery. |
| `app/api/events/team/accept/route.ts` | Invitation acceptance and membership activation. |
| `app/api/events/[id]/team/members/[memberId]/route.ts` | Membership revocation. |
| `app/api/events/[id]/team/invitations/[inviteId]/route.ts` | Invitation cancellation. |
| `app/api/events/[id]/team/invitations/[inviteId]/resend/route.ts` | Token rotation and resend. |
| `app/events/team/accept/page.tsx` | Invitation acceptance UI and post-accept routing. |

## Relevant Tests

- `scratch/test_navigation_and_staff_access.mjs`
- `lib/dashboard/__tests__/event-dashboard-regressions.test.cjs`

