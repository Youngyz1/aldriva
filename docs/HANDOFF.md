# Aldriva — Agent Handoff (START HERE)

> **Read this file first, then `AGENTS.md`.** Originally written 2026-10-20; Phase 2 checkpoint addendum added 2026-10-21.
> Every fact below is labelled **VERIFIED** (read in code/git), **INFERRED**, or **NOT FOUND** (searched, absent). Anything uncertain is under **Owner to confirm**.

---

## 1. What Aldriva is (10 lines)

1. Aldriva is a multi-tenant business & community platform: businesses get mini-websites, organizers run events with tickets and QR check-in, creators raise funds, everyone sells products.
2. One canonical tenant model: everything hangs off `organizers.id`; membership and roles live in `entity_members` (owner/admin/manager/editor/finance/viewer). (VERIFIED — `lib/auth.ts`, `lib/entity-auth.ts`, RLS functions in `db/`.)
3. Businesses (restaurants, shops, services) get public sites at `/site/[slug]` rendered from a block/template system. (VERIFIED — `app/site/[slug]/`, `lib/website-template-resolver.ts`.)
4. Restaurants have digital menus with option groups (size, extras…), online ordering, promotions, and a Store for physical products. (VERIFIED — `db/migration_136`, `182`–`184`, `lib/menu-pricing.ts`, `lib/order-submit.ts`.)
5. Payments: Stripe (cards) and NOWPayments (crypto), both webhook-driven; order status is authoritative server-side, never trusted from the client. (VERIFIED — `app/api/webhooks/stripe`, `lib/order-submit.ts`, ADR in `docs/adr/0001`.)
6. Events: ticket tiers, seat maps, offline QR check-in scanner, invitations with template engine. (VERIFIED — `app/api/seats`, `app/api/verify-ticket`, `docs/technical/events/*`.)
7. Fundraising: fundraisers with beneficiary ledgers, donations, payouts. Articles: TipTap CMS with AI assist. (VERIFIED — `app/fundraisers`, `app/articles`, `lib/ai`.)
8. An AI operating system (agents, sentinel monitoring, QA workforce, background execution, memory, studio chat) is built and admin-only. (VERIFIED — `lib/ai`, `lib/workforce`, `lib/exec`, `db/migration_139`–`168`.)
9. **Stack (VERIFIED — `package.json`, `README.md:12-20`):** Next.js **16.3.4** App Router + Turbopack, React **19.2.4**, Tailwind **v4**, Supabase (Postgres 15 + Auth + Storage), Stripe + NOWPayments, Resend email, TipTap, next-intl, Framer Motion, Cloudflare R2 (partial).
10. **The root `proxy.ts` is NOT `middleware.ts`** — it does session refresh, auth redirects and pre-stream 404s. Next 16 here differs from your training data; read `node_modules/next/dist/docs/` before touching routing/caching. (VERIFIED — `CLAUDE.md`, `proxy.ts`.)

---

## 2. Rules every agent must follow

- **Read `AGENTS.md`** for the full rule set (evidence labels, testing order, design system, migrations). (VERIFIED — exists at repo root.)
- **No database operations, no migration application, ever, without explicit owner approval.** Migrations are applied by hand on staging by the owner. There is **no `schema_migrations` table**, so "which migrations are live" cannot be queried — see `docs/DATABASE.md` for the staging-verified list. (VERIFIED — task history + `docs/DATABASE.md`.)
- **`db/` is canonical**; `supabase/migrations/` mirrors only some migrations. Before writing a migration, see the **Migration number register** in §6 — collisions have already burned the phase docs once. (VERIFIED — `docs/DATABASE.md`, §6.)
- **Label every claim** VERIFIED / INFERRED / NOT FOUND with file paths, commit hashes or test names. If you can't establish a fact, write "Owner to confirm" — never guess. (VERIFIED — this is how the 2026-10-20 audit and this file were written.)
- **Staging vs production:** staging is the only environment agents have ever touched (with approval). Production exists for `aldriva.com`; never act on it autonomously (`docs/GUARDRAILS-NO-AUTONOMOUS-PRODUCTION-ACTIONS.md`). (VERIFIED — exists, 2026-10-03.)
- **Tests:** `npm test` runs `scripts/run-tests-chunked.cjs` against explicit `test-files.json` (200 files at this checkpoint). The runner batches direct Node child-process calls to stay below Windows command-line limits. Add every new test file to `test-files.json`. (VERIFIED — `package.json`, `test-files.json`, `scripts/run-tests-chunked.cjs`.)
- **Run order after changes:** `npx eslint <files>` → `npx tsc --noEmit` → `npm test` → `npm run build`. Last full green on committed code: build PASS, tsc 0 errors, 8 pre-existing lint errors in untouched files. (VERIFIED — 2026-10-20 audit, `work/status-review-*.log`.)

