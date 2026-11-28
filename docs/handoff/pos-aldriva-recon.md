# POS / Commerce Recon — Aldriva (origin/staging)

**Date:** 2026-11-27  
**Mode:** READ-ONLY recon. No edits outside this file, no commits, no pushes, no migrations, no SQL, no DB queries.  
**Worktree:** `C:\Users\Youngyz\aldriva-pos-recon` (fresh, detached)  
**Source:** `origin/staging` fetched first; worktree created with `git worktree add --detach ... origin/staging`  
**HEAD:** `5c9756b4c Merge pull request #17 from Youngyz1/merge/showcase-into-staging` (VERIFIED — `git log -1`)  
**Main folder / rental scan-codes work:** not touched.

## Evidence labels

- **VERIFIED** — confirmed in code/git in this worktree.
- **UNVERIFIED** — claimed by docs/owner but not independently verifiable here (no DB access, no runtime, or not executed).
- **CONTRADICTED** — doc/claim conflicts with code/git evidence.
- **NOT FOUND** — searched for; absent.

---

## 1. Documentation claims reviewed

Read fully: `docs/phases/phase-11-pos.md`, `phase-05-products-services.md`, `phase-06-commerce.md`, `phase-07-bookings.md`, `phase-08-business-management.md`, `phase-10-webhooks.md`, `docs/HANDOFF.md`, `docs/CURRENT-STATE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/DATABASE.md`. Also read `docs/phases/phase-kitchen-delivery.md` because HANDOFF/Phase 6 route the kitchen/delivery workstream there.

### Claim verification matrix

