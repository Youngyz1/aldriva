# Aldriva — Platform Changelog & Evolution History

> **Status**: Verified Historical Record  
> **Format**: Chronological reverse order (Newest first)

## [2026-10] — Invitation Rounds Phase 0: baseline commit + audit decisions (2026-10-09)
- Committed the dirty overview/builder rework as standalone `6ee76d6` on `integration/full-recovery` (8 files, +111/−13, no Round 4 code mixed in): `?embed=1` iframe mode for builder + invitation-home, full-page owner preview with Private banner and Back/Edit actions (page-row guard, sample guest data only, no RSVP writes), dashboard overview `hasInvitationPage` card + localized public/private labels (en/fr), `invitation-home.test.cjs` pins.
- Baseline verification: ESLint 0 errors on touched files, `tsc --noEmit` 0 errors, full suite **1,550/1,553 pass with 3 known failures** — all three are stale expectations from this same rework (`invitation-events-kind.test.cjs:173`, `invitation-home.test.cjs:29`, `invitation-page-builder.test.cjs:409` re iframe `?embed=1`), owned by the Round 4 Rule-1 test rewrite. Nothing else red.
- Recorded owner decisions (DEC-0028): Rule 1 strips invitation controls from `kind='public'` events (UI + server-side 404/403, `isInvitationEvent()` only); `/invitation/[token]` stays canonical, new `/m/[token]` for Memories; explicit `kind='invitation'` gate + `noindex` on `/events/[slug]`; migrations continue from 162 with mirrors + rollback twins; retention 12 mo / 30+7-day notices / dry-run / flag OFF. Round 4 merges only after 155/156 are verified on staging.
- No database was accessed; no migration applied. Next: owner runs the read-only data-check SQL + `supabase migration list` (staging, prod) and pastes outputs for reconciliation.

## [2026-10] — R2 media amendment: user uploads, private products, and host allowlist (2026-10-08)
- Opened the public R2 pipeline to authenticated users through purpose-specific policies, scoped ownership checks, env-configurable per-user/IP rate limits, and an atomic daily quota (defaults: 40 uploads / 200 MiB per UTC day). Quotas apply only to R2-driver uploads. CMS remains admin-only; non-production deployments use Supabase and refuse public R2 operations.
- Routed homepage CMS and event banners through the image driver. Added generic private-media PUT/HEAD/signed-GET/delete helpers for paid product assets; migration 159 defaults existing rows to Supabase and new production assets to R2. Migration 160 adds event target metadata and quota accounting and had already been applied on staging. Migration 161 adds configurable quota parameters; it and migration 159 remain pending. No database or R2 access occurred during this work.
- Restricted image rendering to same-origin paths, Supabase hosts, and the configured media hostname. Added R2 bucket/CORS/lifecycle setup notes and left video/audio paths unchanged. No real database or R2 bucket was accessed.

## [2026-10] — Server-only boundaries for secret-reading modules (2026-10-08)
- Split privileged seating mutations, overview data, site URL generation, and invitation URL generation from browser-shared modules, then added `server-only` boundaries to secret readers and server-only helpers. `proxy.ts` compiles with the marker; standalone scripts and test fixtures remain unmarked.
- Added a test alias for `server-only` and `npm run check:client-secrets`, which checks live environment secret values and credential patterns in `.next/static` without printing values. TypeScript and production build passed; 1,456/1,456 registered tests passed; scan found no secret matches.

## [2026-10] — R2 public media foundation (2026-10-08)
- Added authenticated R2 upload-url/finalize/delete routes with private temporary storage, 10 MB input checks, purpose allowlisting, tenant/admin authorization, and rate limiting. Final images are decoded and re-encoded as metadata-stripped WebP, EXIF orientation applied, then resized to fit 2000×2000.
- Added provider-agnostic bucket-parameterized R2 helpers, sharp `>=0.35.5` (SVG decoding blocked), media metadata migration 157 and Supabase mirror, and CSP/image host support. Homepage CMS uploads now reuse browser validation/compression and explain that uploaded images are public.
- Verification: ESLint passed with 0 errors (4 existing warnings in `HomepageCmsTabs.tsx`), TypeScript passed, production build passed (354 static pages; sandbox network warnings for external event-provider fetches), full suite passed (1,424 tests / 96 suites), and `git diff --check` passed. Migration application, private bucket/CORS setup, live R2 checks, and authenticated responsive browser review remain outstanding. Website-builder `cms-media` write-policy mismatch documented only; existing Supabase media flows remain in place.

## [2026-10] — Round 3 Commit 3: general share link (2026-10-08)
- Migration `db/migration_156_invitation_share_link.sql` (+ rollback twin, supabase mirror `20261007000003_…`, **NOT applied to any database**): `share_token` UNIQUE, `share_enabled` default false, `share_regenerated_at` on `event_invitation_pages`. Rollback drops in reverse order. Also backfilled the missing 154 supabase mirror (`20261007000002_…`, byte-identical).
- General share link (invitation-kind only): 256-bit token, works only while published + enabled; host enable/disable/regenerate (inline confirm) in a new dashboard panel stating anyone with the link can read the page. Shared route renders the real template `shared` with guest-only blocks as a neutral note — no guest name, RSVP, or QR. Disabled/unpublished/invalid/public-kind tokens share one neutral page; noindex, no-store header, per-IP rate limit, always dynamic. Personal guest links unchanged on both kinds. 20 new tests in `lib/__tests__/invitation-sharing.test.cjs`.

---

## [2026-10] — Round 3 Commit 2: preview-first invitation home (2026-10-07)
- Event root routes by kind: invitation-kind opens `invitation-home`, public keeps the overview. Home shows the real template in the builder-preview iframe (sample guest, no writes, labelled sample QR), Draft/Published/Unpublished-changes badge, Edit/Send/Copy-link/Publish actions, no-page template-choice CTA, and Guests (RSVP counts)/Seating/Team/Operations/Check-ins/Scan links. Public overview untouched.
- Builder starts at template choice for fresh drafts, skips to the form for existing pages (`initialSection`). Fixed Commit 1 creation entries pushing to a non-existent `/builder` suffix (real route is `invitation-page`).
- Stale-draft cleanup as dry-run-by-default (`lib/invitation-cleanup.ts`, `POST /api/cron/invitation-drafts`, live needs `?live=1` + `ENABLE_INVITATION_DRAFT_DELETE=1`); logs to stdout. vercel.json schedule held back: the sentinel suite pins the cron count (plan budget) — one-line addition pending confirmation. 12 new tests in `lib/__tests__/invitation-home.test.cjs`.

## [2026-10] — Round 3 Commit 1: invitation events as first-class events (2026-10-07)
- Creation without a prior event: `createInvitationDraft` server action (kind=invitation, private, draft, placeholder title, key-derived slug; UNIQUE slug turns double submits into fetch-existing) with `CreateInvitationButton` next to every dashboard Create-event surface (events list header + empty state, `/dashboard/events/new` third card, both org overviews, both org events pages). Public ticket-first flow untouched.
- Builder Basics collects event title/date/venue/city for invitation-kind events (`updateInvitationEventFields`); `validateForPublish` rejects the placeholder title so it can never ship in a snapshot.
- Public exclusion via shared `applyPublicListableFilter` (event-data, sitemap, cities; embeds + related queries carry an explicit kind predicate); ticket purchase rejects invitation kind; bulk publish/unpublish skip invitation rows.
- Dashboard list: kind filter + badge, "Draft invitation" label for untouched drafts (delete kept), convert-to-invitation action blocked when tickets sold. No kind-gating on builder/guests/RSVP/seating; public event home gains "Invite special guests". 16 new tests in `lib/__tests__/invitation-events-kind.test.cjs`.

## [2026-10] — Migration 155: event kind (public/invitation) (2026-10-07)
- Migration `db/migration_155_event_kind.sql` (+ rollback twin, supabase mirror `20261007000001_…`, **NOT applied to any database — review before applying**): `events.kind TEXT NOT NULL DEFAULT 'public'` with `events_kind_check` (`public`/`invitation`); `events_status_check` relaxed to also allow `draft` (existing pending/approved/rejected rows stay valid; no NOT NULL relaxed); `events_invitation_private_check` (`kind='invitation'` forces `visibility='private'`); `idx_events_kind`. Existing rows take `kind='public'` from the default — no data conversion, no silent reclassification. Share-link columns deferred to migration 156. Rollback aborts loudly if any `kind='invitation'` or `status='draft'` rows remain, then reverses in reverse order. Static pins in `lib/__tests__/migration-155-event-kind.test.cjs`; numbering tracker (`stage17-pass-one`) bumped 154 → 155. Note: `db/migration_154_*` has no supabase mirror yet (flagged, untouched).

## [2026-10] — Stage 22B: AI gateway admin-only (2026-10-05)
- `POST/GET /api/ai/gateway`: replaced the any-signed-in-user gate with the admin check (`401` unauthenticated, `403` non-admin per `app/api/admin/*` convention, first statement before parsing/rate-limit/data); allowlist, tenant fail-closed, approval/guard audit unchanged.