---

## 3. THE STATUS BOARD (verified 2026-10-20)

| # | Phase / workstream | Status | One-line summary | Doc |
|---|---|---|---|---|
| 0 | Codebase & docs audit | **DONE** | Repo made single source of truth; all canonical docs authored | `docs/phases/phase-00-audit.md` |
| 1 | Business website foundation | **DONE** | `tenant_websites` schema + RLS + dashboard settings (migrations 125–127) | `docs/phases/phase-01-website-foundation.md` |
| 2 | Public website engine | **DONE** | `/site/[slug]` renderer + preview mode + proxy 404 gating | `docs/phases/phase-02-website-engine.md` |
| 3 | Website design system | **DONE** | 18 block types, embeds, 3 templates, dark mode | `docs/phases/phase-03-design-system.md` |
| 4 | Website builder/editor | **DONE** | Draft/publish with RPC guard, block inspectors | `docs/phases/phase-04-website-builder.md` |
| 5 | Products, services & menus | **PARTIAL** | Menus+services built; menu **options & promotions** workstream implemented on a branch (migrations 182–183 applied staging, 184 approved **not applied**); USD-hardcoded services | `docs/phases/phase-05-products-services.md` |
| — | **Kitchen & delivery** (named workstream under Phase 6) | **PARTIAL** | Owner reports migrations 185/186 applied on staging; Part 1 and Stage B courier server, management, and owner picker work are implemented on `feat/phase-2-couriers`; Stage C courier dashboard remains | `docs/phases/phase-kitchen-delivery.md` |
| 6 | Unified commerce | **PARTIAL** | Store cart, promo codes (177), orders (171), payments (173/174), owner-managed delivery (175); missing tax, fulfillment dashboard, multi-item crypto cart | `docs/phases/phase-06-commerce.md` |
| 7 | Bookings & reservations | **PARTIAL** | Reservation request engine built (176) but **hidden from nav**; no slots/scheduling/SMS/ics | `docs/phases/phase-07-bookings.md` |
| 8 | Business management ERP | **PARTIAL** | Branches only (132); no shifts/rosters/inventory/cross-branch reports | `docs/phases/phase-08-business-management.md` |
| 9 | Public developer API | **NOT STARTED** | No `/v1`, no API keys (NOT FOUND); only the internal session-cookie API (172 routes, unversioned) | `docs/phases/phase-09-public-api.md` |
| 10 | Outbound webhooks | **NOT STARTED** | No subscription tables or dispatch (NOT FOUND) | `docs/phases/phase-10-webhooks.md` |
| 11 | POS integration | **NOT STARTED** | No POS code anywhere (NOT FOUND) | `docs/phases/phase-11-pos.md` |
| 12 | Custom domains & SSL | **NOT STARTED** | `proxy.ts` has no host routing (VERIFIED — grep empty) | `docs/phases/phase-12-advanced-web.md` |
| 13 | Aldriva AI | **PARTIAL** | AI OS built (agents/sentinel/QA/exec/memory/studio, migrations 139–168, admin-only); WhatsApp/IG auto-responder and tenant AI assistant NOT built | `docs/phases/phase-13-aldriva-ai.md` |
| 14 | External AI ecosystem | **NOT STARTED** | Nothing found (NOT FOUND) | `docs/phases/phase-14-external-ai.md` |
| — | **Table & Menu QR Codes** *(planned, under Phases 5–6)* | **PLANNED (not started)** | Owner-decided feature: menu QR per business + per-table QR with secret tokens, dine-in/pickup/delivery order types, table sessions + mandatory staff confirmation, running table bill; split bills deferred. Nothing exists today (VERIFIED — see doc) | `docs/phases/phase-table-menu-qr-codes.md` |
| ∥ | Events / Fundraising / Products / Articles / Organizations | **DONE** | Pre-phase domains, complete with tests (VERIFIED — routes + registered suites) | `docs/technical/events/*`, `docs/events/*` … |
| ∥ | R2 media storage | **PARTIAL** | Driver + quota built; rollout incomplete | `docs/phases/phase-r2-media-storage.md` |
| ∥ | Server-only boundaries | **DONE** | Server-only markers + bundle scan tests | `docs/phases/phase-server-only-boundaries.md` |

