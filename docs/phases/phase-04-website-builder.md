# Phase 4: Website Builder / Editor

## 1. Objective
Build an intuitive, real-time visual page builder inside the tenant dashboard allowing business managers to add, reorder, configure, and preview website blocks with instant save and publish workflows.

## 2. Scope
- Dashboard editor interface at `app/dashboard/org/[id]/website/builder/page.tsx`.
- Drag-and-drop block reordering (using lightweight accessible primitives).
- Side-panel block property editor (text, images, CTA links, colors).
- Real-time side-by-side device preview (Desktop, Tablet, Mobile).
- Version draft state vs live published state with rollback.

## 3. Out of Scope
- Arbitrary JavaScript injection or custom code embeds.
- Third-party app store widgets.

## 4. Existing Dependencies
- Phase 1 `tenant_websites` and `website_pages` data models.
- Phase 3 Block Component Catalog.
- Supabase storage bucket `cms-media` for media uploads.

## 5. Tasks
- [x] Task 4.1: Implement draft vs publish server actions in `lib/actions/website-builder.ts` and automated tests in `lib/security/__tests__/website-builder-actions.test.cjs`.
- [x] Task 4.2: Build property inspection forms for each block type in `components/dashboard/website/builder/inspectors/` and automated tests in `lib/dashboard/__tests__/website-builder-inspectors.test.cjs`.
- [x] Task 4.3: Build visual builder layout and state manager in `app/dashboard/org/[id]/website/builder/` and automated tests in `lib/dashboard/__tests__/website-builder-canvas.test.cjs`.
- [x] Task 4.4: Settings integration, authorization consolidation (`checkTenantAccess`), and automated end-to-end integration tests (`lib/security/__tests__/website-builder-integration.test.cjs`).

## 6. Acceptance Criteria
- [x] Business managers can construct a complete landing page within minutes.
- [x] Draft edits do not affect the live public page until "Publish" is clicked.
- [x] All data model, security, and atomic publish server actions pass 100% tests.
- [x] All 10 modern + 2 legacy inspectors enforce schema limits, tenant isolation, and URL safety.
- [x] Visual builder canvas with device switcher (Desktop/Tablet/Mobile), in-memory undo/redo, debounced autosave, and validation error routing.
- [x] Page rows and header in `WebsiteSettingsClient.tsx` seamlessly link to the Visual Builder.
- [x] Shared tenant authorization helper `checkTenantAccess()` enforces consistent RBAC across all builder entrypoints.

## 7. Current Status
**COMPLETE & VERIFIED — Extended Stages Landed** (Tasks 4.1–4.4 original + Stages G–K/I landed 2026-09-24)

> **Original scope (4.1–4.4)**: COMPLETE Sep 2026 (411 tests).  
> **Extended Business Mini Website stages (landed 2026-09-24)**: Element editing (G), Section/Container controls (G2/H1), Stable reordering (J), Template Library preview (K), My Media (I), Atomic instantiation integration (E via NewWebsiteClient). All verified 650/650 (36 suites), no drag library, no Connected Media.

## 8. Completed Work
- `lib/actions/website-builder.ts`:
  - `savePageDraft(pageId, draftBlocks)` returning version and updated_at
  - `publishPageDraft(pageId)` with atomic RPC execution and TOCTOU check
  - `discardPageDraft(pageId)`
  - `reorderPageBlocks(pageId, newOrder)`
  - `getPageBuilderData(pageId)` loader action
  - `getBuilderEmbedOptions(tenantId)` server-scoped embed query
- `lib/entity-auth.ts`:
  - `checkTenantAccess(userId, organizerId, allowedRoles)` helper consolidating entity membership and direct organizer ownership fallback.
- `db/migration_129_website_page_drafts_and_publishing_guard.sql`:
  - Table `website_page_drafts` with tenant-isolated RLS.
  - `publish_page_draft(p_page_id, p_expected_version)` RPC with TOCTOU version check (`40001`), revoked from `authenticated`, granted strictly to `service_role`.
  - Trigger `enforce_website_page_publishing_guard` on `website_pages`.
- `components/dashboard/website/builder/`:
  - `WebsiteBuilderClient.tsx` (master 3-panel workspace orchestrator)
  - `BuilderToolbar.tsx` (device switcher, undo/redo, autosave pill, discard/save/publish controls)
  - `BlockPalette.tsx` (block catalog drawer & page structure outline)
  - `BuilderCanvas.tsx` (responsive device frames: Desktop 100%, Tablet 768px, Mobile 375px)
  - `canvas/CanvasBlockWrapper.tsx` (selection ring, error banner, action controls)
  - `canvas/CanvasBlockPreview.tsx` (visual block preview)
  - `builderReducer.ts` (pure reducer with undo/redo history stacks)
  - `types.ts` & `defaultBlocks.ts`
