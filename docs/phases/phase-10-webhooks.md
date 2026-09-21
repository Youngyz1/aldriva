# Phase 10: Outbound Webhooks

## 1. Objective
Build a reliable, retry-backed outbound webhook dispatcher allowing tenants and third-party integrations to receive real-time notifications for critical platform events.

## 2. Scope
- Webhook subscription management in tenant dashboard (`/dashboard/org/[id]/developers/webhooks`).
- Event catalog (`order.created`, `order.paid`, `ticket.issued`, `ticket.checked_in`, `donation.received`, `booking.created`, `booking.cancelled`).
- HMAC-SHA256 signature generation (`X-Aldriva-Signature`) for payload verification.
- Asynchronous dispatch engine with exponential backoff retries and dead-letter failure logging.

## 3. Out of Scope
- Inbound webhook processing (already implemented for Stripe/NOWPayments).
- WebSocket streaming (use Supabase Realtime).

## 4. Existing Dependencies
- Canonical tenant entity `organizers.id`.
- Public Developer API foundations (Phase 9).

## 5. Tasks
- [ ] Task 10.1: Author `db/migration_131_webhook_subscriptions.sql` (and rollback twin).
- [ ] Task 10.2: Build webhook dispatch service with HMAC signing in `lib/webhooks-dispatcher.ts`.
- [ ] Task 10.3: Wire domain event hooks into checkout, check-in, and booking flows.
- [ ] Task 10.4: Build tenant webhook management and delivery log UI.
- [ ] Task 10.5: Author automated tests in `lib/__tests__/outbound-webhooks.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] Subscribed endpoints receive JSON payloads within 2 seconds of event occurrence.
- [ ] Signatures match computed HMAC-SHA256 using the tenant's webhook signing secret.
- [ ] Failed deliveries retry with exponential backoff up to 5 attempts.
- [ ] All tests passing.

## 7. Current Status
**PLANNED**

## 8. Completed Work
- Inbound webhook receivers (Stripe, Crypto) verified complete in Phase 0.

## 9. Remaining Work
- Tasks 10.1 through 10.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 9 completion.