| Claim (source) | Status | Evidence |
|---|---|---|
| Phase 11 POS is NOT STARTED; no `lib/pos*`, no POS routes, no `app/dashboard/org/[id]/pos`, no Square/Clover/Toast refs in `*.ts` (phase-11-pos.md §STATUS) | **VERIFIED (code absence)** | `lib/pos*` NOT FOUND; no `app/dashboard/org/[id]/pos` route files; `git grep -l "Square\|Clover\|Toast" -- *.ts *.tsx` returns only unrelated/non-POS hits in broader scan; phase doc's own grep claim consistent with targeted search. No POS connector/normalizer code present. |
| Phase 10 outbound webhooks NOT STARTED; only inbound Stripe webhook exists (phase-10-webhooks.md §STATUS) | **VERIFIED** | `app/api/webhooks/stripe/route.ts` exists; `app/api/webhooks/new-content/route.js` exists. No webhook subscription/dispatch tables/code found by doc claim; no `lib/webhooks-dispatcher.ts`. Outbound webhook system NOT FOUND. |
| Phase 9 public developer API NOT STARTED; no `/v1`, no API keys (HANDOFF/ROADMAP) | **VERIFIED** | No `app/api/v1/` directory found; no `api_keys` migration in reviewed areas. Internal session-cookie API routes exist under `app/api/**`. |
| Phase 6 store cart/checkout built (store-cart, cart drawer, `/api/checkout/cart`, `/api/checkout/cart/validate`, shared validation) (phase-06) | **VERIFIED** | `lib/store-cart.ts`, `lib/store-cart-checkout.ts`, `components/site/v2/StoreCartDrawer.tsx` (referenced by phase/code), `app/api/checkout/cart/route.ts`, `app/api/checkout/cart/validate/route.ts`. |
| Promo codes: migration 177, lib/promo-codes.ts, apply_promo_use RPC, owner UI/actions (phase-06) | **VERIFIED** | `db/migration_177_store_promo_codes.sql` + rollback; `lib/promo-codes.ts`; `lib/actions/promo-codes.ts`; `components/dashboard/store/PromoCodesManager.tsx` referenced by phase; `lib/promo-codes-roles.ts`; test `lib/__tests__/promo-codes-actions.test.cjs`. |
| Migration 177 applied on staging (phase-06, owner statement) | **UNVERIFIED** | Owner-reported only; no DB query performed. |
| Orders/payments: migrations 171,173,174,175; orders actions/dashboard (phase-06) | **VERIFIED** | `db/migration_171_orders.sql`, `173_order_online_payment.sql`, `174_order_timing.sql`, `175_owner_managed_delivery.sql` (+ rollbacks present). `lib/actions/orders.ts`; `app/dashboard/org/[id]/orders/page.tsx` and client/components exist in git. |
| Owner-managed delivery 175 has uncommitted edits / rollback decision pending (phase-06, HANDOFF) | **CONTRADICTED in this clean worktree / UNVERIFIED as current risk** | Current worktree is clean at `origin/staging` HEAD. The "uncommitted edits" claim describes another worktree/state, not this detached staging snapshot. Code currently contains idempotent/guarded patterns in migration 175 files as committed at HEAD. |
| Kitchen & delivery workstream partially built; migration 185/186 applied on staging per owner report (HANDOFF, phase-kitchen-delivery) | **PARTIALLY VERIFIED** | Code exists: migrations 185,186,189-192,200-203 files; `lib/actions/kitchen-management.ts`, `kitchen-orders.ts`, `courier-management.ts`; `app/kitchen/*`, `app/courier/*`, `app/api/kitchen/*`, `app/api/courier/*`. Staging application = **UNVERIFIED** (owner-reported). |
| Kitchen display exists (phase-kitchen-delivery historical said not found; newer status says implemented) | **VERIFIED** | `app/kitchen/display/page.tsx` exists; `app/api/kitchen/display/bootstrap/route.ts` exists. |
| Courier/driver dashboard exists (phase-kitchen-delivery) | **VERIFIED** | `app/courier/page.tsx`, `app/courier/accept/page.tsx`, `app/api/courier/*` routes present. |
| No automated tax calculation (phase-06) | **VERIFIED (absence)** | Cart/checkout computes subtotal - promo + delivery fee; no tax engine/service found in store-cart-checkout/order-submit path. |
| No unified fulfillment dashboard across menu/product/rental (phase-06) | **VERIFIED (absence/partial)** | Org orders dashboard exists (`/dashboard/org/[id]/orders`); product revenue/orders separate dashboard patterns exist (`/dashboard/products`, product_orders model). No single unified fulfillment dashboard found. |
| Multi-item crypto carts not built (phase-06) | **VERIFIED** | `app/api/checkout/product-crypto/route.ts`, `business-crypto/route.ts` exist (single-item style); no cart crypto route found. |
| Reservations request engine built but hidden from nav (phase-07 older status) / nav unhidden later (HANDOFF/CURRENT-STATE notes vary) | **UNVERIFIED / needs runtime nav check** | Code exists: `db/migration_176_reservations.sql`, `lib/actions/reservations.ts`, `app/dashboard/org/[id]/reservations/page.tsx`, `app/site/[slug]/reservations/[lookup_token]/page.tsx`. Nav visibility not fully verified by this recon pass; CURRENT-STATE mentions booking nav/reservation filter fixes. |
| Scheduling/slot engine, booking widget, calendar, `.ics`, SMS confirmations not built (phase-07) | **PARTIALLY VERIFIED** | No `lib/bookings.ts` slot engine per phase claim; no `components/bookings/BookingWidget.tsx`. However, `lib/actions/general-booking.ts`, `app/dashboard/org/[id]/bookings/page.tsx`, `components/dashboard/bookings/*` exist (service-business booking flow). Slot/availability engine maturity is mixed; calendar timelines/ICS/SMS NOT FOUND as complete Phase 7 scope. |
| Phase 8 branches built; shifts/rosters/inventory/cross-branch reporting not built (phase-08) | **CONTRADICTED (inventory/shifts now exist)** | Branches: `db/migration_132_business_type_and_branches.sql`, `lib/actions/business-branches.ts`, `app/dashboard/businesses/[id]/branches/page.tsx`. Inventory: `db/migration_268_inventory_foundation.sql`, `269_inventory_transfers.sql`, `lib/actions/inventory.ts`, `app/dashboard/org/[id]/inventory/*` exist. Shifts: `db/migration_266_staff_shifts.sql`, `lib/actions/staff-shifts.ts` exist. Cross-branch/consolidated analytics still limited (`app/dashboard/analytics/page.tsx` is stub). |
| No `service_categories` table (phase-05) | **CONTRADICTED** | `lib/actions/service-categories.ts` exists; CURRENT-STATE notes migration 220 service categories applied by owner. |
| Menu options/promotions migrations 182-184 applied on staging per owner report (HANDOFF/CURRENT-STATE) | **UNVERIFIED** | Migration files exist: 182,183,184 and rollbacks/mirror for 184; owner-reported applied on staging. No DB query. |
| Inventory foundation in staff-management merge (CURRENT-STATE) | **VERIFIED in code, staging application UNVERIFIED** | Migrations 268/269 exist with rollbacks/verifies; inventory action/UI/routes exist. DB not queried. |
| Rental handover implemented, migration 233 applied on staging (phase-07/CURRENT-STATE) | **PARTIALLY VERIFIED** | `db/migration_233_rental_handover.sql` exists; `lib/actions/rental-handover.ts`, `components/dashboard/rentals/HandoverPanel.tsx`, `lib/rental/*` exist. Staging application UNVERIFIED. |

