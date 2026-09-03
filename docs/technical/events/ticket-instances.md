# Ticket Instances

`ticket_instances` is the current unit of admission for Stripe-based Event ticket fulfillment.

Related docs:

- [Architecture](./architecture.md)
- [Database Schema](./database-schema.md)
- [QR System](./qr-system.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Payments](./payments.md)

## Why `ticket_orders` and `ticket_instances` are separate

The model is intentionally split:

- `ticket_orders` represents the purchase transaction and order summary.
- `ticket_instances` represents one physical or digital admission entitlement.

That split matters because one purchase can contain multiple tickets, multiple tiers, or multiple seats. A single order cannot safely stand in for all of those checkable entries.

## Canonical Stripe Flow

For current Stripe-based paid purchases:

1. The payment webhook writes one `ticket_orders` row.
2. The same transaction writes `N` `ticket_instances` rows.
3. Each instance gets its own unique QR code.
4. The ledger receives one credit entry for the order total.

Example:

```text
Customer purchases:
  2 VIP
  3 Regular

Database result:
  1 ticket_orders row
  2 VIP ticket_instances rows
  3 Regular ticket_instances rows

Total:
  5 ticket_instances rows
```

## Ticket Ownership

Ownership is represented indirectly:

- `ticket_instances.order_id` ties an instance back to the purchase.
- `ticket_orders.buyer_email` and `buyer_name` store the purchaser details.
- `ticket_instances.ticket_id` stores the ticket tier for that specific instance.

There is no separate `owner_id` column on `ticket_instances`.

## Ticket Tier Handling

The current implementation supports multi-tier purchases.

If a customer buys:

```text
2 VIP
3 Regular
```

then each instance gets the corresponding `ticket_id` for that tier. The order row stores the overall purchase summary, while the instance rows store the actual per-ticket tier breakdown.

That means:

- the order row is a summary record
- the instance rows are the source of truth for each pass
- email rendering and scanning should use the instance rows when available

## Status Lifecycle

`ticket_instances.status` currently uses these values:

| Status | Meaning |
| --- | --- |
| `valid` | The ticket can still be used for entry. |
| `used` | The ticket has been checked in. |
| `cancelled` | The ticket was cancelled. |
| `refunded` | The ticket was refunded. |

The practical lifecycle is:

```text
valid -> used
valid -> refunded
valid -> cancelled
```

There is no `pending` instance state. If the payment is not confirmed yet, the instance does not exist yet.

### What causes the transitions

- `valid -> used`: successful scan through `check_in_ticket(...)`
- `valid -> refunded`: explicit refund RPC or order-level refund cascade
- `valid -> cancelled`: order-level cancellation cascade

### What is prevented

- A `used` ticket cannot be checked in again.
- A `used` ticket cannot be refunded through the instance refund RPC.
- A `cancelled` or `refunded` ticket cannot be checked in.

## QR Code Relationship

Each instance has its own QR code. That means:

- 1 ticket instance = 1 QR code
- 5 ticket instances = 5 QR codes

The code is stored on the instance row, not on the order row for the current Stripe instance-based path.

## Check-In Impact

When a ticket instance is checked in:

- `ticket_instances.status` becomes `used`
- `ticket_instances.checked_in_at` is set
- one `ticket_checkins` audit row is written

The parent order is kept as a summary record. The current instance-based scanner flow does not rely on order status as the check-in source of truth.

## Refund Impact

The database exposes a low-level `refund_ticket_instance(...)` function.

Current behavior:

- only `valid` instances can be refunded
- `used` instances are rejected
- `refunded` instances are rejected as already refunded
- the function changes ticket state only

The function does not itself perform a payment-provider refund. That is a separate product and operations decision.

## Legacy and Direct-Checkout Paths

The current codebase still contains direct paths that create a ticket order without going through the Stripe instance fan-out:

- free-ticket checkout in `app/api/checkout/route.ts`
- NOWPayments crypto ticket checkout in `app/api/crypto/create-payment/route.ts`

Those paths remain part of the codebase, but they do not follow the same instance fan-out model as the Stripe webhook path.

### Important implication

The scanner stack is instance-centric. For any ticket flow that does not produce a matching `ticket_instances` row, check-in behavior needs to be verified carefully before treating it as supported.

## Important Code Locations

| File | Why it matters |
| --- | --- |
| `db/migration_79_ticket_instances.sql` | Defines the table, the atomic check-in RPC, refund RPC, and the order status cascade trigger. |
| `db/migration_80c_multi_tier_instances.sql` | Extends order fulfillment to multi-tier line items and per-instance QR generation. |
| `app/api/webhooks/stripe/route.ts` | Calls `record_ticket_and_credit(...)` to create orders and instances for Stripe purchases. |
| `app/api/send-ticket/route.ts` | Renders one pass per instance when instance rows exist. |
| `app/api/verify-ticket/route.ts` | Resolves QR codes to instances and checks them in. |
| `app/api/events/[id]/checkins/route.ts` | Attendance analytics based on instance state. |

## Relevant Tests

- `scratch/test_migration_79.mjs`
- `scratch/test_phase3_multi_ticket_checkout.mjs`
- `scratch/test_phase4_scanner_and_dashboard.mjs`

