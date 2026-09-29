# Aldriva — Platform Changelog & Evolution History

> **Status**: Verified Historical Record  
> **Format**: Chronological reverse order (Newest first)

---

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
