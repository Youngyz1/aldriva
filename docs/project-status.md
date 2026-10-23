# Aldriva — Project Status Report

> **Date:** 2026-10-20 · **Branch reviewed:** `feat/menu-promotions-phase-4` @ `16265fb` (dirty working tree — see §3.4)
> **Method:** Read-only review. No code, migration, or database operation was performed. No git state was changed.
> **Evidence labels:** **VERIFIED** = read directly in code/files/commits this session · **INFERRED** = conclusion beyond what repository files can prove · **NOT FOUND** = searched the named paths, nothing found.
> **Companion file:** `docs/project-document-index.md` (full document inventory with freshness verdicts).

---

## 1. Master Phase List

The project's own numbering comes from `docs/ROADMAP.md` + `docs/phases/`. Two parallel programs (AI Operating System, menu options/promotions) run outside the 0–14 sequence and are listed after it.

| Phase | Name (project's own title) | Doc status | Code status (this review) | Key evidence |
|---|---|---|---|---|
| 0 | Codebase & Documentation Audit | COMPLETE | COMPLETE | `docs/phases/phase-00-audit.md:37`; canonical docs exist |
| 1 | Business Website Foundation | COMPLETE | COMPLETE | `db/migration_125_tenant_websites.sql`, `lib/actions/website.ts`, `app/dashboard/org/[id]/website/` (VERIFIED) |
| 2 | Public Website Engine | COMPLETE | COMPLETE | `app/site/[slug]/`, `proxy.ts` pre-stream 404 gate (VERIFIED; audit-menu-options-promotions.md:30-35) |
| 3 | Website Design System | COMPLETE | COMPLETE | `lib/website-blocks.ts`, `components/site/blocks/BlockRenderer.tsx`, `lib/website-embeds.ts`; tests registered in `package.json` (VERIFIED) |
| 4 | Website Builder/Editor | COMPLETE | COMPLETE | `components/dashboard/website/builder/*`, `lib/actions/website-builder.ts`, `db/migration_129_website_page_drafts_and_publishing_guard.sql` (VERIFIED) |
| 5 | Products, Services & Menus | PARTIAL | PARTIAL — matches doc | `db/migration_136_services_and_menus.sql`, `lib/actions/{services,menus}.ts`, `app/dashboard/org/[id]/{services,menu}`; multi-currency TODO at `BlockRenderer.tsx:2082` (VERIFIED) |
| 6 | Unified Commerce | PARTIAL (`phase-06-commerce.md:40`) / PLANNED in `ROADMAP.md:67` | PARTIAL — cart/promos/delivery built; tax + fulfillment dashboard + crypto carts missing | `app/api/checkout/cart` + `/validate`, `lib/store-cart.ts`, `lib/promo-codes.ts`, `db/migration_177_*`, `db/migration_175_owner_managed_delivery.sql` (VERIFIED; §5.6) |
| 7 | Bookings & Reservations | PLANNED (`phase-07-bookings.md:34`) | **PARTIAL — doc stale**: reservation request engine built, staff scheduling/appointment slots/capacity/SMS/ICS not built | `db/migration_176_reservations.sql:35` (`CREATE TABLE public.reservations`), `lib/actions/reservations.ts:112,444,667,801`, `app/dashboard/org/[id]/reservations/page.tsx`, `app/site/[slug]/reservations/[lookup_token]/page.tsx`, `lib/__tests__/phase7-reservations.test.cjs` registered (VERIFIED). Not in `app/dashboard/org/[id]/org-nav-items.ts` → navigation suppressed |
| 8 | Business Management ERP | PLANNED (`phase-08-business-management.md:35`) | NOT STARTED except branches: `db/migration_132_business_type_and_branches.sql`, `lib/actions/business-branches.ts`, `app/dashboard/businesses/[id]/branches/` (VERIFIED). No shift/roster/inventory migrations (NOT FOUND in `db/` filenames) |
| 9 | Public Developer API | PLANNED (`phase-09-public-api.md:34`) | **NOT STARTED — NOT FOUND**: no `app/api/v1/**` (glob empty), no `api_keys` table in `db/*.sql`, no `lib/api-auth` (§5.9) |
| 10 | Outbound Webhooks | PLANNED (`phase-10-webhooks.md:34`) | **NOT STARTED — NOT FOUND**: no webhook-subscription table, no dispatch lib (grep `webhook_subscription|outbound_webhook` empty). Only inbound `app/api/webhooks/stripe` |
| 11 | POS Integration Framework | PLANNED (`phase-11-pos.md:34`) | **NOT STARTED — NOT FOUND**: no `lib/pos*`, no `**/pos/**`, no `/v1` POS API, no Square/Clover/Toast/Shopify-POS code (§5.11) |
| 12 | Custom Domains & Advanced Web | PLANNED (`phase-12-advanced-web.md:33`) | NOT STARTED — `proxy.ts` has no Host/custom-domain handling (grep empty) (VERIFIED) |
| 13 | Aldriva AI | IN PROGRESS (`phase-13-aldriva-ai.md:36`) | IN PROGRESS — but built shape ≠ doc scope: AI studio + agent/workforce/sentinel/QA/exec built (migrations 139–168); **NOT FOUND**: `app/api/webhooks/meta` (WhatsApp/IG auto-responder), `/dashboard/org/[id]/ai` tenant assistant (§5.13) |
| 14 | External AI Ecosystem | PLANNED (`phase-14-external-ai.md:34`) | NOT STARTED (NOT FOUND) |
| ∥ | Milestone: R2 Media Storage | PARTIALLY COMPLETE (`phase-r2-media-storage.md:5`) | Built; R2 amendment suite was flaky once historically (`docs/phase-3-report.md:41`) |
| ∥ | Milestone: Server-Only Boundaries | COMPLETE (`phase-server-only-boundaries.md:5`) | Built (server-only markers + static bundle scan tests registered) |
| ∥ | **AI Operating System program** (migrations 139–168) | not in ROADMAP numbering | Built: tool registry (139), agent registry (140), knowledge/RAG (142,145,146), runtime (147,150,164), sentinel (149,151–156,158,163), QA (159), background exec (160,161), approvals (165), memory (166,167), studio chat (168) — filenames VERIFIED in `db/` |
| ∥ | **Menu options & promotions workstream** (Phases 0–4) | see §3.5 | Implemented & committed through item 6 on this branch; migration 184 authored, **not applied** | `docs/phase-4-report.md`, `docs/phase-4-progress.md`, `db/migration_182/183/184` (VERIFIED) |
| ∥ | Pre-phase domains (audited complete in Phase 0) | COMPLETE | Routes + tests present: `app/events`, `app/fundraisers`, `app/products`, `app/articles`, `app/organizations`, `app/businesses` (ls VERIFIED) |

---

## 2. Environment & Technology

**VERIFIED** (README.md:12-20, `package.json`, `proxy.ts`, `CLAUDE.md`): Next.js **16.4.3** (App Router, Turbopack) · React **19.2.4** · Tailwind **v4** (Zinc neutral + Orange `--brand-700` `#c2410c`) · Supabase (Postgres 15+ / Auth / Storage / Realtime) · Stripe + NOWPayments dual payment rails · Resend email · TipTap editor · next-intl · Framer Motion v12 · Cloudflare R2 media (partial milestone). Root `proxy.ts` (not `middleware.ts`) performs session refresh, protected-route redirects, and pre-stream 404 gates.

---

## 3. Git & Working-Tree State (all VERIFIED 2026-10-20)

### 3.1 Remotes & branches
- **Remote:** `origin` → `https://github.com/Youngyz1/aldriva.git`. Remote branches: `main`, `staging`, `add-qa-workflow`, `feat/seat-picker-3d`, `feat/source-migration`, `release/admin-redesign` (6).
- **`origin/main` == local `main` == `a2f0c5e`** (2026-10-05, "docs: add full branch recovery final report"). `staging` is 75 behind `origin/main` with **0 unique commits** (`git rev-list --count origin/main..staging` = 0).
- 20 local branches; branch topology VERIFIED with `git merge-base --is-ancestor`.

### 3.2 Unpushed commits per branch (ahead of their tracking branch / origin)
| Branch | Tip | Date | Unique commits | On any remote? |
|---|---|---|---|---|
| `feat/menu-promotions-phase-4` (**current**) | `16265fb` | 2026-10-20 | **175** ahead of `origin/main` | **NO — machine only** |
| `feat/menu-options-phase-3` | `251f523` | 2026-10-20 | 143 | NO |
| `feat/menu-options-phase-2` | `15bb0d9` | 2026-10-20 | 134 | NO |
| `feat/menu-options-phase-0-1` | `c160202` | 2026-10-20 | 126 | NO |
| `business-sites-checkpoint` | `3b6c660` | 2026-10-19 | 100 | NO |
| `full-recovery` | `284f68f` | 2026-10-17 | 91 | NO |
| `integration/full-recovery` | `a3fed17` | 2026-10-16 | 89 | NO |
| `wip/phase7-checkpoint` | `91c5401` | 2026-10-14 | 90 | NO |
| `wip/admin-baseline` | `20df7d5` | 2026-08-11 | 2 | NO |
| `feat/source-migration` | `b72b006` | 2026-08-22 | 1 ahead of `origin/feat/source-migration` | yes |
| `main`, `staging`, `add-qa-workflow`, `feature/admin-redesign` | — | — | 0 | yes |
- Stacked workstream (VERIFIED ancestors): `origin/main` → `00cb31f` → `phase-0-1` → +8 → `phase-2` → +9 → `phase-3` → +32 → `phase-4`.
- Checked out in **other worktrees**: `feat/entity-architecture` (`C:/Users/Youngyz/fundraising-app-entity-architecture`), `feat/seat-picker-3d` (`C:/Users/Youngyz/aldriva-seating-test`).

### 3.3 Baseline commit `00cb31f` (2026-10-19 22:32, "wip: baseline snapshot of pre-existing uncommitted work before menu-options phase 0-1")
71 files, +12,680 / −386, containing **unrelated Store (mini-site commerce) work**: `components/site/v2/StoreCartDrawer.tsx` (+587), `StoreOrderConfirmationView.tsx`, `StoreProductGallery.tsx`, `lib/store-cart.ts` (159), `lib/store-cart-checkout.ts` (349), `lib/promo-codes.ts` (193), `app/api/checkout/cart/` + `/validate`, `app/api/checkout/product/route.ts` (+44), `app/api/products/order-lookup/`, `app/api/webhooks/stripe/route.ts` (+142), order-confirmation page, product edit/new forms, `db/migration_177_*` + mirror, `db/migration_181_*` + rollback, savannah/store tests + fixtures, `scripts/run-tests-chunked.cjs`, `package.json`, `proxy.ts` (+74), `PlatformThemeProvider` (dark mode), `docs/audit-menu-options-promotions.md` — **plus scratch files that were also committed here**: `.tmp-soundcloud-proof.cjs`, `StorefrontBrowse.{3b6c660,broken,head}.bak`, `test-files.json`, `tsc-output.txt`.

### 3.4 Uncommitted working-tree changes (RISK — see §7.1)
- **Modified:** `db/migration_175_owner_managed_delivery.sql`, `db/migration_175_owner_managed_delivery_rollback.sql`, `supabase/migrations/20261014043000_migration_175_owner_managed_delivery.sql` (+122/−39 total).
- **Untracked:** `db/migration_175_rollback.sql`, plus scratch files (`.tmp-soundcloud-proof.cjs`, 3× `StorefrontBrowse.*.bak`, `test-files.json`, `tsc-output.txt`) and gitignored `work/`.
- **5 stashes** (`stash@{0..4}`): commerce snapshot, loose 3c edits, admin-redesign WIP, supabase-js bump, Cache Components WIP.
- **INFERRED:** only this machine holds the entire menu workstream (4 branches), business-sites/full-recovery checkpoints, wip branches, all stashes, and the uncommitted 175 edits. No remote backup exists for any of it.

### 3.5 Workstream status (menu options + promotions)
**VERIFIED:** Phases 0–4 stack cleanly (ancestors confirmed); commits `6ee2ee3` (184 schema) → `472e6e1`,`667d916` (pricing engine) → `c6a3af9` (server paths) → `332cd10` (Promotions manager) → `ae02feb` (item 5) → … → `16265fb` (tip). Migrations **182, 183, 184** authored; per task, **182/183 applied on staging; 184 approved but not applied** (no DB operation run — `db/tests/migration_184_checks.sql` exists but was never executed). Workstream code present: `lib/actions/menu-option-groups.ts`, `lib/actions/promotions.ts`, `lib/menu-promotions.ts`, `components/dashboard/menu/PromotionsManager.tsx`, `app/dashboard/org/[id]/promotions/page.tsx`.

---

## 4. Architecture (VERIFIED, ≤20 lines)

1. **Multi-tenant SaaS** rooted in `organizers.id`; every domain table carries `tenant_id` with RLS `is_entity_member()` checks (`entity_members` roles: owner/admin/manager/editor/finance/viewer).
2. **Three Supabase clients:** browser (`lib/supabase.ts`), cookie-server (`lib/supabase-server.ts`), service-role admin (`lib/supabase-admin.ts` — bypasses RLS, admin ops only).
3. **Next.js 16 App Router**: public sites `app/site/[slug]/[[...page]]` (+ `[locale]` mirrors), dashboards `app/dashboard/**`, admin `app/admin/**`, internal API `app/api/**` (172 route handlers).
4. **`proxy.ts`** replaces middleware: session refresh, `/dashboard/*` & `/admin` auth redirects, account-suspension blocks, pre-stream 404 gating for `/articles`, `/businesses`, `/products`, `/site/:path*` (real 404 before streaming).
5. **Mini-site pipeline:** slug → `resolveWebsiteAndPage` (published check) → template manifest resolver (`lib/website-template-resolver.ts`) → shared `BlockRenderer` (18 block types); embeds (music, maps, store, menu) resolved server-side from live tables.
6. **Payments:** Stripe Checkout Sessions + webhooks (`app/api/webhooks/stripe`) and NOWPayments invoices + webhook; both funnel through status-authoritative order tables (`product_orders`, `ticket_orders`, `donations`, `orders`).
7. **Shared pricing:** `lib/menu-pricing.ts` (option surcharges), `lib/order-submit.ts` (authoritative server pricing), `lib/store-cart.ts`/`store-cart-checkout.ts` (Store), `lib/ticket-pricing.ts` (events), `lib/promo-codes.ts` (store discounts), `lib/menu-promotions.ts` (restaurant promotions).
8. **AI layer:** `lib/ai/*` — gateway (`app/api/ai/gateway`), 22 tools with `SAFE_COLUMNS` allowlists, output guard (`lib/ai/output-guard.ts`), agent/workforce/sentinel/QA/exec subsystems backed by migrations 139–168.
9. **Testing:** `node --test` with an **explicit 197-file list** in `package.json`; `npm run test:chunked` splits into 7 chunks; static SQL-reading tests pin migration invariants (e.g., `phase6-owner-managed-delivery.test.cjs`).

---

## 5. Phase-by-Phase Audit (code evidence)

### 5.1–5.4 Website phases (1–4) — COMPLETE (spot-checks VERIFIED)
Migrations 125–131 all present with rollbacks (`ls db/migration_12[5-9]|13[01]`), builder at `components/dashboard/website/builder/`, draft/publish RPC in `db/migration_129_...sql` with guard tests registered (`migration129-publishing-guard.test.cjs`). No contradictions found.

### 5.5 Phase 5 — PARTIAL (matches doc)
`db/migration_136_services_and_menus.sql` created `services`, `service_tiers`, `menu_sections`, `menu_items` (13 tables RLS-enabled per static sweep). Dashboard: `app/dashboard/org/[id]/services/`, `services/[serviceId]/`, `menu/`. Remaining gaps confirmed in code: services price **hardcoded USD** (`BlockRenderer.tsx:2082` "TODO: multi-currency not in Phase 5"); QR out of scope per doc. The Oct-2026 audit (`docs/audit-menu-options-promotions.md`) found menu options were **JSON embedded per item** with no reusable group library — the current workstream's migration 182 (`menu_option_groups`) fixes exactly that (VERIFIED: table names present in `db/migration_182_menu_option_groups.sql`).

### 5.6 Phase 6 — PARTIAL (built beyond doc's "PLANNED" framing in ROADMAP)
Built (VERIFIED): unified Store cart (`app/api/checkout/cart`, `/validate`, `lib/store-cart.ts`), Stripe cart checkout (`store-cart-checkout.ts`), store promo codes (`lib/promo-codes.ts` + `db/migration_177_promo_codes.sql` — **applied on staging per task**), order timing (`migration_174`), payment intents (`migration_173`), orders (`migration_171`), **owner-managed delivery** (`migration_175` + `lib/courier/`), order confirmation view, dark-mode cart drawer.
Missing vs. plan (`phase-06-commerce.md:8-10`): automated tax calculation (**NOT FOUND** — grep `tax_engine|avalara|taxjar` empty), unified fulfillment dashboard (NOT FOUND — orders page exists at `app/dashboard/org/[id]/orders` but no cross-domain fulfillment hub), multi-item **crypto** cart aggregation (per-invoice only), POS terminal sync (N/A).
**RISK:** the uncommitted migration-175 redesign breaks the suite (§7.1).

### 5.7 Phase 7 — PARTIAL (doc says PLANNED — STALE)
Built (VERIFIED): `db/migration_176_reservations.sql` → `public.reservations`; server actions `lib/actions/reservations.ts` (`submitReservationRequest:112`, `updateReservationStatus:444`, `cancelReservationByToken:667`, `saveReservationSettings:801` + `WithClient` variants); dashboard `app/dashboard/org/[id]/reservations/page.tsx`; public token page `app/site/[slug]/reservations/[lookup_token]/page.tsx`; tests `lib/__tests__/phase7-reservations.test.cjs` registered.
Not built: `booking_resources`/`availability_rules`/`time_slots` schema (NOT FOUND in `db/`), `components/bookings/BookingWidget.tsx` (NOT FOUND), day/week/month calendar timelines, SMS, `.ics` invites. Navigation intentionally suppressed (`org-nav-items.ts` has no reservations entry) — INFERRED: route is live but undiscoverable, matching the "checkpoint" branch `wip/phase7-checkpoint` (2026-10-14, local-only).

### 5.8 Phase 8 — mostly NOT STARTED
Built: `business_branches` (`migration_132`), `lib/actions/business-branches.ts`, `app/dashboard/businesses/[id]/branches/`. Not built: shifts/rosters, inventory, cross-branch reporting (NOT FOUND — the only "workforce" migrations 151/153 are AI-workforce RLS hardening, unrelated to ERP staff). Multi-location hub partial (branch address on website VERIFIED via `website-v2`).

### 5.9 Phase 9 (API) — NOT STARTED; internal API catalog below
**NOT FOUND:** `app/api/v1/**` (glob empty), `api_keys` table (grep across `db/*.sql` empty), scopes, cursor pagination, RFC 7807, OpenAPI spec. Doc claim `phase-09-public-api.md:22` planned `db/migration_130_api_keys.sql`, but actual `migration_130` is "website category and metadata" — planned numbering is consumed.

**The API that actually exists (internal, `app/api/`, 172 `route.ts` handlers):**
- **Endpoints (docs/API.md + ls VERIFIED):** account (`recover`, `delete`), `auth/callback`, admin (`articles`, `businesses`, `events`, `fundraisers`, `products`, + `app/admin/ai`, `app/admin/workforce/sentinel/incidents`), AI (`/api/ai/{gateway,chat,calendar,conversations,synthesize-trends}`), checkout (`business`, `business-crypto`, `cart`, `cart/validate`, `product`, `product-crypto`, `crypto`), `orders/payment-intent`, `products/order-lookup`, webhooks (`stripe`, `new-content`), cron (`daily-post`, `invitation-drafts`, `invitation-retention`, `memory-retention`, `promotion-engine`, `purge-accounts`, `sentinel-sweep`), plus events/tickets/seats/donate/fundraiser/comments/reviews/follow/notifications/profile/media/geocode/qa/exec routes.
- **Authentication (VERIFIED):** session cookies via `lib/supabase-server.ts` for dashboard routes; Stripe signature verification for `/api/webhooks/stripe`; `CRON_SECRET` for cron (`lib/cron-auth.ts`); admin routes gated by `requireAdmin()` (`lib/auth.ts`). **No API-key auth exists** (nothing to authenticate external clients).
- **Rate limits (VERIFIED):** `lib/rate-limit.ts:327` `enforceRateLimit` (backed by `rate_limits` table, migration 54) wired in **45 of 172** route handlers — all checkout/payment/crypto/AI-gateway/cron/exec/donate routes. ~127 routes (mostly session-guarded reads) have no explicit limiter.
- **Versioning:** **none** (no `/v1`, no header versioning) — NOT FOUND.
- **Documentation:** `docs/API.md` (2026-09-21) — incomplete vs. code (no cart/validate, payment-intent, AI gateway, cron entries).
- **Shared menu/order/pricing logic (VERIFIED):** the internal API **reuses** the same libs as the mini-sites: `/api/checkout/cart` → `lib/store-cart-checkout.ts` + `lib/order-submit.ts`; `lib/actions/orders.ts` shared with the dashboard; menu embeds resolved via the same `lib/website-embeds.ts` path the public site uses. No duplicate pricing implementation found.

### 5.10 Phase 10 — NOT STARTED
No outbound webhook subscriptions, signatures, or retry queue (NOT FOUND across `db/*.sql`, `lib/`, `app/`). The only webhook code is inbound Stripe.

### 5.11 POS — NOT STARTED (the reviewed brief's "a POS" does not exist)
Searched (NOT FOUND): `app/api/v1/**` glob empty · `**/pos/**` glob empty · `lib/pos*` glob empty · `app/dashboard/org/[id]/pos` absent · grep `Square|Clover|Toast POS|point of sale` across all `*.ts` returned only unrelated "MessageSquareQuote"/"square aspect" hits. Docs agree: `phase-11-pos.md:34` **PLANNED**, `INTEGRATIONS.md:76` defers to Phase 11. There are **no POS screens, no POS endpoints, no POS auth, and no POS tables**; consequently no POS-written tables exist (see §6.4). The `lib/courier/` module (delivery/courier dispatch, migration 175) is the closest in-store-adjacent surface and is Phase-6 Store work.

### 5.12 Phase 12 — NOT STARTED
`proxy.ts` has no Host-header/custom-domain routing (grep `host|custom domain` empty); no SSL/certificate code (NOT FOUND).

### 5.13 Phase 13 — IN PROGRESS, different shape than doc
Built (VERIFIED): AI gateway + chat (`app/api/ai/gateway`, `app/api/ai/chat` with `enforceRateLimit`), 22 AI tools (`lib/ai/tools/**` incl. tenant-scoped `tenant-*` tools), output guard, admin studio surfaces (`app/admin/ai/rejections`, `app/admin/workforce/agents`, `app/admin/workforce/sentinel/incidents`), workforce memory/knowledge/QA/exec (`lib/workforce/*`, `lib/exec/*`, `app/api/exec/*`), cron sweeps. Migrations 139–168 cover the whole program.
Not built (NOT FOUND): `app/api/webhooks/meta` (WhatsApp/Instagram auto-responder — Tasks 13.1–13.3), `/dashboard/org/[id]/ai` tenant assistant (Task 13.4), outbound domain webhooks (Task 13.5). So the doc's headline scope is unimplemented while an out-of-scope "AI Operating System" was built instead — ROADMAP's "IN PROGRESS (Core Built)" is accurate but ambiguous.

### 5.14 Phase 14 — NOT STARTED (NOT FOUND)

---

## 6. Migration Inventory

### 6.1 Summary (VERIFIED from `ls` + set arithmetic)
- **`db/` (canonical):** **188 forward SQL files** = 181 plain-numbered (`migration_001` … `migration_184`) + 7 sub-numbered (`79b/c/d`, `80b/c/d/e`). **145 rollback twins. 44 forwards have NO rollback**: 001–036, 039, 048, 049, 073, 074, 088, 089, and **182** (the newest gap, contradicts `docs/phase-2-report.md`'s rollback claim — FLAG for owner).
- **Gaps in numbering:** 066, 081, 123 (no file at all).
- **`supabase/migrations/`:** 90 timestamped mirrors covering 83 numbers (75–80, 82–87, 101–107, 116–122, 124, 127, 130–184) + the 7 sub-numbered. **Every mirrored number exists in `db/`** (no orphan mirrors).
- **Not mirrored (87 numbers):** 001–065, 067–074, 088–100, 108–115, **125, 126, 128, 129**. Mirrors are documented-optional (`DATABASE.md:14`), but 125/126/128/129 (website foundation/drafts) being unmirrored is notable.
- Other `db/` artifacts: legacy `db/schema.sql` (22-table dump — **stale**: shows `comments`/`donations` without RLS although `migration_29` enables it), `db/seed/`, `db/tests/` (129/168 harnesses, 183/184 checks), `db/rollback/`, `db/inventory/phase0_inventory.sql`, `db/staging-migration-order.txt`.

### 6.2 Staging application status
Per the review brief: **applied on staging** = 134, 136, 170, 171, 177, 181, 182, 183. **All other 180 migrations = UNKNOWN** (staging has no `schema_migrations` table to query). 184 = approved, not applied (VERIFIED: no DB op recorded; `CURRENT-STATE.md:6`). **INFERRED:** `DATABASE.md:6` claims 137 was "written 2026-09-24 not yet applied live (manual apply required)" — unknown whether that ever happened.

### 6.3 Read-only verification queries (SELECT-only; run in Supabase SQL editor or psql)
```sql
-- (a) Does schema_migrations exist after all? (expected: 0 rows / relation absent)
SELECT to_regclass('public.schema_migrations') IS NULL AS absent;

-- (b) Table inventory vs. migrations (which feature tables exist live)
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN (
 'tenant_websites','website_pages','website_navigation','website_blocks','website_page_drafts',
 'services','service_tiers','menu_sections','menu_items','menu_option_groups','menu_item_option_groups','menu_options',
 'orders','product_orders','ticket_orders','order_items','promo_codes','promotions',
 'reservations','business_branches','business_types',
 'agents','agent_tasks','approvals','knowledge_documents','sentinel_incidents','qa_runs');

-- (c) RLS posture of every public table (expect rls_enabled = true for all)
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
ORDER BY 1;

-- (d) Policies per key table (sanity: no table with RLS but zero policies = unreachable)
SELECT schemaname, tablename, polname, polcmd FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('orders','product_orders','menu_items','menu_option_groups','promotions','reservations','tenant_websites')
ORDER BY tablename, polname;

-- (e) Migration-182/183/184 live presence (applied / not applied)
SELECT to_regclass('public.menu_option_groups') IS NOT NULL AS m182_present,
       to_regclass('public.menu_item_option_groups') IS NOT NULL AS m182b_present,
       to_regclass('public.promotions') IS NOT NULL AS m184_present;

-- (f) Migration-175 live CHECK constraint shape (silent-remap vs guard decision hinges on it)
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.orders'::regclass AND conname='orders_status_check';

-- (g) 176 reservations / 136 services presence
SELECT to_regclass('public.reservations') IS NOT NULL AS m176_present,
       to_regclass('public.services') IS NOT NULL AS m136_present,
       to_regclass('public.service_tiers') IS NOT NULL AS m136b_present;

-- (h) Per-migration object spot check pattern (example for any migration NNN):
--      pick one object it creates and test existence, e.g.
SELECT to_regclass('public.article_audios') IS NOT NULL AS m074_present;  -- migration_74_article_audio
```
Full per-migration table (number, file, purpose, rollback?, mirrored?) is appended below (§6.6).

### 6.4 RLS gaps & API/POS-written tables (static sweep of `db/*.sql`)
- 117 distinct tables created across migrations; 113+ have an explicit `ALTER TABLE … ENABLE ROW LEVEL SECURITY`; the remaining (`seats`, `ticket_orders`, `venue_layouts`) are enabled in `db/schema.sql:1509-1518`; `comment_likes` in `migration_43:31`. **No production table was found without RLS (VERIFIED statically — live DB not queried).** Only exception: `public._migration_179_invitation_layout_backup`, a temp backup table that is additionally `REVOKE`d from all roles (`migration_179:19`).
- **POS-written tables: none** (no POS code exists, §5.11).
- **API-written tables (service-role writes from route handlers — INFERRED from handler→lib mapping):** Stripe/crypto webhooks → `product_orders`, `ticket_orders`, `donations`, `orders` (+177 `promo_codes` reads); `/api/checkout/cart*` → `product_orders`/order items via `store-cart-checkout`; `/api/orders/payment-intent` → `orders`; `app/api/exec/*` → `agent_runs`/`agent_steps`; cron `promotion-engine` → promotion usage counters; `/api/ai/gateway` → `ai_*` + `agent_memory`. All of these carry RLS with service-role bypass (VERIFIED pattern: `lib/supabase-admin.ts` used only server-side).

### 6.5 Doc-vs-code migration numbering collisions (VERIFIED — plan docs are stale)
Planned numbers already consumed by unrelated work: `128_bookings` (actual 128 = website drafts), `129_branches` (actual 129 = page drafts/publish guard), `130_api_keys` (actual 130 = website category), `131_webhooks` (actual 131 = website atomic creation), `132_pos_connectors` (actual 132 = business types/branches), `133_custom_domains` (actual 133 = moderation guard), `134_external_ai` (actual 134 = moderation events), `139_cart_and_discounts` (actual 139 = AI tool registry). Any resumption of Phases 7–14 must renumber (next free: **185**).

### 6.6 Full migration table

| # | File (`db/`) | Purpose (from name) | Rollback twin | Mirrored in `supabase/migrations/` |
|---|---|---|---|---|
| 01 | `migration_01_profiles.sql` | profiles | NO | no |
| 02 | `migration_02_organizers_additions.sql` | organizers additions | NO | no |
| 03 | `migration_03_events_additions.sql` | events additions | NO | no |
| 04 | `migration_04_fundraisers_additions.sql` | fundraisers additions | NO | no |
| 05 | `migration_05_platform_settings.sql` | platform settings | NO | no |
| 06 | `migration_06_profiles_preferences.sql` | profiles preferences | NO | no |
| 07 | `migration_07_fix_profiles_signup_trigger.sql` | fix profiles signup trigger | NO | no |
| 08 | `migration_08_homepage_hero_settings.sql` | homepage hero settings | NO | no |
| 09 | `migration_09_fundraiser_media.sql` | fundraiser media | NO | no |
| 10 | `migration_10_organizer_visibility.sql` | organizer visibility | NO | no |
| 11 | `migration_11_organizer_follows.sql` | organizer follows | NO | no |
| 12 | `migration_12_profile_account_info.sql` | profile account info | NO | no |
| 13 | `migration_13_fundraisers_organizer_ownership.sql` | fundraisers organizer ownership | NO | no |
| 14 | `migration_14_fundraiser_fixes.sql` | fundraiser fixes | NO | no |
| 15 | `migration_15_profile_privacy_settings.sql` | profile privacy settings | NO | no |
| 16 | `migration_16_homepage_cms.sql` | homepage cms | NO | no |
| 17 | `migration_17_marketplace_arch.sql` | marketplace arch | NO | no |
| 18 | `migration_18_homepage_featured.sql` | homepage featured | NO | no |
| 19 | `migration_19_landing_pages_cms.sql` | landing pages cms | NO | no |
| 20 | `migration_20_organizer_visibility_boost.sql` | organizer visibility boost | NO | no |
| 21 | `migration_21_reviews_and_ratings.sql` | reviews and ratings | NO | no |
| 22 | `migration_22_donation_receipt_paths.sql` | donation receipt paths | NO | no |
| 23 | `migration_23_platform_reviews.sql` | platform reviews | NO | no |
| 24 | `migration_24_fundraiser_category.sql` | fundraiser category | NO | no |
| 25 | `migration_25_crypto_payments.sql` | crypto payments | NO | no |
| 26 | `migration_26_category_and_media_refactor.sql` | category and media refactor | NO | no |
| 27 | `migration_27_event_structured_data_fields.sql` | event structured data fields | NO | no |
| 28 | `migration_28_articles_phase1.sql` | articles phase1 | NO | no |
| 29 | `migration_29_donations_comments_rls.sql` | donations comments rls | NO | no |
| 30 | `migration_30_public_profiles_and_donor_user_ids.sql` | public profiles and donor user ids | NO | no |
| 31 | `migration_31_backfill_profile_visibility_default.sql` | backfill profile visibility default | NO | no |
| 32 | `migration_32_donation_activity.sql` | donation activity | NO | no |
| 33 | `migration_33_backfill_donation_comment_user_ids.sql` | backfill donation comment user ids | NO | no |
| 34 | `migration_34_follows_table.sql` | follows table | NO | no |
| 35 | `migration_35_articles_fixes.sql` | articles fixes | NO | no |
| 36 | `migration_36_business_listings.sql` | business listings | NO | no |
| 37 | `migration_37_products.sql` | products | yes | no |
| 38 | `migration_38_content_approval_workflow.sql` | content approval workflow | yes | no |
| 39 | `migration_39_add_profile_deleted_at.sql` | add profile deleted at | NO | no |
| 40 | `migration_40_total_raised_fn.sql` | total raised fn | yes | no |
| 41 | `migration_41_fundraiser_approval.sql` | fundraiser approval | yes | no |
| 42 | `migration_42_import_markers.sql` | import markers | yes | no |
| 43 | `migration_43_comment_likes.sql` | comment likes | yes | no |
| 44 | `migration_44_notifications.sql` | notifications | yes | no |
| 45 | `migration_45_fix_comments_payment_intent_index.sql` | fix comments payment intent index | yes | no |
| 46 | `migration_46_eventbrite_source_columns.sql` | eventbrite source columns | yes | no |
| 47 | `migration_47_gofundme_source_columns.sql` | gofundme source columns | yes | no |
| 48 | `migration_48_organization_system.sql` | organization system | NO | no |
| 49 | `migration_49_fix_slugs.sql` | fix slugs | NO | no |
| 50 | `migration_50_beneficiary.sql` | beneficiary | yes | no |
| 51 | `migration_51_beneficiary_accounts.sql` | beneficiary accounts | yes | no |
| 52 | `migration_52_beneficiary_column_grants.sql` | beneficiary column grants | yes | no |
| 53 | `migration_53_security_hardening.sql` | security hardening | yes | no |
| 54 | `migration_54_rate_limits.sql` | rate limits | yes | no |
| 55 | `migration_55_beneficiary_claim_token_grants.sql` | beneficiary claim token grants | yes | no |
| 56 | `migration_56_beneficiary_public_profile.sql` | beneficiary public profile | yes | no |
| 57 | `migration_57_pending_deletion_status.sql` | pending deletion status | yes | no |
| 58 | `migration_58_business_entity_link.sql` | business entity link | yes | no |
| 59 | `migration_59_entity_members.sql` | entity members | yes | no |
| 60 | `migration_60_identity_verification.sql` | identity verification | yes | no |
| 61 | `migration_61_organizer_capability_tiers.sql` | organizer capability tiers | yes | no |
| 62 | `migration_62_entity_permissions.sql` | entity permissions | yes | no |
| 63 | `migration_63_articles_entity_permissions.sql` | articles entity permissions | yes | no |
| 64 | `migration_64_fundraising_approval_gate.sql` | fundraising approval gate | yes | no |
| 65 | `migration_65_events_insert_ownership_gate.sql` | events insert ownership gate | yes | no |
| 67 | `migration_67_backfill_orphaned_organizer_ids.sql` | backfill orphaned organizer ids | yes | no |
| 68 | `migration_68_relax_fundraising_approval_requirement.sql` | relax fundraising approval requirement | yes | no |
| 69 | `migration_69_payment_reconciliation_failures.sql` | payment reconciliation failures | yes | no |
| 70 | `migration_70_recipients.sql` | recipients | yes | no |
| 71 | `migration_71_recipient_ledger_entries.sql` | recipient ledger entries | yes | no |
| 72 | `migration_72_ledger_credit_rpcs.sql` | ledger credit rpcs | yes | no |
| 73 | `migration_73_payouts_and_balance_rpcs.sql` | payouts and balance rpcs | NO | no |
| 74 | `migration_74_article_audio.sql` | article audio | NO | no |
| 75 | `migration_75_check_in_ticket_rpc.sql` | check in ticket rpc | yes | yes |
| 76 | `migration_76_event_team_and_invitations.sql` | event team and invitations | yes | yes |
| 77 | `migration_77_ticket_checkins_audit.sql` | ticket checkins audit | yes | yes |
| 78 | `migration_78_fix_check_in_ticket_overload.sql` | fix check in ticket overload | yes | yes |
| 79 | `migration_79_ticket_instances.sql` | ticket instances | yes | yes |
| 79b | `migration_79b_ticket_checkins_unique_idx.sql` | ticket checkins unique idx | yes | yes |
| 79c | `migration_79c_fix_checkins_constraint.sql` | fix checkins constraint | yes | yes |
| 79d | `migration_79d_fix_check_in_ticket_rpc.sql` | fix check in ticket rpc | yes | yes |
| 80 | `migration_80_multi_ticket_instances.sql` | multi ticket instances | yes | yes |
| 80b | `migration_80b_multi_ticket_instances.sql` | multi ticket instances | yes | yes |
| 80c | `migration_80c_multi_tier_instances.sql` | multi tier instances | yes | yes |
| 80d | `migration_80d_drop_overloaded_rpc.sql` | drop overloaded rpc | yes | yes |
| 80e | `migration_80e_checkins_order_id_index.sql` | checkins order id index | yes | yes |
| 82 | `migration_82_organizer_verification_storage.sql` | organizer verification storage | yes | yes |
| 83 | `migration_83_organizer_verification_submissions.sql` | organizer verification submissions | yes | yes |
| 84 | `migration_84_organizer_status_audit.sql` | organizer status audit | yes | yes |
| 85 | `migration_85_fix_organizer_verification_storage_rls.sql` | fix organizer verification storage rls | yes | yes |
| 86 | `migration_86_storage_bucket_limits.sql` | storage bucket limits | yes | yes |
| 87 | `migration_87_user_identity_verifications.sql` | user identity verifications | yes | yes |
| 88 | `migration_88_aldriva_ai.sql` | aldriva ai | NO | no |
| 89 | `migration_89_ai_guard_rejections.sql` | ai guard rejections | NO | no |
| 90 | `migration_90_ai_content_calendar.sql` | ai content calendar | yes | no |
| 91 | `migration_91_alter_ai_conversations_provider_default.sql` | alter ai conversations provider default | yes | no |
| 92 | `migration_92_event_invitations_and_ticket_instances.sql` | event invitations and ticket instances | yes | no |
| 93 | `migration_93_extended_seating.sql` | extended seating | yes | no |
| 94 | `migration_94_platform_content_type.sql` | platform content type | yes | no |
| 95 | `migration_95_aldriva_platform_knowledge.sql` | aldriva platform knowledge | yes | no |
| 96 | `migration_96_ticket_insert_ownership_gate.sql` | ticket insert ownership gate | yes | no |
| 97 | `migration_97_follows_read_restriction.sql` | follows read restriction | yes | no |
| 98 | `migration_98_svg_seating_engine.sql` | svg seating engine | yes | no |
| 99 | `migration_99_guest_import_and_lifecycle.sql` | guest import and lifecycle | yes | no |
| 100 | `migration_100_event_operations_and_audit.sql` | event operations and audit | yes | no |
| 101 | `migration_101_p0_rls_enforcement.sql` | p0 rls enforcement | yes | yes |
| 102 | `migration_102_event_banner_uploads.sql` | event banner uploads | yes | yes |
| 103 | `migration_103_organizer_grant_least_privilege.sql` | organizer grant least privilege | yes | yes |
| 104 | `migration_104_signup_guard_function_hardening.sql` | signup guard function hardening | yes | yes |
| 105 | `migration_105_trigger_service_role_gate.sql` | trigger service role gate | yes | yes |
| 106 | `migration_106_storage_bucket_upload_posture.sql` | storage bucket upload posture | yes | yes |
| 107 | `migration_107_handle_new_user_revoke_public_execute.sql` | handle new user revoke public execute | yes | yes |
| 108 | `migration_108_connected_accounts.sql` | connected accounts | yes | no |
| 109 | `migration_109_channel_assets.sql` | channel assets | yes | no |
| 110 | `migration_110_customer_identities.sql` | customer identities | yes | no |
| 111 | `migration_111_conversations_messages.sql` | conversations messages | yes | no |
| 112 | `migration_112_ai_provider_configs.sql` | ai provider configs | yes | no |
| 113 | `migration_113_ai_tool_invocations.sql` | ai tool invocations | yes | no |
| 114 | `migration_114_notification_preferences.sql` | notification preferences | yes | no |
| 115 | `migration_115_conversation_link_integrity.sql` | conversation link integrity | yes | no |
| 116 | `migration_116_shop_digital_products.sql` | shop digital products | yes | yes |
| 117 | `migration_117_cms_media_storage.sql` | cms media storage | yes | yes |
| 118 | `migration_118_multi_seat_instances.sql` | multi seat instances | yes | yes |
| 119 | `migration_119_event_ticket_template.sql` | event ticket template | yes | yes |
| 120 | `migration_120_invitation_templates.sql` | invitation templates | yes | yes |
| 121 | `migration_121_update_invitation_artwork.sql` | update invitation artwork | yes | yes |
| 122 | `migration_122_offline_scanner_support.sql` | offline scanner support | yes | yes |
| 124 | `migration_124_offline_sync_and_conflicts.sql` | offline sync and conflicts | yes | yes |
| 125 | `migration_125_tenant_websites.sql` | tenant websites | yes | no |
| 126 | `migration_126_website_delete_rls_fix.sql` | website delete rls fix | yes | no |
| 127 | `migration_127_ensure_business_organizer_security_definer.sql` | ensure business organizer security definer | yes | yes |
| 128 | `migration_128_website_draft_blocks_and_dec0016_status.sql` | website draft blocks and dec0016 status | yes | no |
| 129 | `migration_129_website_page_drafts_and_publishing_guard.sql` | website page drafts and publishing guard | yes | no |
| 130 | `migration_130_website_category_and_metadata.sql` | website category and metadata | yes | yes |
| 131 | `migration_131_website_atomic_creation.sql` | website atomic creation | yes | yes |
| 132 | `migration_132_business_type_and_branches.sql` | business type and branches | yes | yes |
| 133 | `migration_133_add_event_subcategory.sql` | add event subcategory | yes | yes |
| 134 | `migration_134_homepage_promotions.sql` | homepage promotions | yes | yes |
| 135 | `migration_135_profile_locale.sql` | profile locale | yes | yes |
| 136 | `migration_136_services_and_menus.sql` | services and menus | yes | yes |
| 137 | `migration_137_business_moderation_guard_and_screening.sql` | business moderation guard and screening | yes | yes |
| 138 | `migration_138_business_moderation_resubmit_and_organizer_guard.sql` | business moderation resubmit and organizer guard | yes | yes |
| 139 | `migration_139_tool_registry.sql` | tool registry | yes | yes |
| 140 | `migration_140_agent_registry.sql` | agent registry | yes | yes |
| 141 | `migration_141_knowledge_foundation.sql` | knowledge foundation | yes | yes |
| 142 | `migration_142_agent_runtime.sql` | agent runtime | yes | yes |
| 143 | `migration_143_sentinel_events.sql` | sentinel events | yes | yes |
| 144 | `migration_144_sentinel_events_fixes.sql` | sentinel events fixes | yes | yes |
| 145 | `migration_145_qa_execution.sql` | qa execution | yes | yes |
| 146 | `migration_146_background_execution.sql` | background execution | yes | yes |
| 147 | `migration_147_exec_smoke_notify.sql` | exec smoke notify | yes | yes |
| 148 | `migration_148_approval_gated_call_text.sql` | approval gated call text | yes | yes |
| 149 | `migration_149_agent_memory.sql` | agent memory | yes | yes |
| 150 | `migration_150_memory_hardening.sql` | memory hardening | yes | yes |
| 151 | `migration_151_workforce_rls_narrowing.sql` | workforce rls narrowing | yes | yes |
| 152 | `migration_152_studio_chat_persistence.sql` | studio chat persistence | yes | yes |
| 153 | `migration_153_workforce_grant_hardening.sql` | workforce grant hardening | yes | yes |
| 154 | `migration_154_invitation_pages.sql` | invitation pages | yes | yes |
| 155 | `migration_155_event_kind.sql` | event kind | yes | yes |
| 156 | `migration_156_invitation_share_link.sql` | invitation share link | yes | yes |
| 157 | `migration_157_public_media_r2.sql` | public media r2 | yes | yes |
| 158 | `migration_158_media_buckets_setup.sql` | media buckets setup | yes | yes |
| 159 | `migration_159_product_asset_storage_provider.sql` | product asset storage provider | yes | yes |
| 160 | `migration_160_public_media_quota_and_targets.sql` | public media quota and targets | yes | yes |
| 161 | `migration_161_configurable_public_media_quota.sql` | configurable public media quota | yes | yes |
| 162 | `migration_162_event_memories.sql` | event memories | yes | yes |
| 163 | `migration_163_unified_template_rpc.sql` | unified template rpc | yes | yes |
| 164 | `migration_164_event_staff_labels_badges.sql` | event staff labels badges | yes | yes |
| 165 | `migration_165_event_staff_badge_hardening.sql` | event staff badge hardening | yes | yes |
| 166 | `migration_166_invite_token_hash.sql` | invite token hash | yes | yes |
| 167 | `migration_167_invitation_music_links.sql` | invitation music links | yes | yes |
| 168 | `migration_168_website_content_store.sql` | website content store | yes | yes |
| 169 | `migration_169_business_offerings.sql` | business offerings | yes | yes |
| 170 | `migration_170_menu_ordering_data.sql` | menu ordering data | yes | yes |
| 171 | `migration_171_orders.sql` | orders | yes | yes |
| 172 | `migration_172_notification_checks_widen.sql` | notification checks widen | yes | yes |
| 173 | `migration_173_order_online_payment.sql` | order online payment | yes | yes |
| 174 | `migration_174_order_timing.sql` | order timing | yes | yes |
| 175 | `migration_175_owner_managed_delivery.sql` | owner managed delivery | yes | yes |
| 176 | `migration_176_reservations.sql` | reservations | yes | yes |
| 177 | `migration_177_store_promo_codes.sql` | store promo codes | yes | yes |
| 178 | `migration_178_universal_page_blocks.sql` | universal page blocks | yes | yes |
| 179 | `migration_179_romantic_envelope_presets.sql` | romantic envelope presets | yes | yes |
| 180 | `migration_180_botanical_reverie.sql` | botanical reverie | yes | yes |
| 181 | `migration_181_luxe_editorial_invitation_card.sql` | luxe editorial invitation card | yes | yes |
| 182 | `migration_182_menu_option_groups.sql` | menu option groups | NO | yes |
| 183 | `migration_183_menu_option_assignment_cleanup.sql` | menu option assignment cleanup | yes | yes |
| 184 | `migration_184_menu_promotions.sql` | menu promotions | yes | yes |

---

## 7. Quality & Security

### 7.1 Quality gates (run 2026-10-20 on the dirty working tree)
| Gate | Result | Evidence |
|---|---|---|
| `npm run test:chunked` | **FAIL (exit 1)** — **2,531 pass / 1 fail** (chunks 1–6: 2,216 pass; chunk 7 aborted) | `work/status-review-test-chunked.log` |
| `npx tsc --noEmit --pretty false` | **PASS** — 0 errors | `work/status-review-tsc.log` |
| `npm run lint` (full repo) | 307 problems = **8 errors + 299 warnings**; all 8 errors pre-existing in untouched files (`app/dashboard/DashboardView.tsx` ×6, `app/m/[token]/page.tsx:54`, `e2e/fixtures.ts:46`) — matches documented baseline (`phase-3-report.md:82`) | `work/status-review-lint.log` |
| `git diff --check` | **PASS** (exit 0) | shell |
| `npm run build` | **PASS** — "Compiled successfully in 38.3s", 367/367 static pages, exit 0 | `work/status-review-build.log` |

**The single failing test (REAL, not flaky):** `Phase 6 migration: forward, rollback twin, and supabase mirror exist with the right constraint` (`lib/__tests__/phase6-owner-managed-delivery.test.cjs:950`, assertion `:970` "rollback maps delivered -> completed").
**Root cause (VERIFIED):** the **uncommitted** migration-175 edits (§3.4) replace the rollback's silent status remap (`delivered→completed`, `out_for_delivery→ready`) with a hard guard (`MIGRATION_175_ROLLBACK_BLOCKED` abort). The test still asserts the old strategy. Doc baselines (2,526/2,526; 2,530) were measured on committed state — this tree is red. **Owner decision needed:** adopt the guard (then update the test) or discard the uncommitted edits. Note `r2-media-amendment` flakiness did not recur in this run.

### 7.2 Security review (static, read-only)
- **Secrets:** `.env*` is gitignored (`gitignore:39`); only `.env.example` tracked. **No real secrets found**: `sk_live_` occurrences are redaction-pattern code (`lib/ai/tools/workforce/memory-propose.ts:51`) and test fixtures (`memory.test.cjs:483,526,531`, `studio-chat-persistence.test.cjs:179`); the only Stripe-shaped key is `sk_test_placeholder` in `next.config.ts`; JWT-shaped strings appear only in docs/test fixtures.
- **Rate limiting:** `enforceRateLimit` on 45/172 routes — payments, crypto, checkout, AI gateway, cron, exec covered. Residual surface: unauthenticated read routes without explicit limits (e.g., parts of `products/order-lookup`, ticket lookup/verify) — INFERRED risk, not exploited in this review.
- **Unbounded queries:** the 2026-10-19 audit's finding stands — `resolveMenuEmbed` still fetches menu items with no `LIMIT` (`lib/website-embeds.ts:352-371`); remediation is the current workstream's backlog.
- **RLS:** static sweep clean (§6.4). Live policy verification impossible read-only — use queries §6.3(c)(d).
- **Guardrails in force:** server-only boundaries milestone COMPLETE; AI output guard + `SAFE_COLUMNS` allowlists (ADR-0002); `GUARDRAILS-NO-AUTONOMOUS-PRODUCTION-ACTIONS.md` (2026-10-03).

### 7.3 Known TODOs in code (exhaustive grep: 3)
`BlockRenderer.tsx:2082` (services multi-currency hardcoded USD) · `app/api/checkout/product-crypto/route.ts:135` (crypto-pending status gap) · `app/api/donate/route.ts:15` (delete-file marker). No feature-flag framework exists.

---

## 8. Stale-Document Register (doc-vs-code mismatches found)

| # | Doc claim | Reality (evidence) | Severity |
|---|---|---|---|
| 1 | `AGENTS.md`: "Latest migration: `migration_126`" | 184 is latest (`ls db`) | High (agent onboarding) |
| 2 | `DATABASE.md:4`: "Migrations 1 to 138" | 188 forwards through 184 | High |
| 3 | `ROADMAP.md:67`: Phase 6 "PLANNED" | Cart/promos/delivery built; `phase-06-commerce.md:40` says PARTIAL | Medium |
| 4 | `ROADMAP.md:68` / `phase-07:34`: Phase 7 "PLANNED" | Reservation engine built (migration 176, pages, tests) | Medium |
| 5 | `CURRENT-STATE.md:8`: migration-184 SHA `8033C841…` | Now `30fb2d16…` (hardened in `7c8cbf4`, `3fd162c`) | Medium (integrity check) |
| 6 | `docs/phase-2-report.md`: migration-182 rollback exists | `db/migration_182*` forward only (no `_rollback` twin) | High |
| 7 | Phase docs 7–14: planned migration numbers 128–139 | All consumed by unrelated migrations (§6.5) | Medium (future collisions) |
| 8 | `API.md`: endpoint catalog | Missing cart/validate, payment-intent, AI gateway, cron routes | Low |
| 9 | `phase-13`: WhatsApp/IG auto-responder as headline scope | Not built; AI OS built instead | Medium |
| 10 | `image-upload.md` (2026-07-31) | Superseded by R2 media milestone | Low |

---

## 9. Bottom Line

1. **The platform's shipped core** (Phases 0–4 complete, 5–6 partial, events/fundraising/products/articles/orgs complete) is real and well-tested: **2,531/2,532 tests pass even on the dirty tree; tsc/lint-delta/build clean.**
2. **The POS and the public `/v1` API do not exist** — only the internal cookie/session API (172 handlers, 45 rate-limited, unversioned, partially documented). Any brief assuming them is wrong about this repository.
3. **The menu options + promotions workstream is the newest, machine-only work** (4 stacked branches, 175 commits, migrations 182–184; 184 unapplied). It has **no remote backup**, one missing rollback (182), and a stale SHA claim in CURRENT-STATE.
4. **The only red gate is caused by uncommitted migration-175 edits** that redesigned the rollback strategy without updating its test — an owner decision, not a code defect in committed work.
5. **Documentation drift is concentrated in numbering and status claims** (§8) — the living docs (CURRENT-STATE/CHANGELOG/DECISIONS + phase 4/5/6 docs) are current; the September reference layer needs a refresh pass.

*No changes were made to the repository beyond this report, `docs/project-document-index.md`, `docs/project-status-progress.md`, and logs in gitignored `work/`.*