---

## 2. Worktree/git verification notes

- **VERIFIED** clean worktree: `git status --short` empty.
- **VERIFIED** detached HEAD at `origin/staging` merge commit `5c9756b4c`.
- This means "uncommitted workstream" claims in phase docs may be historical relative to other worktrees/branches; they are not evidence of uncommitted files here.

---

## 3. Area inventory (POS-relevant / overlapping)

### 3.1 Products & catalogue

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Product catalog tables/models | **VERIFIED** | `db/migration_116_digital_products.sql` (pre-existing, referenced in docs), `products`, `product_orders`, `product_assets`, `product_downloads` in `docs/DATABASE.md`. Storefront/cart code queries `products`. | Digital + physical product records share `products` table; type/price fields used by checkout. |
| Services & menus | **VERIFIED** | `db/migration_136_services_and_menus.sql`, `182_menu_option_groups.sql`, `183_menu_option_assignment_cleanup.sql`, `184_menu_promotions.sql`, `220_service_categories.sql`; `lib/actions/services.ts`, `menus.ts`, `service-categories.ts`, `menu-option-groups.ts`, `promotions.ts`; `app/dashboard/org/[id]/services/*`, `menu/*`, `promotions/*`. | Strong catalog for restaurant/menu/service POS overlap. |
| Menu option groups / promotions | **VERIFIED** | `lib/menu-pricing.ts`, `lib/menu-promotions.ts`, `lib/menu-promotion-data.ts`, `lib/actions/promotions.ts`, `components/dashboard/menu/*` (per phase/docs). | Ordering snapshots include chosen options/promotions. |
| Store/public catalog rendering | **VERIFIED** | `components/site/v2/*`, `lib/store-cart.ts`, `lib/store-cart-checkout.ts`, `app/site/[slug]/...` routes. | Store template uses tenant product catalog. |

**Permission keys / access:** service/menu actions generally use tenant access checks (`requireTenantContext`/`checkTenantAccess` patterns per phase-05). Promotion/promo actions use role lists (e.g. `lib/promo-codes-roles.ts`, promo actions verify tenant access). Exact role matrices are spread across actions; no single POS permission map.

### 3.2 Inventory

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Inventory foundation tables | **VERIFIED** | `db/migration_268_inventory_foundation.sql` (+ rollback/verify): `inventory_items`, `inventory_locations`, `inventory_balances`, `inventory_movements`; `db/migration_269_inventory_transfers.sql` adds transfer RPC/archive guard. | Stock ledger is separate from `products.stock_quantity`. |
| Inventory actions | **VERIFIED** | `lib/actions/inventory.ts` (`listInventory`, `ensureDefaultLocation`, `createInventoryItem`, `updateInventoryItem`, `setInventoryItemActive`, `adjustStock`, `getInventoryItemDetail`, `transferStock`, location CRUD). Uses `assertCanAccessBusinessStaffArea`; RLS/RPC enforce permissions. | Adjustments go through `inventory_apply_movement` RPC; no direct stock writes from client. |
| Inventory UI/routes | **VERIFIED** | `app/dashboard/org/[id]/inventory/page.tsx`, `[itemId]/page.tsx`, `locations/page.tsx`; `components/dashboard/inventory/*`. | Org dashboard inventory pages exist. |
| Inventory permissions | **VERIFIED (partial)** | `assertCanAccessBusinessStaffArea` gate in actions; DB RLS/policies in migration 268/269 (not fully re-read here). Inventory errors map DB denials to readable codes. | Fine-grained permission keys are DB/RPC + staff/workforce layer, not a simple POS ACL table. |

**Gap/seam:** `products.stock_quantity` (product catalog) and `inventory_*` ledger are parallel stock systems. No verified automatic sync between product sales and inventory ledger.

