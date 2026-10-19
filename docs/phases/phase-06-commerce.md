# Phase 6: Unified Commerce

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