- `app/dashboard/org/[id]/website/builder/page.tsx`:
  - Server Component loading page draft/live blocks and tenant embed options with defense-in-depth authorization check.
- `app/dashboard/org/[id]/website/WebsiteSettingsClient.tsx`:
  - Added "Edit in Builder" buttons on all page rows and "Visual Builder" header button.
- Automated test suites:
  - `lib/security/__tests__/website-builder-actions.test.cjs`
  - `lib/security/__tests__/migration129-publishing-guard.test.cjs`
  - `lib/dashboard/__tests__/website-builder-inspectors.test.cjs`
  - `lib/dashboard/__tests__/website-builder-canvas.test.cjs`
  - `lib/security/__tests__/website-builder-integration.test.cjs`
  - `lib/__tests__/website-builder-g.test.cjs`
  - `lib/__tests__/website-builder-g2.test.cjs`
  - `lib/__tests__/website-builder-h1j.test.cjs`
  - `lib/__tests__/website-builder-hj.test.cjs`
  - `lib/__tests__/website-template-library.test.cjs`
  - `lib/__tests__/website-atomic-instantiation.test.cjs`
  - `lib/__tests__/my-media.test.cjs`
  - Total test suite: **650/650 passing (36 suites, 0 failures)** (verified 2026-09-24, includes extended stages).

## 9. Remaining Work
- None (Phase 4 base + extended stages complete). Ready for Phase 5.

## 10. Known Issues
- None.

## 11. Verification Requirements (Actual Results 2026-09-24)
- `npm test` → 650/650 passing (36 suites). ✅
- `npx tsc --noEmit --skipLibCheck` → 0 errors. ✅
- `npx eslint lib/website-blocks.ts lib/website-*/ components/dashboard/website/* components/site/blocks/*` → 0 errors. ✅
- `npm run build` → compiled successfully (Turbopack, 110s). ✅

## 12. Next Step
Phase 5 — Products, Services & Menus (migration 136, planned). Do NOT start until docs sync complete.

## Stage 4B-2a — Template-first form editor (2026-10-11)

**Status: IMPLEMENTED IN WORKING TREE; tests, TypeScript, and lint verified; production build blocked by the Windows sandbox before compilation.** This extension selects a new editor only for valid v2 flagship sites; the existing v1 builder remains available. The v2 editor derives fixed accordion sections from emitted manifest slots, edits one normalized shared content document, previews resolver blocks through a same-origin persistent iframe, and uses the existing version-checked save/publish actions. A v2-only menu-choice action derives the tenant from the website row and checks membership before querying active menu items. Stale draft conflicts pause autosave only for this editor; the default shared invitation queue behavior remains unchanged.

No migration, new table, block type, invitation file, `proxy.ts`, or `package.json` edit is part of this stage. New direct-run tests are `lib/__tests__/website-v2-editor-schema.test.cjs`, `lib/__tests__/website-preview-channel-and-save-queue.test.cjs`, and `lib/security/__tests__/website-v2-menu-choices.test.cjs`. Invitation and website suites passed 573/573 across 81 suites; `tsc --noEmit` passed; ESLint passed with 0 errors and 0 warnings. `npm run build` stopped before compilation because SWC could not canonicalize `jsc.baseUrl(C:\Users\Youngyz\aldriva-staging)` (Windows sandbox access denied, OS error 5). Authenticated browser visual parity remains unverified.

## Stage 4B server-action export compliance fix (2026-10-11)

buildInitialContentFromOrganizer is a pure content-hydration helper, not a server action. It now lives in lib/website-v2-initial-content.ts; lib/actions/website-v2.ts retains async runtime exports and type declarations. The registered website-content-actions suite scans module-level "use server" files under lib/actions and app and guards against synchronous runtime exports. The scan covered 19 modules and found no other violation.

Verification after the correction: website and invitation selections passed 582/582 tests across 81 suites; tsc --noEmit and ESLint passed. npx next build --webpack remained blocked before compilation by the Windows SWC jsc.baseUrl canonicalization error (Access is denied, OS error 5). The import-boundary audit found only intentional server-action references and no Node built-ins or server-only modules in the scanned website client graph.