### 3.3 Orders & checkout

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Storefront/menu orders table | **VERIFIED** | `db/migration_171_orders.sql` creates `public.orders` (organizer/business/website scoped, fulfilment, amounts, status, payment_method/status, items jsonb, tracking token, idempotency). Later migrations extend (173 online payment, 174 timing, 175 delivery/rider, 198 dine-in/table fields, 199 settlement, etc.). | Central order record for menu/storefront/QR dine-in flows. |
| Order submission/pricing/validation | **VERIFIED** | `lib/order-submit.ts` (`submitOrderRequestWithClient`) validates honeypot, rate limits, customer info, fulfilment, idempotency, business approval, storefront features, promo/menu pricing, schedule/hours, dine-in table session/caps, inserts order, dispatches notifications. | Server-authoritative pricing; no client totals trusted. |
| Order actions | **VERIFIED** | `lib/actions/orders.ts`: `submitOrderRequest`, `validatePromoCode`, `updateOrderStatus`, `assignRegisteredCourier`, `adjustEstimatedReadyTime`, `updateRiderDetails`, `saveDeliverySettings`, `confirmDineInOrder`, `declineDineInOrder`. | Role checks: owner/admin/manager for most ops; confirm/decline dine-in allows editor. |
| Checkout routes | **VERIFIED** | `app/api/checkout/cart/route.ts`, `cart/validate/route.ts`, `product/route.ts`, `product-crypto/route.ts`, `business/route.ts`, `business-crypto/route.ts`, `app/api/checkout/route.ts`. | Multi-item cart is Stripe; crypto routes exist for product/business single-item flows. |
| Order status graphs | **VERIFIED** | `lib/orders/transition-graphs.ts`: pickup, delivery, dine-in graphs; statuses include pending/accepted/preparing/ready/picked_up/out_for_delivery/delivered/completed/cancelled. | Dine-in/pickup/delivery differ. |
| Org orders dashboard | **VERIFIED** | `app/dashboard/org/[id]/orders/page.tsx`, `OrdersClient.tsx`, `components/dashboard/orders/*` (present in git). | Operational management UI. |

**Permissions:** `checkTenantAccess` roles (`owner/admin/manager`, sometimes `editor`) in `lib/actions/orders.ts`. Public submission uses rate limits and server validation, no tenant role.

### 3.4 Payments (Stripe, crypto, cash)

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Stripe | **VERIFIED** | `app/api/webhooks/stripe/route.ts`; Stripe use in `lib/store-cart-checkout.ts`, checkout routes, payment-related actions/libs. `lib/ai/tools/tenant/tenant-payments.ts` exists. | Stripe is primary online card rail. |
| NOWPayments / crypto | **VERIFIED** | `app/api/checkout/product-crypto/route.ts`, `business-crypto/route.ts`, `lib/cryptoPayment.ts` exists. DATABASE/DECISIONS mention dual payment rails. | Crypto is present but cart crypto multi-item called out as not built. |
| Online order payment | **VERIFIED** | `payment_method: "on_fulfilment" | "online"` in order-submit; migration 173 order online payment; `online_payment_required`/unsupported currency checks. | Webhook-paid truth pattern per DECISIONS/phase docs. |
| Cash / pay on fulfilment | **VERIFIED** | `orders.payment_method` includes `on_fulfilment` (`migration_171`), order-submit defaults to `on_fulfilment`; delivery cash confirmation in `lib/orders/transition-core.ts` sets `cash_collected_confirmed` when delivered and `markPaymentCollected` for unpaid on_fulfilment; courier tests reference cash collected confirmation. | "Cash" is operationally represented as pay-on-fulfilment / cash collected, not a cash-register/POS tender module. |
| Refund/payment labels | **VERIFIED** | `lib/order-payment-label.ts` (exists), order payment status fields. | UI/payment state mapping present. |

**Gap:** No explicit POS cash drawer/cash register shift closeout module found. Cash handling is order-level (on fulfilment / collected) rather than register-based.

