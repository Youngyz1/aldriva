# Events API Reference

This document lists the important Events-related API routes in the current codebase.

Related docs:

- [Architecture](./architecture.md)
- [Database Schema](./database-schema.md)
- [Ticket Instances](./ticket-instances.md)
- [QR System](./qr-system.md)
- [Scanner and Check-ins](./scanner-and-checkins.md)
- [Event Team RBAC](./event-team-rbac.md)
- [Attendance](./attendance.md)
- [Payments](./payments.md)
- [Security](./security.md)

## Route Inventory

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/create-payment-intent` | POST | Create a Stripe PaymentIntent for paid ticket checkout. |
| `/api/checkout` | POST | Free-ticket direct checkout and legacy Stripe Checkout session flow. |
| `/api/webhooks/stripe` | POST | Stripe fulfillment webhook. |
| `/api/crypto/create-payment` | POST | Create a NOWPayments invoice for crypto ticket checkout. |
| `/api/crypto/status` | GET | Poll the status of a crypto payment. |
| `/api/crypto/webhook` | POST | NOWPayments IPN handler. |
| `/api/my-tickets` | GET | Account ticket lookup and guest order lookup. |
| `/api/send-ticket` | POST | Render and send the ticket email. |
| `/api/verify-ticket` | GET, POST | Resolve a QR code and check it in. |
| `/api/events/[id]/checkins` | GET | Attendance and check-in analytics. |
| `/api/events/[id]/team` | GET | Team member and invitation list. |
| `/api/events/[id]/team/invite` | POST | Invite event staff. |
| `/api/events/[id]/team/members/[memberId]` | DELETE | Remove an active staff member. |
| `/api/events/[id]/team/invitations/[inviteId]` | DELETE | Cancel a pending invitation. |
| `/api/events/[id]/team/invitations/[inviteId]/resend` | POST | Rotate an invitation token and resend. |
| `/api/events/team/accept` | POST | Accept an invitation token. |
| `/api/dashboard/events` | GET | Organizer event list and stats. |
| `/api/dashboard/events/[id]` | GET, PATCH, DELETE | Event detail and management actions. |
| `/api/dashboard/events/bulk` | POST | Bulk publish, unpublish, or delete events. |
| `/api/dashboard/events/export` | GET | CSV export of the organizer event list. |
| `/api/dashboard/attendees` | GET | Organizer attendee roster. |
| `/api/dashboard/attendees/[id]` | GET | Attendee detail drawer data. |
| `/api/dashboard/attendees/bulk` | POST | Bulk attendee actions. |
| `/api/dashboard/attendees/export` | GET | CSV export of the attendee roster. |
| `/api/seats` | GET, POST | Seat map fetch and temporary reservation. |

## Public Purchase and Fulfillment

### `POST /api/create-payment-intent`

Creates a Stripe PaymentIntent for paid ticket checkout.

- Auth: not required
- Authorization: the event must exist and be approved
- Rate limit: `paymentIntent`

Request body:

- `eventId`
- `ticketId` or `items`
- `seatId`
- `seatLabel`
- `quantity`
- `buyerEmail`
- `buyerName`
- `currency`
- `checkoutAttemptId`

Response:

- `clientSecret`
- `qrCode`

Important errors:

- missing event details
- event not found or not approved
- ticket type not found
- invalid purchase total
- Stripe not configured

Database interaction:

- reads `events`
- reads `tickets`
- does not write the order row itself

Security notes:

- multi-tier carts are supported through `items`
- the route uses an idempotency key tied to the checkout attempt

### `POST /api/checkout`

Handles free-ticket direct checkout and the legacy Stripe Checkout session flow.

- Auth: not required
- Authorization: the supplied event slug, ticket name, and amount must be valid

Free-ticket branch:

- writes a `ticket_orders` row immediately
- updates seats when a seat is selected
- sends the ticket email
- returns a `ticket-confirmation` URL

Stripe Checkout branch:

- creates a Stripe Checkout Session
- temporarily reserves seats
- writes the actual order later in the webhook

Important errors:

- invalid checkout details
- Stripe not configured
- seat reservation failure

Database interaction:

- writes `ticket_orders` for free tickets
- reserves and updates `seats`

Security notes:

- this route is one of the legacy order-level paths
- it does not go through the same instance fan-out as the primary Stripe PaymentIntent flow

### `POST /api/webhooks/stripe`

Stripe webhook for payment fulfillment.

- Auth: none, but the Stripe signature must verify
- Authorization: Stripe event signature and internal routing logic

For ticket payments, the webhook handles:

- `payment_intent.succeeded`
- `checkout.session.completed`

Current ticket fulfillment behavior:

- calls `record_ticket_and_credit(...)`
- creates the order
- creates ticket instances when the RPC receives multi-tier or quantity data
- inserts one ledger credit entry
- sends the ticket email after success

Important errors:

- invalid Stripe signature
- payment reconciliation failure
- RPC failure

Database interaction:

- writes `ticket_orders`
- writes `ticket_instances`
- writes `recipient_ledger_entries`
- may write `payment_reconciliation_failures`

Security notes:

- the webhook is idempotent
- duplicate deliveries should not create duplicate tickets

## Crypto Ticketing

### `POST /api/crypto/create-payment`

Creates a NOWPayments invoice for ticket purchases.

- Auth: ticket checkout can be started by the browser
- Authorization: event and ticket input must be valid

Request body for ticket flow:

- `amount`
- `currency`
- `eventId`
- `donorName`
- `donorEmail`
- `ticketId`
- `seatId`
- `seatLabel`
- `quantity`
- `type = "ticket"`

Response:

- `paymentUrl`
- `paymentId`

Database interaction:

- writes a pending `ticket_orders` row for ticket purchases
- reserves a seat when requested

Security notes:

- NOWPayments invoice creation uses a tagged order id
- the route is shared with donation and product flows, but only the ticket branch is documented here

### `GET /api/crypto/status`

Polls the status of a crypto payment.

- Auth: not required
- Query params: `orderId` or `paymentId`

Response:

- `status`
- `type`
- `recordId`
- `slug`
- `qrCode`
- `productName`

Security notes:

- the route checks the local record first and then queries NOWPayments
- it does not expose secrets or raw invoice credentials

### `POST /api/crypto/webhook`

NOWPayments IPN handler.

- Auth: none, but the IPN signature must verify
- Authorization: HMAC signature check against the NOWPayments secret

Ticket branch behavior:

- confirms the pending `ticket_orders` row
- marks the order valid
- updates seats when applicable
- sends the ticket email

Important errors:

- missing signature
- invalid signature
- invalid JSON
- NOWPayments not configured

Database interaction:

- updates `ticket_orders`
- may update `seats`

Security notes:

- the webhook verifies the signed body before it mutates ticket state

## My Tickets and Ticket Lookup

### `GET /api/my-tickets`

Loads tickets for account users or guest purchasers.

- Auth: optional for guest mode, required for account mode
- Rate limit: guest lookup is rate limited under `guestLookup`

Request query params:

- `orderId`
- `email`

Behavior:

- if `orderId` is present, the route performs guest lookup
- if no `orderId` is present, the route requires a signed-in user
- if an `email` query param is supplied for a signed-in user, it must match the user email

Response:

- `{ orders: [...] }`

Database interaction:

- reads `ticket_orders`
- hydrates the related `tickets` rows
- uses a privileged server client for the lookup

Security notes:

- guest lookup requires both order identifier and buyer email
- guest lookup is intended to reduce order ID / QR enumeration

### `POST /api/send-ticket`

Renders the ticket email.

- Auth: service-side only
- Authorization: called by fulfillment routes and admin actions

Request body:

- `buyerEmail`
- `buyerName`
- `eventTitle`
- `eventSlug`
- `qrCode`
- `seatLabel`
- `isFree`

Behavior:

- resolves the purchase by order ID, order QR, instance QR, or payment intent
- fetches all matching instances when they exist
- renders one ticket card per instance
- falls back to a single legacy pass when no instances exist

Database interaction:

- reads `ticket_orders`
- reads `ticket_instances`
- reads `tickets`
- may read `events`

Security notes:

- this route does not expose the raw email template logic to the browser

## QR Verification and Check-In

### `GET /api/verify-ticket`

Looks up a QR code and reports the current state.

- Auth: optional
- Query params: `code`

Response:

- `valid`
- `order`
- `authenticated`
- `can_check_in`

Important errors:

- no code provided
- ticket not found

Database interaction:

- resolves the code against `ticket_instances`
- falls back to `ticket_orders` for legacy compatibility

Security notes:

- the response is informational only
- it does not change ticket state

### `POST /api/verify-ticket`

Performs the actual check-in.

- Auth: required
- Authorization: caller must be allowed to scan this event

Request body:

- `code`
- `action = "checkin"`
- `eventId`

Response states:

- success with `status: "used"`
- `status: "used"`
- `status: "wrong_event"`
- `status: "cancelled"`
- `status: "refunded"`
- `not_found`

Database interaction:

- calls the atomic `check_in_ticket(...)` RPC
- the RPC updates `ticket_instances`
- the RPC writes `ticket_checkins`

Security notes:

- event mismatch is rejected before the RPC call
- the server re-checks permissions even if the scanner UI already gated access

## Event Check-in Analytics

### `GET /api/events/[id]/checkins`

Returns the attendance dashboard for an event.

- Auth: required
- Authorization: event manager or organizer access

Query params:

- `page`
- `per_page`
- `search`
- `scanner_id`

Response:

- `stats`
- `scanner_breakdown`
- `history`

Database interaction:

- counts `ticket_instances`
- reads `ticket_checkins`
- hydrates ticket tier names from `tickets`

Security notes:

- the route uses the current event authorization helpers
- it is instance-based, not order-summary based

## Event Team Management

### `GET /api/events/[id]/team`

Returns event team members and invitations.

- Auth: required
- Authorization: event manager or organizer access

Response:

- `members`
- `invitations`

Database interaction:

- reads `event_team_members`
- reads `event_team_invitations`
- hydrates member profile data from `profiles`

### `POST /api/events/[id]/team/invite`

Creates or updates an invitation.

- Auth: required
- Authorization: event manager or organizer access

Request body:

- `email`
- `role`
- `entranceId` optional

Response:

- invitation metadata plus the accept URL when email delivery is not configured

Database interaction:

- reads `profiles` for existing user detection
- reads and writes `event_team_invitations`
- may update an existing active `event_team_members` row

Security notes:

- the invite token is rotated on resend
- email must be valid and lowercased

### `DELETE /api/events/[id]/team/members/[memberId]`

Removes an active team member.

- Auth: required
- Authorization: event manager or organizer access

Database interaction:

- marks `event_team_members.status = 'removed'`

### `DELETE /api/events/[id]/team/invitations/[inviteId]`

Cancels a pending invitation.

- Auth: required
- Authorization: event manager or organizer access

Database interaction:

- marks `event_team_invitations.status = 'revoked'`

### `POST /api/events/[id]/team/invitations/[inviteId]/resend`

Resends a pending invitation.

- Auth: required
- Authorization: event manager or organizer access

Database interaction:

- rotates the token
- resets the invitation to pending

### `POST /api/events/team/accept`

Accepts an invitation token.

- Auth: required
- Authorization: the signed-in email must match the invited email

Request body:

- `token`

Response:

- success message plus event id and role

Database interaction:

- reads `event_team_invitations`
- updates the invitation to accepted
- upserts `event_team_members`

Security notes:

- email mismatch returns 403
- expired invitations return 410
- already-used invitations return 409

## Organizer Dashboard

### `GET /api/dashboard/events`

Returns the organizer event list and summary stats.

- Auth: required
- Authorization: dashboard context / organizer scope

Query params:

- `page`
- `per_page`
- `search`
- `status`
- `visibility`
- `date`
- `sort`

Response:

- `events`
- `stats`
- `total`
- `page`
- `per_page`
- `total_pages`

Database interaction:

- reads `events`
- reads `ticket_orders` for sold/revenue aggregation
- reads `event_team_members` for staff-only rows

### `GET /api/dashboard/events/[id]`

Returns one event detail row.

- Auth: required
- Authorization: organizer scope

Database interaction:

- reads `events`
- resolves organizer and staff access through the dashboard helper

### `PATCH /api/dashboard/events/[id]`

Updates event status or visibility.

- Auth: required
- Authorization: content-write organizer role

Request body:

- `status`
- `visibility`

Database interaction:

- updates `events`

### `DELETE /api/dashboard/events/[id]`

Deletes an event.

- Auth: required
- Authorization: manage-tier organizer role

Behavior:

- deletion is blocked if payment history exists

Database interaction:

- reads `ticket_orders`
- deletes `tickets`
- deletes `events`

### `POST /api/dashboard/events/bulk`

Bulk publish, unpublish, or delete.

- Auth: required
- Authorization: content-write for publish/unpublish, manage-tier for delete

Request body:

- `ids`
- `action`

### `GET /api/dashboard/events/export`

Exports the organizer event list as CSV.

- Auth: required
- Authorization: organizer scope

## Attendee Roster

### `GET /api/dashboard/attendees`

Returns the order-centric attendee roster.

- Auth: required
- Authorization: organizer scope

Query params:

- `page`
- `per_page`
- `search`
- `event`
- `status`
- `date`
- `sort`

Response:

- `attendees`
- `stats`
- `events`
- `total`
- `page`
- `per_page`
- `total_pages`

Database interaction:

- reads `ticket_orders`
- hydrates event titles

Important note:

- this roster is order-centric, not instance-centric

### `GET /api/dashboard/attendees/[id]`

Returns attendee detail for one order.

- Auth: required
- Authorization: organizer scope

### `POST /api/dashboard/attendees/bulk`

Bulk attendee actions.

- Auth: required
- Authorization: content-write organizer role

Request body:

- `ids`
- `action`

Supported actions:

- `check_in`
- `resend_ticket`

Current behavior:

- `check_in` resolves one ticket instance per selected order and calls the atomic RPC
- `resend_ticket` sends the fulfillment email again

### `GET /api/dashboard/attendees/export`

Exports the attendee roster as CSV.

- Auth: required
- Authorization: organizer scope

## Seat Map

### `GET /api/seats`

Returns the seat layout and seat availability for an event.

- Auth: not required for the public checkout flow
- Query params: `event_id`

Response:

- layout data
- seat list

### `POST /api/seats`

Temporarily reserves seats before payment.

- Auth: not required in the current route
- Request body: `seatIds`

Behavior:

- verifies each seat is still available
- marks them reserved when possible

Security notes:

- this is a pre-payment reservation, not a final purchase
- the actual purchase still has to succeed before the seat becomes sold