Full evidence for each row: `docs/project-status.md` (2026-10-20 audit) and the phase docs above.

---

## 4. EXECUTION ORDER

Do these in order; details in `docs/ROADMAP.md` (Execution Order table).

| Track | What | Why |
|---|---|---|
| **A** | **Finish & verify in-flight work** — (1) menu options & promotions: apply migration **184** on staging, run `db/tests/migration_184_checks.sql`, visual QA; (2) kitchen & delivery: implement the approved Stage B server work after the completed Part 1 fixes | Owner reports migration 185 applied and migration 186 applied and verified; no DB tools were used here |
| **B** | Finish Phase 6 gaps (tax, fulfillment dashboard, crypto carts) → Phase 7 gaps (un-hide nav, add slots) → Phase 8 (shifts/inventory) | Core commerce completeness before breadth |
| **C** | Phase 9 Public API → Phase 10 Webhooks → Phase 11 POS | Strict dependency chain (10 needs 9; 11 needs 9+10) |
| **D** | Phase 12 Custom Domains | Independent; can parallel B/C |
| **E** | Phase 13 completion (WhatsApp/IG auto-responder, tenant assistant) → Phase 14 | 14 depends on 9+10 |

---

## 5. Continue here

- **If you are resuming the menu options & promotions work:** branch `feat/menu-promotions-phase-4` (tip `16265fb`). Next task: **apply migration 184 on staging (owner runs it), execute `db/tests/migration_184_checks.sql`, then 375px visual QA and production data inventory** — these three verifications are the only open items (VERIFIED — `docs/phase-4-report.md`, `docs/CURRENT-STATE.md`).
- **If you are resuming kitchen & delivery:** Phase 1 is on `feat/phase-0-1-kitchen-worker-access`; courier Stage A, Part 1 fixes, and Stage B server/owner-management work are on `feat/phase-2-couriers` from that base. The owner reports migration 186 applied and verified; no database tools were used here. Next is Stage C courier dashboard and visual/integration QA. See `docs/phases/phase-kitchen-delivery.md`.
- **If you are starting new phase work:** start from `main` + whatever in-flight branch it depends on; check the Migration number register (§6) before writing any SQL.

---

## 6. Migration number reservations

**Rule (VERIFIED practice, now mandatory):** before writing a migration, run `ls db/ supabase/migrations/` **in this worktree and `git ls-tree` on every branch/worktree** (`git worktree list`), take the next free number, and add a row here and in `docs/DATABASE.md`. The old planned numbers 128–139 in the phase docs are **consumed by unrelated migrations** — never use them. (VERIFIED — actual `db/migration_130_website_category…` vs planned `130_api_keys`, etc.)

| Number | Owner (workstream) | Status | Branch |
|---|---|---|---|
| 182 | Menu options — reusable option groups | **Applied on staging**; forward only — **NO rollback twin** (VERIFIED — `ls db/migration_182*`) | `feat/menu-options-phase-0-1` |
| 183 | Menu options — assignment cleanup | **Applied on staging**; rollback exists | `feat/menu-options-phase-2` |
| 184 | Menu promotions | Authored + owner-approved; **NOT applied**; rollback + `db/tests/migration_184_checks.sql` exist; SHA-256 `30fb2d16…5482` (both copies identical, VERIFIED 2026-10-20) | `feat/menu-promotions-phase-4` |
| 185 | Kitchen & delivery — worker access | **Applied on staging per owner report**; not independently queried; rollback + staging-only cleanup exist | `feat/phase-0-1-kitchen-worker-access` |
| 186 | Kitchen & delivery — couriers | **Applied and verified on staging per owner report**; rollback + staging cleanup + pre/post-checks + two-tab claim-race SQL exist | `feat/phase-2-couriers` |
| 187+ | unassigned | free as of 2026-10-21 | — |
| **next** | **Table & Menu QR Codes** (planned) | **Number assigned at build time from this register**; before writing, read migration 185 (kitchen/delivery) to learn whether a dine-in type, table fields or confirmation states already exist | unassigned — see `docs/phases/phase-table-menu-qr-codes.md` |