## Stage 4B-3 — V2 template create flow (2026-10-11)

**Status: IMPLEMENTED IN WORKING TREE; tests, TypeScript, and lint verified; production build blocked before compilation.** The organization create route now uses the v2-only gallery. It selects the organizer-mapped category, filters flagship templates through the shared compatibility helper, keeps the existing website redirect, and disables creation unless the caller has owner/admin/manager access or platform-admin status. The legacy template gallery files remain available but are no longer imported by this route.

Gallery cards render sample-resolved Home blocks through the public `BlockRenderer`, with v2 site chrome and locked theme tokens. Embed blocks receive no tenant ID and therefore show the renderer's empty states. The inert preview has no save path. Create retries reuse a request ID for the same template/category, and the existing server action remains the authorization and compatibility authority.

No database was accessed and no migration, table, block type, invitation file, `proxy.ts`, or `package.json` edit was made. The new direct-run suite is `lib/__tests__/website-v2-create-flow.test.cjs`; the legacy atomic-instantiation and template-library tests were updated for the route's new v2-only contract. The combined website/invitation selection and direct-run v2 suites passed 581/581 across 81 suites; `tsc --noEmit` and ESLint passed (0 errors, 0 warnings). `npm run build` stopped before compilation because SWC could not canonicalize `jsc.baseUrl(C:\Users\Youngyz\aldriva-staging)` (Windows `Access is denied`, OS error 5). Authenticated browser review is unverified.

## Phase 2a — Business offerings, capability gating & hours (2026-10-12; working tree)

The v2 storefront receives linked-business type, category, selected offerings, translated labels, and site timezone as resolver context. A shared capability gate exposes ordering, delivery, pickup, or reservations only when the business type allows it, the owner selected it, and the active template emits the feature. Selected factual offerings reuse the existing `features` block; no commerce or reservation routes or block types were added.

Business offerings are stored as stable-key `text[]`; labels and catalog membership remain application-owned. Migration 169 adds the bounded column without changing row-level RLS and is unapplied. The planned orders migration shifts from 169 to 170. Custom Business types use the generic catalog even when a category such as Restaurant is selected.

The restaurant CTA falls back to localized “View menu” at `/menu` while ordering is unbuilt. The rental CTA remains at `/contact` and uses localized availability-enquiry copy when the owner has not supplied a label. Template descriptions do not promise ordering or date-range booking. Selected fact offerings render only when present.

The contact section retains the full weekly schedule; the shared v2 footer displays one localized current-day line, omits invalid or missing hours, and marks overnight intervals as next day. Time input validation accepts complete 24-hour pairs, and `today_tag` remains optional owner-provided highlight text rather than an open/closed status. Rental location free-text hours remain unchanged.

Website category and storefront context use the earliest linked business by `created_at`. Business creation and editing both validate and persist offerings; the dashboard Reservations module remains hidden until a real route and built feature exist.

**Verification:** focused Phase 2a suites passed 86/86; selected website suites passed 296/296 across 25 test files; invitation suites passed 322/322 across 14 test files; organization/navigation suites passed 47/47 across three files; `npx tsc --noEmit` and ESLint on touched TypeScript and test files passed. Migration 169, production build, live database/RLS behavior, and authenticated browser behavior were not exercised.

## Phase 4 Addendum — "Ordering & payments" panel in website builder + fulfilment rule (2026-10-13)

### Scope & Architectural Integration
Added an "Ordering & payments" panel to the V2 Website Editor (`V2WebsiteEditor.tsx`). The panel is category-agnostic and surfaces the feature-kind offerings supported by the linked business's catalog (`online_ordering`, `pickup`, `delivery`, `online_payment`).

