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
- [ ] Task 6.1: Author `db/migration_139_cart_and_discounts.sql` (and rollback twin) for promo codes and multi-item orders. *(Note: migrations 137 and 138 were allocated to Phase 5 hardening (`business_moderation_guard_and_screening` and `business_moderation_resubmit_and_organizer_guard`), so Phase 6 shifts from 137 to 139.)*
- [ ] Task 6.2: Build client cart state provider (`components/cart/CartProvider.tsx`).
- [ ] Task 6.3: Implement multi-line checkout route `/api/checkout/cart`.
- [ ] Task 6.4: Update Stripe webhook handler to fulfill multi-item line orders.
- [ ] Task 6.5: Author automated tests in `lib/__tests__/unified-commerce.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] Buyers can add multiple items from a business to their cart and checkout in one transaction.
- [ ] Discount codes apply accurate percentage or fixed reductions.
- [ ] All tests passing.

## 7. Current Status
**PLANNED**

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
