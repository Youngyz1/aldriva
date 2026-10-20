# Phase 6: Unified Commerce

---

## STATUS (verified 2026-10-20)

Store commerce path (cart → checkout → delivery) is **built**; tax, a unified fulfillment dashboard, and crypto carts are **not built**; the **Kitchen & Delivery workstream** belongs here and is built-but-uncommitted.

### Built
- **Store cart & checkout:** `lib/store-cart.ts` (localStorage cart, bounds), `components/site/v2/StoreCartDrawer.tsx`, `POST /api/checkout/cart` (multi-line Stripe session) and `POST /api/checkout/cart/validate` (priced review, no writes), shared `lib/store-cart-checkout.ts`. (VERIFIED — files exist; §5 Tasks 6.2–6.4.)
- **Store promo codes:** `db/migration_177_store_promo_codes.sql` (+ rollback + Supabase mirror), `lib/promo-codes.ts`, `apply_promo_use()` RPC; **applied on staging** (owner statement). (VERIFIED)
- **Orders & payments:** `db/migration_171_orders.sql` (orders + delivery-ready status set), `db/migration_173_order_online_payment.sql`, `db/migration_174_order_timing.sql`, `lib/actions/orders.ts`, `app/dashboard/org/[id]/orders/`. (VERIFIED — files exist.)
- **Owner-managed delivery:** `db/migration_175_owner_managed_delivery.sql` (delivery fee/threshold, rider name+phone, `out_for_delivery`/`delivered` statuses), `lib/courier/whatsapp-message.ts`. (VERIFIED.)
- **Menu order path:** menu ordering + option snapshots (Phase 5 workstream) submit through `lib/order-submit.ts`. (VERIFIED.)
- Tests: `lib/__tests__/store-cart-checkout.test.cjs`, `phase6-owner-managed-delivery.test.cjs` (38/38 PASS 2026-10-20). (VERIFIED.)

### Partly built
- **Promo owner UI:** backend + validation + usage burn exist, but no dashboard UI creates promo codes; the checkout field only accepts codes provisioned out-of-band. (VERIFIED — §13.)
- **Kitchen & Delivery workstream:** cook worker access, invitations, sessions, kitchen dashboard and `/kitchen/accept` built **but uncommitted** (migration 185). Order state flow, kitchen display page, courier registration UI, and driver dashboard **not built**. Full detail: `docs/phases/phase-kitchen-delivery.md`. (VERIFIED — files exist uncommitted; no kitchen commit anywhere.)
- **Owner-managed delivery migration 175** has uncommitted edits making the forward idempotent and the rollback a hard guard — pending owner decision. (VERIFIED — `git diff`.)
- Diagnostics/repair paths: `lib/__tests__/phase5-overview.test.cjs`, `lib/__tests__/data-consistency.test.cjs`, `lib/__tests__/operational-settings.test.cjs` cover store/website ops. (VERIFIED — registered.)

### Not built
- **Automated tax calculation** — the cart charges server-validated subtotal minus promo only. (VERIFIED — §13; NOT FOUND for any tax engine.)
- **Unified fulfillment dashboard** — menu orders use `/dashboard/org/[id]/orders`, product revenue stays on `/dashboard/products`; no combined view. (VERIFIED — §13.)
- **Multi-item crypto carts** (per-invoice by design) and **product variants** (no schema/UI). (VERIFIED — §13.)

### Known bugs / risks
- Uncommitted migration-175 rollback redesign changes the committed test contract (working tree self-consistent at 38/38). (VERIFIED — `docs/HANDOFF.md` §7.)
- Kitchen/delivery work has no commit yet → loss risk. (VERIFIED.)
- `app/api/checkout/product-crypto/route.ts:135` has a crypto-pending status TODO. (VERIFIED — code comment.)

### Test coverage
- `store-cart-checkout.test.cjs` (19 tests registered), `phase6-owner-managed-delivery.test.cjs` (38, PASS), `phase5-overview`, `data-consistency`, `operational-settings`, `phase3-order-online-payment.test.cjs`. (VERIFIED — registered list.)

### Continue from here
1. Commit the kitchen/delivery work to an owner-approved branch, then finish its order state flow + display page (`docs/phases/phase-kitchen-delivery.md`).
2. Build the automated tax engine and the unified fulfillment dashboard (deferred in §13).
3. Build the promo-code owner UI (dashboard to create/manage codes).
4. Decide the migration-175 rollback question.
5. Then move to Phase 7 (below).

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

## 1. Objective
Unify the checkout experience across physical products, digital deliverables, event tickets, and service deposits into a consolidated shopping bag with persistent cart state, discount codes, and automated tax calculations.