## [2026-09] — Responsive Data Display Standard — Phase 4: Whole-Dashboard Completion & Migration (2026-09-30)
### Phase 4 — Whole-Dashboard Completion, Verification & Migration Across All Admin & Tenant Workspaces (2026-09-30)
- Completed full migration of all administrative, operational, and tenant organization workspaces using the canonical `ResponsiveDataTable` and `ResponsiveDataRow` primitives:
  1. `/admin/events` (`app/admin/events/page.tsx` & `app/[locale]/admin/events/page.tsx`): Category/date reduction at `@md`, mobile Two-Line Structured Row, status pill, and Admin Drawer triggers.
  2. `/admin/fundraisers` (`app/admin/fundraisers/page.tsx` & `app/[locale]/admin/fundraisers/page.tsx`): Progress bar, backdating controls, mobile Two-Line Structured Row with goal/raised metrics.
  3. `/admin/businesses` (`BusinessesClient.tsx`) & `/admin/businesses/review` (`page.tsx`): Listing tiers, review queue risk scores, approval modals, and moderation actions.
  4. `/admin/products` (`ProductsClient.tsx`): Stock count, digital asset indicators, price formatting, and approval controls.
  5. `/admin/articles` (`ArticlesClient.tsx`): Category tags, publication status, featured toggles, and moderation approval actions.
  6. `/admin/finance/payouts` (`PayoutsAdminClient.tsx`): KYC verification checks, recipient badges, multi-destination payout modals, and cancellation triggers.
  7. `/admin/payments` (`page.tsx`): Dual-table view (Ticket Orders + Donations) with status classes and money formatting.
  8. `/admin/organizers` (`OrganizersClient.tsx`): Bulk selection checkboxes, capability toggles, and detail drawer.
  9. `/admin/reviews` (`page.tsx`): StarRating component, target resolution, and moderation approvals.
  10. `/admin/ai/rejections` (`page.tsx`): Security audit log with verdict badges and code excerpts.
  11. Tenant Organization Events (`/dashboard/org/[id]/events`, `/dashboard/organizations/[slug]/events`): Tenant-isolated event management.
  12. Tenant Organization Fundraisers (`/dashboard/org/[id]/fundraisers`, `/dashboard/organizations/[slug]/fundraisers`): Tenant-isolated campaign progress.
  13. Tenant Organization Products (`/dashboard/org/[id]/products`, `/dashboard/organizations/[slug]/products`): Tenant-isolated product inventory.
  14. Tenant Organization Blog (`/dashboard/org/[id]/blog`, `/dashboard/organizations/[slug]/blog`): Tenant-isolated articles and updates.
- Synchronized pilot screens across root (`app/...`) and localized (`app/[locale]/...`) route trees (`EventsClient.tsx`, `FundraisersClient.tsx`, `AttendeesClient.tsx`, `PaymentsClient.tsx`, `UsersClient.tsx`).
- Resolved container query breakpoint mappings in `app/globals.css` with `@theme` declarations (`--container-sm: 30rem; --container-md: 48rem; --container-lg: 64rem; --container-xl: 80rem;`).
- Cleaned DOM nesting and eliminated double-mounting via `ResponsiveTableModeContext` (`"table"` vs `"list"`).
- Extended test suite in `lib/dashboard/__tests__/responsive-data.test.cjs` with 4 new test suites verifying Admin and Tenant Organization surfaces.
- Verification: Full platform test suite **908/908 passing (39 suites, 0 failures)**, TypeScript clean (`0 errors`), build clean.

## [2026-09] — Responsive Data Display Standard — Phase 3: Remaining User-Facing Migration (2026-09-29)
### Phase 3 — Remaining User-Facing Responsive Data Migration Across 9 Operational Surfaces (2026-09-29)
- Completed full migration of all 9 remaining user-facing operational/data-heavy screens using the canonical `ResponsiveDataTable` and `ResponsiveDataRow` primitives:
  1. `/dashboard/organizers` (`OrganizersClient.tsx`): Organization directory with followers/campaigns reduction at `@md` and mobile Two-Line Structured Row featuring revenue metrics, event counters, and detail drawer trigger.
  2. `/dashboard/donations` (`DonationsClient.tsx`): User donation ledger with date reduction at `@md` and mobile Two-Line Structured Row featuring green emerald donation amounts, campaign links, and detail drawer trigger.
  3. `/dashboard/events/[id]/checkins` (`CheckinsClient.tsx`): Real-time event check-in list with scanner breakdown reduction at `@md` and mobile Two-Line Structured Row featuring guest name, seat/qty indicator, offline sync badge, and timestamp.
  4. `/dashboard/events/[id]/guests` (`GuestsClient.tsx`): Comprehensive event guest manifest with contact/admission reduction at `@md` and mobile Two-Line Structured Row featuring VIP badge, seat indicator/Assign button, status pill, and detail drawer trigger.
  5. `/dashboard/products` (`products/page.tsx`): Product inventory view with stock/price type reduction at `@md` and mobile Two-Line Structured Row featuring thumbnail, price/sales metrics, product type pill, and `ProductRowActions`.
  6. `/dashboard/businesses` (`businesses/page.tsx`): Business directory with subscription ID/period reduction at `@md` and mobile Two-Line Structured Row featuring business logo, tier badge, status pill, and `BusinessRowActions`.
  7. `/dashboard/articles` (`articles/page.tsx`): Editorial articles manager with tags/visibility reduction at `@md` and mobile Two-Line Structured Row featuring cover image, visibility badge, status pill, and `ArticleRowActions`.
  8. `/dashboard/fundraisers/[id]/donations` (`DonationsClient.tsx`): Replaced legacy `hidden sm:block` table vs `sm:hidden` cards split with canonical container-query table + two-line structured row, preserving metrics strip, sticky search toolbar, and `DonationDetailSheet`.
  9. `/dashboard/fundraisers/[id]/donors` (`DonorsClient.tsx`): Replaced legacy dual table/cards split with canonical container-query table + two-line structured row, preserving donor avatar, repeat badge, metrics strip, and `DonorDetailSheet`.
- Synced changes symmetrically across both localized (`app/[locale]/dashboard/...`) and root (`app/dashboard/...`) route trees.
- Admin screens (`/admin/*`) strictly preserved without migration (reserved for Phase 4 / Batch 4).
- Updated regression test suite `lib/dashboard/__tests__/responsive-data.test.cjs` with 9 new test suites covering structural invariants of all Phase 3 screens.
- Verification: Full platform test suite **893/893 passing (38 suites, 0 failures)**, TypeScript compiler clean (`0 errors`), ESLint clean (`0 errors`).

## [2026-09] — Responsive Data Display Standard — Phase 2 / Batch 2: Pilot Migration (2026-09-29)
### Phase 2 / Batch 2 — Validated Pilot Migration Across 5 Representative Surfaces (2026-09-29)
- Successfully deployed `ResponsiveDataTable` and `ResponsiveDataRow` primitives (built with Tailwind v4 container queries `@container`) across 5 distinct data-heavy surfaces:
  1. `/dashboard/events` (`EventsClient.tsx`): Canonical event lifecycle table with date/visibility reduction at `@md` and two-line structured row with money formatting on mobile.
  2. `/dashboard/fundraisers` (`FundraisersClient.tsx`): Unified campaign progress table; eliminated legacy table/cards toggle switch in favor of container-responsive two-line rows.
  3. `/dashboard/attendees` (`AttendeesClient.tsx`): High-volume attendee list with batch selection checkboxes, quantity/paid indicators, and mobile drawer details.
  4. `/dashboard/settings/payments` (`PaymentsClient.tsx`): Financial ledger / payout history with multi-destination support, currency formatting, and safe cancellation actions.
  5. `/admin/users` (`UsersClient.tsx`): 10-column administrative management view reduced gracefully to 5 columns at `@md` and two-line identity rows with role/status badges and moderation drawer on mobile.
- Enforced all non-negotiable rules: Zero schema changes, zero auth changes, preserved drawer triggers (`DashboardDrawer`/`AdminDrawer`), preserved bulk selection states, and 100% test coverage.
- Created regression test suite `lib/dashboard/__tests__/responsive-data.test.cjs` registered in `package.json` (6 tests covering primitives and all 5 pilot screens).
- Verification: Full test suite **884/884 passing (37 suites, 0 failures)**, TypeScript clean (`0 errors`), ESLint clean (`0 errors`).

## [2026-09] — 3D Office Stage 19 complete: visualization only (2026-09-30)
### Stage 19 — read-only office view, no runtime change (2026-09-30)
- New `app/admin/workforce/office/` (server page + `OfficeView` wrapper + lazy `OfficeScene` + `OfficeFallback` 2D list): `requireAdmin()` first, reads via existing command-center modules with the signed-in client, minimal snapshot (ids, names, departments, status labels, counts; titles trimmed to 80). No prompts, args, evidence, tokens or tenant data.
- `lib/workforce/office.ts`: pure snapshot→scene view-model. Rooms from the registry `department` field (new agents get desks automatically); idle=seated, busy=working pose, awaiting=marker, open incidents=reliability annex alert light, stale/unknown=neutral. Stored state only.
- Scene: code primitives only (no model/texture files), fixed camera, click→agent page, `prefers-reduced-motion` respected, disposal on unmount, 30s `router.refresh()` polling paused when hidden, no client fetch/websockets/Realtime. `three@0.186.1` used imperatively (no react-three-fiber — its global JSX typing breaks unrelated components) and typed via `@types/three@0.186.0` devDependency (audit unchanged at 1 low/1 high/1 critical).
- Nav: one "Office" sidebar entry; p2 `WORKFORCE_PAGES` registration. Tests: `office.test.cjs` (9 tests: mapping, auto-desk, snapshot hygiene, gate order, static prohibitions, three confinement).
- Pass 2 rebuild: department grid cells with glass walls/door gaps/floor labels; desk+chair+monitor+figure per agent (all pick to the agent); idle breathe, running typing, awaiting stands at an in-room marker, incident pulse, unknown static; exact frustum fit for all geometry (verified hermetically at 1/3/8 rooms, wide+narrow); shared geometries/materials; unassigned cell for empty departments.
- No migrations, no API routes, no service-role, no writes, existing modules untouched.