### 3.5 Promo codes & promotions

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Store promo codes | **VERIFIED** | `db/migration_177_store_promo_codes.sql`, `lib/promo-codes.ts`, `lib/actions/promo-codes.ts`, `lib/promo-codes-roles.ts`, `components/dashboard/store/PromoCodesManager.tsx` (referenced), `app/api/checkout/cart/validate` uses promo validation. | Tenant-scoped codes, percent/fixed, window, max uses, atomic use RPC. |
| Menu promotions | **VERIFIED** | `db/migration_184_menu_promotions.sql`, `lib/actions/promotions.ts`, `lib/menu-promotions.ts`, `lib/menu-promotion-data.ts`, `lib/menu-promotion-schema.ts`, `app/dashboard/org/[id]/promotions/page.tsx`. | Separate from store promo codes. |
| Promotion engine / marketing promotions | **VERIFIED** | `lib/promotionEngine.js`, `db/migration_134_homepage_promotions.sql`, `260_promotions_highlight_destinations.sql`. | Different domain than checkout promo codes; naming overlap risk. |

**Seam:** Three promo/promotion concepts exist: store checkout promo codes, menu promotions, and homepage/marketing promotions. They are related by name but different schemas/flows.

### 3.6 Reservations & bookings

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Reservations | **VERIFIED** | `db/migration_176_reservations.sql`, `204-206,215-218` reservation migrations; `lib/actions/reservations.ts`; `app/dashboard/org/[id]/reservations/page.tsx`; `app/site/[slug]/reservations/[lookup_token]/page.tsx`. | Table/reservation request engine; stages C/D change requests/capacity. |
| Service/general bookings | **VERIFIED** | `lib/actions/general-booking.ts`, `bookings.ts`; `app/dashboard/org/[id]/bookings/page.tsx`; `components/dashboard/bookings/*`; `lib/general-booking-notifications.ts`. | Service-business booking flow exists alongside reservations. |
| Public booking UI | **PARTIAL** | `app/site/[slug]/book/page.tsx` exists (`git ls-files` shows), `components/site/reservations/GeneralBookingForm.tsx` referenced by CURRENT-STATE. No `components/bookings/BookingWidget.tsx` per phase-07. | Not the full Phase 7 slot/calendar vision. |

**Gaps:** full calendar timelines, staff scheduling/assignment engine, SMS, `.ics` not fully built as phase-07 originally planned.

### 3.7 Rentals

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Rental schema | **VERIFIED** | `db/migration_224-230,232,233,262,263` rental migrations. | Fleet, bookings, hardening, storefront settings, payments, transition, vehicle photo, handover, staff assignment, booking privileges. |
| Rental actions/libs | **VERIFIED** | `lib/actions/rental-bookings.ts`, `rental-categories.ts`, `rental-handover.ts`, `rental-pay.ts`, `rental-public.ts`, `rental-settings.ts`, `rental-staff-assignments.ts`, `my-rental-assignments.ts`; `lib/rental/*` (agreement, allocation, checkout, emails, handover-guards, late-fee, pricing, receipt, validation etc.). | Substantial rental domain, overlapping with POS (checkout, deposit, handover, receipt, staff assignment). |
| Rental UI/routes | **VERIFIED** | `app/dashboard/org/[id]/rentals/*` exists; `components/dashboard/rentals/HandoverPanel.tsx` referenced. Public booking/lookup pages exist. | Rental operations are built, some QA pending per docs. |
| Rental receipts | **VERIFIED** | `lib/rental/receipt-data.ts`, `lib/rental/receipt.ts`, rental receipt panel mentioned in CURRENT-STATE. | Separate from donation receipt and no general POS order receipt system found. |

### 3.8 Kitchen display

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Kitchen worker access | **VERIFIED** | `db/migration_185_kitchen_worker_access.sql`; `lib/actions/kitchen-management.ts`; `lib/kitchen/*`; `app/kitchen/accept/page.tsx`; `app/api/kitchen/accept/*`, `session`, `logout`, `display/bootstrap`. | Cook invite/session/display-link model. |
| Kitchen orders/display | **VERIFIED** | `lib/actions/kitchen-orders.ts` (`transitionKitchenOrder`, cook session, allowed accepted->preparing->ready); `app/kitchen/page.tsx`, `app/kitchen/display/page.tsx`; kitchen order routes/components exist. | Kitchen can advance limited statuses via shared transition core. |
| Kitchen owner dashboard | **VERIFIED** | `app/dashboard/org/[id]/kitchen/page.tsx`, `components/dashboard/kitchen/KitchenManagementClient.tsx`, `CookPerformancePanel.tsx` referenced. | Includes management and performance reporting. |

