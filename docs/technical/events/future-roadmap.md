# Events Future Roadmap

This document lists the current gaps and the product decisions that still need to be made.

Related docs:

- [Architecture](./architecture.md)
- [Ticket Instances](./ticket-instances.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Event Team RBAC](./event-team-rbac.md)
- [Security](./security.md)

## Not Implemented

These features do not exist in the current implementation:

- offline scanning
- dynamic QR codes
- ticket transfer
- re-entry tracking
- entrance or gate assignment as a product workflow

## Partially Implemented

These areas exist in code, but the implementation is not fully unified:

- free-ticket checkout still uses a direct order-level path
- NOWPayments ticket purchases still use a direct order-level path
- the attendee roster is still order-centric while the check-in dashboard is instance-centric
- `entrance_id` exists on event-team rows, but no current UI or workflow uses it
- legacy order QR compatibility still exists alongside the instance model

## Requires Product Decision

These are real product choices, not just engineering work:

### Refund policy

The code can mark a valid ticket instance as refunded, but the product still needs a clear end-user refund policy.

Questions to settle:

- Who is allowed to initiate a refund?
- Should refunds be automatic or manual?
- Are partial refunds allowed?
- What should happen for already-used tickets?

### Transfer policy

Ticket transfer is not implemented.

If the product wants it, decide:

- whether transfers are allowed at all
- whether they are organizer-controlled
- whether the QR changes on transfer
- whether the original buyer keeps access

### Re-entry policy

The product currently treats a checked-in ticket as used.

If re-entry should be allowed, decide:

- whether re-entry is per event or per ticket
- whether staff need a special re-open action
- whether the audit trail should record re-entry separately

### Entrance assignment

The schema has an `entrance_id` placeholder on event-team records, but there is no current workflow around it.

If the product wants entrance assignment, decide:

- how entrances are modeled
- who can assign them
- whether a scanner is tied to one entrance
- whether analytics should split by entrance

### Legacy order flows

The team should decide whether to keep supporting the older order-level free and crypto ticket flows or migrate them onto the same instance-based model as Stripe.

That decision affects:

- scanning consistency
- ticket emails
- attendance reporting
- refund behavior

## Planned

No roadmap item is currently established in the reviewed repository as a formal plan.

If a feature is not in the code and not explicitly committed in documentation, it should be treated as not implemented rather than planned.

## Architectural Follow-Ups

Recommended follow-up work for the next engineering phase:

- verify the live RLS policy surface for `venue_layouts` and `seats`
- unify the non-Stripe ticket paths with the instance model if those paths must remain supported
- decide whether the attendee roster should be rewritten to use `ticket_instances`
- decide whether ticket transfer and re-entry are in scope
- decide whether entrance management should become a first-class feature

