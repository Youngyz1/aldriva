# Olgax POS — Analysis for Aldriva Integration

**Date:** 2026-11-27  
**Mode:** READ-ONLY analysis. No edits to either repo, no installs, no copying, no commits.  
**Olgax repo:** `C:\Users\Youngyz\olgax-pos` (inspected in place)  
**Aldriva recon:** `C:\Users\Youngyz\aldriva-pos-recon\docs\handoff\pos-aldriva-recon.md`  
**Aldriva worktree:** `C:\Users\Youngyz\aldriva-pos-recon` (detached `origin/staging` `5c9756b4c`, clean except this report)

## Evidence labels

- **VERIFIED** — confirmed in code/docs in inspected repos.
- **BEST-EFFORT** — inferred from package metadata/names; not registry-verified in this environment.
- **UNVERIFIED** — cannot confirm without install/registry/runtime/DB.
- **RISK** — security/licensing/architecture concern.

---

## 1. Licence

### 1.1 Root licence

| Item | Status | Evidence |
|---|---|---|
| `LICENSE` is MIT, Copyright (c) 2026 OLGAX (https://olgax.com) | **VERIFIED** | `C:\Users\Youngyz\olgax-pos\LICENSE` full text present; MIT permission notice included. |
| `package.json` declares `"private": true`, no `license` field | **VERIFIED** | `C:\Users\Youngyz\olgax-pos\package.json` (has name/version/private/packageManager/scripts/deps; no `license` field). Root `LICENSE` file is the authoritative licence. |

### 1.2 Dependency licence audit (direct + transitive)

**Method/limitation:** Inspected `package.json` and `pnpm-lock.yaml` (lockfile v9). `pnpm-lock.yaml` contains no `license:` fields (**VERIFIED** by sampling/grep). No `node_modules` present; no installs performed; no registry queries performed. Therefore transitive licence verification is **UNVERIFIED**. Direct dependency licences below are **BEST-EFFORT** based on well-known upstream licences for the exact package names/versions; they must be verified with `pnpm licenses list --json` / registry metadata before copying code.

**Lockfile scale:** 2256 package entries parsed from `pnpm-lock.yaml` (**VERIFIED** by node parse of package keys).

#### Direct dependencies (`package.json`)

| Package | Version | Declared/known licence (BEST-EFFORT) | Flag |
|---|---:|---|---|
| `@aws-sdk/client-s3` | ^3.1004.0 | Apache-2.0 | Verify |
| `@electric-sql/pglite` | ^0.3.15 | Apache-2.0 | Verify |
| `@hookform/resolvers` | ^5.2.2 | MIT | Verify |
| `@prisma/adapter-pg` | ^7.4.2 | Apache-2.0 | Verify |
| `@prisma/client` | ^7.4.2 | Apache-2.0 | Verify |
| `@radix-ui/react-slot` | ^1.2.4 | MIT | Verify |
| `@vercel/blob` | ^2.3.1 | Apache-2.0 | Verify |
| `better-auth` | ^1.5.1 | MIT | Verify |
| `class-variance-authority` | ^0.7.1 | Apache-2.0 | Verify |
| `clsx` | ^2.1.1 | MIT | Verify |
| `framer-motion` | ^12.35.0 | MIT | Verify |
| `geist` | ^1.7.0 | SIL OFL 1.1 (fonts) / MIT (package) - VERIFY | **VERIFY font licence** |
| `lucide-react` | ^0.576.0 | ISC (icons/package commonly ISC; verify) | Verify |
| `next` | 16.1.6 | MIT | Verify |
| `next-intl` | ^4.8.3 | MIT | Verify |
| `pg` | ^8.19.0 | MIT | Verify |
| `react` | 19.2.3 | MIT | Verify |
| `react-dom` | 19.2.3 | MIT | Verify |
| `react-hook-form` | ^7.71.2 | MIT | Verify |
| `recharts` | ^3.7.0 | MIT | Verify |
| `sonner` | ^2.0.7 | MIT | Verify |
| `tailwind-merge` | ^3.5.0 | MIT | Verify |
| `zod` | ^4.3.6 | MIT | Verify |
| `zustand` | ^5.0.11 | MIT | Verify |

#### Direct dev dependencies (`package.json`)

| Package | Version | Declared/known licence (BEST-EFFORT) | Flag |
|---|---:|---|---|
| `@playwright/test` | ^1.58.2 | Apache-2.0 | Verify |
| `@tailwindcss/postcss` | ^4 | MIT | Verify |
| `@testing-library/jest-dom` | ^6.9.1 | MIT | Verify |
| `@testing-library/react` | ^16.3.2 | MIT | Verify |
| `@types/node` | ^20 | MIT | Verify |
| `@types/pg` | ^8.18.0 | MIT | Verify |
| `@types/react` | ^19 | MIT | Verify |
| `@types/react-dom` | ^19 | MIT | Verify |
| `@vitejs/plugin-react` | ^5.1.4 | MIT | Verify |
| `babel-plugin-react-compiler` | 1.0.0 | MIT | Verify |
| `dotenv` | ^17.3.1 | BSD-2-Clause | Verify |
| `eslint` | ^9 | MIT | Verify |
| `eslint-config-next` | 16.1.6 | MIT | Verify |
| `jsdom` | ^28.1.0 | MIT | Verify |
| `prettier` | ^3.8.1 | MIT | Verify |
| `prettier-plugin-tailwindcss` | ^0.7.2 | MIT | Verify |
| `prisma` | ^7.4.2 | Apache-2.0 | Verify |
| `shadcn` | ^3.8.5 | MIT | Verify |
| `tailwindcss` | ^4 | MIT | Verify |
| `tsx` | ^4.21.0 | MIT | Verify |
| `tw-animate-css` | ^1.4.0 | MIT | Verify |
| `typescript` | ^5 | Apache-2.0 | Verify |
| `vite-tsconfig-paths` | ^6.1.1 | MIT | Verify |
| `vitest` | ^4.0.18 | MIT | Verify |

#### Transitive dependencies

| Status | Evidence | Flag |
|---|---|---|
| **UNVERIFIED** | 2256 lockfile package entries; no license metadata in lockfile; no install. | **Must audit before copying.** Run `pnpm licenses list` (or equivalent) in an isolated environment and review all GPL/AGPL/LGPL/SSPL/unknown/no-license packages. |

**Copyleft/unknown flags:** No GPL/AGPL/LGPL/SSPL/unknown licence was confirmed because verification was not possible. This is **not** a clearance. Treat as **RISK: UNVERIFIED** until audited.

### 1.3 Attribution required when copying Olgax code

When copying MIT-licensed Olgax source into Aldriva (or any derivative work):

1. **Keep the copyright notice:** `Copyright (c) 2026 OLGAX (https://olgax.com)` (**VERIFIED** in `LICENSE`).
2. **Keep the MIT permission notice:** include the full MIT permission paragraph and warranty disclaimer from `LICENSE` in the copied source/subtree or in a third-party notices file that clearly covers the copied files.
3. **Identify provenance:** for each copied/adapted file, retain a header/comment or a `NOTICE`/`THIRD_PARTY_NOTICES` entry mapping Aldriva files to Olgax source paths and commit/revision.
4. **Do not copy trademark/branding as implied endorsement:** Olgax name/logo/branding assets require separate review; MIT covers code, not brand rights.
5. **Re-verify dependency licences** for any Olgax dependency you introduce into Aldriva.

Suggested notice (adapt path/revision):

```text
Portions derived from Olgax POS (https://github.com/olgax/olgax-pos)
Copyright (c) 2026 OLGAX (https://olgax.com)
Licensed under the MIT License. See THIRD_PARTY_NOTICES.md.
```

---

## 2. Stack and structure

### 2.1 Olgax POS (observed)

| Area | Olgax | Evidence |
|---|---|---|
| Framework | Next.js 16.1.6, App Router, React 19.2.3, TypeScript strict | `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/**` |
| UI/styling | Tailwind CSS 4, shadcn/Radix primitives, custom components, Framer Motion, lucide-react, Sonner, Geist font | `package.json`, `components.json`, `src/components/**`, `src/app/globals.css` |
| DB | PostgreSQL | `prisma/schema.prisma` datasource `postgresql`, `docker-compose.yml` |
| ORM/data access | Prisma 7.4.x, generated client at `src/generated/prisma`, PrismaPg adapter | `schema.prisma`, `src/lib/db.ts`, `package.json` |
| Auth | Better Auth 1.5.x, email/password, Prisma adapter, `User.role` ADMIN/CASHIER | `src/lib/auth.ts`, `schema.prisma`, `src/proxy.ts` |
| State | Zustand cart store with `persist` | `src/store/cart.ts` |
| Offline layer | PGLite (`idb://olgax-pos`) + `sync_queue`; online hook replays queue | `src/lib/pglite.ts`, `src/lib/sync.ts`, `src/hooks/use-online-status.ts` |
| i18n | next-intl, cookie/DB locale, 14 message files | `src/i18n/request.ts`, `next.config.ts`, `messages/*.json` |
| Build/deploy | Dockerfile + docker-compose (Postgres + web), Next standalone in Docker | `Dockerfile`, `docker-compose.yml`, `README.md` |
| Tests | Vitest unit/component + Playwright e2e; 13 test files found | `package.json`, `vitest.config.ts`, `playwright.config.ts`, `src/tests/**` |
| API style | Route handlers under `src/app/api/**`, server actions under `src/app/actions/**` | file tree |

### 2.2 Aldriva comparison (from recon/AGENTS)

| Area | Aldriva | Implication for Olgax copy |
|---|---|---|
| Framework | Next.js 16.4.3, App Router, React 19.2.4, Turbopack, root `proxy.ts` | Similar framework; not drop-in due to different app structure/conventions. |
| DB | Supabase Postgres + Auth + Storage + RLS | **Major blocker for straight copy.** Olgax assumes Prisma + direct Postgres + Better Auth. |
| Auth/RBAC | Supabase Auth, `lib/auth.ts` (`getCurrentUser`, `isAdmin`, etc.), tenant/entity roles, staff permissions | Olgax ADMIN/CASHIER is too simple; no tenant/org model. |
| Tenancy | `organizers.id` tenant root, `entity_members`, `lib/tenant-context.ts` | Olgax has no tenant isolation; every table/model is single-tenant. |
| i18n | next-intl in Aldriva repo conventions (present in stack) / verify exact setup | Olgax next-intl is straightforward to port, but messages/routes differ. |
| Testing | `node --test` via `scripts/run-tests-chunked.cjs`, explicit `test-files.json` | Olgax Vitest/Playwright tests cannot be dropped in unchanged. |
| Offline | No general POS offline register; event scanner has offline patterns | Olgax PGLite/sync is reusable conceptually, but needs redesign for multi-tenant/auth/idempotency. |

### 2.3 What blocks a straight copy

1. **Data/Auth architecture mismatch (blocking):** Prisma/Better Auth/single-tenant vs Supabase/RLS/multi-tenant. Copying route handlers/server actions as-is would bypass Aldriva auth/RLS conventions.
2. **No tenant scoping (blocking):** Olgax models have no `organizer_id`/`business_id`. Direct lift would create cross-tenant data risk.
3. **Stock model mismatch (blocking):** Olgax mutates `Product.stock` directly in sales/refunds/adjustments. Aldriva's declared single stock truth is `inventory_*` (migration 268/269) while `products.stock_quantity` also exists - Olgax copy would create/strengthen a third ledger.
4. **Server action security gaps (blocking):** `src/app/actions/product-actions.ts` and `settings-actions.ts` have no session/role checks (**VERIFIED**). They cannot be copied as-is.
5. **Schema/status mismatch:** Olgax sale statuses COMPLETED/VOIDED/REFUNDED vs Aldriva order graphs; Olgax payment methods CASH/CARD/OTHER vs Aldriva on_fulfilment/online/mobile_money/crypto.
6. **Testing/build conventions:** Vitest/Playwright vs node:test + `test-files.json`; different lint/build/test gates.
7. **UI/design system mismatch:** Olgax UI is its own Tailwind/shadcn styling; Aldriva requires `DESIGN.md`, zinc/orange tokens, no decorative wrappers, specific nav/density rules.

---

## 3. Feature inventory

| Feature | File paths (key) | Data model | Completeness | Runs in repo? |
|---|---|---|---|---|
| **Offline-first core** | `src/lib/pglite.ts`, `src/lib/sync.ts`, `src/hooks/use-online-status.ts`, `src/app/api/ping/route.ts`, `src/tests/sync.test.ts`, `docs/architecture.md` | `sync_queue` in browser PGLite; `pending_writes`/`local_products` also defined in PGLite bootstrap | **Partial**. Queue + replay + online hook exist; POS sale flow still posts directly to `/api/sales` (no offline enqueue in `pos-screen.tsx`/`payment-panel.tsx` observed). No idempotency/conflict resolution. | **Partially** - code present; real offline sale completion path not wired end-to-end (**UNVERIFIED** runtime). |
| **ESC/POS receipt printing** | `src/lib/thermal-print.ts`, `src/components/receipt/receipt.tsx`, `receipt-modal.tsx`, `receipt-modal-shell.tsx`, `refund-receipt-modal.tsx`, `src/components/settings/device-settings-form.tsx`, `src/tests/receipt-modal.test.tsx` | Receipt rendered from sale payload; thermal print formats ESC/POS bytes and uses Web Serial/USB fallback path | **Works/partial**. Browser print + receipt modal + ESC/POS generator present. Hardware-dependent; Web Serial browser support limited. | **Likely in browser**; hardware behavior **UNVERIFIED**. |
| **Loyalty points** | `src/app/api/loyalty/route.ts`, `src/app/api/sales/route.ts`, `src/store/cart.ts`, `src/components/pos/payment-panel.tsx`, `prisma/schema.prisma` (`Customer.loyaltyPoints`, `BusinessSettings.loyalty*`), `src/tests/loyalty.test.ts` | `Customer.loyaltyPoints`, earn/redeem settings in `BusinessSettings`, redemption passed into sale | **Works (basic)**. Earn on completed sale, redeem discount, balance endpoint. No tiers/expiry/ledger/audit beyond points counter. | **Likely**; runtime **UNVERIFIED**. |
| **Split-tender payments** | `src/store/cart.ts`, `src/components/pos/payment-panel.tsx`, `src/app/api/sales/route.ts`, `prisma/schema.prisma` (`PaymentLine`), `src/tests/e2e/split-payment.spec.ts` | `Sale` + `PaymentLine[]` with `PaymentMethod` enum CASH/CARD/OTHER | **Works**. UI supports split lines; API accepts `paymentLines`, computes tendered from sum. | **Likely**; runtime **UNVERIFIED**. |
| **Stock & supplier management** | `prisma/schema.prisma` (`Product.stock`, `Supplier`, `StockAdjustment`), `src/app/api/stock-adjustments/route.ts`, `src/app/api/suppliers/route.ts`, `src/app/api/suppliers/[id]/route.ts`, `src/components/products/stock-adjust-*.tsx`, `src/app/(app)/suppliers/page.tsx` | Product has `stock`, `lowStockThreshold`, optional `supplierId`; `StockAdjustment` records delta/reason; `Supplier` basic CRUD | **Partial**. Manual stock adjustments and supplier CRUD exist. No purchase orders/receiving/inventory ledger/transfers/cost layers. Sale creation decrements stock non-transactionally before sale create (**RISK**). | **Likely partial**; runtime **UNVERIFIED**. |
| **Admin and cashier roles** | `prisma/schema.prisma` (`Role` enum), `src/lib/auth.ts`, `src/proxy.ts`, `src/app/(app)/layout.tsx`, API checks in sales/refund/stock-adjustments/suppliers/reports; `src/app/actions/user-actions.ts` | `User.role` ADMIN/CASHIER; session role in Better Auth additional field | **Partial**. Role checks exist in many API routes; some server actions/routes missing checks (products/settings). No fine-grained permissions. | **Partial**. |
| **Sales reports and CSV export** | `src/app/api/reports/route.ts`, `src/app/api/sales/export/route.ts`, `src/components/reports/reports-dashboard.tsx`, `src/app/(app)/reports/page.tsx` | Aggregates over `Sale`, `SaleItem`, `Refund` | **Works/basic**. Summary, revenue by day, payment breakdown, top products, low stock, CSV export, date range. No tax reports, Z/X, shifts/registers, margins by COGS ledger. | **Likely**; runtime **UNVERIFIED**. |
| **Docker self-hosting** | `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, `docs/deployment.md` | Postgres 16 + web app | **Works/basic**. Compose and Dockerfile present; README has quickstart. | **UNVERIFIED** in this audit (no Docker run). |
| **Multi-language** | `src/i18n/request.ts`, `next.config.ts`, `messages/*.json` (14 locales), `src/app/actions/locale-actions.ts` | `BusinessSettings.language`, locale cookie, message JSON files | **Partial/works for framework**. i18n infra exists with 14 locale files; completeness of translations and UI coverage **UNVERIFIED**. | **Likely**; runtime **UNVERIFIED**. |

### Additional observed features (POS-relevant)

| Feature | File paths | Completeness | Notes |
|---|---|---|---|
| POS cart/checkout UI | `src/components/pos/*`, `src/store/cart.ts` | **Works/basic** | Cart, qty, notes, discount, tax override, tip, hold/recall, split tender, customer attach, receipt modal. |
| Held orders | `src/app/api/held-orders/route.ts`, `src/components/pos/held-orders-modal.tsx`, schema `HeldOrder` | **Partial** | Hold/recall exists; minimal model, no register/user assignment/expiry policy. |
| Refunds | `src/app/api/sales/[id]/refund/route.ts`, `src/components/sales/refund-modal.tsx`, `src/lib/tax.ts` | **Partial** | Admin-only, supports item refund qty, stock restore, refund tax allocation, loyalty points deducted proportionally. No refund payment tender reversal workflow. |
| Customers | `src/app/api/customers/route.ts`, `[id]/route.ts`, `src/app/(app)/customers/*` | **Basic** | Search/create/update/delete (delete blocked if sales exist). No CRM/customer accounts/segmentation. |
| Product CRUD | `src/app/actions/product-actions.ts`, `src/components/products/*`, `src/app/(app)/products/*`, `src/app/api/products/search/route.ts` | **Basic** | Create/update/delete server actions; search API; image URL field. **No auth in server actions**. |
| Settings | `src/app/actions/settings-actions.ts`, `src/app/api/settings/route.ts`, `src/components/settings/*` | **Basic** | Branding/tax/receipt/loyalty/storage settings. **No auth in update action**; storage secrets stored in DB. |
| Plugin system | `src/lib/plugins.ts`, `src/components/settings/plugins-panel.tsx`, `plugins/**` | **Stub/early** | Hook registry and `fire` call in sale creation; plugin UI/docs exist but ecosystem/packaging **UNVERIFIED**. |

---

## 4. Data model

### 4.1 Olgax tables (Prisma)

| Olgax model | Key fields | Purpose | Aldriva mapping | Map/conflict/new |
|---|---|---|---|---|
| `User`, `Session`, `Account`, `Verification` | Better Auth identity, `User.role` ADMIN/CASHIER | Auth/users | `auth.users`, `profiles`, `entity_members`, staff systems | **Conflict** - different auth model; do not copy. |
| `BusinessSettings` (singleton) | branding, tax, receipt, loyalty, storage config/secrets | Global settings | `organizers`/org settings, website/settings tables, possibly new POS settings | **Adapt/new** - must become tenant-scoped; secret storage must not mirror plaintext DB pattern. |
| `Category` | name unique | Product category | product/service/menu taxonomy exists in various forms | **Adapt** - Aldriva catalog is richer and split across domains. |
| `Product` | name, sku/barcode unique, price/cost decimal, stock int, lowStockThreshold, supplierId, active | POS product/catalog item | `products` (digital/physical) + `services/menu_items` in other domains | **Conflict/Adapt**. Stock field conflicts with Aldriva inventory ledger direction. |
| `Sale` | status, subtotal/tax/tip/discount/total, paymentMethod, amountTendered/changeDue, note, userId, customerId | Sale header | `orders` (menu/storefront), `product_orders`, `ticket_orders`, rental bookings | **Conflict** - Aldriva has multiple order models; POS sale could be new `pos_sales` or mapped into `orders` with care. |
| `SaleItem` | saleId, productId nullable, name snapshot, price, quantity, total, notes | Sale line snapshot | `orders.items` jsonb (current), `product_orders` line semantics limited | **Adapt/new** - Aldriva often uses JSONB items; normalized lines better for POS reporting/refunds. |
| `PaymentLine` | saleId, method, amount | Split tender | no dedicated tender lines found in store orders | **New** (for POS/tender split). |
| `Refund` | saleId, userId, amount, taxAmount, reason | Refund header | order/rental refund/payment status fields exist in places; no unified POS refund ledger | **New/Adapt**. |
| `RefundItem` | refundId, saleItemId, productId, name, quantity, price, total | Refund line | none equivalent | **New**. |
| `Customer` | name, phone/email unique optional, notes, loyaltyPoints | POS customer | `orders` customer fields, `profiles`, `customer_identities` (AI/messaging) | **New/Adapt** - no POS CRM/loyalty table. |
| `Supplier` | name, contact, email/phone, notes | Supplier master | no supplier module found in recon | **New**. |
| `StockAdjustment` | productId, userId, delta, reason, note | Stock movement audit | `inventory_movements` / `inventory_balances` (268/269) | **Conflict/Adapt** - same concept, different authority/model. |
| `HeldOrder` | label, cartSnapshot JSON, optional tableNumber | Parked cart | no POS held order found; kitchen/orders have different states | **New**. |

### 4.2 Aldriva mapping summary (from recon)

| Aldriva area | Current state | Olgax equivalent | Fit |
|---|---|---|---|
| `orders` | Storefront/menu/dine-in orders, JSONB items, status graph, payment status | `Sale`/`SaleItem`/`PaymentLine` | **Partial fit**; needs tender lines, register/cashier, receipt/shift, normalized lines. |
| `product_orders` | Digital/physical product checkout records | `Sale` | **Partial fit**; separate domain today. |
| `inventory_items/balances/movements` | Org-scoped inventory ledger (268/269) | `Product.stock`, `StockAdjustment` | **Best stock fit**, but integration work required. |
| `products.stock_quantity` | Legacy/simple stock on product records | `Product.stock` | **Tempting but dangerous** - would create/continue duplicate stock truth. |
| `staff_*` / `entity_members` / `business_workers` | Fragmented personnel/permissions | `User.role` | **Adapt** - map cashier/register permissions into staff/capability model. |
| `customer_identities` | AI/messaging identity, not POS CRM | `Customer` | **Not a fit**; different purpose. |
| Receipts | Donation receipt + rental receipt | Receipt/thermal | **Adapt** - reuse receipt rendering/PDF patterns, not donation flow. |

---

## 5. Feature classification

Effort is rough engineering estimate for Aldriva-quality integration (tenant-safe, RLS-aware, tests, design-system compliant), not copy-paste time.

| Feature | Classification | Effort | Risks / notes |
|---|---|---:|---|
| ESC/POS receipt rendering/printer adapter | **LIFT/ADAPT** | 2-4 days | LIFT receipt layout/ESC-POS command builder; ADAPT to Aldriva order/sale model, print permissions, browser support, hardware QA. |
| Receipt modal / print UX | **ADAPT** | 1-2 days | Must follow Aldriva design rules; rental receipt patterns already exist. |
| Split tender data model & UI logic | **ADAPT** | 3-5 days | Olgax logic reusable; Aldriva needs DB schema, RLS, payment reconciliation, refund semantics. |
| Loyalty points (basic earn/redeem) | **ADAPT** | 4-7 days | No Aldriva loyalty model; needs tenant-scoped schema, ledger/audit, fraud/adjustment rules, privacy. |
| Stock adjustments / low stock alerts | **ADAPT** | 3-5 days | Reuse concepts/UI; must write into `inventory_*`, not `Product.stock`. |
| Supplier master CRUD | **LIFT/ADAPT** | 2-4 days | Simple CRUD, but add tenant scope, permissions, audit, design system. |
| Purchase receiving / supplier stock-in | **REBUILD** | 5-8 days | Olgax has no real purchasing/receiving; only stock adjustment. |
| Admin/cashier roles | **ADAPT** | 3-6 days | Map to `entity_members`/staff capabilities; Olgax role model too small. |
| Sales reports/CSV | **ADAPT** | 4-7 days | Reuse report shapes/CSV export; data sources differ (orders/product_orders/rentals/POS). |
| Docker self-hosting | **ALREADY IN ALDRIVA? / ADAPT** | 1-3 days | Aldriva deployment model differs; Olgax compose is reference only. |
| Multi-language | **ALREADY IN ALDRIVA (partial infra) / ADAPT** | 2-4 days | next-intl exists in both ecosystems; copy message keys/translations selectively. |
| Offline-first queue (PGLite + replay) | **ADAPT/REBUILD** | 8-15 days | Concept reusable; needs auth, tenant scoping, idempotency keys, conflict resolution, encrypted/local data policy, offline product catalog sync. |
| POS cart/register UI | **ADAPT** | 5-10 days | Good reference for cashier flow; must be rebuilt into Aldriva components/design/tenant-aware data. |
| Held orders | **ADAPT** | 2-4 days | Simple model; add tenant/register/cashier/expiry/permissions. |
| Refund flow | **ADAPT** | 4-7 days | Olgax has itemized refund basics; Aldriva needs payment provider refund integration, permissions, audit, order-state alignment. |
| Plugin system | **REBUILD / DO NOT LIFT NOW** | 5-10 days | Aldriva already has complex platform; Olgax plugin model is early and not tenant/security hardened. |
| Product CRUD/supplier-linked catalog | **ALREADY IN ALDRIVA (partial)** | 0-3 days | Aldriva already has products/services/menus; only borrow specific POS UX patterns. |
| Tax calculation | **ADAPT** | 2-4 days | Olgax has simple tax rate/override; Aldriva currently has no automated tax engine - can lift simple logic only as interim. |

---

## 6. Central question: Olgax-style sale record + stock model on Aldriva single stock truth

### Constraints (from recon)

- Aldriva inventory foundation already exists: `inventory_items`, `inventory_locations`, `inventory_balances`, `inventory_movements`, RPCs in `db/migration_268_inventory_foundation.sql`, `269_inventory_transfers.sql`, `lib/actions/inventory.ts`.
- `products.stock_quantity` still exists and is used by store/cart flows (**VERIFIED** seam in recon). This is already a duplicate-ledger risk.
- Aldriva has multiple order systems: `orders`, `product_orders`, rentals, tickets. A POS sale must not become a third stock authority.

## Option A — New `pos_sales` domain, inventory ledger as stock authority (recommended)

**Design**

- Create POS-specific tables: `pos_registers`, `pos_shifts`, `pos_sales`, `pos_sale_items`, `pos_sale_payments`, `pos_refunds`, `pos_refund_items` (names illustrative), all tenant-scoped (`organizer_id`, `business_id/location_id`).
- Stock-affecting POS actions do **not** write `products.stock_quantity`. They call inventory RPC/service that records `inventory_movements` and updates `inventory_balances` in the same transaction boundary.
- Each sale line references an `inventory_item_id` (or a resolvable product->inventory mapping). If no mapping exists, block sale-or-mark-untracked explicitly.
- For online/catalog compatibility during migration, maintain a **derived projection**: update `products.stock_quantity` from inventory balances in a single service/RPC, or replace product reads with inventory-backed views. Projection is cache/read model, never authoritative.
- Order reporting: build a unified reporting view that unions/normalizes `pos_sales`, `orders`, `product_orders`, rentals as needed.

**Trade-offs**

| Pros | Cons |
|---|---|
| Preserves single stock truth (`inventory_*`). | More schema/work than forcing into `orders`. |
| Clean POS semantics: registers, shifts, split tender, cash drawer, receipts. | Requires cross-domain reporting normalization. |
| Avoids overloading `orders.items` JSONB with POS refund/tender complexity. | Needs product/catalog-to-inventory mapping discipline. |
| Easier offline/idempotent sale sync model. | Two sale-like systems remain until unified later. |

**Best when:** you want real POS behavior quickly without corrupting inventory or distorting existing storefront orders.

## Option B — Extend `orders` into an omnichannel order record, inventory ledger as stock authority

**Design**

- Extend `orders` with `channel` (`storefront`, `dine_in`, `pos`, etc.), register/shift/cashier IDs, tender lines table, normalized order items table, receipt metadata, and POS status transitions.
- Migrate/bridge `product_orders`/POS sales into this model over time (large effort).
- All stock-impacting transitions (POS complete, online fulfilment, refund, cancellation/restock) go through inventory RPCs. `products.stock_quantity` becomes derived/read-only projection.
- Keep `orders` as commercial transaction record; kitchen/rental/ticket domains may remain separate but feed unified reporting.

**Trade-offs**

| Pros | Cons |
|---|---|
| Long-term unified commerce model. | High migration risk; `orders` already carries storefront/dine-in assumptions. |
| One reporting/source model for many channels. | Touches critical checkout/webhook/fulfillment paths. |
| Avoids creating parallel POS sale tables. | Harder to deliver incrementally; likely needs careful strangler migration. |

**Best when:** Aldriva is ready for a commerce-domain refactor and can afford migration/testing cost.

## Recommendation

**Choose Option A now, with Option B as a later consolidation target.** It fits Aldriva's current state: inventory ledger exists but is not yet the universal authority, and `orders` is already specialized. Option A gives a POS lane with inventory-authoritative stock and minimal blast radius. The key guardrail is: **no POS feature may write `products.stock_quantity` or create a new stock balance table; all stock mutations go through inventory movement services/RPCs.**

---

## 7. UI, colour, and image assets to swap

Treat these as **replace before shipping in Aldriva**. They are Olgax-branded or not aligned with Aldriva `DESIGN.md`.

| Asset / UI area | Path(s) | What to swap / concern |
|---|---|---|
| Olgax brand/name/logo | `README.md`, `public/og-image.png`, `public/icons/*`, `src/components/receipt/receipt.tsx` default business name, reports export header in `reports-dashboard.tsx` | Replace with Aldriva branding; keep third-party attribution in notices, not UI. |
| PWA/manifest/icon set | `public/manifest.webmanifest`, `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.ico` | Replace icons/manifest names/colors. |
| Primary color scheme | `src/app/globals.css` (oklch blue/yellow theme), `src/app/(app)/layout.tsx` branding CSS injection (`#0f2044`, `#f5c518`) | Replace with Aldriva zinc/orange tokens and `DESIGN.md` rules. No blue/yellow POS theme. |
| Fonts | Geist font via `geist` package / layout usage | Confirm Aldriva font/token policy; replace if needed. |
| Receipt styling | `src/components/receipt/receipt.tsx` uses monospace white/black receipt, dashed borders | Adapt to Aldriva receipt format/branding; keep print CSS accessible. |
| Dashboard shell/sidebar | `src/components/layout/app-shell.tsx`, `app-sidebar.tsx`, `dark-mode-toggle.tsx` | Replace with Aldriva dashboard shell/navigation patterns. |
| Generic shadcn component styling | `src/components/ui/*`, `components.json` | Keep only if restyled to Aldriva tokens/components; prefer existing Aldriva `components/ui`. |
| Static marketing/docs images | `README` screenshots/badges references | Do not copy into Aldriva product UI. |
| Plugin panel/settings copy | `src/components/settings/plugins-panel.tsx` | Review for Olgax-specific wording and trust model. |

**Aldriva design constraints to apply before reuse:** zinc neutral + orange accent, no gradients on interactive elements, no glassmorphism, no decorative card wrappers, `rounded-xl` only for controls/justified standalone cards, no default shadows.

---

## 8. Security review of code we would lift

| Area | Finding | Evidence | Severity | Action before lift |
|---|---|---|---:|---|
| AuthZ missing in server actions | `createProduct`, `updateProduct`, `deleteProduct`, `updateSettings` have no session/role checks. | `src/app/actions/product-actions.ts`, `src/app/actions/settings-actions.ts` | **High** | Add Aldriva `requireAuth`/tenant role checks; never copy as-is. |
| AuthZ missing/weak in APIs | `GET /api/products/search` has no auth; `GET /api/settings` has no auth; held-orders routes auth only, no role/tenant scope. | `src/app/api/products/search/route.ts`, `src/app/api/settings/route.ts`, `src/app/api/held-orders/route.ts` | **Medium** | Require authenticated tenant-scoped access; expose only needed fields. |
| Tenant isolation absent | No `organizer_id`/business scoping anywhere. | schema/routes/actions all single-tenant | **Critical for Aldriva** | Add tenant IDs, RLS, server-side tenant context checks everywhere. |
| Input validation | Good use of Zod in sales/customers/suppliers/stock/refund/product form; but some routes trust body shape lightly (`held-orders` POST/DELETE body). | `src/app/api/sales/route.ts`, `customers/route.ts`, `held-orders/route.ts` | **Medium** | Validate all inputs with Zod schemas; reject unknown fields. |
| SQL injection | No `$queryRaw`/`$executeRaw`/raw SQL found in `src`; Prisma parameterizes normal queries. | `git grep $queryRaw/$executeRaw` no hits | **Low** | Keep ORM parameterization; review any future raw SQL. |
| XSS / CSS injection | `dangerouslySetInnerHTML` used for branding CSS in layout with settings-derived colors. | `src/app/(app)/layout.tsx` | **Medium** | Validate color tokens against strict allowlist; do not inject arbitrary setting strings. |
| Secrets/storage | `BusinessSettings` stores `storageSecretKey` in DB; update action accepts it; GET settings omits secret but settings action has no auth. | `schema.prisma`, `src/app/actions/settings-actions.ts`, `src/app/api/settings/route.ts` | **High** | Move secrets to managed secret store/env/KMS; encrypt at rest; strict admin + audit. |
| Offline sync conflicts/duplication | Sync queue replays POSTs with no idempotency key; `markSynced` on non-ok 4xx can drop writes. | `src/lib/sync.ts` | **High for offline POS** | Add idempotency keys, server-side dedupe, retry/backoff, conflict UI, tombstones. |
| Stock race/integrity | Sale decrements stock in loop before transaction; separate update calls not atomic with sale creation. | `src/app/api/sales/route.ts` | **High** | Use DB transaction/RPC with conditional stock decrement or inventory movement ledger. |
| Refund integrity | Refund flow uses transaction and validates refundable qty - good baseline. | `src/app/api/sales/[id]/refund/route.ts` | **Medium** | Add payment-provider refund linkage, idempotency, audit trail. |
| CSRF/session | Better Auth session cookies; server actions rely on Next.js action protections, but missing authZ still dangerous. | actions/routes | **Medium** | Keep CSRF/origin protections; enforce authZ in every action/route. |
| Dependency supply chain | 2256 transitive deps unverified for licence/vulnerabilities. | lockfile | **Medium** | Audit licences and vulnerabilities before importing. |

### Files safe to use as reference only (not direct lift)

- `src/lib/thermal-print.ts` - good ESC/POS reference; review browser support/fallbacks.
- `src/lib/tax.ts` - simple, clear tax allocation math; add tests in Aldriva style.
- `src/store/cart.ts` - useful POS cart state model; adapt to Aldriva conventions.
- `src/components/pos/payment-panel.tsx` - useful UX reference; rebuild with Aldriva UI/auth/data.

### Files not to lift without redesign

- `src/app/actions/product-actions.ts`, `settings-actions.ts` - missing authZ.
- `src/app/api/sales/route.ts` - stock mutation not atomic/tenant-aware.
- `src/lib/sync.ts` + `pglite.ts` - offline concept only; needs idempotency/tenant/auth/conflict model.
- Prisma schema/migrations - incompatible with Supabase/RLS/tenant model.

---

## 9. Practical next step

Before copying any Olgax code:

1. Run a proper licence audit in isolation (`pnpm install --frozen-lockfile` in disposable env, `pnpm licenses list`) and record results.
2. Decide Option A vs B for sale+stock model; do not implement POS stock writes against `products.stock_quantity`.
3. If lifting code, create `THIRD_PARTY_NOTICES.md` and add per-file provenance headers.
4. Reimplement lifted logic as Aldriva tenant-scoped, RLS-safe server actions/routes with node:test coverage added to `test-files.json`.

*End of analysis. No files in Olgax were modified. Only this report was created in the Aldriva recon worktree; no commit made.*