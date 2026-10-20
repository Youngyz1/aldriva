# Phase 10: Outbound Webhooks

---

## STATUS (verified 2026-10-20)

**NOT STARTED.** No webhook-subscription tables, no dispatch service, no signing. (VERIFIED — `grep webhook_subscription|outbound_webhook` across `db/`/`lib/`/`app/` empty; the only webhook code is the **inbound** Stripe handler.)

## What it is and why it matters (no prior context needed)
Today, when something happens in Aldriva (an order is placed, a payment lands, a ticket is scanned), nothing tells the merchant's *other* systems. The merchant has to poll or check manually.

**Outbound webhooks** flip that: Aldriva pushes a small JSON message to a URL the business configures the instant the event happens. It includes **subscriptions** (which events, which URL), **HMAC signatures** (`X-Aldriva-Signature`) so the receiver can verify it really came from Aldriva, and **automatic retries** with backoff if the receiver is down.

**Why it matters:** it's how Aldriva becomes a real-time citizen of a business's stack — inventory systems, accounting, custom dashboards, and our own POS sync (Phase 11) all consume these events. **Depends on Phase 9** (API-key/tenant auth primitives and the shared request/response conventions).

## Prerequisites
- Phase **9** (auth/scopes/standard formats) — the dispatcher needs the same tenant/auth model.
- A domain-event definition (naming and payload shapes for order/ticket/donation/booking events).

## Risks
- **Delivery reliability**: retries + dead-letter handling must not double-charge or double-notify.
- **Signature/secret management**: per-tenant signing secrets must be stored and rotatable.
- **Abuse**: outbound calls to tenant-supplied URLs → SSRF risk (must allow-list/validate destinations; the app already has SSRF guards for AI tools to reuse).
- Doing this before Phase 9 means re-plumbing auth later.

## Proposed first task
Author the webhook-subscriptions migration (endpoint URL, event list, signing secret) and a dispatch service that signs with HMAC-SHA256, then wire **one** event (`order.paid`) end-to-end with a retry/dead-letter test.

## Migration numbers
Old plan names `migration_131_webhook_subscriptions` — **consumed** (actual 131 = website atomic creation). **Assign at build time from the register.** Next free as of 2026-10-20: **186**.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

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