---

## 7. Open decisions — Owner to confirm

1. **Migration 185 staging status** is owner-reported applied; this agent did not query the database (per policy).
2. **Uncommitted migration-175 edits** (3 files): forward made idempotent (named CHECK constraints via guarded `DO` blocks), rollback changed from silent status remap to a hard `MIGRATION_175_ROLLBACK_BLOCKED` abort; the paired test was updated and now passes 38/38 (VERIFIED — `git diff db/migration_175*`, test run 2026-10-20). Adopt or discard?
3. **Untracked `db/migration_175_rollback.sql`** — appears to duplicate the redesigned rollback. Intentional? (VERIFIED — file exists; purpose INFERRED.)
4. **Apply 184 on staging** (approved, not yet run); migration 185 is owner-reported applied.
5. **Migration 182 has no rollback twin** — author one, or accept permanent forward-only? (VERIFIED missing.)
6. **Backup risk** — the entire menu workstream (4 branches), kitchen work, 5 stashes and all checkpoints exist **only on this machine** (VERIFIED — no remote counterparts). Push somewhere.
7. **Reservations (Phase 7) navigation** — un-hide now, or only after slots exist? (VERIFIED hidden: no nav entry, route live.)
8. **`PrivacySafeGoogleAnalytics` + layout edits** (uncommitted, unrelated to kitchen — INFERRED): keep, or split out? (VERIFIED files modified.)
9. **Table & Menu QR Codes (planned)** — three decisions recorded in `docs/phases/phase-table-menu-qr-codes.md` §9: (a) does the staff **confirmation screen** belong on the existing owner dashboard or the lightweight kitchen/driver dashboard? (b) how does a **table session expire**? (c) what happens to **unpaid sessions at closing**? None of this is built. (PLANNED — feature spec, not code.)

---

## 8. Verification still pending (do not treat as done)

- Migration **184**: order snapshot fields (`group_name`, `group_kind`, `qty`, promotion) **not confirmed in a running app**; 375px visual QA not done; production data inventory not done. (VERIFIED as unverified — `docs/phase-4-report.md` "Owner Checkpoint E" list.)
- Migrations **185 and 186**: applied on staging per owner report; no database query was made in this task. Application flows remain unverified against a live database.
- Staging application status of all other migrations except 134, 136, 170, 171, 177, 181, 182, 183 is **UNKNOWN** (no `schema_migrations` table; SELECT checks in `docs/DATABASE.md`). (VERIFIED — 2026-10-20 audit; 185/186 status is owner-reported.)
- Kitchen display page and kitchen order state flow are **NOT built**. Courier management, invitation, availability, owner picker, and Stage B server routes are implemented; the standalone courier dashboard remains Stage C. See `docs/phases/phase-kitchen-delivery.md`.

---

## 9. Branch map — what exists only on this machine

**VERIFIED 2026-10-20** (`git branch -vv`, `git worktree list`, `git log --all`). Remote `origin` = `github.com/Youngyz1/aldriva`; `origin/main` == local `main` == `a2f0c5e` (2026-10-05).

| Branch / worktree | Tip | Remote? |
|---|---|---|
| `feat/menu-promotions-phase-4` (was checked out here; **current menu work**) | `16265fb` | **NO — machine only** |
| `feat/menu-options-phase-0-1` / `-phase-2` / `-phase-3` | `c160202` / `15bb0d9` / `251f523` | **NO** |
| **`docs/handoff-roadmap`** (this docs branch) | created 2026-10-20 from `16265fb` | **NO** |
| `feat/phase-0-1-kitchen-worker-access` | Phase 1 cook access base | **NO** |
| `feat/phase-2-couriers` | Stage A migration 186 (owner-reported applied) + Part 1 + Stage B implemented in working tree; Stage C pending | **NO** |
| `business-sites-checkpoint`, `full-recovery`, `integration/full-recovery`, `wip/phase7-checkpoint`, `wip/admin-baseline` | 2026-08 → 10 | **NO** |
| 5 stashes (`stash@{0..4}`) | — | **NO** |
| Other worktrees: `aldriva-head` (staff/invites), `aldriva-seating-test` (`feat/seat-picker-3d`), `fundraising-app` (invitations), `fundraising-app-entity-architecture`, `.codex/worktrees/r2-media-clean-head` | — | mixed |

