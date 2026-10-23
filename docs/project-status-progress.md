# Project Status Review — Progress Log (READ-ONLY review)

Session started: 2026-10-20. Working dir: C:\Users\Youngyz\aldriva-staging
Branch at start: feat/menu-promotions-phase-4

Allowed outputs: docs/project-document-index.md, docs/project-status.md, this file.
All other writes prohibited. No git state changes. No DB operations.

## STEP 1 — IN PROGRESS

- docs/ listed (recursive, md+sql): 146 md files + SQL audit scripts (see shell find output).
- Root docs: README.md, CLAUDE.md, AGENTS.md, DESIGN.md.
- Read so far:
  - docs/CURRENT-STATE.md (435 lines) — living status; newest entries = menu options/promotions phases (2026-10-20).
  - docs/ROADMAP.md (83 lines) — Phases 0–14 master map; statuses: 0-4 COMPLETE, 5 PARTIAL, 6-12 PLANNED, 13 IN PROGRESS, 14 PLANNED.
  - docs/PRODUCT.md — product definition (events, fundraising, commerce, articles, orgs, AI).
  - docs/ARCHITECTURE.md — Next 16, proxy.ts, 3 Supabase clients, tenants=organizers.id.
  - docs/API.md — internal API route catalog; /v1 public API PLANNED (Phase 9).
  - docs/phases/phase-00..14 + r2 + server-only statuses captured via grep (50 matches).