- **Panel Definition**: [`components/dashboard/website/v2/OrderingPaymentsPanel.tsx:35`](file:///c:/Users/Youngyz/aldriva-staging/components/dashboard/website/v2/OrderingPaymentsPanel.tsx#L35)
- **Panel Mounting**: [`components/dashboard/website/v2/V2WebsiteEditor.tsx:327`](file:///c:/Users/Youngyz/aldriva-staging/components/dashboard/website/v2/V2WebsiteEditor.tsx#L327)
- **Shared Component Confirmation**: The Edit Business form ([`app/dashboard/businesses/[id]/edit/EditBusinessFormClient.tsx:350`](file:///c:/Users/Youngyz/aldriva-staging/app/dashboard/businesses/%5Bid%5D/edit/EditBusinessFormClient.tsx#L350)) and the Website Builder panel ([`components/dashboard/website/v2/OrderingPaymentsPanel.tsx:149`](file:///c:/Users/Youngyz/aldriva-staging/components/dashboard/website/v2/OrderingPaymentsPanel.tsx#L149)) share the exact same component: [`components/dashboard/businesses/OfferingsFulfilmentWarning.tsx`](file:///c:/Users/Youngyz/aldriva-staging/components/dashboard/businesses/OfferingsFulfilmentWarning.tsx). They also share the underlying helper `isFulfilmentMissing()` in [`lib/storefront-features.ts:56`](file:///c:/Users/Youngyz/aldriva-staging/lib/storefront-features.ts#L56) and write through the identical validated server action `updateBusiness()` in [`lib/actions/businesses.ts:286`](file:///c:/Users/Youngyz/aldriva-staging/lib/actions/businesses.ts#L286) with `validateBusinessOfferings()` in [`lib/business-offerings.ts:105`](file:///c:/Users/Youngyz/aldriva-staging/lib/business-offerings.ts#L105). No duplicate forms, tables, or columns were introduced.

### Key Rules & Behavior
1. **Immediate Live Updates**: Changes in the panel persist immediately via `updateBusiness` (no draft/publish cycle). Both EN and FR banners explicitly inform the user.
2. **Preview Channel Synchronization**: Toggling an offering posts an `"update_offerings"` message across the iframe preview bridge (`website-preview-channel.ts`), immediately refreshing the live feature resolution in `V2WebsitePreviewClient.tsx`.
3. **Display-Only Preview Notice**: When ordering is live, an amber notice banner is rendered near the preview: *"Ordering works on your live site, not in this preview"* (EN/FR parity via `Storefront.previewOrderingNotice`).
4. **Live Status Lines & Feature Filtering**: Every toggle displays live status via `resolveStorefrontFeatures` / `computeFeatureStatus`: either "Live" or "Needs setup — <reason>" (reasons: `no_fulfilment`, `no_active_dish`, `currency_not_supported`, `feature_not_built`). Toggles for features not built in the active template are suppressed completely.
5. **Fulfilment Rule**: `resolveStorefrontFeatures` resolves `ordering: false` unless at least one of `pickup`, `delivery`, or `delivery_to_customer` is ticked. `OfferingsFulfilmentWarning` alerts the owner in both the builder and the business edit form when ordering is ticked without fulfilment.
6. **Role Gating & Multi-Business**: Owner, admin, and manager roles can toggle offerings; editors and viewers see a read-only panel with disabled toggles. Multiple linked businesses resolve via the earliest `created_at` rule, and the panel explicitly displays the active business name.

### Verification
- **Automated Tests**: New suite `lib/__tests__/phase4-ordering-payments-panel.test.cjs` (8 hermetic tests covering validated writes, unknown key rejection, role gating, status reasons, fulfilment rule, EN/FR parity, unbuilt template suppression, and SSR render). Registered in `package.json`.
- **Full Suite**: 2068/2068 tests passing across 186 suites (`npm test --script-shell=pwsh`).
- **TypeScript & Lint**: `tsc --noEmit` clean, ESLint clean.

## Public Site Design System (PSD), Stage 1 Foundation (2026-10-15; working tree)

- Scoped shared public tokens to `.public-site`; kept `:root`, global body typography, and Tailwind base unchanged. Public UI uses Plus Jakarta Sans, with template heading fonts applied to block headings. Shared public blocks, chrome, forms, storefront, and tracking views consume the shared roles.
- Hero image and logo are optional for publishing. Image-less heroes render text-only and missing logos fall back to the business name. Added six accent palettes, metadata override, manifest fallback, preview wiring, and preserved the existing Table & Flame/DriveLine accents. No Branding control was added because the current metadata action is timezone-specific and there is no accent-specific writer.
- V2 template selection is category-neutral; category remains a recommendation. DEC-0031's V2 filter is superseded; the separate V1 gallery/instantiation gate remains unchanged and requires a later decision before claiming V1 is category-neutral.
- Added a read-only live catalog adapter for menu/products. Empty and unsupported catalog slots/pages/navigation/actions are hidden; services and fleet adapters are unsupported. Gallery previews show the linked business identity with neutral EN/FR samples that are not saved or published.
- No food/store templates were started. No migrations or database writes were made.
- **Verification:** affected suites 266/266; full registered suite 2,286/2,286 across 204 suites; touched-file ESLint and `npx tsc --noEmit` exit 0. Authenticated desktop/mobile browser review and live catalog records remain unverified.
