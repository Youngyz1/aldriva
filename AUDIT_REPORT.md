# Aldriva Platform Engineering Audit Report

> **Audit Date**: 2026-10-27 (Updated after Part 1 Staging Hygiene)  
> **Repository**: `aldriva-staging` (`c:\Users\Youngyz\aldriva-staging`)  
> **Branch**: `chore/staging-hygiene-and-table-qr` (off `staging` at `972e88d`)  
> **Environment**: Windows, PowerShell, Node.js v24.13.0, Next.js 16.4.3 (Turbopack), React 19.2.4  
> **Scope**: Codebase, documentation, test suite, and database migration audit + Part 1 Staging Hygiene.

---

## 0. Part 1 Staging Hygiene Execution Results (Completed)

All Part 1 repository hygiene tasks specified by the operator have been completed and committed:

1. **Migration 193 Parity**: Copied canonical `db/migration_193_event_team_members_active_user_index.sql` and authored `db/migration_193_event_team_members_active_user_index_rollback.sql`. (Commit: `875c83c`)
2. **Rollback Twins for Migrations 182 & 194**: Authored `db/migration_182_menu_option_groups_rollback.sql` and `db/migration_194_staging_drift_sync_rollback.sql`. (Commit: `409bd7c`)
3. **Migration 175 Rollback Deduplication**: Verified `db/migration_175_rollback.sql` was a byte-for-byte duplicate (0 byte diff) of `db/migration_175_owner_managed_delivery_rollback.sql`. Deleted the duplicate; preserved the hard `MIGRATION_175_ROLLBACK_BLOCKED` guard and canonical naming.
4. **Reservations Navigation Audit**: Confirmed no org-level setting exists on `organizers`. Verified merchant can configure `table_reservations` in `/dashboard/businesses/[id]/edit` and `/dashboard/org/[id]/website/v2` (OrderingPaymentsPanel), which triggers `RESERVATIONS` capability and surfaces `/dashboard/org/[id]/reservations` via `org-dashboard-modules.ts`. Option A preserved with no code changes needed.
5. **ESLint Errors (7 resolved)**: Extracted `ViewAllLink` in `app/dashboard/DashboardView.tsx` and moved JSX `<InvalidMemoryView />` outside `try/catch` in `app/m/[token]/page.tsx`. Verified clean: `npx eslint app components lib --quiet` exits 0 with 0 errors. (Commit: `c070da1`)
6. **Unused Component Cleanup**: Deleted empty 0-byte stubs `components/FeatureCard.tsx` and `components/Hero.tsx`. (Commit: `536ab36`)
7. **Test Registration & Regex Fix**: Fixed class regex drift in `lib/__tests__/invitation-image-presentation.test.cjs` (now passes 7/7). Registered 6 previously omitted passing test suites in `test-files.json`. (Commit: `00b41eb`)
8. **Currency Formatting**: Replaced hardcoded `$` in `components/site/blocks/BlockRenderer.tsx:2083` with `formatCurrency(svc.price, displayCurrency, locale)` respecting tenant currency with USD fallback. (Commit: `09c6080`)
9. **Scanner Token Typecheck Fix**: Added null-coalescing to optional `userId` in `scanner-dataset/route.ts` and `scanner-sync/route.ts`. Verified `npx tsc -p tsconfig.build.json --noEmit` exits 0 with 0 errors. (Commit: `6a3ccb2`)

### Suite Status After Part 1
- **TypeScript**: 0 errors (`npx tsc -p tsconfig.build.json --noEmit`)
- **ESLint**: 0 errors (`npx eslint app components lib --quiet`)
- **Test Suite**: 2,823 / 2,825 tests passing across 233 files in `test-files.json`.
- **Known Failing Tests (2)**: In `lib/__tests__/event-scan-activity.test.cjs`:
  - `online and offline validation record controlled rejection reasons without storing ticket credentials`
  - `offline synchronization returns unavailable on database errors instead of inventing rejection reasons`
  *Reason*: Pre-existing on `staging` (verified via detached worktree against `origin/staging` at `972e88d`). When commit `da5d9fa` added the test file to staging, the implementation of `recordRejectedTicketScan` in `verify-ticket/route.ts` and `scanner-sync/route.ts` was separated and committed to `wip/event-staff-scanner`. Left unchanged per instructions.

---

## 1. Executive Summary

