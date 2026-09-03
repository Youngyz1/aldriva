# QR System

The QR system identifies individual tickets, not entire orders, for the current Stripe instance-based flow.

Related docs:

- [Architecture](./architecture.md)
- [Ticket Instances](./ticket-instances.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Payments](./payments.md)
- [Security](./security.md)

## What a QR ticket is

A QR ticket is the scannable code attached to one individual ticket instance. It is what event staff scan at entry.

The QR code is not the admission rule by itself. Aldriva still verifies:

1. that the ticket exists
2. that the ticket belongs to the event being scanned
3. that the ticket is still valid
4. that the user scanning has permission to check it in

## How QR codes are generated

The current codebase generates opaque, random QR values using UUID-based strings without hyphens, uppercased for readability.

This happens in the purchase and fulfillment layer, not in the scanner.

Current places that emit QR values:

- `app/api/create-payment-intent/route.ts`
- `app/api/checkout/route.ts`
- `app/api/crypto/create-payment/route.ts`
- `db/migration_80c_multi_tier_instances.sql` for ticket instances created by the Stripe webhook path

## What entity owns a QR code

The current canonical owner is `ticket_instances.qr_code`.

There is also a compatibility path for `ticket_orders.qr_code`:

- historical ticket orders can still be found by order QR code
- some direct checkout flows still write an order QR code
- the scanner and email renderer still understand those older records

That compatibility path exists for backward support, but the instance record is the current preferred model.

## Uniqueness

Uniqueness is enforced at the database level:

- `ticket_instances.qr_code` is unique
- `ticket_orders.qr_code` is unique

That means one QR code value should map to one ticket instance or one legacy order record, not multiple active tickets.

## How the QR code is delivered

The ticket email renderer, `app/api/send-ticket/route.ts`, renders one card per instance when instance rows exist.

Typical output:

```text
VIP PASS
Ticket 1 of 5
[QR CODE]
```

The same ticket information is also available in the public ticket portal at `/events/my-tickets`.

## How the scanner resolves the QR code

The scanner resolves the scanned code in this order:

1. `ticket_instances.qr_code`
2. legacy `ticket_orders.qr_code`

If the code resolves to an instance, the instance is checked in directly.

If the code only resolves to an order, the route falls back to the compatibility path. That path should be treated carefully, because the current check-in RPC is instance-centric.

## Event ownership verification

During scan, Aldriva verifies that the ticket belongs to the event currently being scanned.

If the ticket belongs to a different event, the scan is rejected as a wrong-event ticket.

That check happens before the check-in RPC is called.

## Invalid QR handling

If the QR code cannot be resolved to a known ticket instance or legacy order, the scanner returns a not-found result.

If the QR code is syntactically valid but not recognized, it is still rejected. Aldriva does not accept an unknown QR just because it looks like a ticket string.

## Already-used QR handling

Once a ticket instance has been checked in, the same QR code should not admit the attendee a second time.

The atomic check-in RPC rejects already-used tickets, and the scanner surfaces that as an already-checked-in result.

## Security notes

The QR code is an identifier, not a secret credential.

Authorization still matters:

- the scan must belong to the correct event
- the user must have scan permission
- the ticket must still be valid

## Important Code Locations

| File | Why it matters |
| --- | --- |
| `app/api/verify-ticket/route.ts` | QR resolution and check-in path. |
| `app/api/send-ticket/route.ts` | Ticket email rendering and QR display. |
| `app/dashboard/events/[id]/scan/ScannerClient.tsx` | Camera scanning and manual code entry. |
| `db/migration_79_ticket_instances.sql` | Unique QR generation and instance-based ticket storage. |
| `db/migration_80c_multi_tier_instances.sql` | Per-instance QR generation for multi-tier orders. |