⚠️ **Backup warning:** these branches have no remote counterpart. Preserve the menu stack and courier branch before any cleanup.

---

## 10. Phase 2 courier checkpoint (2026-10-21)

- **VERIFIED — working tree:** repository `C:\Users\Youngyz\aldriva-staging`; branch `feat/phase-2-couriers`; HEAD/base `e3ed3ad92e569e3ed7284a32d96bb250a31cdb20`, from `feat/phase-0-1-kitchen-worker-access`. Existing unrelated changes and untracked files were preserved.
- **Owner-reported:** migrations 185 and 186 are applied on staging; migration 186 was verified by the owner. No database or MCP tools were used here. Migration 186 and its SQL check/race artifacts were not edited in Stage B; the authored SQL scripts remain for owner-run staging.
- **Part 1:** worker reactivation rotates a hashed invitation for 14 days, revokes old sessions, returns the plaintext link once, keeps reactivated couriers offline, disables the pending UI action, and blocks a second rotation for five seconds with a friendly message. Cook accept checks `out_role`, valid sessions redirect with `location.replace('/kitchen')`, and cook acceptance retains role isolation.
- **Stage B — session and route security:** cook and courier cookies are distinct. Session validation takes an expected role, denies role mismatches, and permits null kitchen scope only for couriers. Kitchen session/order/logout routes and the cook transition require `role='cook'`; courier endpoints require `role='courier'` and scope each read/write by the session worker and business. Courier JSON has `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; analytics excludes courier paths.
- **Stage B — endpoints:** bootstrap/accept, session/logout, orders feed, availability, offer accept/decline, and assigned-order delivery completion exist under `app/api/courier/`. Bootstrap and accept limiters fail closed by IP plus invitation hash; the orders feed limiter is fail-closed at 60 requests per 10 minutes keyed by the session hash. Offers expose pickup/delivery addresses, items, and amount to collect. Customer name/phone are exposed only for the winning courier's active assigned order. Taken/declined rows return metadata only.
- **Stage B — owner flows:** `lib/actions/courier-management.ts` supports create, invite, resend, revoke, deactivate, reactivate, list, and availability with owner/admin/manager authorization plus organizer/business scope checks. The existing kitchen owner page has courier management. The Out for delivery picker allows an offline courier with a warning, disables On delivery couriers, handles unique-index conflicts, and retains typed rider fallback. Owner order cards show courier declines/messages and cash confirmer/time; the waiting-for-courier overdue state is connected to offer data.
- **Stage B — transitions:** courier claims use migration 186's atomic RPC, then call the shared transition core's post-persist email/revalidation effects without a second order status update. Assigned courier completion reuses the core; explicit cash confirmation for unpaid pay-on-fulfilment orders records worker and timestamp and sets payment paid. Risk: a false confirmation records cash as collected. Unpaid online orders cannot use the override.
- **Verification:** `npm test` passed **2,590/2,590 tests across 200 files** (0 failures, 0 skipped), +23 tests and +1 file over the 2,567/199 baseline. `npx tsc --noEmit --pretty false`, targeted changed-file ESLint, `npm run build`, and `git diff --check` passed. Mocked role-isolation and courier route/action tests are in `lib/courier/__tests__/courier-server.test.cjs` and `lib/kitchen/__tests__/`.
- **Owner-run SQL only:** `db/tests/migration_186_claim_race_tab_a.sql`, `...tab_b.sql`, `...verify.sql`, and `migration_186_business_delete_test.sql` are not run here. The business-delete harness is staging-only and says never run on production.
- **Stage C remains:** standalone courier dashboard/offer polling and visual/integration QA, live tracking, WhatsApp sending, and push are not included.
*This file is maintained by documentation agents. Last updated: 2026-10-21. Evidence audit: `docs/project-status.md`.*
