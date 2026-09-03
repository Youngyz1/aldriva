# Attendance and Check-In Reporting

This document covers the organizer-facing attendance view for Events.

Related docs:

- [Architecture](./architecture.md)
- [Ticket Instances](./ticket-instances.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Database Schema](./database-schema.md)
- [API Reference](./api-reference.md)

## What the attendance view shows

The current check-in analytics route is instance-based.

It reports:

- total sold
- checked in
- not arrived
- attendance rate
- scanner breakdown
- check-in history

The source route is `app/api/events/[id]/checkins/route.ts`.

## How the numbers are calculated

### Total sold

Total sold is counted from `ticket_instances` rows in `valid` or `used` state for the event.

### Checked in

Checked in is counted from `ticket_instances` rows in `used` state.

### Not arrived

Not arrived is counted from `ticket_instances` rows in `valid` state.

### Attendance rate

Attendance rate is the ratio of checked-in instances to sold instances.

## Scanner breakdown

The dashboard groups successful scans by `scanned_by_user_id` from `ticket_checkins`.

This lets organizers see:

- who scanned the most tickets
- whether checks were attributed to named staff
- how many check-ins are unattributed or legacy bulk checks

## Check-In History

The history list is built from used ticket instances and then enriched with:

- buyer name
- buyer email
- tier name
- seat label
- check-in time
- scanner attribution when available

This is the best view for answering:

- who was checked in
- when they were checked in
- which staff member scanned them

## Attendee Roster vs Attendance View

There are two different organizer-facing ticket views in the current implementation:

### Attendance view

This is the instance-based check-in analytics view described in this document.

### Attendee roster

`app/api/dashboard/attendees/route.ts` still works from `ticket_orders`.

That means the roster is order-centric, while the attendance view is instance-centric.

The two views are related, but they are not identical.

## Bulk check-in

The bulk attendee action route uses the same atomic check-in RPC, but it is still order-centric in how it resolves a target ticket instance.

That is a convenience path, not a separate attendance engine.

## Important Code Locations

| File | Why it matters |
| --- | --- |
| `app/api/events/[id]/checkins/route.ts` | Attendance metrics, scanner breakdown, and history data. |
| `app/dashboard/events/[id]/checkins/CheckinsClient.tsx` | Check-in analytics UI. |
| `app/api/dashboard/attendees/route.ts` | Order-centric attendee roster. |
| `app/api/dashboard/attendees/bulk/route.ts` | Bulk attendee actions and instance resolution. |
| `db/migration_79_ticket_instances.sql` | Instance status updates and audit insert. |

## Relevant Tests

- `scratch/test_phase4_scanner_and_dashboard.mjs`