## 2. Scope
- Multi-item shopping cart state manager (`useCart` client hook with local storage persistence).
- Unified multi-item Stripe Checkout Session generator (`/api/checkout/cart`).
- Promo code and discount voucher engine with usage limits and expiration checks.
- Order history and unified fulfillment dashboard for business owners.

## 3. Out of Scope
- Point of sale terminal hardware sync (deferred to Phase 11).
- Multi-currency crypto cart aggregation (crypto remains per-invoice).

## 4. Existing Dependencies
- Dual payment rail infrastructure (`app/api/webhooks/stripe`).
- Digital products (`migration_116`) and physical listings (`products` table).
- Services catalog (Phase 5).

## 5. Tasks
- [x] Task 6.1: Author `db/migration_139_cart_and_discounts.sql` (and rollback twin) for promo codes and multi-item orders. *(Note: migrations 137 and 138 were allocated to Phase 5 hardening (`business_moderation_guard_and_screening` and `business_moderation_resubmit_and_organizer_guard`), so Phase 6 shifts from 137 to 139.)* — **SUPERSEDED 2026-10-16: shipped as `db/migration_177_store_promo_codes.sql` (+ rollback twin + byte-identical Supabase mirror). Canonical HEAD had moved to 176, so 139 was stale. Multi-item grouping needs NO order-table change (cart rows link via the existing indexed `product_orders.stripe_session_id` + the Stripe session metadata id array, capped at 12 items); the migration therefore carries only the `promo_codes` table (tenant-scoped, percent-XOR-fixed, window, usage cap) plus the capped atomic `apply_promo_use()` RPC and tenant RLS. Migration authored, not applied live.**
- [x] Task 6.2: Build client cart state provider (`components/cart/CartProvider.tsx`). — **RECONCILED 2026-10-16: implemented as `lib/store-cart.ts` (external-store `useStoreCart(slug)`, localStorage `aldriva_store_cart_<slug>`, 12-item/100-qty bounds, de-dup) plus `components/site/v2/StoreCartDrawer.tsx` (floating button, drawer, review-then-pay). Store-scoped rather than generic: the menu-ordering cart keeps its separate flow untouched.**
- [x] Task 6.3: Implement multi-line checkout route `/api/checkout/cart`. — **DONE 2026-10-16, extended: shared `lib/store-cart-checkout.ts` validation/pricing (tenant, status, stock, live Stripe prices, single-currency, online-payment gate, promo) backs both `POST /api/checkout/cart` (N pending rows + one multi-line session via server-computed `price_data`, session id stamped) and `POST /api/checkout/cart/validate` (priced review, writes nothing).**
- [x] Task 6.4: Update Stripe webhook handler to fulfill multi-item line orders. — **DONE 2026-10-16: `fulfillProductCart` (metadata id array bounded + UUID-checked, row-total sum guard vs charged total, per-row idempotent `markProductOrderPaid`, per-row failure alerts, single promo burn iff ≥1 row newly paid).**
- [x] Task 6.5: Author automated tests in `lib/__tests__/unified-commerce.test.cjs` and append to `package.json`. — **RECONCILED 2026-10-16: covered by `lib/__tests__/store-cart-checkout.test.cjs` (19 tests, registered) instead of the planned filename; same acceptance surface plus promo, idempotency-contract, and tenant-privacy assertions.**

## 13. Deferred in the Store milestone (explicit, not omitted)
- Promo/owner UI: the promo backend (table, validation, application, usage burn, tests) is implemented, but no dashboard UI creates codes yet and the checkout promo field only accepts codes an owner provisions out-of-band. Owner code management belongs to M5 dashboard work.
- Automated tax calculations and shipping-rate engine: the cart charges server-validated subtotal minus promo only; no tax/shipping lines are shown.
- Unified fulfillment dashboard: menu orders keep `/dashboard/org/[id]/orders`; product revenue stays on `/dashboard/products`. No combined fulfillment view was built.
- Crypto carts (per-invoice by design, Phase 6 §3), refunds automation (`online_refund_required` manual path unchanged), product variants (no schema/UI), subscription items in carts (rejected with a same-flow message).

## 6. Acceptance Criteria
- [ ] Buyers can add multiple items from a business to their cart and checkout in one transaction.
- [ ] Discount codes apply accurate percentage or fixed reductions.
- [ ] All tests passing.

## 7. Current Status
**PARTIAL — Store multi-item commerce implemented in the working tree (2026-10-16); promo owner UI, tax engine, and unified fulfillment dashboard deferred (see §13).**

## 8. Completed Work
- Single-item ticket and digital product checkouts verified complete in Phase 0.

## 9. Remaining Work
- Tasks 6.1 through 6.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 5 completion.