## [2026-09] — Guardrails Stage 18 complete: no autonomous production actions (2026-09-30)
### Stage 18 — L0 enforcement pinned by tests, one violation reported (2026-09-30)
- New `lib/security/__tests__/no-autonomous-production-actions.test.cjs` (10 tests, registered): forbidden-API scan over lib/ai, lib/exec, lib/qa, lib/workforce, app/api/ai|exec|qa|cron (shell, fs-write, eval, Vercel/GitHub/payment/DDL APIs, infra tokens, `.github/` writes); 16-var env allowlist; financial tables never written from agent paths; agent writes limited to reviewed tables; exec dispatch registry-only; 30-tool snapshot; all agents L0; write-capable tools ungranted except dylan/qa-scoped pins; fallback has no writers; autonomy never raised.
- **Finding S18-1 (NOT fixed, assertion excluded from package.json)**: `createNotification` + `notifyOwner` are medium-risk, write-capable, `approval_required=false` (`migration_139:87-88`), and medium is outside the L0-blocking set (`approvals.ts:29`). Currently ungranted to all agents (ACL-only defense). Pinned by `approval-flag-gap.test.cjs` (fails by design). Fix needs a product decision (flag migration vs gate change).
- `docs/GUARDRAILS-NO-AUTONOMOUS-PRODUCTION-ACTIONS.md`: prohibition→mechanism→test matrix, S18-1, relaxation preconditions.
- QA worker verdict: schedule/manual triggers only; no deploy step; staging-only target with fail-closed empty check; agents cannot dispatch workflows (no GitHub API, receipt-only tool, human approval, worker poll).
- No runtime changes, no migrations. Deferred: S18-1 decision.

## [2026-09] — Observability Stage 17 pass one complete (2026-09-30)
### Stage 17 pass one — stored-state truth, no migration (2026-09-30)
- O-1: `reclaimStaleLeases` closes the orphaned attempt (`agent_runs` → `failed`, `error='exec-lease-expired:superseded'`, `completed_at`, conditional on `status='running'` + `task_id`/`attempt_no`) on both exhaust and requeue paths. Task requeue, attempt count, backoff, eligibility untouched; late-ingest rejection unchanged.
- O-2: new `transitionDecidedRun` helper (guard untouched) called from `decideWorkforceApproval` post-decision, try/catch log-and-continue: approved → `completed`, rejected/expired → `cancelled`, conditional on `awaiting_approval`. `approved → completed` means the gate passed and execution continues in exec rows — not that the work finished (Activity renders run entries by status text; Agent detail shows run status verbatim).
- O-5: memory applier selects `approver_id` and passes it as `p_approver` for agent-proposed applies (poll + action paths); idempotency/conflict behavior unchanged (keyed on fact identity).
- O-3: sentinel sweep stamps `incidents.agent_run_id` with the investigation run id (`WHERE agent_run_id IS NULL`), non-fatal.
- O-6: exec attempt rows now `triggered_by='manual'`; QA standing smoke keeps `'schedule'`. Gateway task born-`completed` corrected at read time (completed tasks with a linked live run count as active in Command Center).
- O-7 read-side: `qaRunCount` from `qa_runs` (platform + tenant rows); window counts labelled recent; busy/awaiting derive with decided-approval staleness guard (Command Center, Agents list/detail); `currentTask` newest non-terminal; `lastActivityAt` prefers `completed_at`; Activity no longer renders `awaiting_approval` as finished; stale Stage-7 QA empty note fixed. Historical `via schedule` rows stay verbatim.
- Tests: `stage17-pass-one.test.cjs` (14 behavioral/static); spec-mandated assertion updates in `command-center`, `agents`, `workforce-admin-actions` tests (same strength, new behavior pinned). No migration added; nothing applied to any database.
- Deferred: O-4 (worker identity), O-8 (QA reclaim), O-9 (role audit, 429 visibility, dead kinds), O-10 (correlation id), O-11 (retention, sweep scheduling), O-12 (exec SHA/env), Studio turn trail.

## [2026-09] — Workforce Testing Stage 16 complete (2026-09-30)
### Stage 16 — hermetic gap tests + staging verification script (2026-09-30)
- Behavioral (real logic, stubbed boundaries only): `lib/actions/__tests__/workforce-admin-actions.test.cjs` (12 tests: decide non-admin/invalid/rate-limited/decided/expired + exactly-one-write happy path; memory non-admin/secret/scope/agent/rate-limited + one-RPC happy path); `lib/qa/__tests__/qa-routes.test.cjs` (7 tests: poll 401s, PREV accepted, claimed:false pass-through, ingest 401s, ingest-once + idempotent replay); `lib/exec/__tests__/worker-auth.test.cjs` (6 tests: bearer/claim-token behavior incl. PREV rotation, timingSafeEqual static, 401 denial args carry fixed labels only).
- Static: `agent-config-by-absence.test.cjs` (no runtime writes to agent-config tables; seeds only in 139-150; readers pinned), `workforce-page-order.test.cjs` (requireAdmin precedes data access on all pages).
- `scripts/verify-staging-db.cjs` + `npm run verify:staging-db` (NOT in `npm test`; human-run only; refuses unset/prod-ref URL; BEGIN/ROLLBACK only; PASS/FAIL/SKIP; covers SELECT-only policies, anon zero-rows, column privileges, partial-unique duplicates, versions append-only, RPC lockdown, kind CHECK, member isolation with SKIP on missing fixtures) + hermetic guard tests (5).
- `docs/TESTING-WORKFORCE.md`: roadmap map, run instructions, real-DB vs emulation vs not-at-all table.
- No runtime code, migrations, or existing-test changes. No new test exposed a runtime bug (nothing excluded from package.json).
- Deferred: true PG concurrency, RPC crash atomicity, live model→approval end-to-end.

## [2026-09] — Security Hardening Stage 15 pass one complete (2026-09-30)
### Stage 15 pass one — RLS narrowing (151, NOT applied) + abuse/detection gaps (2026-09-30)
- Migration `db/migration_151_workforce_rls_narrowing.sql` (+ rollback twin, supabase mirror `20261005000000_…`, order entry; **NOT applied to any database — fold into the production promotion set**): SELECT-only narrowing. Admin-only: agents, agent_versions, agent_tools, tool_definitions (S-1), qa_runs (S-14). Admin-or-member (143 pattern): approvals, agent_tasks, agent_runs, agent_reports (S-4). Parent-scoped: agent_steps via agent_runs, qa_test_results via qa_runs, knowledge_document_versions via parent doc visibility (S-2/S-4). knowledge_chunks: non-admin reads require parent status='approved' (S-8). qa_runs secret columns (claim_token_hash, claim_expires_at, idempotency_key, metadata) hidden from anon/authenticated via column GRANT (migration-55 doctrine); admin UI uses explicit column lists, service-role bypasses grants. No INSERT/UPDATE/DELETE policies added; NULL-tenant platform rows stay admin-readable.
- Abuse/detection (no migration): per-admin 30/60s buckets `decideWorkforceApproval` + `createMemoryDirect` (`?decided=rate-limited` / `?created=rate-limited`, existing redirect style); worker 401s (exec claim/heartbeat/run, exec-ingest token failures as 422-audited, QA poll/ingest) log ONE throttled `auth_failure` row (`authDenialLog` 1/IP/min, fixed message, no token material, fail-open, responses unchanged); `getToolGate` catch fails closed (approval-required); QA poll token gains `_PREV` rotation (exec construction).
- Tests: new `stage15-pass-one.test.cjs` (12 tests); `p1-generic-error-responses` gains template-literal shape-6 check (6 pre-existing out-of-scope hits pinned: fundraiser import ×2, promotion-engine ×4 — fix separately) + 6 repinned shifted lines; 10 previously-unlisted test files registered (shop-digital-products + 9 dashboard phase files, all passing, +62 tests).
- Deferred: S-3 (service-role knowledge retrieval), S-5 (retrieval screening/injection), S-7 (platform memory visibility), S-9 (role-change audit), S-16/F-3 (retention vs append-only), dead `[locale]/admin/ai` twins + dead audit link, dev-login hygiene.
- Untouched: applied migrations ≤150, approvals engine, exec/QA protocol, memory model, knowledge retrieval, Studio, gateway routing, proxy.ts.