**Permissions:** cook/courier session cookies distinct; kitchen routes require role cook; owner management uses owner/admin/manager tenant access.

### 3.9 Staff roles & permissions

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Staff/workforce schema | **VERIFIED** | `db/migration_231-267` staff-management migrations (members, roles, invitations, sessions, branch scopes, audit logs, shifts, worker links, grants tightening, RLS). | Large workforce model, separate from event staff and kitchen worker access. |
| Staff actions | **VERIFIED** | `lib/actions/staff-members.ts`, `staff-invitations.ts`, `staff-role-assignments.ts`, `staff-roles.ts`, `staff-shifts.ts`, `staff-worker-links.ts`. | Staff CRUD/role/shift/link flows. |
| Staff permission/capability model | **VERIFIED** | `lib/staff/staff-capabilities.ts`, `staff-capabilities-server.ts`, `roles-access.ts`, `role-permission-grouping.ts`; permissions are dotted keys (CURRENT-STATE says 62-key catalogue migration 235). | UI capability mirrors RLS; DB is real gate. |
| Event/kitchen/courier staff | **VERIFIED** | Event staff: migrations 164-166,196,211, `lib/staff/*`, `app/api/staff/*`. Kitchen/courier workers: migration 185/186 and `lib/kitchen/*`, `lib/courier/*`. | Multiple staff systems with overlapping concepts (worker/member/role/session). |

**Seam:** There are at least four personnel concepts: `entity_members` (tenant roles), `business_workers` (kitchen/courier), staff-management `staff_*` tables (generic workforce), and event staff/sessions. POS unification would need careful mapping.

### 3.10 Branches & locations

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Business branches | **VERIFIED** | `db/migration_132_business_type_and_branches.sql`; `lib/actions/business-branches.ts`; `lib/branches/*`; `app/dashboard/businesses/[id]/branches/page.tsx`, `components/dashboard/branches/*`. | Branch CRUD with main-branch guards, cover image validation, audit logging. |
| Inventory locations | **VERIFIED** | `inventory_locations` in migration 268/269; `lib/actions/inventory.ts` location create/update/archive; `app/dashboard/org/[id]/inventory/locations/page.tsx`. | Locations can be branch-linked or business-wide; stock is location-scoped. |
| Kitchen/worker branch scoping | **PARTIAL/VERIFIED** | Kitchens belong to business; workers have business/kitchen scope. Staff branch scopes exist in migrations 238/253/254. | Branch-aware operations exist but not a single branch POS terminal model. |

### 3.11 Receipts & printing

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Donation receipt PDF/email | **VERIFIED** | `lib/receipt.ts` generates donation receipt/tax-deductible PDF via jsPDF and emails via Resend; `/api/receipts/[id]` implied. | Not POS/order receipt. |
| Rental receipt/printed receipt | **VERIFIED** | `lib/rental/receipt.ts`, `lib/rental/receipt-data.ts`, CURRENT-STATE "Rental receipt printer" describes 80mm print CSS, PDF, email, no QR/barcode encoding booking number. | Rental-specific. |
| Order/store POS receipt printing | **NOT FOUND as general POS receipt** | No general `order receipt` print/PDF module found comparable to rental receipt; order tracking/confirmation exists. | Gap for POS. |

### 3.12 Reports & analytics

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Cross-org analytics stub | **VERIFIED** | `app/dashboard/analytics/page.tsx` — aggregates event/fundraiser counts and total raised; shows "Detailed charts are coming soon". | Explicitly partial. |
| Reports page | **VERIFIED** | `app/dashboard/reports/page.tsx`, `ReportsClient.tsx`, `DashboardCharts.tsx`. | Needs deeper review for POS relevance; exists. |
| Kitchen/cook performance | **VERIFIED** | `lib/actions/cook-performance.ts`, `courier-performance.ts`; kitchen/courier performance UI/tests referenced. | Operational reporting, not full POS sales reporting. |
| Unified sales/POS reporting | **NOT FOUND** | No consolidated POS sales report across in-store/online/channels. | Expected Phase 11+ gap. |