- KEY FINDING: no app/api/v1/** exists (glob empty), no lib/pos*, no **/pos/** (glob empty), no Square/Clover/Toast references in *.ts. POS = NOT FOUND in code; Phase 11 doc says PLANNED. Internal API exists under app/api/ (40+ route groups listed).
- Also read: README.md, CLAUDE.md (head), DATABASE.md, API.md, audit-menu-options-promotions.md (229 lines, 2026-10-19),
  docs/phase-4-progress.md, docs/phase-3-report.md, docs/phase-4-report.md (120 lines), CHANGELOG.md (head).
- Per-file last-commit dates collected for all 146 docs/*.md + README/CLAUDE/AGENTS/DESIGN (output in session; go/no-go for index: current if >= 2026-10, stale if <= 2026-09 for fast-moving areas).

### MASTER PHASE LIST (source: docs/ROADMAP.md:59-75 + docs/phases/* §7)
- Phase 0 Codebase & Documentation Audit — doc: COMPLETE (phase-00-audit.md:37)
- Phase 1 Business Website Foundation — doc: COMPLETE (phase-01:36)
- Phase 2 Public Website Engine — doc: COMPLETE (phase-02:37)
- Phase 3 Website Design System — doc: COMPLETE (phase-03:43)
- Phase 4 Website Builder/Editor — doc: COMPLETE (phase-04:38)
- Phase 5 Products, Services & Menus — doc: PARTIAL (phase-05:40; ROADMAP:66)
- Phase 6 Unified Commerce — doc: PARTIAL (phase-06:40; ROADMAP:67 says PLANNED — MISMATCH)
- Phase 7 Bookings & Reservations — doc: PLANNED (phase-07:34)
- Phase 8 Business Management ERP — doc: PLANNED (phase-08:35)
- Phase 9 Public Developer API — doc: PLANNED (phase-09:34)
- Phase 10 Outbound Webhooks — doc: PLANNED (phase-10:34)
- Phase 11 POS Integration — doc: PLANNED (phase-11:34)
- Phase 12 Custom Domains & SSL — doc: PLANNED (phase-12:33)
- Phase 13 Aldriva AI — doc: IN PROGRESS / FOUNDATION BUILT (phase-13:36)
- Phase 14 External AI Ecosystem — doc: PLANNED (phase-14:34)
- Parallel: R2 media storage — doc: PARTIALLY COMPLETE (phase-r2-media-storage.md:5); server-only boundaries — doc: COMPLETE (phase-server-only-boundaries.md:5)
- Pre-phase domains (audited as COMPLETE in CURRENT-STATE §1A): Events & Ticketing, Fundraising, Digital Products/Marketplace, Articles, Entities/Organizations (incl. dashboard/profile architecture).
- Menu options + promotions workstream (Phases 0-4 on feat/menu-options-phase-0-1/-2/-3, feat/menu-promotions-phase-4): docs = audit-menu-options-promotions.md (2026-10-19), phase-2/3/4 reports + phase-4-progress; migration 184 authored, NOT applied.

## STEP 2 — GIT STATE (VERIFIED 2026-10-20)

- Remote: origin https://github.com/Youngyz1/aldriva.git. Local branches: 20; remote branches: 6 (add-qa-workflow, feat/seat-picker-3d, feat/source-migration, main, release/admin-redesign, staging).
- origin/main == local main == a2f0c5e (2026-10-05). staging behind origin/main by 75, has 0 unique commits. add-qa-workflow behind 168.
- Current branch feat/menu-promotions-phase-4, tip 16265fb (2026-10-20), NO remote counterpart, 175 commits ahead of origin/main; origin/main IS an ancestor.
- Menu-options stack (VERIFIED ancestors): origin/main → 00cb31f baseline → feat/menu-options-phase-0-1 (c160202, 126 ahead of origin/main) → +8 → phase-2 (15bb0d9) → +9 → phase-3 (251f523) → +32 → phase-4 (16265fb).
- LOCAL-ONLY branches (no remote tip): business-sites-checkpoint (100 ahead, 2026-10-19), full-recovery (91, 10-17), integration/full-recovery (89, 10-16), wip/phase7-checkpoint (90, 10-14), wip/admin-baseline (2), the 4 menu-options/promotions branches.
- Remote-tracking-only-elsewhere: feat/entity-architecture checked out in worktree C:/Users/Youngyz/fundraising-app-entity-architecture; feat/seat-picker-3d in C:/Users/Youngyz/aldriva-seating-test. feat/source-migration ahead 1 of its origin branch.
- Uncommitted: MODIFIED db/migration_175_owner_managed_delivery.sql (+61/-... total 122 insertions/39 deletions across 3 files), its rollback, and supabase mirror 20261014043000_migration_175...; UNTRACKED db/migration_175_rollback.sql, work/ (test logs), scratch files (ignored per rules: .tmp-soundcloud-proof.cjs, StorefrontBrowse.*.bak, test-files.json, tsc-output.txt), docs/project-status-progress.md (this file).
- 5 stashes exist (stash@{0..4}): integration/full-recovery commerce, loose 3c edits, feature/admin-redesign WIP, staging supabase-js bump, main Cache Components WIP.
- Baseline 00cb31f (2026-10-19 22:32, "wip: baseline snapshot of pre-existing uncommitted work before menu-options phase 0-1"): 71 files, +12680/−386. Contains: Store work (StoreCartDrawer 587, StoreOrderConfirmationView, StoreProductGallery, store-cart.ts 159, store-cart-checkout.ts 349, promo-codes.ts 193, app/api/checkout/cart + /validate + product route + order-lookup, stripe webhook +142, order-confirmation page, product edit/new forms, product carousel/CatalogCard/BlockRenderer/StorefrontBrowse edits, migration_177 + mirror, migration_181 + rollback, savannah-3h + store tests, fixtures, scripts/run-tests-chunked.cjs, package.json, proxy.ts +74, PlatformThemeProvider dark mode, audit-menu-options-promotions.md) + SCRATCH: .tmp-soundcloud-proof.cjs, StorefrontBrowse.{3b6c660,broken,head}.bak, test-files.json, tsc-output.txt.
- Newest work: feat/menu-promotions-phase-4 (2026-10-20). Exists ONLY on this machine: all 4 menu branches, business-sites-checkpoint, full-recovery, integration/full-recovery, wip/*, 5 stashes, uncommitted 175 edits.

## STEP 3 — ARCHITECTURE (VERIFIED spot checks)

- Stack: Next.js 16.3.4 App Router + Turbopack, React 19.2.4, Tailwind v4, Supabase (Postgres/Auth/Storage), Stripe + NOWPayments, Resend, TipTap, next-intl (README.md:12-20; package.json).
- Tenancy: organizers.id root; entity_members roles owner/admin/manager/editor/finance/viewer; is_entity_member() in RLS; lib/auth.ts, lib/entity-auth.ts, lib/tenant-context.ts; 3 Supabase clients (lib/supabase.ts browser / supabase-server.ts cookie / supabase-admin.ts service-role) (ARCHITECTURE.md:79-111).
- App structure: public sites app/site/[slug]/[[...page]]; dashboard app/dashboard/* incl. app/dashboard/org/[id]/*; admin app/admin; API app/api/* (~40 route groups, ls VERIFIED); NO POS routes; proxy.ts pre-stream gates (not middleware).
- Shared libs: lib/website-*.ts (blocks/templates/resolver/embeds), lib/menu-pricing.ts, lib/order-submit.ts, lib/store-cart*, lib/promo-codes.ts, lib/actions/* (24 modules incl. menus, orders, promotions, reservations, website-v2), lib/ai/* + lib/workforce/* + lib/exec/* + lib/qa/*.
- Mini-site resolution: proxy.ts gates /site/:path* (pre-stream 404) → resolveWebsiteAndPage by slug + published check → template manifest resolver emits blocks → shared BlockRenderer; menu_embed resolved live from menu tables (docs/audit-menu-options-promotions.md:30-35).
- Scripts: test = node --test explicit list; test:chunked = scripts/run-tests-chunked.cjs; lint = eslint; build = next build (package.json VERIFIED).

## STEP 4 — EARLY FINDINGS

- POS (Phase 11): NOT FOUND in code — glob app/api/v1/** empty, **/pos/** empty, lib/pos* empty, no Square/Clover/Toast in *.ts. Docs: docs/phases/phase-11-pos.md:34 PLANNED; docs/INTEGRATIONS.md:76 defers to Phase 11. The user brief's "a POS" is NOT in this repo.
- Public /v1 API (Phase 9): NOT FOUND (no app/api/v1). Internal API exists: app/api/checkout/{business,cart,product,product-crypto,business-crypto,crypto}, app/api/orders/payment-intent, app/api/webhooks/stripe, app/api/cron/{daily-post,invitation-drafts,invitation-retention,memory-retention,promotion-engine,purge-accounts,sentinel-sweep}, app/api/ai/{gateway,chat,calendar,conversations,synthesize-trends}.
- Phase 7 bookings: PARTIAL although docs say PLANNED — app/dashboard/org/[id]/reservations/page.tsx; app/site/[slug]/reservations/[lookup_token]/page.tsx; lib/actions/reservations.ts (submitReservationRequest, updateReservationStatus, cancelReservationByToken, saveReservationSettings + WithClient variants); db/migration_176_reservations.sql (CREATE TABLE public.reservations at :35); lib/__tests__/phase7-reservations.test.cjs registered. NOT in org-nav-items.ts (grep empty) → nav suppressed. phase-07-bookings.md:34 still PLANNED → DOC STALE.
- Phase 6: PARTIAL — app/api/checkout/cart + /validate, lib/store-cart.ts, lib/promo-codes.ts, migration_177, owner-managed delivery migration_175 (MODIFIED uncommitted), orders 171/173/174; phase-06-commerce.md:40 says PARTIAL but ROADMAP.md:67 says PLANNED → mismatch.
- TODO/FIXME across lib/components/app: exactly 3 — BlockRenderer.tsx:2082 (services multi-currency hardcoded USD), app/api/checkout/product-crypto/route.ts:135 (crypto-pending status gap), app/api/donate/route.ts:15 (delete-file marker). No feature-flag framework (grep FEATURE_FLAG/isEnabled empty).

## STEP 5 — MIGRATIONS (static, VERIFIED from files)

- db/: 181 unique-numbered forwards (001–184; gaps 066, 081, 123) + 7 sub-numbered (79b/c/d, 80b/c/d/e) = 188 forward SQL; 145 rollbacks; 44 forwards WITHOUT rollback (001–036, 039, 048, 049, 073, 074, 088, 089, 182).
- supabase/migrations/: 90 files = 83 numbers (75–80, 82–87, 101–107, 116–122, 124, 127, 130–184) + 7 sub-numbered. Every supabase number exists in db/.
- db NOT mirrored: 001–065, 067–074, 088–100, 108–115, 125, 126, 128, 129 (87 numbers). Mirrors documented optional (DATABASE.md:14) — large divergence nonetheless.
- db/extra artifacts: db/schema.sql legacy dump (22 tables only; shows comments/donations w/o RLS although migration_29 enables them → STALE), db/seed/, db/tests/, db/rollback/, db/inventory/, staging-migration-order.txt.
- Static RLS sweep: 117 distinct tables created in db/*.sql; 113+ explicitly ENABLE ROW LEVEL SECURITY in migrations; seats/ticket_orders/venue_layouts enabled in db/schema.sql:1509-1518; comment_likes at migration_43:31. No production table found without RLS (static only; live DB not queried).
- db/migration_182_menu_option_groups.sql has NO _rollback twin (NOT FOUND; ls db/migration_182*) despite phase-1 report claiming one — FLAG.
- Staging-verified applied per task: 134, 136, 170, 171, 177, 181, 182, 183. Others UNKNOWN; no schema_migrations table.

## STEP 6 — QUALITY & SECURITY (VERIFIED 2026-10-20)

### Quality gates (all run on the DIRTY working tree of feat/menu-promotions-phase-4)
- **test:chunked — FAIL (exit 1): TOTAL PASS 2,531 / TOTAL FAIL 1** (work/status-review-test-chunked.log).
  Chunks 1–6: 249+265+409+183+414+696 = 2,216 pass, 0 fail. Chunk 7 (17 files incl. phase6/phase7/store/savannah/menu suites) aborted on one failing test.
  Failing test: `Phase 6 migration: forward, rollback twin, and supabase mirror exist with the right constraint`
  (lib/__tests__/phase6-owner-managed-delivery.test.cjs:950, assertion at :970 "rollback maps delivered -> completed").
  ROOT CAUSE (VERIFIED): the UNCOMMITTED working-tree edits to db/migration_175_owner_managed_delivery_rollback.sql (and its forward + supabase mirror) replace the old silent remap (`delivered -> completed`, `out_for_delivery -> ready` before CHECK restore) with a hard guard (`MIGRATION_175_ROLLBACK_BLOCKED` abort). The test still asserts the old silent-remap strategy → fails. The doc baselines (2,526/2,526; 2,530) were measured on COMMITTED state; this dirty tree is red. Not a flaky test — a deliberate-looking strategy change whose test was not updated.
- **tsc: PASS** — `npx tsc --noEmit --pretty false` exit 0, 0 errors (work/status-review-tsc.log).
- **ESLint (full repo): 307 problems = 8 errors + 299 warnings** (work/status-review-lint.log, exit 1).
  All 8 errors are pre-existing in UNTOUCHED files: app/dashboard/DashboardView.tsx ×6 ("Cannot create components during render", lines 165/205/224/248/252/256), app/m/[token]/page.tsx:54 ("JSX within try/catch"), e2e/fixtures.ts:46 (rules-of-hooks). Matches the documented baseline (phase-3-report.md:82). 299 warnings are legacy no-unused-vars across lib/scripts.
- **git diff --check: PASS** (exit 0, no whitespace errors).
- **npm run build**: run result recorded in Step 7 report (work/status-review-build.log).

### Security findings (static, read-only)
- Secrets: `.env*` ignored (gitignore:39); only `.env.example` tracked. NO real secret found: `sk_live_` hits are redaction-pattern code (lib/ai/tools/workforce/memory-propose.ts:51) and test fixtures (memory.test.cjs:483,526,531; studio-chat-persistence.test.cjs:179); the only stripe-shaped key is `sk_test_placeholder` in next.config.ts. JWT-shaped strings occur in docs/test fixtures only.
- Rate limiting: lib/rate-limit.ts:327 `enforceRateLimit` (table migration_54.rate_limits) is wired into 45 of 172 app/api route handlers (payment, crypto, checkout, AI gateway, cron, comments, geocode, exec, donations...). ~127 routes have NO explicit rate limit — most are session-cookie dashboard/internal reads; unauthenticated ones (e.g. some product/order-lookup, tickets, verify-ticket — NOT exhaustively classified) are the residual risk surface.
- Unbounded queries flagged in the 2026-10-19 menu audit (lib/website-embeds.ts:352-371, no LIMIT) still present — audit remediation not yet done (it's the premise of the current workstream).
- RLS: static sweep found no production table without ENABLE ROW LEVEL SECURITY (Step 5). Live policy verification NOT POSSIBLE read-only (no schema_migrations table; task prohibits DB writes but SELECT was not available either — queries provided in report instead).
- DOC-vs-CODE MISMATCH (VERIFIED): CURRENT-STATE.md:8 states migration 184 SHA-256 = 8033C841… but current db/migration_184_menu_promotions.sql + mirror both hash to 30fb2d164cfbc0315230c8f72b7d91d21c551c6ed30c84bdebe21686cf255482; the file was hardened in 7c8cbf4 ("revoke inherited grants") and 3fd162c ("prevent organizer changes on targeted promotions") AFTER the SHA claim was committed (8a361b6). Both copies identical and match HEAD; the doc SHA is stale.

## STEP 7 — COMPLETE (2026-10-20)

- **Deliverable 1:** `docs/project-document-index.md` (14.6 KB) — every repo doc with last-commit date, purpose, freshness verdict + gaps section.
- **Deliverable 2:** `docs/project-status.md` (49+ KB) — master phase list, git/env state (incl. baseline 00cb31f contents), architecture (≤20 lines), phase-by-phase audit with POS/API deep dives, migration inventory (stats + verification queries + 188-row table + RLS sweep), quality/security results, stale-doc register (10 items), bottom line.
- Quality run final results (dirty tree): test:chunked **2,531 pass / 1 fail** (uncommitted migration-175 rollback redesign vs. test asserting old silent-remap), tsc **0 errors**, lint **8 pre-existing errors** + 299 warnings, git diff --check **clean**, build **PASS** (367/367 pages).
- Key flags for owner: (1) no remote backup for 175-commit menu/promotions stack + 5 stashes; (2) migration 182 missing rollback twin; (3) CURRENT-STATE migration-184 SHA claim stale (30fb2d16… now); (4) uncommitted migration_175 edits = deliberate-looking rollback strategy change needing test update or discard; (5) POS and /v1 API do NOT exist anywhere in the repo.
- No repository changes beyond: docs/project-document-index.md, docs/project-status.md, this progress file, and logs in gitignored work/ (status-review-test-chunked.log, status-review-tsc.log, status-review-lint.log, status-review-build.log, migration-table.md).
