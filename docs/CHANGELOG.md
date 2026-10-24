# Aldriva — Platform Changelog & Evolution History

> **Status**: Verified Historical Record  
> **Format**: Chronological reverse order (Newest first)

## [2026-10-24] — Courier map provider switch to TomTom Orbis (staging verification pending)

- Provider follow-up: switched shared Leaflet maps from public OSM tiles to the documented TomTom Orbis v2 PNG raster endpoint, with 256px XYZ tiles, zoom 0–22, TomTom/OSM attribution, and only `api.tomtom.com` added to CSP `img-src`.
- The local public key variable is `NEXT_PUBLIC_TOMTOM_API_KEY`; missing configuration and tile failures now have separate visible diagnostics that never include the key. Rider GPS, marker updates, follow/recenter, stop phase, and resize logic are preserved.
- **Verification:** focused map/GPS/courier tests passed 32/32; focused ESLint and `git diff --check` passed. No authenticated map was available to verify a TomTom tile response or rider-marker update. No database or production-setting changes were made.

- Previous provider investigation: the owner reported OSM HTTP 403 responses. Source inspection also showed the old CSP omitted OSM hosts, so the exact contribution of the CSP was not independently isolated in a browser.

- Confirmed that `DeliveryMap` already used Leaflet, OpenStreetMap tiles, and the globally imported Leaflet stylesheet. The site CSP's `img-src` omitted the OSM tile subdomains, explaining the marker-on-white map in source; browser console/network confirmation was unavailable.
- Added only the three OSM tile hosts to `img-src`. The shared map now validates coordinates, has loading/error/retry states, updates markers in place, supports rider follow/recenter, responds to element and orientation resize, and selects the pickup or delivery stop by order lifecycle. It no longer chooses a hard-coded fallback location.
- Existing schema has no business/customer coordinates; maps continue to show only rider location until verified stop coordinates are captured by an approved data workflow. An OSRM helper exists but is not wired to delivery; no road route/ETA or new provider credentials are introduced.
- **Verification:** focused delivery-map, courier GPS/location, and courier server tests passed 32/32; focused ESLint passed. TypeScript is blocked by missing `sharp` and `@aws-sdk/client-s3`. Direct Next build is blocked by missing `@aws-sdk/client-s3`, `jsdom`, and `sharp`. Browser/device and deployed tile verification remain pending. See `docs/phases/phase-3-courier-gps-dispatch.md`.

## [2026-10-24] — Phase 3 courier dispatch and GPS reliability (local working tree; staging verification pending)

- Confirmed the same-origin Geolocation API was explicitly disabled by `Permissions-Policy: geolocation=()`. Enabled same-origin use without changing CSP, and added intentional GPS start/retry, lifecycle/error states, tab-resume behavior, and separate acquisition/upload feedback.
- Authored migration 192 for durable dispatch when a delivery is accepted/preparing with a preparation estimate: five-courier cohorts, a configurable 1–60 minute response window (10-minute default), atomic claim, early assignment without advancing kitchen order status, expiry advancement during courier feed polling, and a guarded rollback. No database was changed; the owner must apply the canonical SQL manually.
- Hardened location writes with courier-session ownership, active-assignment checks, a fail-closed rate limit, timestamp validation, and stale-write rejection. Added scoped no-store customer and business tracking endpoints, dashboard progress, and dispatch retry controls.
- **Verification remains in progress.** Automated device/browser QA and deployed staging acceptance have not been performed. There is no configured push/email notification or road-routing provider; durable offers appear in the existing courier feed, and road-route ETA is identified as unavailable rather than fabricated. See `docs/phases/phase-3-courier-gps-dispatch.md` for limitations and remaining staging checks.

## [2026-10-23] — Website Builder Vercel runtime follow-up 2 (local fix verified; staging verification pending)

- Fresh errors from the newest READY preview show a second `ERR_REQUIRE_ESM` path: `jsdom@27.3.0` → `cssstyle@5.3.7` → `@asamuzakjp/css-color@4.1.2` CommonJS → ESM-only `@csstools/css-calc@3.2.1`. The server-rendered `TemplateSwitchPreview` imports `BlockRenderer`, which reaches `lib/sanitize-html` and this JSDOM chain. Vercel's log record omitted the request path, so exact request correlation remains unavailable.
- Replaced the previous jsdom pin with `26.1.0`; its locked CSS color/calc chain exposes a CommonJS entry point. Extended the sanitizer regression to assert the exact compatible majors/entry point and retain the malicious-HTML sanitization check. Updated Next.js and matching ESLint config to `16.4.3` for Cache Components security fixes and DOMPurify to `3.4.17` for sanitizer security fixes; no sanitizer policy, permission, tenant, service-worker, CSP, or cache-policy code changed.
- The build identifies the builder as Partial Prerender under the existing Cache Components setting. This explains the prerender shell header; a cache hit does not itself establish that tenant-specific data is cached or shared. A local unauthenticated production request redirected to `/login` and emitted no ESM error.
- **Verification on updated packages:** focused builder/block/template-switch suites 39/39; `npm test` 2,734/2,734 across 220 files with no skips; production TypeScript and focused ESLint passed; configured Next.js 16.4.3 Turbopack build passed with 386 pages. Next emitted a warning that Cache Components lacks an explicit `partialPrefetching` setting. Authenticated Vercel browser verification remains blocked because browser access is disabled.

## [2026-10-23] — Phase 2 Website Builder Vercel runtime follow-up (deployed; authenticated QA pending)

- Traced the remaining blank builder response to the server-rendered template-switch preview importing `BlockRenderer` → `sanitize-html` → `isomorphic-dompurify` → `jsdom@29.1.1` → `html-encoding-sniffer@6` → ESM-only `@exodus/bytes` through CommonJS. This was a separate server import path from the earlier client-only canvas preview change.
- Pinned transitive jsdom to 27.3.0, whose lockfile resolves `html-encoding-sniffer@4.0.0`, while keeping DOMPurify sanitization and template previews intact. Added a runtime dependency-chain/security regression and a logged, retryable Website Builder route error boundary.
- **Local verification:** full suite 2,734/2,734; production TypeScript check passed; focused ESLint passed; configured Turbopack build generated all 386 static pages; `git diff --check` passed. The pre-existing focused lint error at `app/m/[token]/page.tsx:54` remains unchanged.
- Commit `0ed6548c053ac543caa1ff4ef3d80cce22fd4539` is deployed READY as `dpl_Hg6gUNRdsPj1ib3ah7u36maLoLFp` at `https://aldriva-5sday95ti-ofiliyoungyz-specs-projects.vercel.app`. Its initial 10-minute error-log query returned zero records but included no authenticated Website Builder request, so deployed runtime behavior remains unverified.
- Authenticated Vercel UI checks remain pending because browser use is disabled in this session. Rich-text verification requires suitable existing staging content or approval for a disposable draft.

## [2026-10-23] — Phase 1A information density, interaction, typography, and Tabler icons (staging working tree)