### 3.13 Website builder & store

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Website builder/templates | **VERIFIED** | `app/dashboard/org/[id]/website/*`, `components/dashboard/website/builder/*`, `lib/website-*`, `tenant_websites` model. | Mature website builder; not POS terminal but commerce surface. |
| Store storefront | **VERIFIED** | `lib/store-cart.ts`, `components/site/v2/StoreCartDrawer.tsx`, `app/api/checkout/cart/*`, store template resolution in `lib/store-cart-checkout.ts`. | Online store overlaps POS catalog/checkout. |
| QR/menu/table ordering | **VERIFIED** | Migrations 198/199 table QR/settlement; `/q/[code]` redirect and table/session flows per CURRENT-STATE; dine-in in order-submit. | Strong dine-in POS-adjacent flow. |

### 3.14 Customers & loyalty

| Item | Status | Evidence (paths) | Notes |
|---|---|---|---|
| Customer fields on orders | **VERIFIED** | `orders` stores `customer_name`, `customer_phone`, `customer_email`, delivery address/note; order-submit validates. | Transactional customer data, not CRM. |
| Customer identities (messaging/AI) | **VERIFIED** | `db/migration_110_customer_identities.sql` exists; referenced in tenant architecture tests. | AI/messaging domain; not POS customer CRM/loyalty. |
| Loyalty/points/rewards | **NOT FOUND** | No loyalty/rewards/points schema or module found in targeted search. | Gap. |
| Customer accounts/CRM | **NOT FOUND as POS CRM** | No dedicated customer CRM dashboard/module for POS; users/profiles exist for platform accounts. | Gap. |

---

## 4. Duplicate ledgers / systems / seams

| Seam | Status | Evidence | POS impact |
|---|---|---|---|
| **Product stock vs inventory ledger** | **VERIFIED** | `products.stock_quantity` used by store cart/checkout and product flows; inventory uses `inventory_items/balances/movements` with RPCs in `lib/actions/inventory.ts` + migrations 268/269. | High. POS must decide authoritative stock source and sync strategy. |
| **Multiple order systems** | **VERIFIED** | `orders` (menu/storefront/dine-in) in migration 171+; `product_orders` (product checkout) in migration 116/DATABASE; rental bookings in 225+; ticket orders/ticket instances in events. | High. Unified POS reporting/fulfillment needs cross-model normalization. |
| **Multiple promo/promotion models** | **VERIFIED** | Store promo codes (`promo_codes`, migration 177), menu promotions (184), homepage/marketing promotions (134/260/promotionEngine). | Medium. Different semantics and scopes. |
| **Multiple staff/role systems** | **VERIFIED** | `entity_members` roles; staff-management `staff_*` with dotted permission keys (231+); `business_workers` kitchen/courier (185/186); event staff. | High. POS register permissions must map carefully. |
| **Cash representation** | **VERIFIED** | `payment_method` on_fulfilment/online/mobile_money? (171 includes mobile_money in CHECK as seen) and cash collected confirmation in transition core; no cash drawer/register. | Medium. POS cash drawer would be new. |
| **Receipt systems** | **VERIFIED** | Donation receipt (`lib/receipt.ts`), rental receipt (`lib/rental/receipt-data.ts`), no general order POS receipt. | Medium. POS needs order receipt/print template. |
| **Built but not fully connected** | **PARTIAL** | Inventory exists but not clearly wired to product/order decrement; analytics stubs exist; reservations/bookings partially connected; kitchen/courier has rich flow but still maturing. | High for POS rollout. |

---

## 5. Gaps and risks (POS comparison prep)

### Likely gaps vs a typical POS

- **NOT FOUND:** POS connector framework (Square/Clover/Toast), terminal management, hardware register mode.
- **NOT FOUND:** Unified cash register/session, cash drawer open/close, Z-report/X-report, shift cash reconciliation.
- **NOT FOUND:** Loyalty/points/rewards, customer CRM profiles, customer purchase history UI.
- **NOT FOUND:** General order receipt printing/PDF for storefront/menu orders (rental receipt exists; donation receipt exists).
- **NOT FOUND:** Unified multi-channel sales reporting; analytics page is stub.
- **NOT FOUND:** Multi-item crypto cart; automated tax engine.
- **PARTIAL:** Inventory exists but appears disconnected from product stock and sales decrement.
- **PARTIAL:** Staff/permissions are powerful but fragmented across domains.
- **PARTIAL:** Offline-first POS register behavior (events have offline scanner patterns; commerce POS does not).

### Risks / verification needed

