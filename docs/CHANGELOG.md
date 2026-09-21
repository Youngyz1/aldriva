# Aldriva — Platform Changelog & Evolution History

> **Status**: Verified Historical Record  
> **Format**: Chronological reverse order (Newest first)

---

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