- Replaced application Lucide interface icons with verified Tabler exports, added a safe dynamic homepage-category icon map, and removed `lucide-react`. Added the permanent icon and readability rules to `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, and DEC-0055.
- Added progressive disclosure for kitchen/courier creation and personnel records, simplified menu and Orders empty-state surfaces, and improved navigation contrast and touch-target readability.
- **Verification:** production TypeScript and Next.js build passed (386 static pages); the full suite passed 2,732/2,732 tests across 220 files; focused ESLint on five representative files had 0 errors and 3 `<img>` advisories; `git diff --check` passed. Authenticated review covered representative admin pages at 1440px/1100px plus organization Menu, Orders, Kitchen, and Promotions empty states. Admin route smoke passed 39/40; `/admin/workforce/sentinel/incidents/[id]` returned HTTP 200 with a `500` body marker, and `/admin/articles` had no row for the screenshot harness to capture.
- Detailed scope and limitations: `docs/phases/phase-1a-platform-ui.md` and `docs/UI-SIMPLIFICATION-AUDIT.md`. The Phase 2 blank Website/Invitation Builder investigation was not started.

## [2026-10-23] — Platform-wide UI simplification (working tree)

- Set the page background as the default content surface and documented a permanent rule against decorative wrappers around ordinary text, forms, filters, tables, lists, and sections.
- Removed default shadows from shared buttons, cards, and page-header actions; made `Section` unboxed by default; flattened redundant page, form, table, empty-state, and nested information wrappers in audited routes.
- Follow-up: flattened organization Menu sections/items/forms and Promotions form sections; improved sidebar label, icon, badge, active, and keyboard-focus contrast across desktop, mobile, organization, admin, settings, and profile-account variants. Recorded WCAG contrast targets in the design and agent instructions.
- **Follow-up verification:** changed-file ESLint passed with 0 errors (29 warnings); final focused ESLint passed with 0 errors (7 warnings); production TypeScript, `git diff --check`, production build (386 pages), and all 2,730 tests across 219 files passed. Protected visual routes remain unverified because no configured QA credentials or saved admin session were available.
- Preserved individual kitchen orders, courier tasks/offers, menu/product/event records, selectable templates, metrics, map/preview canvases, semantic alerts, fundraising palette rules, and template-owned public-site/invitation styles.
- Route inventory, changed components, exceptions, and verification: `docs/UI-SIMPLIFICATION-AUDIT.md`.
- **Verification:** production TypeScript passed; changed-file ESLint passed with 0 errors and 22 warnings; full suite passed 2,730/2,730 tests across 219 files; production build compiled and generated 386 static pages; `git diff --check` passed. Browser review of login, event discovery, and ticket lookup at 375/768/1024/1440px found no overflow or page errors. Authenticated screens could not be visually checked without a local session.

## [2026-10] — Organizer dashboard sanitizer/runtime and generated type incident (2026-10-23; staging fix)

- Split strict URL validation and the article-size limit into dependency-free modules, moved URL-only imports to them, and kept the HTML sanitizer and its security profile intact. Added a Node `>=22.13.0` Vercel runtime requirement for the installed jsdom 29 chain.
- Diagnosed the TypeScript failure as corrupted `.next/dev/types` output with a truncated validator block; no generated output or route source was changed to mask it.
- Added a production-only TypeScript config so corrupted/stale dev type output cannot block production builds; development type checking keeps its existing generated type inputs.
- **Verification:** `npm run build` passed (Next TypeScript phase included); `npx tsc --noEmit -p tsconfig.build.json --pretty false` passed; focused sanitizer/security/website tests passed 18/18; changed-file ESLint and `git diff --check` passed. The local production server returned the expected 307 login redirect for `/dashboard/org/test/overview` with no `ERR_REQUIRE_ESM` log, and the route trace contained none of the jsdom chain packages.

## [2026-10] — Evergreen Envelope Fix Round 2 (2026-10-23; staging QA, working tree)

- Added the Evergreen-only one-tap envelope gate and CSS opening sequence, two builder-configurable cards, preview replay, reduced-motion and skip paths, uploaded-audio control, accessible expanded QR reuse, and preview-safe map links. Existing templates remain on their prior components and behavior.
- **Verification:** production build passed; full project TypeScript passed; Evergreen focused regressions passed 47/47; full suite passed 2,678/2,678 across 213 files; changed-file ESLint and git diff --check passed. Playwright passed 5/5 using localhost:3000, 390×844 touch emulation, production build, and normal/4× CPU recordings at 390×844.
- Evergreen Photos album work is audit/proposal only (DEC-0052). No database migrations were authored or run for this fix round; no event invitations were sent and the protected event remained read-only.


## [2026-10] — Kitchen & Delivery Part 1 and courier Stage B (2026-10-21; working tree)

### Phase 3 cook performance — Stage 3C (2026-10-21; working tree)

- Added the owner Kitchen cook-performance panel with UTC range tabs, per-cook medians and sample counts, inactive badges, empty/loading/error/retry states, and prior-result retention during range changes.
- Embedded one panel in each kitchen-enabled business card, preserving the function's alphabetical order with no ranking. Added a client-callable server-action wrapper and English/French UI messages for the UTC and interval-credit notes.
- **Verification:** seven mocked UI tests pass; full suite passed 2,615/2,615 across 204 files; changed-file ESLint, TypeScript, production build, and `git diff --check` pass. No SQL was run and no migration file was changed.

### Phase 3 cook performance — Stage 3B (2026-10-21; working tree)

- Added a server-only performance loader with per-call owner/admin/manager authorization, service-role business/organizer verification, explicit UTC date bounds, a narrow RPC-field projection, and median suppression below three samples while retaining n.
- Added English and French Organizer panel labels. The loader requires an explicit business ID; Stage 3C supplies it from each existing business card.
- Mocked loader tests cover role/tenant boundaries, invalid ranges, safe RPC errors, projection and median shaping. Updated the existing static latest-migration assertion for migration 187. Verification passed: 2,608/2,608 tests across 203 files, ESLint, TypeScript, and production build. Migration 187 is owner-reported applied; no SQL was executed for this stage.

- Added Reactivate for deactivated cooks/couriers: rotates the hashed invitation with a 14-day expiry, revokes sessions, returns the plaintext link once, keeps couriers offline, disables the pending UI action, and blocks repeat rotation within five seconds.
- Added the courier server flow: role-specific cookies/session validation, invitation acceptance, availability, scoped offers, atomic claim/decline routes, and assigned-courier delivery completion. Offer claims reuse post-persist email/revalidation without a second status update; cash collection requires confirmation for unpaid pay-on-fulfilment orders and is attributed in history.
- Added owner courier management and registered-courier picker with offline warning, on-delivery disablement, and manual rider fallback. Analytics excludes courier paths; courier responses are no-store/no-referrer.
- **Verification:** full suite passed 2,590/2,590 across 200 files (0 failures, 0 skipped), +23 tests and +1 file over the 2,567/199 baseline. TypeScript, changed-file ESLint, `git diff --check`, and `npm run build` passed. SQL race/business-delete scripts are authored for owner-run staging and were not executed; migration 186 is owner-reported applied/verified, with no database tools used here.

## [2026-10] — Restaurant menu promotions Phase 4 (2026-10-20; implementation committed, migration unapplied)

- Added organizer-scoped restaurant promotions in the dashboard, shared promotion pricing, batched public-safe promotion reads, server-side code/order revalidation, and additive optional promotion snapshot details. Migration 184 is authored with rollback, RLS, target limits and a rollback-only SQL check harness; it has not been applied.
- Added promotion prices to menu cards and item sheets, item/section/menu/HTTPS destinations, and a dashboard-managed promotions embed with announcement, banner, and dish-card layouts. The older manual `cta_banner` promotion remains available and is labelled legacy in its inspector.
- Added promo-code checkout reference storage and revalidation, price-change messaging, and promotion savings in order cards, tracking, and notifications. Store product promotions and popup/click analytics remain deferred.
- **Verification:** full suite passed 2,526/2,526 across 197 files; TypeScript, changed-file ESLint, diff check, and production build passed. Screenshots were not possible because local browser use is disabled in the desktop Work settings. No migration or database operation was run; see `docs/phase-4-report.md` for evidence, full SQL, and staging instructions.

## [2026-10] — Menu option groups Phase 3 customer ordering (2026-10-20; working tree)

- Added a responsive customization sheet with shared-rule badges, required-group validation/focus, option details, quantity controls, defaults, and live customer totals. The server remains the pricing authority.
- Added one-tap add for option-free items; cart v3 references current menu data, reconciles removed options, edits and merges lines, and reports quantity caps and changed prices.
- Added keyboard-operable category tabs with scroll-spy/lazy sections and loaded-item search. New option snapshot labels now render group name, kind, and quantity in staff/customer tracking and notifications; old snapshots retain their fallback.
- Added local Playwright screenshots for five ordering flows at 375px and 1440px in light mode. Public-site tokens have no customer dark palette, so dark-theme storefront coverage is not claimed.
- **Verification:** focused storefront suite passed 46/46; `npm run test:chunked` passed 2,507/2,507 across 196 files; standalone TypeScript and changed-file ESLint passed. Full ESLint retains 8 errors in untouched dashboard/e2e files. The isolated production build compiled, then page generation ran out of memory; bundle measurements are directional because the baseline was Turbopack and the feature build was Webpack. No database operation was run.

## [2026-10] — Menu option groups Phase 2 dashboard (2026-10-20; authored, migration not applied)

- Added a reusable option-group library, bilingual starter templates, option editing with images/allergens/defaults/availability/reordering, and normalized item assignment controls with hidden-option and price-override editing.
- Added an explicit JSON-to-library upgrade that uses the backfill converter and an atomic database function; the legacy JSON snapshot remains unchanged. The function reuses an active same-organizer group when its normalized name, selection rules, and ordered option configuration match. Legacy modifiers are now displayed read-only.
- Migration 183 now returns early during option cascades after its parent group has been deleted, validates all input group/assignment organizer and item IDs, adds assignment-delete cleanup for deleted option IDs, and retains the `updated_at` concurrency token plus editor DELETE on assignments only. Its rollback restores manager-only assignment deletion and removes both functions, both triggers, and the added column.
- Added `db/tests/migration_183_checks.sql`, a `BEGIN`/`ROLLBACK` SQL harness for direct-option cleanup, group cascade, identical-group reuse, and upgrade tenant/item guards. It is authored but not executed.
- Shared menu allergens and dietary tags now feed form and action validation; tests compare them against the existing SQL CHECK values.
- **Verification:** `npm run test:chunked` passed 2,497/2,497; Phase 2 regression suite passed 13/13; `npx tsc --noEmit --pretty false` passed; targeted ESLint had 0 errors and 1 unused-variable warning; `git diff --check` passed. The SQL harness was not run. No database operation or migration execution occurred; details are in `docs/phase-2-report.md`.

## [2026-10] — Menu option groups Phase 1 (2026-10-20; authored, awaiting migration rollout)

- Added migration 182 and timestamped Supabase mirror for reusable tenant-scoped option groups/options, per-item assignments, hidden choices, price overrides, bounded cardinality, tenant-matching triggers, indexes, and RLS; added a rollback twin.
- Added an explicit opt-in deterministic backfill with read-only `--verify`, plus fixture inputs for the staging seed and the test suite. Added staging-only seed and narrowly scoped cleanup SQL; neither file has been run.
- Added a shared resolver and pricing path selected by `menu_items.options_source`, so normalized items with no remaining assignments do not resurrect legacy JSON and JSON items ignore normalized assignments. Add-on quantities multiply deltas; variant prices replace the base price and ignore item `promo_price` for this phase.
- Checkout reloads normalized data and snapshots group ID/name/kind and option quantity. Order displays and notifications keep legacy snapshot fallbacks. Added authorized server actions for group/option CRUD and item assignments.
- **Verification:** `npm run test:chunked` passed 2,487/2,487 tests across 196 registered files; TypeScript and diff checks pass; touched-file ESLint has 0 errors and 1 unused-`CatalogCard` warning in `storefront-browse.test.cjs`; both backfill verification fixtures pass. The migration mirror has identical SHA-256. No database query, write, seed, or migration was run.

## [2026-10] — Savannah Phase 3c (2026-10-18; working tree)

- Promo save/render chain fixed via new shared `lib/website-v2-slot-value.ts` (`readSlotValue`/`applySlotValue`) used by both `V2WebsiteEditor.renderControl` and `website-v2-editor-schema.describeControl`; `applySavannahSectionBands` skips `variant === "promo"`; past end-date hides at resolver time (`now?: Date`, date-only parsed as end-of-day UTC); Promo OFF by default, no sample content live.
- Highlights image upload control per item gated to Savannah; builder preview shows first item image instead of letter card; `normalizeKeyedItems` protects image keys via `clampImage`.
- Hero optional focal point x/y (0-100, default 50/50) → `imagePosition`; optional "Show full image" fit (`cover`/`contain`, default cover) → `imageFit` with `object-contain` + `bg-[var(--tf-soft)]` only when contain.
- New `components/site/blocks/CatalogCard.tsx` with `CatalogCard` + `CatalogCarousel` reusing `computeCarouselEnds`; 4:3 image cards, clamp-2, `formatCurrency`, no heart/rating/badge; scroll-snap + motion-reduce + arrow keys. `menu_embed` variant `"catalog-carousel"` accepted by `validateBlock`, emitted by `buildMenuEmbed` for Savannah.
- Hidden header CTA uses `invisible` (visibility:hidden); extracted pure `computeV2HeaderStyle`; Savannah CTA band unlocked with editable `cta.heading`/`cta.button_label`/`cta.button_link` via `template_extras`; defaults `ctx.viewMenuLabel` → `/menu`.
- Isolation diff against a634f04 via fixture-render script: `fc` reports zero differences for Table & Flame, Food Order, Store, DriveLine.
- New tests: `lib/__tests__/savannah-phase-3c-content.test.cjs` and `lib/__tests__/savannah-phase-3c-render.test.cjs` (28 tests, all passing); both registered in `package.json`.

## [2026-10] — Platform design spec and theme foundation (2026-10-17; working tree)

- Added root `DESIGN.md` as the source of truth for platform colors, typography, spacing, shared components, motion guidance, and V1/V2 website and invitation template ownership. Converted `docs/DESIGN-SYSTEM.md` into a compatibility link and updated agent guidance.
- Replaced the Plus Jakarta Sans root font with Geist Sans and Geist Mono in both root layouts, matching the existing design-document direction.
- Added persistent Light / Dark / System theme selection, OS preference tracking, route ownership boundaries, a #09090b dark canvas, semantic dark tokens, and neutral utility compatibility mapping. Updated the footer theme control and shared buttons, section, page-header, and navbar surfaces.
- Fundraising colors remain unchanged. Tests and visual review were not run; dark-theme coverage remains **NEEDS VISUAL VERIFICATION**.

## [2026-10] — Luxe Editorial wedding invitation (2026-10-17; working tree)

- Added `luxe-editorial` as a unified wedding card/page pair, with a custom photo-led page composition over the existing shared invitation blocks and an editorial full-bleed hero/gallery presentation.
- Added conditional formal invitation, event, schedule, venue/map, gallery, and closing sections with French system copy. Existing organizer-managed RSVP remains the shared, token-authorized action flow; preview remains disabled for submissions.
- Added a 900×1200 standalone card variant to `InvitationCardRenderer`; the card PNG uses published hero artwork only, preserves its existing token guard, and omits guest-identifying text.
- Added migration 181 and rollback to seed the existing invitation card catalog row. The SQL is authored but not applied live; no commit was created.
- **Verification:** browser preview checked at 320/375/390/430/768/1440px with no horizontal overflow and hero/gallery reaching the mobile edges; standalone card preview rendered at 432×576 without overflow. French system labels and disabled preview RSVP were present; no public RSVP form or browser JS exceptions appeared. Focused invitation suites passed 138/138; touched-file ESLint exited 0 with 10 existing `<img>` optimization warnings; TypeScript had no invitation errors but reported 52 Storefront translation-key errors, and the production bundle compiled before failing on those types. The 190-file test set passed 2,356/2,382; the 26 failures are in pre-existing Storefront/commerce work. No live token or RSVP was tested; migration 181 remains unapplied.

## [2026-10] — Botanical Reverie wedding invitation (2026-10-16; working tree)

- Added the selectable `botanical-reverie` wedding page/card pair to the code-owned page registry, unified picker, and local EN/FR name dictionaries. Its local SVG sample artwork keeps preview rendering independent of remote sample image hosts.
- Added a bespoke envelope gate with open/skip controls, responsive split editorial hero, custom paper/stationery composition, shared event-detail/schedule/map/gallery/RSVP blocks, and decorative bloom motion that honors reduced-motion settings.
- Added a portrait botanical card variant through `InvitationCardRenderer` and reused its pure component for the token-guarded card PNG route. Card export uses published snapshot artwork only and does not expose guest-specific names.
- Added database seed/rollback migration 180 and updated invitation engine authoring documentation. Migration not applied live; no commit created.
- **Verification so far:** TypeScript reports the pre-existing commerce translation-key failures; final invitation-only diagnostics, focused tests, lint, and viewport QA remain pending.

## [2026-10] — Invitation custom composition and bounded effects (2026-10-16; working tree)

- Added the first custom page composition for `romantic-envelope`, selected through the typed template definition registry. Its page component is loaded through an explicit literal-path `React.lazy` allowlist; Suspense and error fallback preserve the shared block canvas. The other five page templates continue using shared blocks and theme/config variants.
- Added typed, bounded `envelope-reveal`, `scroll-reveal`, and `falling-petals` effect configuration; reduced-motion support, visibility-safe reveal defaults, and a 12-petal ceiling. The builder renders effect controls only when the selected template declares support.
- Preserved the shared server action boundary: the custom page receives validated page data/layout and shared block children, while live RSVP callbacks remain optional and are omitted from preview/shared/sandbox rendering.
- Updated template authoring documentation. No schema migration or live DB write was needed; migration 178 already stores layouts/snapshots.
- **Verification:** focused invitation suites passed 141/141; changed TS/TSX ESLint exited 0 with six image-element warnings; `git diff --check` passed. Browser sandbox checked all six designs at 375px and 1440px without horizontal overflow; envelope reveal and French gate copy passed, with no JS exceptions. One sample Pixabay audio URL was blocked by the sandbox media CSP. Full TypeScript/build currently fail on unrelated commerce translation-key errors; private guest tokens and live RSVP were not used.

## [2026-10] — Invitation template registry and configuration validation (2026-10-16; working tree)

- Added the code-owned `lib/invitation-template-registry.ts` for stable page IDs, versioned definitions, rendered-sample preview metadata, default themes/block order, supported sections, customizations, and effects. The legacy invitation catalog now projects from this source.
- Legacy template normalization now consumes registry metadata. Invitation draft layouts have a narrower schema than business pages: unknown block types, duplicate IDs, unsafe object keys, undeclared `$bind` paths, non-RSVP invitation actions, and invalid envelope transition settings are rejected.
- Added a code-owned invitation block-to-component map and registry-driven design-control visibility. The envelope reveal accepts a bounded duration and honors reduced-motion preferences. Added the missing EN/FR Romantic Envelope name keys.
- No database migration was needed; JSONB layout storage and snapshot support already exist in migration 178. No live migration or database write performed.
- **Validation:** pending final registry/adapter tests, TypeScript, lint, full test suite, and build. Browser visual QA remains open.

## [2026-10] — Shared JSON page composition (2026-10-16; working tree)

- Added canonical `{ version, global_theme, layout_blocks: [{ id, type, content }] }` validation/adapters and invitation legacy-template conversion with explicit allowlisted bindings.
- Added reusable invitation hero/story/details/gallery/schedule/music blocks, an RSVP/business-lead Action Portal, and `UniversalPageRenderer` for invitation and existing business blocks. Published invitations and the host preview use the new dispatcher; the host iframe click selects the mapped builder section; business site rendering unwraps canonical blocks back into the existing secure block renderer. Live invitations retain guest seating/QR passes and calendar exports.
- Authored migration 178 (+ rollback and timestamped forward-migration mirror) to add JSONB layout columns and project existing website block arrays into the canonical envelope. Migration is not applied to a live database.
- **Verification:** `npx tsc --noEmit --skipLibCheck` passed; touched-file ESLint passed with 0 errors and 4 `@next/next/no-img-element` warnings in invitation image blocks; `git diff --check` passed. No test suite or browser review run, and no live database migration applied.

## [2026-10] — Store completion, Milestones 3 & 4: cart, checkout, density (2026-10-16; working tree)

- Multi-item cart: `lib/store-cart.ts` external store (per-slug localStorage, 12-item/100-qty bounds), `StoreCartDrawer` (floating button, dialog drawer, quantity/remove, review-then-pay, empty/error/conflict states), quick-add on carousel cards (opt-in, sold-out disabled) and detail-page Add button. Single-product Buy Now and the menu-ordering cart are untouched.
- Unified checkout: shared `lib/store-cart-checkout.ts` validation (tenant, status, stock, live Stripe prices, single currency, online-payment gate, promo) backs `POST /api/checkout/cart` (N pending `product_orders` snapshots + one multi-line session via server-computed `price_data`, session id stamped) and `POST /api/checkout/cart/validate` (priced review, writes nothing). Webhook `product_cart` fulfillment with charged-total guard, per-row idempotent flips, per-row failure alerts, and single promo burn. Cart-session lookup mode + multi-item site confirmation, both tenant-bound.
- Promo backend (migration 177, authored not applied): `promo_codes` table + `apply_promo_use()` RPC + RLS + rollback/mirror twins; percent-XOR-fixed math with windows, caps, minimums, currency gates, and tests. Owner code-management UI deferred to dashboard work; crypto carts, tax/shipping engine, unified fulfillment dashboard, refunds automation, and variants explicitly deferred (see phase-06 §13).
- Template editing (M4): V2 `shop.density` slot (`number` kind) with `storeBrowsePageSize` extras override honored by preview and publish; save/reload/publish consistency covered by tests; Food Order and legacy tracks regression-tested.
- **Verification:** new `store-cart-checkout` suite 19/19; full registered list 2,356/2,356 (189 paths, 5 batches); `npx tsc --noEmit`, touched-file ESLint (0 errors, 2 pre-existing webhook `req` warnings), `git diff --check` clean; `npm run build` passed. No live Stripe, browser QA, or DB write.

## [2026-10] — Store completion, Milestone 2: shop, detail, checkout return (2026-10-16; working tree)

- Shop sorting (Featured/Newest/Price ↑↓) via new pure `sortBrowseItems` (unpriced/undated sort last, stable), opt-in `sort` prop on `StorefrontBrowse` so Food Order ordering is untouched; `numericPrice` (Stripe amount) and `created_at` (new resolver projection) feed the sort. Category reuse: `getOwnerProductCategories()` + datalist suggestions in both product forms, no new table.
- Multi-image detail gallery (`StoreProductGallery` with thumbnail group, `aria-pressed`); site-local checkout return (`siteSlug` validated against published Store tenancy in `/api/checkout/product`, platform fallback); new site-local `app/site/[slug]/order-confirmation` page binding the order to the site tenant and polling the existing buyer-proofed lookup; `proxy.ts` pre-stream `checkStoreProductAccess` for product slugs.
- New suite `lib/__tests__/store-milestone2.test.cjs` (14 tests, registered). One task-mandated pin update in `storefront-browse.test.cjs` (projection now includes `created_at`).
- **Verification:** new suite 14/14; affected suites green; full registered list 2,337/2,337 (188 paths, 5 batches); `npx tsc --noEmit`, touched-file ESLint (0 errors, 4 pre-existing `<img>` warnings), `git diff --check` clean. No migration or database write. Browser QA and live Stripe verification remain open.

## [2026-10] — Store completion, Milestone 1: products_embed hardening (2026-10-16; working tree)

- `validateBlock(products_embed)` now preserves valid Store browse flags (`categoryTiles`, `siteLocalProductDetails`, `allowLargeCatalog`, `browsePageSize` 1..24) instead of stripping them; non-boolean/non-numeric values are rejected, absent keys stay absent. `previewProducts` remains render-only and is never persisted. `parseBlock` fallback mirrors the same preservation leniently.
- Products inspector gains an owner-friendly "Products Shown at Once" control plus a note that category tiles and site-local details are template-managed. Hero inspector gains Tagline and Background Color controls; badge limit corrected 100→50 to match the validator. Gallery alt/caption limits corrected to 200/300.
- New suite `lib/__tests__/store-products-embed-validation.test.cjs` (13 tests, registered in `package.json`).
- **Verification:** new suite 13/13; affected suites 113/113; full registered list 2,323/2,323 (187 paths, 5 batches); `npx tsc --noEmit`, touched-file ESLint, and `git diff --check` clean. No migration or database write. Browser QA and live Stripe verification remain open.

## [2026-10] — Public Site Design System (PSD), Stage 3 Store template (2026-10-16; working tree)

- Added Store v1.0 to the new V2 gallery after Food Order; its `warm-gold` manifest default remains overridable through the existing public accent metadata. Legacy templates remain resolvable.
- Added Store Home, Shop, Contact, and tenant-scoped product detail rendering under `/site/{slug}/products/{productSlug}`. Empty active catalogs omit Store Shop navigation/page content. The shared browse search/filter UI displays real product categories only, and Store product cards link to the local detail route.
- Product details show a safe optional image, owner copy, `formatMoney` price display, and stock state. Buy now is gated by the existing online-payment feature state, product status/stock, Stripe price retrieval, and exact site/Stripe currency match; the fallback links to Contact. The existing product-checkout API is reused with only name, email, and quantity fields.
- Added owner-editable trust and fulfilment text through bounded `template_extras`; testimonials remain owner-supplied and hidden empty. Added neutral EN/FR gallery examples with no fabricated prices, photos, or categories. No new block type or schema migration was introduced.
- **Verification:** focused suites 95/95; full registered list 2,293/2,293 (184 existing test paths, 10 batches; five absent seating/venue paths excluded); `npx tsc --noEmit` and touched TS/TSX ESLint passed. No owner browser QA, live database check, or Stripe test-mode checkout was run. Existing checkout success/cancel URLs still point to platform `/products` routes.

## [2026-10] — Public Site Design System (PSD), Stage 1 Foundation (2026-10-15; working tree)

- Added a `.public-site` scoped token layer for typography, spacing, radii, colors, cards, buttons, and focus states without changing `:root`, global body typography, or Tailwind base. Migrated shared public blocks, storefront/order/reservation views, and site headers/footers to the shared roles and Plus Jakarta Sans. Template heading fonts now flow into block headings.
- Made hero imagery and logos optional for publishing. Missing hero media produces text-only content; business name remains the logo fallback. Added six readable accent palettes with metadata override and manifest fallback; existing Table & Flame and DriveLine keep their current accents.
- Removed category compatibility as a V2 gallery/server creation gate. Added a read-only live menu/products catalog adapter that hides unsupported or empty catalog slots/pages/nav/actions. Services and fleet adapters remain unsupported. V1 category filtering is unchanged.
- Updated gallery previews to use the linked owner's identity and neutral bilingual sample copy. Samples remain preview-only and do not enter published output or saved owner content. No new food/store template was started.
- **Verification:** affected website/public-render suites passed 266/266; full registered `npm test --script-shell=pwsh` passed 2,286/2,286 across 204 suites; ESLint on touched files and `npx tsc --noEmit` exited 0; `git diff --check` clean. Authenticated browser and live database verification remain outstanding. No migration or database write was performed.

## [2026-10] — Phase 4 addendum: "Ordering & payments" panel in website builder (2026-10-13; working tree)

- Added `OrderingPaymentsPanel` accordion panel to the v2 website editor. Category-agnostic: shows the feature-kind offerings the linked business's catalog allows. Toggles: online_ordering, pickup, delivery, online_payment. Reads/writes via the existing validated `updateBusiness` path in `lib/actions/businesses.ts` — no new column or table.
- **Fulfilment rule added to `resolveStorefrontFeatures`:** ordering resolves to `false` when online_ordering is ticked but neither pickup nor delivery nor delivery_to_customer is ticked. Panel and Edit-business form both show a `FulfilmentWarning`. Existing sites with offerings unset → result unchanged.
- **Live status lines:** each toggle shows "Live" or "Needs setup — <reason>" via `computeFeatureStatus`. Features not built in the active template are suppressed from the panel. `resolveStorefrontFeatures` extended with `status` and `reasons` fields.
- **Live updates + preview channel:** changes write immediately (no draft/publish); preview receives `"update_offerings"` postMessage and re-resolves features live. Amber ordering notice banner added to preview when ordering is live (EN/FR).
- **Role gating:** owner/admin/manager toggle; editor/viewer read-only. Multiple linked businesses: earliest-by-created_at (same rule as website category derivation); panel names the business.
- **EN/FR i18n:** all new strings in `messages/en.json` and `messages/fr.json` under `BusinessOfferings` and `Storefront` namespaces.
- **New test file:** `lib/__tests__/phase4-ordering-payments-panel.test.cjs` (8 tests). Registered in `package.json`.
- **Pre-existing bug fixes:** `event-import-removal.test.cjs` — `/import/i` was too broad, catching French "Importez" in music link translations; narrowed to event-import-specific patterns. `org-dashboard-modules.ts` Orders nav check — was using `resolveStorefrontFeatures` (causing nav to hide with no fulfilment method); now uses direct `offerings.includes("online_ordering")` (nav access ≠ storefront live state).
- **Verification:** ESLint clean, `tsc --noEmit` clean, `npm test --script-shell=pwsh` 2069/2069 (full suite, pending confirmation). Build and browser review not run.

## [2026-10] — Phase 3.1 menu interaction fix (2026-10-13; working tree)
- Root cause: the client menu grid rendered only after a search/chip tap, so default-view dish cards were dead static markup and clicks did nothing on every site. The grid is now interactive right after mount (static markup remains the pre-mount/no-JS output). Gating unchanged: unticked sites browse and open dishes with no ordering UI.
- Added real render coverage (react-dom/server for legacy/full/undefined-config shapes; jsdom client render proving buttons exist pre-engagement, a click opens the sheet, and throwing localStorage never breaks the menu).
- **Verification:** website+ 220/220, invitation 351/351 (14 files), org-nav 96/96 (7 files); `tsc`/`eslint` clean. Only known failure: pre-existing `event-import-removal`. Browser hand-check pending.

## [2026-10] — Phase 3 online card payment for orders, slug fix and money helper (2026-10-13; working tree)
- Slug fix: production "ams-bidjan" came from strip-before-lowercase in `ensure_business_organizer()` (migrations 58/127); future rows fixed in migration 173 (lowercase-first + accent folding), all JS entity generators routed through the hardened `lib/slug.ts` (length cap, fallback). No existing slug rewritten.
- USD-only online payment: `resolveStorefrontCurrency` chain documented; one-off `db/data_fix_001_*` USD backfill (NOT run, XOF sites excluded); `lib/money.ts` minor/major helper for new payment code only.
- Migration 173 (NOT applied): `payment_expires_at` + unique `(provider, provider_reference)` partial index on orders; no new status value (pending+unpaid expresses awaiting).
- `online_payment` owner offering + `onlinePayment` gated feature (capability or live ordering + tick + built + USD); checkout Pay online vs pickup/delivery choice; PaymentIntent + existing Stripe Elements flow; webhook-only paid truth with idempotent flip, tenant/amount/currency match and reconciliation alerts; owner list shows Paid/Awaiting/Expired/To collect with read-time expiry (no cron).
- **Verification:** website+ 216/216, invitation 351/351 (14 files), org-nav 96/96 (7 files); `tsc`/`eslint` clean. Only known failure: pre-existing `event-import-removal`. Build/browser/live-Stripe not run.

## [2026-10] — Phase 2b-2.2 ordering hardening (2026-10-13; working tree)
- Added migration 172 (files only, NOT applied): widens `notifications_type_check`/`notifications_related_type_check` to the union of every value ever allowed (44/116/171) plus code-sent `related_type 'organizer'`; nothing dropped. `db/` forward, rollback twin restoring 171, and byte-identical `supabase/migrations` mirror.
- Moved order logic to `lib/order-submit.ts` (`submitOrderRequestWithClient(input, admin)`); the `"use server"` action now takes only serializable input and creates the admin client itself. Tests target the internal function.
- Unknown `selectedOptionIds` are rejected with `unknown_option` (previously silently dropped); the cart shows a specific stale-option message. Static `db-table-references` test pins every code table name against `db/` (one grandfathered miss: `guests` count in the event overview page).
- **Verification:** touched suites green (website set 205 incl. 2 new, invitation 14 files 351, org-nav 7 files 96); `tsc`/`eslint` clean. Full-suite known failure unchanged: `event-import-removal` (fr.json music copy, fails on clean HEAD too).

## [2026-10] — Phase 2b-2.1 ordering reconcile and harden (2026-10-13; working tree)
- Reconciled migration 171: `supabase/migrations/20261012000002_migration_171_orders.sql` now byte-matches `db/migration_171_orders.sql` (`website_id REFERENCES public.tenant_websites(id)`); rollback twin verified against the migration 116 baseline. Fixed `lib/actions/orders.ts` to resolve slugs via `tenant_websites` directly (no `websites` table exists) with an injectable admin override for tests; moved pure phone validation to `lib/order-phone.ts` so the `"use server"` module exports only async functions and types.
- Hardened access and navigation: org Orders page allows owner/admin/manager/editor/finance only (viewer removed); business Orders module hidden with `routeExists: false` (same as Reservations); org Orders nav now requires the shared resolver's `ordering` (capability + `online_ordering` offering + built `menu_order`), with offerings plumbed from layout through all three nav surfaces. Updated `stage17` latest-migration pin 168 → 171.
- Replaced source-text assertions in `phase2b2-cart-and-orders` with mocked-`submitOrderRequest` behavior (tampered price, sold-out, inactive, foreign-tenant, delivery without offering, duplicate idempotency, invalid options, honeypot, rate-limited) plus failing-channel dispatcher tests; added Table & Flame `menu.order-buttons` real-block and unticked-site-unchanged tests plus the CI→XOF currency test.
- **Verification:** ESLint clean on touched files; `npx tsc --noEmit` clean; touched suites 169/169 (phase2b2 39, org-modules 27, business-offerings 11, website-content-actions 23, stage17 14, website-blocks 15, website-template-v2 40). Full `npm test` 2015/2018 with 3 failures: 2 fixed by this task, 1 pre-existing `event-import-removal` fr.json `import` substring (invitation music copy, out of scope/prohibited). Build and browser review not run.

## [2026-10] — Phase 2a business offerings, storefront gating & hours (2026-10-12; working tree)
- Added an additive, unapplied migration 169 for stable-key `businesses.offerings text[]`; the planned orders migration number shifts to 170. Existing row-level RLS policies remain unchanged.
- Added a business-type offering catalog with category fallback, localized labels, capability-aware defaults, server-side key validation, and create/edit checklists. A shared resolver now requires allowed capability, owner selection, and a feature actually emitted by the template before exposing ordering, delivery, pickup, or reservations.
- Wired linked-business classification and offerings into v2 create/editor/public resolution; selected factual offerings reuse the existing features block. Template CTA/navigation and organization/business navigation suppress unavailable or unbuilt features.
- Added normalized weekly hours and a single localized current-day footer line with overnight support; kept the weekly schedule in the contact section and retained `today_tag` as optional owner highlight copy.
- Custom Business uses the generic offering catalog even when paired with a specialized category. The rental CTA keeps `/contact` and uses localized availability-enquiry copy instead of implying an unbuilt booking flow.
- **Verification:** focused Phase 2a suites 86/86; selected website suites 296/296 across 25 test files; invitation suites 322/322 across 14 files; organization/navigation suites 47/47 across three files; `npx tsc --noEmit` and ESLint on touched TypeScript and test files passed. Migration 169 was not run; build and authenticated browser checks were not run.

## [2026-10] — Website V2 server-action export compliance (2026-10-11; working tree)
- Moved the pure buildInitialContentFromOrganizer helper out of lib/actions/website-v2.ts into lib/website-v2-initial-content.ts, leaving the action module with async runtime exports and type declarations only.
- Added a regression test to the already-registered lib/security/__tests__/website-content-actions.test.cjs; it scans module-level "use server" files under lib/actions and app and rejects non-async runtime exports. The scan covered 19 modules and found no other violation.
- Verification: website and invitation selections passed 582/582 tests across 81 suites; tsc --noEmit passed; ESLint passed with no errors or warnings. npx next build --webpack stopped before compilation because SWC could not canonicalize jsc.baseUrl(C:\Users\Youngyz\aldriva-staging) (Windows Access is denied, OS error 5).

## [2026-10] — Website V2 template create flow, Stage 4B-3 (2026-10-11; working tree)
- Replaced the organization website-create route's legacy blank/business/template wizard with category pills and compatible v2 flagship cards. The organizer's mapped category is selected initially; unsupported categories show “No templates for this category yet.” Existing websites continue to redirect to the overview, and editors have disabled create buttons.
- Cards render the resolver's sample-filled Home page through `BlockRenderer`, v2 header/footer, and locked theme variables. Embed blocks receive no tenant ID and render their empty states, avoiding live embed queries in this gallery. The inert preview data is never passed to a save action.
- Creation calls `createWebsiteFromV2Template` with the route organizer ID and only `websiteCategory` plus a retry-stable `creationRequestId`; action failures are mapped for the user, and success opens the organization builder route. Existing legacy gallery files remain in the repository but are not linked by the create route.
- No migration, table, block type, invitation edit, `proxy.ts`, or `package.json` edit. New direct-run suite: `lib/__tests__/website-v2-create-flow.test.cjs`. Two legacy assertions were updated to expect the v2 create route while continuing to cover the legacy action/gallery separately.
- **Verification:** the combined website/invitation selection and direct-run v2 suites passed 581/581 across 81 suites. `tsc --noEmit` passed; ESLint passed with 0 errors and 0 warnings. `npm run build` stopped before compilation because SWC could not canonicalize `jsc.baseUrl(C:\Users\Youngyz\aldriva-staging)` (Windows `Access is denied`, OS error 5). Authenticated browser review remains unverified.

## [2026-10] — Website V2 form-first editor, Stage 4B-2a (2026-10-11; working tree)
- The organization website-builder route now selects a v2 editor for valid flagship metadata before the legacy pages-empty redirect; v1 sites continue through the existing builder. V2 uses numbered accordion sections and real-content summaries, typed controls derived from emitted template slots, an emitted-pages-only preview tab bar, device toggle, save status, publish checklist, and a read-only Template row.
- Added a tenant-authorized menu-choice action which derives `tenant_id` from `tenant_websites`, checks `checkTenantAccess`, and queries active menu items through tenant-owned sections. Added a same-origin iframe preview route and strict message channel; preview samples are used only to resolve/render the preview and the editor normalizes its real content document before save.
- `lib/draft-save-queue.ts` gained opt-in stale-draft pausing for the website editor. Its existing default behavior and state shape remain unchanged for invitation builders.
- No migration, table, block type, invitation file, `proxy.ts`, or `package.json` change. New hermetic tests are run directly (not registered in the explicit `npm test` list because this task prohibits `package.json` changes): editor schema, preview channel/queue, and tenant-scoped menu-choice tests. Authenticated browser visual parity remains unverified; the editor-side resolver renderer may differ visually from the public `BlockRenderer`.
- **Verification:** invitation and website suites passed 573/573 across 81 suites; `tsc --noEmit` passed; ESLint passed with 0 errors and 0 warnings. `npm run build` stopped before compilation because SWC could not canonicalize `jsc.baseUrl(C:\Users\Youngyz\aldriva-staging)` (Windows sandbox access denied, OS error 5).

## [2026-10] — Invitation music links + expandable QR codes (2026-10-10, uncommitted; persistence follow-up 2026-10-11)
- **2026-10-11 UI follow-up:** only Spotify and SoundCloud remain selectable link providers; Apple Music and Audiomack legacy records are filtered at read time with a one-time builder notice. No data migration is needed. Desktop builder columns now allocate a 480–520px form and fixed 640px preview; palette hex values are normalized before rendering. Story content uses the existing `wedding_story` JSONB array for up to four captioned/text chapters, and failed story images are hidden. Current layout/color/story browser QA and quality checks are pending.
- Music links remain validated and capped at three; migration 167 (+ rollback and mirror) adds a nullable `JSONB music_links` column with no SQL type or constraint. A real save/reload in the configured staging app verified the column and a Spotify `?si=` link. The CLI is not linked here, so migration-history state and production schema remain unknown; the prior “not applied anywhere” status is superseded by the staging schema check. Uploaded audio remains unchanged. Spotify and SoundCloud SDKs/controllers load before the tap; their synchronous pill calls run only under user activation, and playing state follows provider events. SDK failure/timeout shows an unavailable state and opens the validated URL externally. The pill moves above the first-visit consent prompt on narrow screens. Apple Music MusicKit has a supported custom-player API, but needs a developer token and listener authorization absent here; Audiomack offers OAuth stream resolution but no documented embed-control API or app integration. Both remain external-only.
- Real-browser findings: Spotify's API loader fetched `embed-cdn.spotifycdn.com`, missing from `script-src`; the exact host was added. Provider iframe origins were added to `frame-src`, and the preview iframe now delegates autoplay with `allow="autoplay"`. No `connect-src` or `img-src` widening was needed. Spotify and SoundCloud play/pause events were verified in headless Chrome on the guest route and within `InvitationDevicePreviewFrame`. SoundCloud emitted `AbortError: signal is aborted without reason` from its widget bundle when the test paused playback; the corresponding pause event arrived and the canceled HLS request was expected.
- QR overlays now render inline SVG from the unchanged payload in every template. The Black Tie variant's enlarged image previously depended on `api.qrserver.com`, which is not allowed by this app's `img-src` policy; that external image path was the cause of the blank enlarged QR, not a canvas mount or resize issue. The original RSVP-section QR footprint is preserved, and tapping the enlarged QR closes the dialog.
- **Browser QR verification:** headless Chrome mounted the real component; the trigger SVG was 96×96 and the modal SVG was 480×480 with nonempty paths, no image/canvas, a white panel, no CSP violations, and no change to the 164px RSVP section height.
- **Persistence follow-up:** source confirms shared builder state → autosave payload → validated server-action upsert → draft reload. The collapsed summary previously ignored links, and sample preview audio previously overrode link-only provider playback; both are fixed. A server-action regression test covers save/load and missing-column errors. In real headless Chrome, a Spotify link survived reload, the summary showed a link count, and the guest preview pill changed to Pause only after the Spotify playback event; the pre-existing Apple test link was restored after the check.
- **Persistence verification:** targeted ESLint and `npx tsc --noEmit` passed; `npm test` passed 1,803/1,803 across 185 suites; the production build passed. No commit made.
- **Verification:** targeted ESLint exit 0; `tsc --noEmit` exit 0; `npm test` 1,798/1,798 across 184 suites; `npm run build` exit 0. Headless Chrome verified provider play/pause events and stream requests for a real Spotify track and SoundCloud URL, plus Spotify's unavailable state and validated external-link fallback when the SDK was deliberately blocked. QR SVG path and layout checks also passed. Headless verification confirms provider-reported playback and media requests, not human-audible output from physical speakers. No commit made.

## [2026-10] — Staff Round A2: labels, names, hashed invitation tokens (2026-10-10)
- Migration 166 (`db/migration_166_invite_token_hash.sql` + rollback twin, byte-identical supabase mirror): **applied on staging by owner; production has none. A2 adds labels, names and hashed invitation tokens; no badge minting or scan changes yet.**

## [2026-10] — Staff Round Phase A1/A1b: staff schema, badge hashing, grant hardening (2026-10-10)
- Migration 164 (`db/migration_164_event_staff_labels_badges.sql` + rollback twin, byte-identical supabase mirror) and migration 165 (`db/migration_165_event_staff_badge_hardening.sql` + rollback twin, byte-identical supabase mirror): **both applied on staging by owner; production has neither. No app code changed in A1/A1b.**

## [2026-10] — Invitation Round 5, step 3d: template display names & device preview frame (2026-10-10, committed as c16fbbc)
- Registered authoritative display names (EN: Aurora, Confetti, Midnight, Atelier, Cover Story / FR: Aurore, Confetti, Minuit, Atelier, En couverture) directly on `UNIFIED_INVITATION_TEMPLATES` with single-source resolution.
- Rebuilt builder preview frame as a dedicated device component: iPhone-style CSS chassis (rounded bezel, dynamic island, home indicator, 390x844 logical screen, no fake Safari chrome) and plain browser desktop frame.
- Scaled frame with `calculatePreviewFitScale` (fitting available width and height) and sized wrapper to scaled bounds to eliminate horizontal scrolling.
- Verified with ESLint 0 errors, `tsc --noEmit` exit 0, production build exit 0, full suite **1,654/1,654 across 146 suites**.

## [2026-10] — Invitation Round 5, step 3c: visual round 2 & unified picker (2026-10-10, committed as 1991ee0)
- Moved the template-tile card preview to a small portrait crop in the tile footer, keeping Black Tie and Editorial page date/venue content unobstructed. The crop uses the selected card template's own art; only Cover receives the event hero.
- The type section now collapses after confirmed changes and shows the current type when collapsed. The template section subtitle resolves localized display names through the unified registry.
- Added tests for the portrait card inset and the collapsed type/template summaries. Verified with ESLint 0 errors, `tsc --noEmit` exit 0, production build exit 0, full suite **1,653/1,653 across 146 suites**.

## [2026-10] — Invitation Round 5, step 3b: builder UX fixes (2026-10-09, committed as 09f9470)
- Accordion sections close on repeat click without page jumps; gallery supports bounded multi-file uploads with per-file progress/errors and existing image processing; HEIC copy, picker wrapping, and Publish readiness labels were corrected.

## [2026-10] — Invitation Round 5, step 3: Cover template (2026-10-09, committed as 1c7dbdb)
- Cover pair (`cover@1.0.0`, code-owned, no migration): code-resolved card variant (empty fixed background by design, lower-third slots, `heroDim: 0.72`) + `InvitationTemplateCover` page (full-bleed hero with focus, brightness filter + solid panel instead of gradient scrim, six standard anchors, shared mode, same data contract; panel contrast white 15.7:1 / zinc-200 12.4:1 / amber-200 12.6:1 worst-case, all WCAG AA).
- Guest card hero reads the PUBLISHED snapshot only (never draft edits); unpublished Cover renders the solid palette fallback. `card.png` pre-fetches with `AbortSignal.timeout(3000)`, storage-host allowlist, single re-validated redirect hop, image/* + 5 MB cap — any failure logs and renders the fallback identically.
- Hero pipeline unchanged (processed 1600px via `InvitationImageUploadField`; schema storage-URL allowlist at save); builder shows an explicit "Add a cover photo" empty state for Cover. Text fit reuses truncate/adaptive bounds (card) and clamp/ellipsis (page).
- i18n: `coverPhotoTitle/Body` en+fr; the unified display name is EN "Cover" / FR "En couverture", the category is EN "Cover" / FR "Couverture", and the French description is "Photo plein cadre avec texte en direct, carte et page." Rule 1 throughout (selection via the RPC; no card-only writes). Tests: 5 Cover review tests added since Phase 0 (the 1,623-test baseline already included the original 12 Cover pins); card-system registry evolved 6→7.

## [2026-10] — Invitation Round 5, step 2: unified picker + atomic RPC (2026-10-09, committed as 5bff7c9)
- Migration `db/migration_163_unified_template_rpc.sql` (+ rollback twin, byte-identical mirror `20261009000001_…`, **applied on staging by owner**): `set_unified_invitation_template` writes card UUID + page template id in one transaction with a DB-level kind guard; `SECURITY DEFINER`, pinned search path, service-role-only (migration_131 precedent). Chosen over compensating rollback (compensation can itself fail); partial failure is structurally impossible, pinned by SQL-shape tests.
- `setUnifiedInvitationTemplate` now calls the RPC and reports `needsPublish` (published page still renders the old design while the card updates live); RPC/DB errors map to fixed generic strings.
- `UnifiedTemplatePicker` in the builder template section (4 complete pairs; card thumbnail + page swatch per option; Card | Page preview tabs; custom-combination banner with one-click Unify, never auto-rewrites; native radiogroup keyboard; selected/saving/error states; publish notice with jump-to-Publish). Replaces the page-only dropdown and its builder modal (confirm now inline in the picker). Builder threads server-resolved `cardSlug` + card catalog; draft syncs via existing autosave; `hasDraftChanges` already covers `template_id` so the unpublished badge follows.
- i18n: 21 `unified*` keys in en + fr with parity pins. Tests: +13 step-2 pins; rewritten modal/dropdown pins; stage17 tracker → 163.

## [2026-10] — Invitation Round 5, step 1: unified template model + design-tab removal (2026-10-09, committed as 57b10b5)
- Code-owned `UNIFIED_INVITATION_TEMPLATES` registry (4 pairs, versioned ids, no migration): one selection resolves card slug + page id. Pure `resolveUnifiedPair` derives the display pair without rewriting (exact > card > page > null; mismatches stay custom). `setUnifiedInvitationTemplate` wrote both columns behind access + kind gates (sequential in step 1; made atomic via the 163 RPC in step 2).
- Standalone Invitation Design tab removed from nav (all kinds); `/dashboard/events/[id]/invitation-design` is now a kind-gated redirect to the builder; `PATCH /api/events/[id]/invitation-design` returns 410 and writes nothing; `InvitationDesignClient.tsx` deleted. Retained: renderer, card.png, table, fallback, email art. Builder opens for card-only drafts via synthesized defaults.
- Tests: new `lib/__tests__/unified-invitation-templates.test.cjs` (17); regressions/kind pins updated for the removed tab.

## [2026-10] — Invitation Round 4: Memories + Rule-1 strip (2026-10-09, committed as a390017)
- Migration `db/migration_162_event_memories.sql` (+ rollback twin, byte-identical supabase mirror `20261009000000_…`, **applied on staging by owner**): `event_memory_settings` (1:1 upload credential `mem_`+base62, approval toggle default true, revocation), `event_memories` (private photo rows, pending/approved/rejected, uploader delete-token hash, report count), `event_memory_reports`, `event_memory_retention_notices` (30d/7d idempotency), private `event-memories` bucket (15 MB, jpeg/png/webp/heic/heif). RLS mirrors the invitation-pages manage shape. Table names were pinned in advance by `lib/invitation-cleanup.ts`.
- Rule-1 strip via single-source `isInvitationEvent()`: overview Invitation card, dashboard tabs (guests/invitation-design/invitation-page hidden on public kind; Memories tab serves both), and server-side 404/403 in invitation-page, builder-preview, invitation-design, guests pages, guests/batch/invitation-design APIs, and page mutations. Conversion/creation flows untouched. `/events/[slug]` gains an explicit invitation-kind 404 + robots-only metadata. Rewritten pins: invitation-events-kind, invitation-home, invitation-page-builder (`?embed=1`), guest-csv (route-gated, engine-agnostic), dashboard regressions (memories tab + kind matrix), stage17 tracker → 162, dep allowlist + `heic-convert@2.1.0`.
- Memories: `/m/[token]` guest upload (rate-limited, noindex, no-store), signed direct-to-storage PUT → magic-byte validation → HEIC→JPEG → EXIF/GPS strip → pending/approved flow, report-photo (no reporter IPs stored), uploader delete credential, organizer Memories tab (pending/approved/rejected, bulk up to 200, QR panel, approval toggle, streaming stored-ZIP capped 500 files/512 MB), scanner rejects memory QRs with "This is a photo-upload code, not an admission ticket" (no `check_in_ticket` change), RSVP POST rate-limited.
- Retention: `POST /api/cron/memory-retention` (cron auth, dry-run default, live needs `?live=1` + `ENABLE_MEMORY_RETENTION_DELETE=1` which is unset everywhere), 12 mo after end (upload-date fallback), owner-APPROVED 30d/7d Resend notices (HTML + plain-text mirror) following the `sendInvitationEmail` pattern, notice rows recorded only on successful send.
- Image hardening: HEIC capped at 30 MP via container-header check pre-decode (unreadable HEIC headers reject outright, no fallback); JPEG/PNG/WebP capped at 50 MP via sharp `limitInputPixels` plus post-decode check; 20s HEIC conversion budget that rejects cleanly (pending object removed, 422); explicit `maxDuration = 60` on the upload-complete route and the memories ZIP route (no maxDuration existed anywhere; 60 is legal on Hobby and Pro — owner confirming the actual plan limit).
- Verification: ESLint 0 errors, `tsc --noEmit` 0, production build green (all new routes), full suite **1,583/1,583**. New tests in `lib/__tests__/event-memories.test.cjs` (27).

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