- Many migration application statuses are **owner-reported or unknown**; no `schema_migrations` table (DATABASE.md). Do not assume staging/prod parity.
- This recon used code/git only; no runtime QA, no DB inspection.
- Some docs are stale relative to code (e.g., Phase 8 saying inventory/shifts not built is contradicted by migrations 266/268/269 and actions).
- Sensitive flows exist (payments, handover, staff invitations/sessions). POS comparison should include security/permission review before reuse.

---

## 6. Key file index (quick lookup)

| Area | Key files |
|---|---|
| POS phase | `docs/phases/phase-11-pos.md` |
| Orders | `db/migration_171_orders.sql`, `173`, `174`, `175`, `199`, `203`; `lib/order-submit.ts`; `lib/actions/orders.ts`; `lib/orders/transition-core.ts`; `lib/orders/transition-graphs.ts`; `app/dashboard/org/[id]/orders/*` |
| Checkout/payments | `app/api/checkout/cart/route.ts`, `cart/validate/route.ts`, `product/route.ts`, `product-crypto/route.ts`, `business/route.ts`, `business-crypto/route.ts`; `app/api/webhooks/stripe/route.ts`; `lib/store-cart.ts`; `lib/store-cart-checkout.ts`; `lib/cryptoPayment.ts` |
| Promo | `db/migration_177_store_promo_codes.sql`; `lib/promo-codes.ts`; `lib/actions/promo-codes.ts`; `lib/actions/promotions.ts`; `lib/menu-promotions.ts` |
| Inventory | `db/migration_268_inventory_foundation.sql`; `269_inventory_transfers.sql`; `lib/actions/inventory.ts`; `lib/inventory/errors.ts`; `app/dashboard/org/[id]/inventory/*` |
| Rentals | `db/migration_224-230,232,233,262,263`; `lib/actions/rental-*.ts`; `lib/rental/*`; `app/dashboard/org/[id]/rentals/*` |
| Kitchen/courier | `db/migration_185-192,200-203`; `lib/actions/kitchen-management.ts`; `kitchen-orders.ts`; `courier-management.ts`; `lib/kitchen/*`; `lib/courier/*`; `app/kitchen/*`; `app/courier/*`; `app/api/kitchen/*`; `app/api/courier/*` |
| Staff/roles | `db/migration_231-267`; `lib/actions/staff-*.ts`; `lib/staff/*`; `app/dashboard/org/[id]/workforce/*`, staff routes |
| Branches/locations | `db/migration_132_business_type_and_branches.sql`; `lib/actions/business-branches.ts`; `lib/branches/*`; `app/dashboard/businesses/[id]/branches/*`; inventory locations |
| Reservations/bookings | `db/migration_176,204-206,215-218`; `lib/actions/reservations.ts`; `general-booking.ts`; `bookings.ts`; `app/dashboard/org/[id]/reservations/*`; `bookings/*` |
| Receipts | `lib/receipt.ts` (donation); `lib/rental/receipt.ts`; `lib/rental/receipt-data.ts` |
| Analytics/reports | `app/dashboard/analytics/page.tsx`; `app/dashboard/reports/*` |
| Customers/loyalty | `db/migration_110_customer_identities.sql` (messaging/AI); no loyalty module found |

---

## 7. Suggested next comparison axes for Olgax POS

1. **Catalog model:** products/services/menu/rentals vs Olgax item types, modifiers, variants, bundles.
2. **Stock authority:** `products.stock_quantity` vs `inventory_balances/movements` vs Olgax stock ledger.
3. **Order model:** `orders` + `product_orders` + rentals/tickets vs Olgax unified order/sale model.
4. **Payments/tenders:** Stripe/crypto/on-fulfilment vs Olgax cash/card/mobile/tender split, partial payments, refunds.
5. **POS operations:** register/session, cash drawer, receipt printing, barcode/QR scan, offline mode.
6. **Staff/permissions:** entity members + staff dotted permissions + kitchen/courier workers vs Olgax role model.
7. **Locations/branches:** branch + inventory location + kitchen scope vs Olgax store/terminal model.
8. **Reporting:** stub analytics vs Olgax Z/X, sales, tax, inventory, staff performance reports.
9. **Customer/loyalty:** absent vs Olgax CRM/loyalty.
10. **Integration seam:** Phase 11 POS plan vs actual Olgax APIs/events required.

*End of recon. No files other than this report were created/modified; no commit was made.*