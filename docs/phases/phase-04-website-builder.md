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
**COMPLETE & VERIFIED** (Tasks 4.1, 4.2, 4.3 & 4.4 all passing)

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
  - Total test suite: 411/411 passing (21 suites, 0 failures).

## 9. Remaining Work
- None (Phase 4 complete). Ready for Phase 5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.
- `npx tsc --noEmit` passes with 0 errors.
- `npx eslint` passes with 0 errors.
- `npm run build` succeeds (exit 0).

## 12. Next Step
Execute after Phase 3 completion.