### 1.1 Overall Platform Completion Estimate: ~50%
Across the 15 master platform roadmap phases (0 through 14) defined in [`docs/ROADMAP.md`](file:///c:/Users/Youngyz/aldriva-staging/docs/ROADMAP.md):
- **5 Phases are COMPLETE (33.3%)**: Phase 0 (Codebase & Continuity Audit), Phase 1 (Business Website Foundation), Phase 2 (Public Website Engine), Phase 3 (Website Design System), Phase 4 (Visual Website Builder).
- **5 Phases are PARTIALLY IMPLEMENTED (33.3%)**: Phase 5 (Products, Services & Menus — ~75%), Phase 6 (Unified Commerce & Kitchen/Delivery Operations — ~65%), Phase 7 (Bookings & Reservations — ~30%), Phase 8 (Business Management ERP — ~20%), Phase 13 (Aldriva AI — ~45%).
- **5 Phases are NOT STARTED (33.3%)**: Phase 9 (Public Developer API), Phase 10 (Outbound Webhooks), Phase 11 (POS Integration Framework), Phase 12 (Custom Domains & SSL), Phase 14 (External AI Ecosystem).
- **Additional Subsystems & Standalone Features**:
  - **Complete**: Server-only security boundaries, 3D Seating Picker (`feat/seat-picker-3d`), Evergreen Envelope Wedding Invitations, Platform UI Simplification (Phase 1A).
  - **Partially Complete / Unverified**: Event Staff Account-less Invitations (migrations 195–197), Cloudflare R2 Media Storage (migrations 157, 160, 161).
  - **Planned / Spec Only**: Table & Menu QR Codes (`docs/phases/phase-table-menu-qr-codes.md`).
- *Note*: If core historical product domains (Events, Ticketing & QR Door Scans, Crowdfunding/Donations, Digital Downloads Shop, TipTap CMS Articles) are factored in, the functional repository is approximately **~60% complete** toward its total commercial vision.

### 1.2 Biggest Risks
1. **Database Migration Ledger Absence & Drift**:
   - There is **no `schema_migrations` table** in the Supabase PostgreSQL database. Applied status on staging is based solely on operator reports and read-only PostgREST object probes.
   - **Migration 193** exists only in `supabase/migrations/20261024010000_migration_193_event_team_members_active_user_index.sql`, but is **completely missing from the canonical `db/` directory**, violating repo architecture rules.
   - **Missing Rollback Twins**: Migration 182 (`migration_182_menu_option_groups.sql`), migration 194 (`migration_194_staging_drift_sync.sql`), and 44 older legacy migrations lack `_rollback.sql` counterparts.
   - **Unapplied Staging Migration**: Migration 184 (`migration_184_menu_promotions.sql`) is approved but has not been applied to staging.
   - **Migration 175 Collision**: Forward and rollback have uncommitted edits, and an untracked `db/migration_175_rollback.sql` duplicate exists.
2. **Hidden Test Failures & Omitted Suites**:
   - The test harness (`scripts/run-tests-chunked.cjs`) executes **only** test files explicitly listed in `test-files.json`.
   - **8 test files on disk are omitted from `test-files.json`**. When run directly:
     - `lib/__tests__/invitation-image-presentation.test.cjs` **fails 2 tests** due to expectation drift against updated component classes.
     - `lib/security/__tests__/approval-flag-gap.test.cjs` **fails by design**, pinning an unaddressed AI workforce vulnerability (finding S18-1: medium-risk write tools execute without L0 approval).
     - `lib/security/__tests__/website-v2-menu-choices.test.cjs` fails unless the server-only stub is loaded.
3. **Hidden and Incomplete Core Merchant Features**:
   - **Reservations (Phase 7)**: The backend request engine and public lookup token route are fully built and tested, but **Reservations is completely omitted from the organization dashboard sidebar** (`app/dashboard/org/[id]/org-nav-items.ts`). It is unreachable by merchants via normal navigation.
   - **Store Promo Codes (Phase 6)**: The database schema (migration 177), validation, and Stripe checkout burn are live, but **no merchant UI exists** in the dashboard to view, create, or deactivate promo codes.
   - **Hardcoded Currency**: Services pricing in `components/site/blocks/BlockRenderer.tsx:2083` is hardcoded to `$`, blocking internationalization.
4. **Local Working Tree Volatility & Single-Machine Backup Risk**:
   - `staging` currently has 12 modified/uncommitted files and 39 untracked files/artifacts (including account-less staff redemption, database diff dumps, and scratch scripts).
   - Key branches (`feat/entity-architecture`, `feat/seat-picker-3d`, `wip/phase7-checkpoint`) and 5 local stashes have unmerged commits that exist only on this machine.

### 1.3 Recommended Immediate Next Action
**Stabilize and commit in-flight working tree changes**:
1. Verify the local `POST /api/events/team/redeem` runtime behavior to resolve the pending account-less event staff redemption checkpoint.
2. Commit and push the verified account-less staff changes (migrations 195–197).
3. Backport migration 193 into `db/` to restore canonical parity, and create the rollback twin for migration 182.
4. Un-hide Phase 7 Reservations in `app/dashboard/org/[id]/org-nav-items.ts`.

---

## 2. Phase Status Table

| Phase / Workstream | Status | Evidence (Files, Commits, Schema) | Remaining Work |
|---|---|---|---|
| **Phase 0: Codebase & Docs Audit** | **COMPLETE** | `docs/phases/phase-00-audit.md`, `AGENTS.md`, `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`. | None. Canonical source of truth established. |
| **Phase 1: Business Website Foundation** | **COMPLETE** | `db/migration_125_tenant_websites.sql`, `migration_126_website_delete_rls_fix.sql`, `lib/actions/website.ts`, `app/dashboard/org/[id]/website/page.tsx`, `lib/__tests__/website-foundation.test.cjs`. | None. Database models, tenant linkage, RLS policies verified. |
| **Phase 2: Public Website Engine** | **COMPLETE** | `app/site/[slug]/[[...page]]/page.tsx`, `proxy.ts:79` (`checkWebsiteAccess`), `lib/website-structured-data.ts`, `lib/__tests__/website-engine.test.cjs`. Commit `8bd65fa` resolved Vercel runtime dependencies (`jsdom@26.1.0`). | Authenticated staging browser visual verification after deployment. |
| **Phase 3: Website Design System** | **COMPLETE** | 18 block types in `lib/website-blocks.ts`, resolvers in `lib/website-embeds.ts`, `components/site/blocks/BlockRenderer.tsx`, templates (`table-flame`, `food-order`, `store`, `driveline`, `restaurant-savannah`), `lib/__tests__/website-blocks.test.cjs`. | None. Base system + extended stages A–K/I landed and tested. |
| **Phase 4: Visual Website Builder** | **COMPLETE** | `app/dashboard/org/[id]/website/builder/page.tsx`, `components/dashboard/website/v2/V2WebsiteEditor.tsx`, `lib/actions/website-builder.ts`, `db/migration_129_website_page_drafts_and_publishing_guard.sql`, `lib/security/__tests__/migration129-publishing-guard.test.cjs`. | Browser visual QA on production Vercel deployment across mobile/desktop. |
| **Phase 5: Products, Services & Menus** | **PARTIAL** | Core schema: `db/migration_136_services_and_menus.sql`, `lib/actions/services.ts`, `lib/actions/menus.ts`, `app/dashboard/org/[id]/services/`, `app/dashboard/org/[id]/menu/`. Menu options & promotions: migrations 182 & 183 applied; migration 184 authored and approved (`db/migration_184_menu_promotions.sql`). | 1. Owner applies migration 184 on staging and runs checks.<br>2. Confirm order snapshot fields in running app & 375px mobile QA.<br>3. Author missing rollback twin for migration 182.<br>4. Fix hardcoded USD currency in `BlockRenderer.tsx:2083`. |
| **Phase 6: Unified Commerce** | **PARTIAL** | Store cart: `lib/store-cart.ts`, `components/site/v2/StoreCartDrawer.tsx`, `POST /api/checkout/cart`, `lib/store-cart-checkout.ts`. Promo codes: `db/migration_177_store_promo_codes.sql`. Orders & payments: migrations 171, 173, 174, 175, `lib/actions/orders.ts`, `app/dashboard/org/[id]/orders/`. | 1. Automated sales tax engine.<br>2. Unified merchant fulfillment dashboard.<br>3. Dashboard UI for store promo code management.<br>4. Multi-item crypto checkout (`/api/checkout/product-crypto/route.ts:135`).<br>5. Reconcile migration 175 rollback redesign. |
| **— Kitchen & Delivery Workstream (under Phase 6)** | **PARTIAL** | Migrations: 185 (worker access), 186 (courier offers), 187 (cook performance), 189 (pickup), 190 (GPS), 191 (rating), 192 (early dispatch). Routes: `app/kitchen/*`, `app/courier/*`, `components/dashboard/kitchen/CookPerformancePanel.tsx`, `DeliveryMap.tsx` (TomTom Orbis v2). Tests: `lib/kitchen/__tests__/worker-access.test.cjs`, `lib/courier/__tests__/courier-server.test.cjs`. | 1. End-to-end device testing with live GPS coordinates.<br>2. TomTom account and raster tile rendering QA on staging.<br>3. Owner approval and staging application of migration 191.<br>4. Scheduled worker for cohort timeout advancement (currently polling-driven).<br>5. Author missing Supabase mirrors for migrations 185, 186, 187, 188. |
| **— Table & Menu QR Codes (under Phases 5–6)** | **NOT STARTED (PLANNED)** | Full specification in `docs/phases/phase-table-menu-qr-codes.md`. QR utilities exist in `components/cards/ExpandableQr.tsx` and `qrcode` package. | Complete implementation: DB migration (tables, sessions, running bills), `/q/<code>` short redirect route, QR generation/print UI, waiter confirmation lane. |
| **Phase 7: Bookings & Reservations** | **PARTIAL** | Backend request engine: `db/migration_176_reservations.sql`, `lib/actions/reservations.ts`, `app/dashboard/org/[id]/reservations/page.tsx`, `app/site/[slug]/reservations/[lookup_token]/page.tsx`, `lib/__tests__/phase7-reservations.test.cjs`. | 1. **Unhide navigation**: Add Reservations to `org-nav-items.ts`.<br>2. Schema for `booking_resources`, `availability_rules`, `time_slots`.<br>3. Real-time conflict prevention engine in `lib/bookings.ts`.<br>4. Public booking widget (`BookingWidget.tsx`) & calendar dashboard.<br>5. Confirmation emails & `.ics` calendar generation. |
| **Phase 8: Business Management ERP** | **PARTIAL** | Branches built: `db/migration_132_business_type_and_branches.sql`, `lib/actions/business-branches.ts`, `app/dashboard/businesses/[id]/branches/`. | 1. Staff scheduling and shift rosters.<br>2. Inventory movement tracking & low-stock alerts.<br>3. Consolidated cross-branch analytics (replace stub in `app/dashboard/analytics/page.tsx`).<br>4. Decide whether courier/driver records unify with staff rosters. |
| **Phase 9: Public Developer API** | **NOT STARTED** | No `/v1` routes, no `api_keys` table in `db/`, no `lib/api-auth.ts`. (Only internal unversioned cookie API exists). | 1. Migration for API keys (hashed) + granular permission scopes.<br>2. API key auth middleware + tiered rate limiting in `lib/api-auth.ts`.<br>3. `/v1/events`, `/v1/products`, `/v1/orders`, `/v1/bookings` endpoints.<br>4. OpenAPI 3.1 schema generator and Swagger documentation. |
| **Phase 10: Outbound Webhooks** | **NOT STARTED** | No webhook subscription tables or dispatch engine in `db/`/`lib/`. (Only inbound Stripe/Crypto webhooks exist). | 1. Migration for webhook subscriptions and delivery logs.<br>2. Dispatch engine with HMAC-SHA256 signatures and retries in `lib/webhooks-dispatcher.ts`.<br>3. Domain event triggers in checkout, checkin, and booking flows.<br>4. Tenant webhook management and delivery log UI. |
| **Phase 11: POS Integration Framework** | **NOT STARTED** | No POS adapters or routes in `lib/pos/` or `app/`. | 1. Migration for POS connections, terminal maps, and normalized sales.<br>2. Connector adapters for Square and Clover webhooks.<br>3. Bi-directional inventory synchronization engine.<br>4. POS settings interface in tenant dashboard. |
| **Phase 12: Custom Domains & SSL** | **NOT STARTED** | `proxy.ts` has zero `Host`-header routing; no domain verification table or SSL issuance service. | 1. Migration for domain verification records.<br>2. Dynamic `Host` header routing branch in `proxy.ts`.<br>3. DNS CNAME/TXT verification checker in `lib/custom-domains.ts`.<br>4. Vercel Custom Domains API / Cloudflare for SaaS integration.<br>5. Tenant domain management UI. |
| **Phase 13: Aldriva AI Tenant Engine** | **PARTIAL** | Admin AI Operating System built: migrations 139–168, `lib/ai/tools-registry.ts` (22 tools), `lib/ai/output-guard.ts` (ADR-0002), `lib/workforce/*`, `lib/exec/*`, `lib/qa/*`. WhatsApp/IG auto-responder and tenant assistant NOT built. | 1. Meta WhatsApp Cloud API / Instagram Direct webhook handlers in `app/api/webhooks/meta/`.<br>2. Customer message ingestion pipeline.<br>3. Tenant AI assistant interface at `/dashboard/org/[id]/ai`.<br>4. Resolve S18-1 security gap (medium-risk tools lack approval gating). |
| **Phase 14: External AI Ecosystem** | **NOT STARTED** | No developer portal, no OAuth 2.0 PKCE consent flow, no third-party MCP server gateway. | 1. Migration for third-party apps, permissions, and tool manifests.<br>2. OAuth 2.0 authorization server (`/oauth/authorize`, `/oauth/token`).<br>3. Sandboxed MCP proxy with output guard screening.<br>4. App Directory UI in tenant dashboard. |
| **Parallel: R2 Media Storage Foundation** | **PARTIAL** | `lib/storage/r2.ts`, `lib/media/*`, migrations 157, 160, 161 (public quota), `HomepageCmsTabs.tsx`. | 1. Complete production R2 bucket configuration and CORS validation.<br>2. Apply migration 159 & 161 on production.<br>3. Reconcile `cms-media` storage policy mismatch in website builder. |
| **Parallel: Server-Only Boundaries** | **COMPLETE** | `import "server-only"` enforced across secrets-reading modules; `scripts/check-client-secrets.cjs` verified. | None. Boundaries intact. |
| **Parallel: Account-less Event Staff Invitations** | **PARTIAL** | Working tree implementation in `app/api/events/[id]/*`, migrations 195, 196, 197 authored and tested on local Postgres; 2,790 tests pass. | 1. Reproduce and resolve local HTTP 503 on `POST /api/events/team/redeem`.<br>2. Configure production `SCANNER_TOKEN_SECRET`.<br>3. Commit and push verified code. |

---

## 3. Test Report

### 3.1 Verification Commands and Results

| Command | Status | Output / Findings |
|---|---|---|
| `npm test` (`scripts/run-tests-chunked.cjs`) | **PASS** | **2,790 passed, 0 failed, 0 skipped** across 227 registered test files (Batch 1: 1,139 tests, Batch 2: 1,651 tests). Exit code 0. |
| `npx tsc -p tsconfig.build.json --noEmit` | **PASS** | Completed in ~59s with **0 type errors**. Exit code 0. |
| `npm run build` (`next build`, Turbopack) | **PASS** | Compiled in 3.7min; **all 389 static and Partial Prerender (PPR) pages generated successfully**. Exit code 0. |
| `npm run lint` (`eslint app components lib --quiet`) | **FAIL** | **7 errors** in 2 files (all pre-existing, known in untouched lines). Exit code 1. |
| Unregistered tests audit (8 files) | **FAIL** | **3 failing test files** when run outside `test-files.json`. |

### 3.2 Failing Tests & Root Causes

1. **`lib/__tests__/invitation-image-presentation.test.cjs`** (2 test failures):
   - *Test 1*: `uses shared semantic fitting for full-bleed, framed, and gallery template imagery`
   - *Test 2*: `routes unframed template galleries through viewport-matched gutters`
   - *Cause*: Regex pattern drift. The test performs raw string matching against source TSX files (`components/invitation/blocks/InvitationPresentationBlocks.tsx` and template files). Recent visual simplifications in Phase 1A adjusted CSS class structures, causing strict regexes to fail even though functionality is healthy.
2. **`lib/security/__tests__/approval-flag-gap.test.cjs`** (1 test failure):
   - *Test*: `S18-1: medium write-capable tools must require approval (CURRENTLY FAILS)`
   - *Cause*: **Fails by design**. It is an intentional test documenting vulnerability S18-1 in the AI workforce: `createNotification` and `notifyOwner` are medium-risk write tools (`migration_139_tool_registry.sql`), but the approval gate (`lib/ai/approvals.ts`) only gates `high` and `critical` risk tools for L0 agents.
3. **`lib/security/__tests__/website-v2-menu-choices.test.cjs`**:
   - Registered in `test-files.json`. Passes 3/3 using the runner's built-in `test-server-only-alias.cjs`.
4. **ESLint Errors (Resolved in Part 1)**:
   - Previously 7 errors across `DashboardView.tsx` and `app/m/[token]/page.tsx`. Now **0 errors** across `app`, `components`, and `lib`.
5. **`lib/__tests__/event-scan-activity.test.cjs` (2 pre-existing failures)**:
   - Fails on staging and origin/staging because implementation changes to `verify-ticket/route.ts` and `scanner-sync/route.ts` were segregated to `wip/event-staff-scanner`. Left unchanged per instruction.

### 3.3 Test Coverage Gaps Against Phase Acceptance Criteria

- **Phase 5 (Products & Menus)**: No running-app automated test for order snapshot fields (`group_name`, `group_kind`, `qty`, `promotion`) resulting from normalized menu option groups.
- **Phase 6 (Commerce & Delivery)**:
  - No automated test for automated tax calculation or unified fulfillment.
  - Cash-on-delivery confirmation has mocked coverage, but live transactional consistency remains unexercised.
- **Kitchen & Courier Workstream**:
  - Live GPS coordinate reporting (`order_delivery_locations`) and TomTom tile rendering are only tested via mocked contracts (`lib/courier/__tests__/delivery-map.test.cjs`). No end-to-end device test exists.
- **Phase 7 (Reservations)**:
  - Existing suite (`phase7-reservations.test.cjs`) covers request creation and status updates, but real-time calendar slot collision tests are completely absent because the slot engine is unbuilt.
- **Phase 8 (Business Management)**:
  - Branch CRUD is covered only through entity tests; no dedicated `business-management.test.cjs` exists.
- **Phases 9–12, 14**: 0% test coverage (subsystems not built).

---

## 4. Unfinished-Work Findings

### 4.1 Explicit Code Markers (`TODO`, `FIXME`, `HACK`, `not implemented`)
1. [`app/api/checkout/product-crypto/route.ts:135`](file:///c:/Users/Youngyz/aldriva-staging/app/api/checkout/product-crypto/route.ts#L135):
   ```ts
   // TODO(products): /crypto-pending and /api/crypto/status don't know
   ```
   *Impact*: Crypto checkout status verification lacks multi-product tracking.
2. [`app/api/donate/route.ts:15`](file:///c:/Users/Youngyz/aldriva-staging/app/api/donate/route.ts#L15):
   ```ts
   * TODO: Delete this file entirely once confirmed no external integrations call it.
   ```
   *Impact*: Deprecated legacy donation API endpoint awaiting sunset confirmation.
3. [`components/site/blocks/BlockRenderer.tsx:2083`](file:///c:/Users/Youngyz/aldriva-staging/components/site/blocks/BlockRenderer.tsx#L2083):
   ```tsx
   {/* TODO: multi-currency not in Phase 5 - hardcoded USD */}<div className="text-sm font-semibold text-[var(--ps-text)]">${svc.price.toFixed(2)}</div>
   ```
   *Impact*: Services pricing ignores tenant currency and forces `$`.
4. [`lib/ai/output-guard.ts:23`](file:///c:/Users/Youngyz/aldriva-staging/lib/ai/output-guard.ts#L23):
   ```ts
   * V3 hook points (per-user isolation - not implemented yet):
   ```
   *Impact*: Multi-tenant user isolation hook in the AI output guard remains a stub.
5. [`lib/unified-invitation-templates.ts:72`](file:///c:/Users/Youngyz/aldriva-staging/lib/unified-invitation-templates.ts#L72):
   ```ts
   // TODO: Revisit the share-preview card slug; Evergreen currently uses botanical-reverie.
   ```
   *Impact*: Evergreen envelope share card preview slug relies on a botanical fallback.

### 4.2 Stubs and Placeholder Returns
- [`app/dashboard/analytics/page.tsx:12`](file:///c:/Users/Youngyz/aldriva-staging/app/dashboard/analytics/page.tsx#L12):
  Renders static placeholder text: *"Detailed charts are coming soon"*. Cross-branch financial analytics (Phase 8 Task 8.5) are completely stubbed out.

### 4.3 Empty Files
The following files are 0 bytes on disk and should be safely pruned or implemented:
- [`components/FeatureCard.tsx`](file:///c:/Users/Youngyz/aldriva-staging/components/FeatureCard.tsx) (0 bytes, unreferenced)
- [`components/Hero.tsx`](file:///c:/Users/Youngyz/aldriva-staging/components/Hero.tsx) (0 bytes, unreferenced)

### 4.4 Unmerged Branches and Worktrees
Analysis of `git log staging..<branch>` reveals several branches containing commits not present in `staging`:
1. `feat/entity-architecture`: Ahead by 1 commit (`5da2d4b`: `feat(entity): Phase 1 entity architecture - link businesses to organizers`).
2. `feat/seat-picker-3d`: Ahead by 7 commits (`74ef1ff`: narrow screen refits, hold liveness margins, expired hold normalization).
3. `wip/phase7-checkpoint`: Ahead by 8 commits (`bda92ee`: uncommitted work from seating folder for orders/delivery/reservations).
4. `wip/admin-baseline`: Ahead by 2 commits (`20df7d5`: remove dead admin locale mirror).
5. **Git Stashes**: 5 local stashes (`stash@{0..4}`) contain uncommitted work on recovery, full-recovery, admin redesign, and supabase-js bumps.

---

## 5. Recommended Plan to Complete the Platform

### 5.1 Track Overview & Sequencing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRACK A: Immediate Stabilization & In-Flight Completion (Effort: S-M)       │
│ 1. Event Staff Redemption Verification -> Commit staging working tree       │
│ 2. Canonical Migration 193 restore -> Rollback twins for 182 & 194          │
│ 3. Apply Migration 184 (Menu Promotions) on Staging -> Order snapshot QA    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRACK B: Core Commerce & Merchant Operations Completeness (Effort: L)        │
│ 4. Phase 7: Unhide Reservations in nav -> Build Slot Scheduling & Calendar  │
│ 5. Phase 6: Merchant Store Promo UI -> Automated Tax -> Crypto Multi-Item   │
│ 6. Table & Menu QR Codes: Short redirect /q/ -> Table sessions & confirmation│
│ 7. Phase 8: Staff Rosters -> Inventory Movement Tracking                   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRACK C: Developer Platform (Strict Dependency Chain) (Effort: L)           │
│ 8. Phase 9: Public Developer API (/v1, API Keys, Scopes, OpenAPI)          │
│                                      │
│                                      ▼
│ 9. Phase 10: Outbound Webhooks (Subscriptions, HMAC Signing, Retries)       │
│                                      │
│                                      ▼
│ 10. Phase 11: POS Integration Framework (Square & Clover Connectors)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRACK D & E: Custom Domains & AI Ecosystem (Effort: M-L)                    │
│ 11. Phase 12: Custom Domains & SSL (proxy.ts Host routing, DNS check)        │
│ 12. Phase 13: WhatsApp/Instagram Webhooks & Tenant Assistant                │
│ 13. Phase 14: External AI Ecosystem & MCP App Directory                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Detailed Task Breakdown

#### Part A: Fixes Needed on Already-"Done" Work
1. **Restore Migration 193 Canonical File** (`db/migration_193_event_team_members_active_user_index.sql`):
   - *Dependency*: None.
   - *Effort*: **S** (30 mins).
   - *Description*: Copy `supabase/migrations/20261024010000_migration_193_event_team_members_active_user_index.sql` to `db/` with a corresponding rollback twin.
2. **Author Rollback Twin for Migration 182 & 194**:
   - *Dependency*: None.
   - *Effort*: **S** (1 hour).
   - *Description*: Create `db/migration_182_menu_option_groups_rollback.sql` and `db/migration_194_staging_drift_sync_rollback.sql`.
3. **Register or Fix Omitted Tests**:
   - *Dependency*: None.
   - *Effort*: **S** (1 hour).
   - *Description*: Fix regexes in `lib/__tests__/invitation-image-presentation.test.cjs` and add the 6 passing unregistered test files to `test-files.json`.
4. **Fix ESLint Errors in DashboardView and Memory Page**:
   - *Dependency*: None.
   - *Effort*: **S** (1 hour).
   - *Description*: Move `ViewAllLink` outside `DashboardView` render function in `app/dashboard/DashboardView.tsx`, and move JSX `<InvalidMemoryView />` outside the `try/catch` block in `app/m/[token]/page.tsx`.
5. **Delete Empty Scaffolding Files**:
   - *Dependency*: None.
   - *Effort*: **S** (5 mins).
   - *Description*: Delete 0-byte files `components/FeatureCard.tsx` and `components/Hero.tsx`.

#### Part B: Remaining Work per Phase
1. **Phase 5 (Menu Promotions & Currency)**:
   - *Effort*: **M** (1–2 days).
   - Apply migration 184 on staging and execute `db/tests/migration_184_checks.sql`.
   - Complete 375px visual QA for promotions manager and customer checkout.
   - Parameterize services pricing currency in `components/site/blocks/BlockRenderer.tsx:2083`.
2. **Phase 6 (Commerce Gaps & Promo Management)**:
   - *Effort*: **L** (3–5 days).
   - Build Dashboard UI for store promo codes management (`/dashboard/org/[id]/promotions/store`).
   - Implement automated tax calculation hook in `/api/checkout/cart`.
   - Build unified merchant fulfillment dashboard (`/dashboard/org/[id]/fulfillment`).
3. **Kitchen & Delivery Workstream (Phase 6)**:
   - *Effort*: **M** (2–3 days).
   - Author missing Supabase CLI mirrors for migrations 185–188.
   - Live mobile browser testing for geolocation permissions and TomTom tile rendering.
   - Apply migration 191 (courier performance & ratings) to staging.
4. **Table & Menu QR Codes**:
   - *Effort*: **L** (1–2 weeks).
   - Author migration (assigned as 198) for `business_tables`, `table_sessions`, `table_orders`.
   - Implement short URL redirect `/q/<code>` resolving to live menu/table session.
   - Implement waiter confirmation screen on dashboard and QR print sheet generator.
5. **Phase 7 (Bookings & Reservations)**:
   - *Effort*: **L** (1–2 weeks).
   - Un-hide Reservations in sidebar navigation (`app/dashboard/org/[id]/org-nav-items.ts`).
   - Author migration for `booking_resources`, `availability_rules`, `time_slots`.
   - Implement slot availability and conflict prevention engine in `lib/bookings.ts`.
   - Build public `BookingWidget.tsx` and admin calendar view.
6. **Phase 8 (Business ERP)**:
   - *Effort*: **L** (1–2 weeks).
   - Author migration for staff shifts, rosters, and inventory stock movements.
   - Build shift scheduling UI and low-stock notification triggers.
   - Replace analytics stub in `app/dashboard/analytics/page.tsx` with consolidated revenue charts.
7. **Phase 9 (Public Developer API)**:
   - *Effort*: **L** (1–2 weeks).
   - Author migration for `api_keys` (hashed SHA-256) and permission scopes.
   - Implement API gateway at `app/api/v1/*` with `X-Aldriva-Key` authentication and tiered rate limits.
   - Build OpenAPI 3.1 generator and developer portal docs.
8. **Phase 10 (Outbound Webhooks)**:
   - *Effort*: **M** (1 week).
   - Author migration for `webhook_subscriptions` and `webhook_delivery_attempts`.
   - Build async dispatch service with HMAC-SHA256 signatures and exponential backoff.
   - Wire domain events (`order.paid`, `ticket.checked_in`, `reservation.confirmed`).
9. **Phase 11 (POS Integration)**:
   - *Effort*: **L** (2 weeks).
   - Build Square and Clover webhook receivers and event normalizer in `lib/pos/`.
   - Build bi-directional inventory synchronization engine.
10. **Phase 12 (Custom Domains & SSL)**:
    - *Effort*: **M** (1 week).
    - Add dynamic `Host` header routing branch to `proxy.ts`.
    - Build DNS verification engine and integrate with Vercel Custom Domains API.
11. **Phase 13 (Aldriva AI Messaging & Tenant Assistant)**:
    - *Effort*: **L** (1–2 weeks).
    - Implement Meta WhatsApp Cloud API / Instagram Direct webhook handlers in `app/api/webhooks/meta/`.
    - Build customer message ingestion and tenant AI chat studio at `/dashboard/org/[id]/ai`.
    - Fix S18-1 approval gate gap for medium-risk tools.
12. **Phase 14 (External AI Ecosystem)**:
    - *Effort*: **L** (2 weeks).
    - Build OAuth 2.0 PKCE authorization server and third-party MCP tool gateway.

#### Part C: Missing Tests to Write
1. End-to-end integration test for menu options order snapshots in checkout.
2. Integration test for store promo code usage depletion under concurrent requests.
3. Live/mocked test for courier claim race conditions under high concurrency.
4. Unit and regression test suite for Phase 8 multi-branch permissions.
5. End-to-end test for short redirect `/q/<code>` with valid/invalid secret table tokens.

#### Part D: Tech Debt & Architectural Risks
1. **Lack of Migration Tracking Table**: Without `schema_migrations`, staging and production are vulnerable to drift. Introducing a formal migration tracking mechanism or syncing with Supabase CLI migration tables is strongly recommended.
2. **Windows Path Length & CLI Limits**: Running all tests via standard npm requires the chunked runner (`scripts/run-tests-chunked.cjs`). Any new test must be manually appended to `test-files.json`.
3. **Hardcoded USD Currencies**: Currency symbols are scattered across multiple components rather than derived from tenant configuration.

---

## 6. Sensible First Milestone (Achievable in One Sitting)

### Milestone: "Staging Hygiene & Merchant Navigation Fix" (Effort: ~2–3 hours)
1. **Restore Canonical Parity for Migration 193**:
   - Create `db/migration_193_event_team_members_active_user_index.sql` and its rollback twin from the Supabase mirror.
2. **Author Migration 182 Rollback Twin**:
   - Create `db/migration_182_menu_option_groups_rollback.sql`.
3. **Un-hide Phase 7 Reservations in Navigation**:
   - Edit `app/dashboard/org/[id]/org-nav-items.ts` to include the Reservations route when the business supports it.
4. **Fix the 7 ESLint Errors**:
   - Extract `ViewAllLink` in `app/dashboard/DashboardView.tsx`.
   - Fix JSX try/catch block in `app/m/[token]/page.tsx`.
5. **Prune Empty Files**:
   - Delete `components/FeatureCard.tsx` and `components/Hero.tsx`.
6. **Register Valid Unregistered Tests**:
   - Append `evergreen-photo-resolution.test.cjs`, `website-preview-channel-and-save-queue.test.cjs`, `website-v2-create-flow.test.cjs`, and `website-v2-editor-schema.test.cjs` to `test-files.json`.

---

## 7. Open Decisions & Questions for Owner

1. **Migration 184 Application**: Migration 184 (Menu Promotions) is approved. Can the owner apply it to staging and run `db/tests/migration_184_checks.sql`?
2. **Migration 175 Rollback Strategy**: Should the rollback retain the hard `MIGRATION_175_ROLLBACK_BLOCKED` guard (preventing destructive data loss on live deliveries), or revert to silent status remapping?
3. **Phase 7 Reservations Navigation**: Should Reservations be surfaced in the dashboard sidebar immediately for all organizations, or gated only to organizations with `reservations` enabled in their business settings?
4. **AI S18-1 Vulnerability Mitigation**: For medium-risk tools (`createNotification`, `notifyOwner`), should they be set to `approval_required=true` via a new migration, or should `medium` risk be added to the L0 approval gate in `lib/ai/approvals.ts`?
5. **Table & Menu QR Codes Architectural Placement**: Does the staff confirmation screen for incoming table orders belong on the existing desktop dashboard (`/dashboard/org/[id]/orders`) or on the lightweight mobile kitchen dashboard (`/kitchen`)?
6. **Remote Branch Backups**: Branches `feat/entity-architecture`, `feat/seat-picker-3d`, and `wip/phase7-checkpoint` exist only on this local machine. Should they be pushed to remote origin branches for backup?
