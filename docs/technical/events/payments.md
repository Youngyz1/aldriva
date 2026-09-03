# Payments

This document covers the current ticket payment architecture for Events.

Related docs:

- [Architecture](./architecture.md)
- [Ticket Instances](./ticket-instances.md)
- [QR System](./qr-system.md)
- [Security](./security.md)
- [Future Roadmap](./future-roadmap.md)

## Payment Paths

There are three live ticket-payment paths in the codebase:

1. Stripe PaymentIntent flow for instance-based ticket fulfillment
2. Stripe Checkout session flow, still supported for compatibility
3. NOWPayments crypto flow, which still uses direct order-level fulfillment

There is also a direct free-ticket checkout path.

## Primary Stripe Flow

The current primary paid-ticket path is:

```text
TicketCheckout UI
  -> /api/create-payment-intent
  -> Stripe PaymentIntent
  -> Stripe webhook
  -> record_ticket_and_credit(...)
  -> ticket_orders + ticket_instances + recipient_ledger_entries
  -> /api/send-ticket
```

### Request preparation

`app/api/create-payment-intent/route.ts`:

- validates that the event exists and is approved
- loads the selected ticket tier or multi-tier cart
- calculates the total
- creates a Stripe PaymentIntent
- returns `clientSecret` plus a generated QR value for the client flow

The route is rate-limited under the `paymentIntent` budget.

### Multi-tier cart support

The route supports both:

- a single ticket tier with quantity
- a multi-tier `items` array

Example:

```text
2 VIP + 3 Regular
```

becomes a single payment with five total tickets in the cart metadata.

### Webhook fulfillment

`app/api/webhooks/stripe/route.ts` handles the confirmed payment.

For the current ticket path, the webhook:

- parses line items from metadata
- calls `record_ticket_and_credit(...)`
- creates one order row
- creates one instance per ticket
- writes one ledger credit entry for the order total
- sends the ticket email only after the fulfillment succeeds

The webhook is idempotent:

- it checks for an existing PaymentIntent
- `ticket_orders.stripe_payment_intent_id` is unique
- the RPC returns whether the row is new or already processed

## Stripe Checkout Session Compatibility Flow

The codebase also still has a Stripe Checkout session route in `app/api/checkout/route.ts`.

That path is used for:

- free tickets
- compatibility with older checkout behavior

For paid Checkout-session fulfillment, the Stripe webhook still ends up calling the same ticket fulfillment RPC.

## Free Ticket Direct Flow

If the ticket price is zero, `app/api/checkout/route.ts` creates the order immediately and sends the ticket email.

Current behavior:

- it writes `ticket_orders`
- it marks the order valid
- it updates seats when applicable
- it sends the ticket email
- it does not fan out into `ticket_instances`

This is a direct order-level path and is not the same as the primary Stripe instance-based flow.

## NOWPayments Crypto Flow

`app/api/crypto/create-payment/route.ts` creates a NOWPayments invoice.

For ticket purchases it:

- reserves a seat if needed
- writes a pending `ticket_orders` row
- stores the crypto payment correlation id
- returns the payment URL to the client

`app/api/crypto/webhook/route.ts` confirms the invoice and marks the ticket order valid.

Current behavior:

- this flow still operates at the order level
- it does not create `ticket_instances`
- it sends the ticket email after confirmation

`app/api/crypto/status/route.ts` is the public status probe used by the client or confirmation page.

## Refund and Cancellation Behavior

### Instance-level refund primitive

`refund_ticket_instance(...)` exists in the database layer.

It:

- changes a valid instance to refunded
- rejects used tickets
- rejects already-refunded tickets
- does not directly call Stripe or NOWPayments

### Order-level cascade

If a ticket order is cancelled or refunded, the `cascade_ticket_order_status` trigger updates matching valid child instances to the same status.

Used instances are preserved.

### What is not defined here

The current codebase does not define a complete public refund policy.

It also does not show a user-facing API route that wraps `refund_ticket_instance(...)`.

That means the database primitive exists, but the end-to-end refund workflow still needs product and operations decisions.

## Payment Reconciliation

If a Stripe charge succeeds but the fulfillment write fails, the webhook:

- records a row in `payment_reconciliation_failures`
- alerts support
- does not silently drop the payment

This is intentionally not an automatic refund flow.

## Idempotency and Replay Protection

Important safeguards:

- Stripe PaymentIntent creation uses an idempotency key tied to the checkout attempt
- `record_ticket_and_credit(...)` avoids duplicate order creation
- `stripe_payment_intent_id` is unique on `ticket_orders`
- QR codes are unique on both the order and instance tables

## Seat Reservation Behavior

The checkout routes can temporarily reserve a seat before payment completes.

Observed behavior:

- Stripe flows reserve for about 30 minutes
- crypto flows reserve for about 1 hour

The reservation is released or sold after fulfillment.

## Ticket Email Delivery

`app/api/send-ticket/route.ts` renders the fulfillment email.

For instance-based paid tickets it:

- loads all instances for the order or payment group
- renders one pass card per instance
- shows the ticket tier
- shows `Ticket X of Y`
- shows the QR code for each instance

## Important Code Locations

| File | Why it matters |
| --- | --- |
| `app/api/create-payment-intent/route.ts` | Main Stripe ticket payment setup. |
| `app/api/webhooks/stripe/route.ts` | Payment fulfillment and idempotent ticket creation. |
| `db/migration_80c_multi_tier_instances.sql` | Multi-tier order fan-out into instances. |
| `db/migration_72_ledger_credit_rpcs.sql` | Ledger credit RPC used by the payment webhook. |
| `app/api/checkout/route.ts` | Free-ticket and compatibility checkout flow. |
| `app/api/crypto/create-payment/route.ts` | NOWPayments invoice creation. |
| `app/api/crypto/webhook/route.ts` | NOWPayments confirmation handling. |
| `app/api/crypto/status/route.ts` | Crypto payment status lookup. |
| `app/api/send-ticket/route.ts` | Ticket email rendering. |

## Relevant Tests

- `scratch/test_phase3_multi_ticket_checkout.mjs`
- `scratch/test_phase4_scanner_and_dashboard.mjs`