## [2026-09] — AI Studio / Workforce Boundary Stage 14 complete (2026-09-30)
### Stage 14 — directTool allowlist + boundary invariants, turn logging deferred (2026-09-30)
- Boundary enforced: Studio = creation workspace, Workforce = employees/operations/management; shared layers only provider, tools, knowledge, runtime, guards. `app/api/ai/chat/route.ts`: `STUDIO_DIRECT_TOOL_ALLOWLIST` (the exact 9 read-only tools reachable via `executeAITool`); non-allowlisted `directTool` calls return 403 with no execution and log one `approval_block` system event (fixed message `Studio direct tool rejected: not on read-only allowlist`, tool name in `tool_name`, no prompts/args; fail-open `.catch`). Model-initiated chat tool use unchanged (PUBLIC+ADMIN lists, no tenant context).
- SSRF verified hermetic: `fetch_url_summary`/`fetch_rss_feed` via `safeFetchHtml` (RFC1918/loopback/link-local fail-closed without DNS) with `SsrfBlockedError`→failure-object mapping; `search_trends` via input-guard screening; directTool shares the identical functions through `executeAITool` (no parallel path).
- Tests: new `lib/ai/__tests__/studio-boundary.test.cjs` (13 tests: tenant-exclusion, 9-name snapshot, allowlist integrity + no writers, SSRF evidence, rejection shape + fail-open) registered in `package.json`. Ownership comments (only) on `tools-registry.ts`, `provider-factory.ts`, `input-guard.ts`, `output-guard.ts`.
- Studio per-turn audit trail deferred: requires a decision (dedicated table, or a studio_turn kind excluded from incident correlation, which needs a migration). Every insertSystemEvent creates or bumps an incident (system-events.ts:112-121), so turn logging via system_events is not viable.
- Untouched: gateway, orchestrator, agent registry, Stage 12/13 memory, approvals engine, Workforce pages, proxy.ts, lib/exec/*, db/, supabase/. Report-only: dead `app/[locale]/admin/ai/*` twins left in place.

## [2026-09] — AI Workforce Stage 13 complete: Agent Memory Hardening (2026-09-30)
### Stage 13 — F-1/F-2/F-4/F-5 hardening, F-3 deferred (2026-09-30)
- `db/migration_150_memory_hardening.sql` (+ rollback twin, supabase mirror `20261004000000_…`, order entry): F-1 three partial unique indexes (platform / tenant-shared / agent-on-platform scopes; base UNIQUE keeps all-non-null rows) behind a fail-loud duplicate guard (raises with counts, never merges/deletes); F-2 transactional RPC `apply_agent_memory()` (approval lock+verify, version-guarded fact write, history insert, conditional stamp — all-or-nothing; unique_violation → clean conflict; service-role only, `REVOKE … FROM anon, authenticated`); F-4 `BEFORE UPDATE OR DELETE` reject trigger on `agent_memory_versions` (all roles, INSERT open); F-5 additive `memory_retrieval` kind in the `agent_steps` CHECK (145 precedent).
- App: applier rewritten onto the RPC (same interface; conflict stamps so pollers never re-spin; idempotent re-entry reports applied+duplicate); human direct-create via the same RPC (no table writes left in either file); orchestrator logs a `memory_retrieval` step (keys/versions/scopes via `buildMemoryAuditLine`, never values) after the knowledge step.
- Tests: `memory.test.cjs` 19→26 (F-1 race-ordered + scope-matrix, F-2 injected-failure atomicity + retry + duplicate, F-4 trigger/harness, F-5 audit-line/orchestrator/kind, migration-150 consistency). Harness emulates the RPC transactionally (snapshot/restore), enforces partial uniques, and blocks versions mutation.
- Reported-only: true PG concurrency proven by constraints (hermetic tests are race-ordered sequences); trigger behavior needs live apply to observe; F-3 retention deferred per scope (no CASCADE changes).
- Untouched: migration 149, `lib/exec/*`, proxy, approval engine semantics, other sections.

## [2026-09] — AI Workforce Stage 12 complete: approved persistent memory (2026-09-30)
### Stage 12 — Human-approved agent memory, proposal-gated writes (2026-09-30)
- `db/migration_149_agent_memory.sql` (+ rollback twin, supabase mirror `20261003000000_…`, order entry): `agent_memory` (tenant/agent scope, key 1–120, value 1–4000, status active/revoked/expired, version, source human/system/agent-proposed, proposer/run/task provenance, approver/approval, effective/expiry timestamps, UNIQUE(agent_id,tenant_id,fact_key)) + append-only `agent_memory_versions` + scoped SELECT-only RLS (writes service-role only) + `memory_propose` tool seed (transactional/medium/approval-gated, dylan-only grant).
- Read: `lib/ai/memory.ts` (`resolveMemory` with in-query tenant/agent/status/expiry predicates + injectable client, `formatMemoryForPrompt` context-framed block after knowledge); orchestrator resolves memory after knowledge retrieval and appends the block (knowledge outranks memory).
- Proposal: `memory_propose` tool (`lib/ai/tools/workforce/memory-propose.ts`: op/scope/agent/key/value/version/expiry validation, secret-pattern rejection, executor records approvals only) + registry wiring; orchestrator gate validates proposals pre-creation (malformed → tool error, no approval) and records `action='memory_propose'` with a canonical `{memory_proposal}` payload (never an execution envelope, so the generic materializer cannot enqueue it).
- Apply: `lib/workforce/memory-apply.ts` (sole writer: poll/single-apply, exact-state revalidation, optimistic base-version check, fact+history writes, conditional `audit_ref` stamp, idempotent re-entry, conflict stamps) invoked synchronously from `decideWorkforceApproval` on approved memory proposals (+ due-expiry sweep, no new worker).
- UI: `/admin/workforce/memory` (status chips, scope labels, version/status/expiry badges, human direct-create form with secret + identity + platform-admin checks) + `/admin/workforce/memory/[id]` (value, metadata, linkage, full history) + approvals detail memory-proposal section (current/proposed/apply state) + sidebar Memory entry. All escaped text, `requireAdmin`, `notFound()` on bad ids.
- Tests: `lib/workforce/__tests__/memory.test.cjs` (19: the 15 mandated isolation/approval/versioning/expiry/secrets/404/gating cases + validator/proposal/view-model/migration units), registered in `package.json`; memory pages in p2 `WORKFORCE_PAGES`.
- Reported-only: no retrieved-text screening for memory values yet (matters if memory ever feeds higher-trust contexts); expiry transitions ride admin decide-activity (no dedicated scheduler — read predicates exclude expired regardless); `lib/database.types.ts` left untouched (stale since before 146 — established fallback).

## [2026-09] — AI Workforce Stage 11 complete: Knowledge section (2026-09-29)
### Stage 11 — Chunk viewer, sources, agent panel, retrieval test (2026-09-29)
- Shipped across `d1e8d41` (11.1: read-only list + detail, `lib/workforce/knowledge.ts` helpers, 7 tests) and this commit: chunk viewer on the detail page (explicit `id,chunk_index,tenant_id,content` select, ordered, capped 50, 5000-char previews, tsv never selected, fetched only after parent read); sources summary panel on the list (by `source_type`/`source_ref` counts aggregated in code from an explicit-column select, capped 200 rows, same allowlisted filters); static agent-knowledge panel (identical retrieval for all agents today, no per-agent model, deferred); retrieval test box (`knowledge/retrieval` page + client form + one server action) running the existing `retrieveKnowledge`/`formatKnowledgeForPrompt` UNMODIFIED and rendering applied scope, chunks, count, fallback notice (`fallback-` id detection), and the exact prompt block. Nothing persisted anywhere.
- SERVICE-ROLE EXCEPTION (narrow, documented): ONLY `lib/actions/workforce-knowledge-retrieval.ts` may reach `retrieveKnowledge`, which uses the service-role client internally (`lib/ai/knowledge.ts:8,91`, no user-client path exists). Conditions, all enforced and statically tested: call inside exactly one `"use server"` action file, never in a page render, never in `lib/workforce/knowledge.ts`; `requireAdmin()` first; tenant re-validated against a server-fetched organizers allowlist (admin's own session, capped 50) or literal `"platform"`; query trimmed, capped 300 chars; retrieval limit fixed at 4; per-admin rate limit BEFORE the call via `checkRateLimit` with NEW bucket `workforceKnowledgeRetrievalTest` (20/60s — new convention: first action-level bucket, `user:<adminId>` identifier, documented in `lib/rate-limit.ts`); nothing returned is persisted; no other stage file imports or calls the service-role factory.
- Reported-only (NOT fixed — no migration/RLS changes): `knowledge_document_versions` any-authenticated SELECT; `knowledge_chunks` no status check; no retrieved-text screening (required before any authoring stage); no per-agent knowledge model; dead `ai_knowledge_docs`. `lib/ai/knowledge.ts` and `lib/ai/orchestrator.ts` zero-diff. With this commit Stage 11 is CLOSED.

## [2026-09] — AI Workforce Stage 11.1: Knowledge read-only list + detail (2026-09-29)
### Stage 11.1 — Knowledge list/detail UI, zero writes (2026-09-29)
- Replaced the `knowledge` stage-stub with a read-only list (`app/admin/workforce/knowledge/page.tsx`: scope chips Platform/Tenant/All defaulting to Platform, 17-category chips, allowlisted filters with safe fallbacks, tenant labels, `agent_memory` Stage-12 notice) and document detail (`knowledge/[id]/page.tsx`: metadata, 1500-char content preview as escaped pre-wrap text, version metadata, chunk count, back link). No sidebar change (entry existed).
- New `lib/workforce/knowledge.ts` (Reports-pattern helpers): list select NEVER includes `content`; versions metadata-only after parent read; chunk COUNT only; uuid guards → notFound. No `insert/update/delete/upsert`, no service-role client, no `dangerouslySetInnerHTML` — statically asserted in `lib/workforce/__tests__/knowledge.test.cjs` (registered in `package.json` test list); `knowledge/[id]` added to p2 `WORKFORCE_PAGES`.
- Reported-only (NOT fixed — no migration/RLS changes): `knowledge_document_versions` allows any-authenticated SELECT (no scope/status gate; UI reads metadata only after parent read); `knowledge_chunks` has no status check (UI never selects chunk text); legacy `ai_knowledge_docs` is dead (no readers); retrieved-text screening absent (matters when authoring arrives); no per-agent knowledge model exists.
- Untouched: `lib/ai/knowledge.ts`, orchestrator, registry, proxy, `lib/exec/*`, approvals, other sections. `_components/stage-stub.tsx` kept (zero consumers now, deletion out of scope).

## [2026-09] — AI Workforce Stage 10.11: Workforce admin UI reachable (route move only, 2026-09-29)
### Stage 10.11 — Moved app/[locale]/admin/workforce/** to app/admin/workforce/** (2026-09-29)
- Cause: `proxy.ts` strips the locale prefix and rewrites to the root tree, so the `app/[locale]` tree is never route-matched; the 16 Workforce pages were the only pages without a root twin → `/admin/workforce/*` and `/en/admin/workforce/*` both 404'd live on staging (`d656a9f`).
- Move (`git mv`, history preserved): 16 pages + `_components/stage-stub.tsx`. No import changes needed (only `@/lib/*` + one preserved relative import; no `params.locale`, no locale hooks). Header path comments updated to the new location.
- Root sidebar (`app/admin/layout.tsx`): added "Workforce" nav group with the same 9 entries/hrefs as the dead `[locale]` layout (Command Center, Agents, Tasks, Approvals, Reports, Activity, Knowledge, Sentinel, QA). Same admin gate (`x-admin-verified` + `requireAdmin()` fallback, identical in both layouts) plus per-page `requireAdmin()` — no auth change.
- Tests: `p2-admin-page-gates` workforce paths repointed to `app/admin/…` + new structure test (all 16 exist under `app/admin/workforce`, none remain under `app/[locale]/admin/workforce`); `sentinel.test.cjs` paths repointed. Full suite **878/878** (was 877/877). `tsc` clean, scoped `eslint` 0 errors, build compiles (pre-existing `things-to-do/[city]` prerender failure unchanged).
- Untouched: `proxy.ts`, i18n config, all other routes, RLS, migrations, `lib/exec/*`, approvals/decide logic. Pre-existing dead link `/admin/system/audit` (no page in either tree) left as-is, reported only.

## [2026-09] — Responsive Data Display Standard — Phase 1 UX Specification & Table Audit (2026-09-29)
### Phase 1 — Comprehensive Table Audit & Canonical Responsive Data Specification (2026-09-29)
- Audited all 15 operational data-heavy screens across user dashboard and admin routes (`app/dashboard/*`, `app/dashboard/org/[id]/*`, `app/admin/*`).
- Established canonical pattern specification in `.aldriva/design/patterns/data-tables.md` and updated `.aldriva/design/responsive.md` and `docs/DESIGN-SYSTEM.md`.
- Formally defined 5-level mobile information hierarchy (Priority 1: Identity, Priority 2: Primary Value, Priority 3: State, Priority 4: Important Secondary Context, Priority 5: Low-Frequency Details).
- Established the **Two-Line Structured Row** mobile standard (Line 1: Identity on left, Primary Value on right; Line 2: State Badge + secondary metadata).
- Documented 4-state container query architecture (`@container`, `@lg` Full Table, `@md` Reduced Table, `< @md` Structured Row, State D: Expanded Record).
- Established entity-specific field priority matrix across all Aldriva domains (Events, Fundraisers, Businesses, Products, Payouts, Donations, Attendees, Check-Ins, Organizations, Users, Articles, AI Guard Logs).
- Documented Phase 2 implementation architecture (`ResponsiveDataTable` / `ResponsiveDataRow` extending `DashboardTableCard`) and 4-batch rollout plan. Zero changes to database, schema, or authorization rules.

## [2026-09] — AI Workforce Stage 10: Background Execution (2026-09-29)
### Stage 10 — Durable approval→execution loop: envelope, claim/lease, binding, worker, recovery, ingest (2026-09-29)
- Discovery first (`docs/STAGE-10-BACKGROUND-EXECUTION-DISCOVERY.md`, audit-only): orchestrator ends blocked work as `awaiting_approval` with no resume; only QA has a background executor; generic approvals have zero consumers; evidence sanitizer breaks `parseRequestArgs`; approval binding is action-name-global; no durable job state anywhere.
- 10.0 `lib/exec/envelope.ts` (versioned canonical envelope: identities, canonical args, budget, idempotency continuity) — minted in the orchestrator block path into `approvals.proposed_outcome`; QA claim parses envelope-first (server-resolved tenant wins) with legacy fallback. Resolves the evidence mismatch for new rows.
- 10.1 `db/migration_146_background_execution.sql` (+ rollback twin + supabase mirror + order entry): 9 `agent_tasks` columns (lease/idempotency/attempt/delay/result + `claim_token_hash`), `attempt_no` + partial unique on `agent_runs`, claim/lease/approved-poll indexes. Additive only; status vocabulary reused; `approval_id` left loose; RLS untouched. Not yet applied live.
- 10.2–10.3 `lib/exec/{tokens,claim,binding}.ts`: idempotent enqueue, atomic conditional claim (race-safe), 15-min leases, single-use tokens, six-way live binding (tenant/agent/approval/action/args/job) with permanent failures.
- 10.4–10.6 `lib/exec/{runner,dispatch,recovery,ingest}.ts`: single bounded dispatch via existing registry, attempt timeouts, owner-guarded heartbeat, stale-lease reclaim with capped backoff, idempotent forward-only ingest (duplicate short-circuit, terminal freeze), terminal `agent_reports` + audit steps.
- 10.7 `lib/exec/{materialize,emit}.ts`: approval→job materialization inside claim (bounded, `request_qa_run` excluded, legacy stamped invalid); terminal failures emit metadata-only `job_error` (Sentinel observes, unchanged). No UI changes — existing task/report/activity surfaces render new rows.
- Routes (all Layer-1 `EXEC_WORKER_TOKEN` except claim-token-only ingest; `execClaim` 60/min bucket): `POST /api/exec/{claim,heartbeat,ingest,run}`. No scheduler attached.
- Tests: 11 new suites (envelope/claim/binding/runner/recovery/ingest/materialize/migration/routes/e2e/agent-runs) + 2 extended; full suite **861/861** (was 797/797). `npx tsc` clean, `npx eslint` 0 errors, build compiles (pre-existing `things-to-do` prerender failure unchanged).
- Boundaries kept: no auto-approve/loops/arbitrary execution; no new tools; no Sentinel changes; no unrelated fixes. Record: `docs/STAGE-10-BACKGROUND-EXECUTION-IMPLEMENTATION-REPORT.md`.
- Stage 10.9 smoke-test enabler: new test-only tool `execSmokeNotify` (`transactional/medium/approval_required=true`, granted to `dylan` only) writing one fixed in-app row to the first tenant owner (no email ever); `db/migration_147_exec_smoke_notify.sql` (+ rollback, mirror, order); executor + registry wiring reusing the shared notification path; `smoke-tool.test.cjs` (10 tests). Zero behavior change for existing agents/tools. Undo: delete rows by title prefix + rollback twin.

## [2026-09] — AI Workforce Stage 9: Sentinel Foundation and UI (2026-09-28)

### Stage 9 — Read-only Sentinel incident UI: overview, list, detail (2026-09-28)
- Readiness audit first (`docs/SENTINEL-STAGE-9-IMPLEMENTATION-READINESS.md`, audit-only, no code): Sentinel executable backend (L0 identity, 24 tools, 4 read-only executors, gateway + manual sweep paths) with stub UI, no lifecycle writes, no notifications, unscheduled sweep, shadow-suppressed QA emission.
- 9.0 test hygiene (test-only): `sentinel-events` cron assertion corrected to audited reality (4 crons, sweep stays manual per Hobby-limit removal `87e5292` — entry NOT re-added); fallback allowlist divergence (20 vs DB 24) judged a latent degraded-path gap, not an active defect — production allowlist untouched per boundaries, divergence pinned with a documenting test.
- `lib/workforce/sentinel.ts` (new) — fetch + pure VMs for overview/incidents/events/detail, real schema sets only (statuses open/investigating/resolved/expired; s1–s4; 10 event kinds), strict `.eq('tenant_id')` tenant contract (platform view unfiltered), `metadata`/actor columns never selected, messages truncated (300ch) + redacted, zero write calls / no service-role (scanned).
- `sentinel/page.tsx` stub → real overview (counts, severity histogram, attention = open s1/s2, recent incidents/events, recent `qa_failure`, honest empties, "last observed" labeling); `sentinel/incidents/page.tsx` (status + severity chips) + `sentinel/incidents/[id]/page.tsx` (timeline, run→task→approval chain, investigation history, labeled QA display-linkage, `notFound()` on bad id). No forms/buttons/writes anywhere; read-only scope stated on-page.
- 9.4 reciprocal (justified only): report-detail incident link + activity incident hrefs → `sentinel/incidents/[id]`; event hrefs stay on overview (no per-event route in scope); Command Center/agent/task/approval/QA pages untouched.
- Tests: `sentinel.test.cjs` (14: access, tenant-never-`.or()`, hops, forbidden columns, redaction, VM secrets scan, zero-write scan, 404, page requireAdmin/no-controls scan) registered in `package.json`; 2 new `p2-admin-page-gates` inventory lines. Full suite **797/797** (was 781/782). `npx eslint` 0 errors, `npx tsc --noEmit` clean, build compiles + type-checks (prerender still stops at pre-existing `things-to-do/[city]` failure, unchanged cause).
- Boundaries kept: no migrations, no APIs, no tools/permissions, no workers, no schedule change, no lifecycle writes, no unrelated fixes. Implementation record: `docs/SENTINEL-STAGE-9-IMPLEMENTATION-REPORT.md`.

## [2026-09] — AI Workforce Stage 8: QA Reporting UI (2026-09-28)

### Stage 8 — QA runs list + run detail, replacing the Stage 1 QA stub (2026-09-28)
- `lib/workforce/qa.ts` (new) — fetch + pure view-model shape matching Stages 1–7 (`reports.ts`/`tasks.ts`): list/detail/status-counts keyed to the REAL migration-145 schema (statuses requested/approved/running/passed/failed/cancelled/expired; suites smoke/auth/payments; staging only). Tenant contract: `target_tenant_id` nullable = platform-level; tenant-scoped queries use `.or(target_tenant_id.eq.X,target_tenant_id.is.null)` so null-tenant smoke runs (incl. the known failing donate-spec runs) are never hidden. `claim_token_hash`/`claim_expires_at`/`idempotency_key`/`metadata` never selected; run + per-test error text truncated (300ch) + secret-pattern redacted; artifact URLs render only when https (nulls = honest "not uploaded", never fabricated).
- `app/[locale]/admin/workforce/qa/page.tsx` — stub replaced with real list: status chips (actual schema states), recent-200 counts, newest-first, platform/tenant scope labels, pass/fail/skip + duration per row; failed runs render honestly.
- `app/[locale]/admin/workforce/qa/[id]/page.tsx` (new) — full run record (suite/env/commit/trigger/timing/counts/external id/artifact base/error) + per-test breakdown (name/file/status/duration/redacted error/screenshot-trace-logs links or honest absence note) + reciprocal links to Stage 2 agent detail and Stage 4 approval detail; malformed/missing id → `notFound()`.
- `app/[locale]/admin/workforce/approvals/[id]/page.tsx` — reciprocal "QA runs from this approval" section via `fetchQaRunsByApproval` (qa_runs.approval_id). Verified: Task detail and Report detail have no direct QA-run reference (linkage flows approval→QA only), so no other reciprocal links were added.
- Command Center QA section: already links to `/admin/workforce/qa`; count semantics (agent_runs for the qa agent) left untouched.
- Tests: `lib/workforce/__tests__/qa.test.cjs` (11 tests: list access + real statuses, tenant-null handling, detail linkage, forbidden-column scan, redaction, truncation, artifact honesty, no-secrets VM scan, empty states, by-approval linkage, 404-on-bad-id) registered in `package.json`; `qa/[id]` added to the `p2-admin-page-gates` inventory. Full suite 781/782 — the single failure (`sentinel-events` vercel.json cron entry) is pre-existing and unrelated (cron removed in 87e5292). `npx eslint` clean, `npx tsc --noEmit` clean, production build passes.
- Explicitly NOT done here: no donate-spec fix (tracked separately, still expected to display as failed), no Sentinel/workers/memory.

## [2026-09] — Phase 5: Products, Services & Menus (2026-09-24)

### Phase 5 — Services, Service Tiers, Menu Sections/Items, Public Blocks (2026-09-24) — corrected 2026-09-24 live verification
- `db/migration_136_services_and_menus.sql` — **corrected live version applied 2026-09-24**: renamed `menu_items_dietary_tags_enum_check`/`menu_items_allergens_enum_check` (avoid 42710), added `menu_modifiers_valid(jsonb)` IMMUTABLE function before `menu_items` and `CHECK (menu_modifiers_valid(modifiers))` (no subquery in CHECK), **removed** `UNIQUE (service_tiers/pos, menu_sections/pos, menu_items/pos)` (position not unique; fixes 23505 on second create and reorder collisions). Valid inserts succeed, bad dietary tag and malformed modifier rejected 23514 verified live. RLS and `check_menu_item_organizer_match` trigger NOT yet non-admin tested.
- Rollback corrected: drops triggers, then tables children-first WITHOUT CASCADE, then functions last including `menu_modifiers_valid(jsonb)`. Mirror `supabase/migrations/20260925000000` byte-identical to `db/` (test asserts).
- `lib/actions/services.ts` — **security fix**: `deleteServiceTier` now verifies `services.organizer_id` BEFORE delete (was delete-before-check, bypassed RLS via service-role); `updateServiceTier` now scopes final update with `.eq(service_id, serviceId)` and checks parent before tier (avoid probing), `createService` race-safe `SLUG_MAX-6` + `crypto.randomUUID` 10-attempt insert loop handling `23505`; `reorderServices`/`reorderServiceTiers` bail on failure; position defaults to `max+1` (capped 999) when not provided.
- `lib/actions/menus.ts` — position `max+1` default for sections/items, `validatePosition` restored and used in `updateMenuSection`/`updateMenuItem`, `POSITION_MAX` restored, `reorderMenuSections`/`reorderMenuItems` with ownership BEFORE write and duplicate/length guards, same showInactive removal.
- Website `lib/website-blocks.ts` removed `showInactive` from `services_embed`/`menu_embed` (was ignored by resolvers; prefer removal over plumbing); `lib/website-embeds.ts` resolvers still filter `is_active` only; prices in dashboard `/services` and `BlockRenderer` left with hardcoded `$` plus `TODO: multi-currency not in Phase 5` and Known Issues note.
- Dashboard: `/services` now `ServicesManager` with Move Up/Down + delete ConfirmDialog + role-aware (viewer/finance read-only, editor no delete); `/services/[serviceId]` now `TierManager` with create/edit/delete/move/is_active + empty state (zero tiers valid); `/menu` now `MenuManager` with section create/edit/delete/move (ConfirmDialog warns items deleted too) + item create/edit/delete/move + `MenuItemForm` (MediaUploadField menu, dietary/allergen checkboxes, ModifiersEditor max 12) + role-aware; previously `ComingSoonPage` placeholder overwritten (no valuable content lost per git show 79de55d).
- Tests `services-and-menus.test.cjs` §1–§5 updated for live constraints plus new §6 reorder/admin UI (duplicate/length guards, MenuManager/TierManager existence, ModifiersEditor cap, no dnd-kit/puck, placeholder gone, `updateServiceTier` order, `createService` race-safe), 676/676

## [2026-09] — Hardening & Landing — Business Mini Website Extended + Platform Parallel Updates (2026-09-24)

### Business Mini Website — Hardening & Landing (2026-09-24)

#### Atomic Instantiation (Migrations 130–131, Stage E/K)
- `db/migration_130_website_category_and_metadata.sql` (`metadata JSONB DEFAULT '{}'` + GIN) and mirror `supabase/migrations/20260921000000` (no rollback in mirrors).
- `db/migration_131_website_atomic_creation.sql` — transactional `create_website_from_template` with `ON CONFLICT (tenant_id) DO NOTHING` race boundary, `creationRequestId` idempotency, pages+drafts+navigation single transaction, `SECURITY DEFINER` + pinned `search_path` + `REVOKE PUBLIC/anon/authenticated` / `GRANT service_role`, plus rollback twin.
- `lib/website-template-registry.ts` 6 canonical templates `id@1.0.0` with `pages[]+navigation` + shim `lib/website-templates.ts`, `lib/website-category.ts` centralized compatibility, `lib/website-hydration.ts` whitelisted `ALLOW_HYDRATION_FIELDS` + `TOKEN_MAP`.
- `lib/actions/website-instantiation.ts` validates auth/`requireTenantContext`/template/version/category compatibility/reserved slugs/bounded retry, then `cloneBlockWithNewIds`→`normalizeBlocks`→`hydrateBlocks`→`validateBlocks`→`supabaseAdmin.rpc`.
- `components/dashboard/website/TemplateGallery.tsx` uses `isTemplateCompatibleWithCategory` + `TemplatePreview.tsx` read-only preview (no clone), desktop/mobile modes.
- `app/dashboard/org/[id]/website/new/NewWebsiteClient.tsx` uses `instantiateWebsiteFromTemplate` + `crypto.randomUUID()` creationRequestId, `derivedWebsiteCategory` + `metadata.business_id`.
- Test: `lib/__tests__/website-atomic-instantiation.test.cjs` (10 checks), `lib/__tests__/website-template-library.test.cjs` (11 checks).

#### Element Editing / Section/Container Controls (Stages G, G2, H1)
- `lib/website-block-edit-schema.ts` whitelisted `isEditablePath`/`getFieldDef`/`setElementValue` with `__proto__` rejection.
- `lib/section-helpers.ts` tokens + `lib/website-blocks.ts` `SectionEnvelope.container` (`constrained|wide|narrow|full`) + `extractSectionEnvelope`.
- `components/dashboard/website/builder/inspectors/SectionInspector.tsx` (visible/hiddenOnMobile/spacing/background/container) with `sanitizeUrl` on image.
- `builderReducer` `UPDATE_ELEMENT`/`UPDATE_SECTION` sanitization, `CanvasBlockPreview` editor overlays (`data-element-path`, `ring-brand-600`) vs `BlockRenderer` `SectionEnvelopeWrapper` outer/inner parity.
- Tests: `website-builder-g.test.cjs`, `website-builder-g2.test.cjs`, `website-builder-h1j.test.cjs`.

#### Stable Reordering (Stage J)
- `builderReducer` `MOVE_BLOCK` splice + history (1 entry) + `isDirty` + selection reconciliation by `blockId`; `BlockPalette`/`CanvasBlockWrapper` Move Up/Down with `aria-label`/`disabled`.
- No `dnd-kit`/`react-beautiful-dnd`/`puck`; `page.tsx` `blocks.map` preserves order (no sort).
- Tests: `website-builder-hj.test.cjs` (12 checks).

#### My Media — Stage I
- `lib/media/my-media.ts` tenant-scoped `cms-media/<tenant_id>/...` bounded `limit:100` + `sanitizeUrl` + UUID/traversal guards, `deleteTenantMedia` tenant-scoped `remove`, no `service_role`, no `media_assets` table, no new bucket.
- `components/dashboard/website/builder/media/MyMediaPicker.tsx` loading/empty/error/retry, `grid-cols-2 sm:grid-cols-3`, `Use`/`Delete` + `ConfirmDialog`, sanitized thumbnails. `MediaUploadField` 3 tabs `Upload | My Media | Direct URL` wired across 5 surfaces.
- No Connected Media (Instagram/Facebook/YouTube) — verified in tests.
- Test: `lib/__tests__/my-media.test.cjs` (12 checks) including multi-tenant isolation and bucket reality.

#### Migration Hygiene (2026-09-24)
- Removed erroneous rollback mirrors `supabase/migrations/20260923000001`/`20260924000001`; canonical rollbacks remain only in `db/`.
- Verified `npx tsc --noEmit --skipLibCheck` 0, `npx eslint` 0, `npm test` **650/650 (36 suites)**, `npm run build` compiled successfully.

#### Parallel Platform Updates (Separate from Business Mini Website core, same landing window)
- Migrations 132 `businesses.business_type` + `business_branches` and 133 `events.subcategory` (business/event taxonomy), 134 `homepage_promotions`, 135 `profile locale` (`next-intl`, `i18n/routing`, `messages/`).
- Capability-driven dashboard modules, branches CRUD, profile navigation, donations/donors UI, event search/filter, proxy/i18n updates.
- Tests: `dashboard-profile-architecture.test.cjs`, `fundraiser-donations-donors.test.cjs`, `i18n.test.cjs`.
- Production migration status: **present in repository, 130–133 verified applied per CURRENT-STATE; 134–135 pending live application (not claimed as live).**

## [2026-09] — Continuity Audit, Digital Products & Door Operations

### Phase 4 Task 4.4: Settings Integration, Consolidated Auth & Integration Suite (2026-09-19)
- Integrated Website Builder entry points into `app/dashboard/org/[id]/website/WebsiteSettingsClient.tsx`:
  - Added "Edit in Builder" action button with `LayoutTemplate` icon for each page row.
  - Added "Visual Builder" header button for quick navigation.
- Consolidated tenant authorization into `checkTenantAccess(userId, organizerId, allowedRoles)` in `lib/entity-auth.ts`:
  - Resolves `entity_members` table and fallback `organizers.user_id === userId` direct owner checks in one shared pure helper.
  - Updated `resolveAndAuthorizePage()`, `getPageBuilderData()`, `getBuilderEmbedOptions()` in `lib/actions/website-builder.ts`, and `app/dashboard/org/[id]/website/builder/page.tsx`.
- Authored automated end-to-end integration test suite `lib/security/__tests__/website-builder-integration.test.cjs`:
  - Validates `checkTenantAccess` role matching, fallback ownership, and stranger rejection.
  - Validates full E2E builder lifecycle: editor draft save (WIP allowed) → draft block reorder → editor publish rejection (`Forbidden: Insufficient permissions`) → manager publish via atomic RPC → live page block update and draft cleanup → draft discard.
  - Validates embed options server-side tenant isolation.
- Registered test suite in `package.json` (**411/411 platform tests passing**).

### Phase 4 Task 4.3: Visual Builder Workspace & State Management (2026-09-19)
- Implemented full three-panel visual builder workspace at `app/dashboard/org/[id]/website/builder/page.tsx`:
  - Left Panel (`BlockPalette.tsx`): Block library drawer with category badges, item counters, search filter, and draggable page tree outline.
  - Center Canvas (`BuilderCanvas.tsx`): Real-time responsive device viewport switcher (Desktop 100%, Tablet 768px, Mobile 375px), inline block reordering (up/down/move), duplication, deletion, selection ring, and validation error pills.
  - Right Panel (`BlockInspector.tsx`): Schema-aware property inspector wired directly to Task 4.2 inspectors.
  - Top Toolbar (`BuilderToolbar.tsx`): Device toggles, Undo/Redo controls with keyboard shortcut hints, Autosave status pill, Discard Draft, Save Draft, and Publish controls.
- Built immutable state manager in `builderReducer.ts`:
  - Supports `ADD_BLOCK`, `UPDATE_BLOCK`, `MOVE_BLOCK`, `DUPLICATE_BLOCK`, `REMOVE_BLOCK`, `UNDO`, `REDO`, `SET_SAVE_STATUS`, `SET_PUBLISH_STATUS`, `DRAFT_DISCARDED`.
  - Past/future history stacks (clamped to 30 states) with dirty tracking.
  - Debounced autosave (1500ms) with in-flight race prevention before publish.
- Authored test suite `lib/dashboard/__tests__/website-builder-canvas.test.cjs` registered in `package.json` (**405/405 tests passing**).
- Built 12 schema-aware property inspector components in `components/dashboard/website/builder/inspectors/`:
  - Standard Inspectors: `HeroInspector`, `FeaturesInspector`, `AboutInspector`, `GalleryInspector`, `TestimonialsInspector`, `ContactInspector`, `FaqInspector`, `EventsEmbedInspector`, `ProductsEmbedInspector`, `FundraiserEmbedInspector`.
  - Legacy Inspectors: `RichTextInspector`, `CtaBannerInspector`.
  - Dispatcher & Helpers: `BlockInspector`, `InspectorField`, `InspectorSection`, `MediaUploadField`.
- Validation parity with server: directly binds to `BLOCK_LIMITS` from `lib/website-blocks.ts` (character counters, limit clamping 1..12, array item caps of 12).
- Draft-tolerant UX: allows saving incomplete blocks with real-time "Required to publish" indicators and validation hints without blocking WIP draft saves.
- Media upload integration: `MediaUploadField` uploads to `cms-media` bucket at `<tenant_id>/...` with image cropping, preview, and direct URL fallback.
- Embed scoping: item pickers strictly filter to items belonging to `tenantId` (`organizer_id === tenantId`), and limit fields are clamped between 1 and 12.
- Authored test suite `lib/dashboard/__tests__/website-builder-inspectors.test.cjs` registered in `package.json` (**389/389 tests passing**).

### Phase 4 Task 4.1: Website Builder Data Model & Server Actions (2026-09-19)
- Implemented `lib/actions/website-builder.ts` with complete Server Actions:
  - `savePageDraft(pageId, draftBlocks)`: Saves WIP drafts to `website_page_drafts`. Authorized for `owner, admin, manager, editor`. Validates basic object shape with string `type` while permitting WIP incomplete blocks.
  - `publishPageDraft(pageId)`: Validates all blocks in `draft_blocks` through `validateBlock()` from `lib/website-blocks.ts`. If any block fails, rejects the entire publish operation with descriptive error and leaves the database untouched. If all pass, calls atomic `publish_page_draft(p_page_id, p_expected_version)` RPC. Authorized for `owner, admin, manager` only (editors strictly rejected).
  - `discardPageDraft(pageId)`: Deletes draft row from `website_page_drafts`, leaving live `blocks` and `status` untouched. Authorized for `owner, admin, manager, editor`.
  - `reorderPageBlocks(pageId, newOrder)`: Reorders blocks within `website_page_drafts` (draft-time operation). Authorized for `owner, admin, manager, editor`.
- Hardened `migration_129_website_page_drafts_and_publishing_guard.sql`:
  - `publish_page_draft` RPC uses `(p_page_id UUID, p_expected_version INTEGER DEFAULT NULL)` with `DELETE WHERE ... AND (p_expected_version IS NULL OR version = p_expected_version)` returning SQLSTATE `40001` on version mismatch to eliminate TOCTOU races between validation and publish.
  - `REVOKE ALL ON FUNCTION public.publish_page_draft FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE TO service_role` to prevent client-side SDK direct calls from bypassing `validateBlock()`.
- Updated `lib/payouts.ts` with strict dual-condition verification gating for organizer payouts (`payment_enabled === true AND status === "verified"`) and business status checks (`is_flagged === false AND status !== "archived"`).
- Authored test suite `lib/security/__tests__/website-builder-actions.test.cjs` registered in `package.json` (**389/389 tests passing**).

### Business Creation Permission Denied Bugfix (`migration_127`, 2026-09-18)
- Resolved PostgreSQL 42501 permission error on `/dashboard/businesses/new` by declaring `ensure_business_organizer()` as `SECURITY DEFINER` with explicit `SET search_path = public, pg_catalog`.
- Preserved least-privilege column grant boundaries on `public.organizers` without re-opening direct caller modification of `is_business_auto_created`.
- Authored canonical migration `db/migration_127_ensure_business_organizer_security_definer.sql`, rollback twin, and mirrored to `supabase/migrations/`.

### Phase 3: Website Design System & Block Catalog (2026-09-18)

**Task 3.1 — `lib/website-blocks.ts` Block Schema & Validation**
- Defined 12 TypeScript block type interfaces (10 standard + 2 legacy `rich_text` / `cta_banner`): `hero` (split/center/video_bg), `features`, `about`, `gallery`, `testimonials`, `contact`, `faq`, `events_embed`, `products_embed`, `fundraiser_embed`.
- Implemented `validateBlock()` with length bounds (title ≤ 120 chars, body ≤ 2000 chars), per-array item caps (max 12), UUID-format validation on `selectedEventIds` / `selectedProductIds` / `selectedFundraiserIds`, and URL safety backed directly by `sanitizeUrl()` from `lib/sanitize-html.ts` — no separate regex, eliminating write-time vs render-time drift risk. Protocol-relative (`//evil.com`) and dangerous scheme URLs (`javascript:`, `data:`, `vbscript:`) are rejected at both layers.
- Implemented fallback `parseBlock()` / `parseBlocks()` for resilient JSONB rendering without hard failures on stored legacy data.
- Six theme palette presets (`default`/`zinc_orange`, `dark`, `slate`, `warm_amber`, `forest`) with `resolveThemeTokens()` and `themeTokensToStyle()` generating CSS custom properties (`--site-primary`, `--site-bg`, `--site-text`, `--site-card`, `--site-border`, `--site-muted`).
- 15 unit tests in `lib/__tests__/website-blocks.test.cjs` (registered in `package.json`).

**Task 3.2 — `lib/website-embeds.ts` Live Embed Block Resolvers**
- `resolveEventsEmbed(block, tenantId, isTeamMember)`: scoped to `events.organizer_id = tenantId`, published-only status gating for public visitors, all statuses with draft badge for team members, optional `selectedEventIds` UUID filter, LIMIT clamped server-side to `Math.min(Math.max(1, limit), 12)`.
- `resolveProductsEmbed(block, tenantId, isTeamMember)`: two-step join `businesses WHERE organizer_id = tenantId → products WHERE business_id IN (...)`. **No `owner_id` fallback** — returns `[]` if no business linked to prevent cross-tenant leakage (DEC-0012).
- `resolveFundraiserEmbed(block, tenantId, isTeamMember)`: scoped to `fundraisers.organizer_id = tenantId` with `deleted_at IS NULL` guard; soft-deleted campaigns never surface.
- All resolvers use `createSupabaseAdmin()` (service-role, bypasses RLS) with explicit `organizer_id` equality — never client-exposed.
- 9 unit tests in `lib/__tests__/website-embeds.test.cjs` (registered in `package.json`), including a multi-tenant cross-contamination regression test confirming Organizer B's public site never surfaces Organizer A's products.

**Task 3.3 — Visual Block Components & Theme Provider Integration**
- Replaced Phase 2's 7-type synchronous `BlockRenderer` with a 12-type `async` Server Component in `components/site/blocks/BlockRenderer.tsx`.
- `HeroBlockRenderer`: center, split, and `video_bg` variants with up to 3 CTAs (all `sanitizeUrl()`-checked), badge chip, and responsive layout.
- `FeaturesBlockRenderer`: 2/3/4-column grid, icon badge background, optional `ArrowRight` link per feature.
- `AboutBlockRenderer` (new): story prose, mission callout blockquote, 2/3-column metrics highlight grid, founder bio card with image.
- `GalleryBlockRenderer`: `grid`, `masonry` (CSS `columns`), and `carousel` (horizontal scroll-snap) layouts.
- `TestimonialsBlockRenderer`: 1–5 star rating filled/unfilled dots, grid/carousel layouts, avatar initials fallback.
- `ContactBlockRenderer` (new): icon cards for email, phone, address, hours; Google Maps link/preview panel.
- `FaqBlockRenderer`: `<details>/<summary>` native accordion inside `rounded-xl` card container.
- `EventsEmbedBlockRenderer`, `ProductsEmbedBlockRenderer`, `FundraiserEmbedBlockRenderer`: async server-side, `await` resolvers, grid/list/banner layout variants, `DraftBadge` for team members, progress bar for fundraisers.
- `DraftBadge` and `SectionHeading` reusable primitives added.
- `tenantId` injected from `tenant_websites.tenant_id` server-side — never trusted from block JSON.
- Design system compliance: `rounded-xl` cards, `shadow-xs` standard, zinc/orange tokens, `var(--site-primary, #c2410c)` fallbacks on all color references, no gradients on interactive elements, no glassmorphism.
- Updated `app/site/[slug]/[[...page]]/page.tsx`: merged `themeTokensToStyle(resolveThemeTokens(...))` with existing `themeConfigToStyle()` for font/radius; passed `tenantId={website.tenant_id}` and `isTeamMember` props to `BlockRenderer`. Theme CSS variables scoped to public site `<div>` — isolated from dashboard/admin layouts.
- Added structural assertion test (§7) in `website-blocks.test.cjs` confirming all 12 block `case` dispatchers, resolver call sites, and theme wiring are present.
- Verified: `npx eslint` exit 0 · `npx tsc --noEmit` exit 0 · `npm test` **339/339 passing**.

### Phase 2: Public Website Rendering Engine (2026-09-17)
- Implemented `checkWebsiteAccess` helper and `/site/:path*` pre-stream route status gate in `proxy.ts`, guaranteeing real HTTP 404s for unlisted/draft sites before Next.js 16 response streaming begins, while enabling authenticated entity members to preview unpublished sites.
- Created standalone route segment layout `app/site/[slug]/layout.tsx` isolating public tenant mini-websites from the platform Navbar and shared footers.
- Built public catch-all dynamic SSR route `app/site/[slug]/[[...page]]/page.tsx` with deterministic homepage resolution hierarchy (`is_home = true` -> `slug = 'home'` -> `sort_order ASC, created_at ASC, id ASC`).
- Built modular Server-Side Block Renderer catalog in `components/site/blocks/BlockRenderer.tsx` for 7 block types (`hero`, `features`, `rich_text`, `gallery`, `cta_banner`, `faq`, `testimonials`) with `isomorphic-dompurify` HTML sanitization via `lib/sanitize-html.ts`.
- Built tenant-branded `SiteHeader.tsx`, `SiteFooter.tsx`, and `DraftPreviewBanner.tsx` components.
- Implemented structured JSON-LD data generators (`WebSite`, `Organization`, `WebPage`), OpenGraph metadata generator, theme CSS variable mapper (`themeConfigToStyle`), and runtime navigation staleness pruning (`filterPublishedNavItems`) in `lib/website-structured-data.ts`.
- Enforced reserved platform slugs (`RESERVED_WEBSITE_SLUGS`) in `lib/website-nav.ts` and `lib/actions/website.ts`.
- Added strict `sanitizeUrl()` helper validating all `href` / `src` block attributes against dangerous schemes (`javascript:`, `data:`, `vbscript:`).
- Authored test suite `lib/__tests__/website-engine.test.cjs` registered in `package.json` (**312/312 tests passing**).

### Phase 1: Business Website Foundation (2026-09-17)

- Authored and deployed `db/migration_125_tenant_websites.sql` and `db/migration_125_tenant_websites_rollback.sql` defining `tenant_websites`, `website_pages`, and `website_navigation` with RLS policies, triggers, and JSONB defaults.
- Authored and deployed `db/migration_126_website_delete_rls_fix.sql` and `db/migration_126_website_delete_rls_fix_rollback.sql` splitting legacy `FOR ALL` policies into `SELECT`, `INSERT`, `UPDATE` (allowing `editor`), and `DELETE` (restricting strictly to `owner`, `admin`, `manager`).
- Implemented server action services in `lib/actions/website.ts` with `requireTenantContext` RBAC verification.
- Built pure navigation tree sanitization algorithms in `lib/website-nav.ts` (`sanitizeNavOnPageDelete`, `sanitizeNavOnPageSlugChange`).
- Added dashboard settings interface at `app/dashboard/org/[id]/website/` supporting site branding, presets, custom themes, header/footer configuration, page management, navigation menu builder, and SEO metadata.
- Added sidebar navigation link to `/dashboard/org/[id]/website` in `app/dashboard/org/[id]/org-nav-items.ts`.
- Added unit and regression test suite in `lib/__tests__/website-foundation.test.cjs` registered in `package.json` (304/304 tests passing).

### Phase 0: Continuity & Documentation Audit (2026-09-17)
- Completed exhaustive codebase and documentation audit.
- Established repository-as-source-of-truth continuity protocol in `AGENTS.md`.
- Authored canonical platform docs: `PRODUCT.md`, `ARCHITECTURE.md`, `CURRENT-STATE.md`, `ROADMAP.md`, `DECISIONS.md`, `DATABASE.md`, `API.md`, `INTEGRATIONS.md`, `SECURITY.md`, and 15 phase execution plans in `docs/phases/`.
- Verified 297/297 tests passing and zero TypeScript compilation errors.

### Digital Products & Marketplace Commerce (`migration_116`)
- Added `products.product_type` (`ebook`, `template`, `audio`, `video`, `bundle`, `software`, `ticket_addon`, `voucher`, `other`).
- Implemented `product_assets` and `product_downloads` tables with signed URLs (~120s TTL) backed by private `product-assets` storage.
- Added `record_product_paid_and_credit` RPC with idempotent webhook handling.
- Shipped public `/products` catalog, flight strips, and `/products/order-confirmation` landing page.

### Offline Door Scanner & Seating Sync (`migration_118`, `119`, `120`, `121`, `122`, `124`)
- Implemented hybrid offline door scanner with IndexedDB (`idb`) local caching and batch sync (`/api/door/sync-offline`).
- Added anti-double-sell multi-seat multi-tier checkout with stale-hold auto-release.
- Shipped organizer-controlled ticket design system and invitation card template builder.
- Added conflict resolution table `ticket_checkin_conflicts` for multi-scanner offline reconciliation.

### Multi-Tenant AI Architecture Foundations (`migration_108`–`115`)
- Deployed schema for `connected_accounts`, `channel_assets`, `customer_identities`, `conversations`, and `messages`.
- Built tenant-scoped AI tool registry with 14 tools (`lib/ai/tools-registry.ts`) and `resolveTenantContext` verification.
- Added `ai_provider_configs` and `ai_tool_invocations` audit logging.

---

## [2026-08] — SVG Seating Engine, Guest Imports & Security Hardening

### Visual Seating & Guest Management (`migration_93`, `98`, `99`)
- Shipped interactive SVG seating canvas with table/seat generators and drag-and-drop builder.
- Added CSV guest list bulk import and attendee lifecycle tracking.
- Shipped AI Seating Assistant for smart table distribution.

### Security Hardening (P0–P2) (`migration_100`–`107`)
- Implemented least-privilege grants revoking blanket `anon`/`authenticated` writes on sensitive tables.
- Hardened signup trigger function and added service-role trigger gates (`trg_on_auth_user_created`).
- Added DOMPurify HTML sanitization across articles and comments to prevent stored XSS.
- Fixed error response leakages by sanitizing internal database errors before returning to clients.

---

## [2026-07] — Organizations, Beneficiary Ledgers & Editorial Audio

### Canonical Entity & Tenant Model (`migration_48`, `58`, `59`, `62`)
- Consolidated organizations and businesses under canonical `organizers.id`.
- Introduced `entity_members` table and `is_entity_member()` security definer function for multi-tier RBAC (`owner`, `admin`, `manager`, `editor`, `finance`, `viewer`).
- Added identity verification submission workflow and encrypted document storage.

### Beneficiary Payouts & Double-Entry Ledger (`migration_50`–`56`, `70`–`73`)
- Added beneficiary claim tokens and dedicated beneficiary payout accounts.
- Shipped immutable double-entry ledger in `recipient_ledger_entries` with atomic credit RPCs.

### Editorial Publishing & NVIDIA TTS Audio (`migration_28`, `35`, `74`)
- Integrated TipTap rich-text editor with category/tag taxonomies.
- Added AI-synthesized speech audio narration via NVIDIA FastPitch TTS with chunking and WAV concatenation.

---

## [2026-06 & Earlier] — Initial Foundation, Events & Fundraising Core

- Bootstrapped Next.js 16 App Router application with Tailwind CSS and Radix UI.
- Implemented core events and ticket sales with Stripe checkout.
- Implemented crowdfunding fundraisers with progress trackers and public donation walls.
- Added dual payment rails supporting Stripe card transactions and NOWPayments cryptocurrency invoices.
- Configured root `proxy.ts` for session refresh and route protection.
