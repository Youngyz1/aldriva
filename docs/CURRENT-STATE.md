# Aldriva — Current Implementation State & Living Status

> **WHERE ARE WE RIGHT NOW?**  
> **Current Phase**: **Phase 5 — Products, Services & Menus (COMPLETE)**  
> **Prerequisites**: **migrations 130 (tenant_websites.metadata), 131 (atomic create_website_from_template), 132 (businesses.business_type + business_branches), 133 (events.subcategory), 134 (homepage promotions), 135 (profile locale), 136 (services + service_tiers + menu_sections + menu_items) — present in repository, 130–136 hermetic verified**  
> **Next Step**: **Phase 6 — Unified Commerce (planned)**  
> **Last Verified**: 2026-09-24 — Full checklist verified (services, service tiers, menu sections/items, dietary/allergens/modifiers, public services/menu blocks, tenant isolation)  
> **Test Suite**: 669/669 passing (36 suites, 0 failures)  
> **TypeScript Health**: 0 errors (`npx tsc --noEmit --skipLibCheck` verified)  
> **Build Health**: Next.js 16.3.4 production build verified (compiled successfully, Turbopack)

---

## 1. System Implementation Classification

### A. COMPLETE (Verified Working in Code & Tests)
1. **Events & Ticketing**:
   - Multi-tier, multi-seat ticket catalog and checkout (`app/events/[slug]`, `app/api/checkout/session`).
   - SVG-based interactive venue builder & seating engine (`lib/seating*.ts`, `app/dashboard/events/[id]/seating`).
   - Anti-double-sell seat locking with automatic stale hold release (`lib/seating.ts`, `migration_118`).
   - Secure QR code generation, issuance, and verification (`lib/qr.ts`, `app/verify/[code]`).
   - Hybrid offline-capable door scanner PWA with IndexedDB local caching and batch conflict sync (`lib/offline-scanner.ts`, `migration_122`, `migration_124`).
   - Digital invitation template system, custom card designer, and RSVP lifecycle (`app/dashboard/events/[id]/invitation-design`, `migration_120`, `migration_121`).
   - Event team RBAC (`owner`, `manager`, `scanner`, `checkin`) with invitation acceptance flows (`lib/event-team.ts`, `migration_76`).
2. **Fundraising & Beneficiary Operations**:
   - Crowdfunding campaign creation, media galleries, and public goal progress (`app/fundraisers/[slug]`).
   - Beneficiary claims, dedicated beneficiary accounts, and transparent recipient ledger credits (`lib/beneficiary.ts`, `migration_50`–`56`, `migration_70`–`73`).
   - Public donor wall, private donor protection, and comment activity feeds (`app/fundraisers/[slug]/donate`, `migration_29`–`33`).
   - Automated PDF donation receipts and certificate issuance (`lib/receipt.ts`, `lib/certificate.ts`).
3. **Digital Products & Marketplace Commerce**:
   - Product catalog, flight strips, digital downloads, and inventory tracking (`app/products/page.tsx`, `app/(gated)/products/[slug]`).
   - Tokenized private asset delivery via signed URLs with ~120s TTL (`lib/digital-products.ts`, `lib/product-access.ts`, `migration_116`).
   - Dual payment processing (Stripe Checkout + NOWPayments Crypto) with idempotent webhook credit RPCs (`app/api/webhooks/stripe`, `app/api/crypto/webhook`).
4. **Articles & Editorial Publishing**:
   - TipTap WYSIWYG editor with image uploads, tags, and category taxonomies (`app/dashboard/articles/new`, `lib/actions/articles.ts`).
   - AI narration synthesis via NVIDIA FastPitch TTS with chunking and WAV concatenation (`lib/audio/*`).
   - Content moderation approval workflow (`draft` → `pending_review` → `published` / `rejected`).
5. **Multi-Tenant Architecture & Entities**:
   - Canonical entity model rooted in `organizers.id` (`migration_48`, `migration_58`).
   - Entity-level RBAC (`owner`, `admin`, `manager`, `editor`, `finance`, `viewer`) via `entity_members` (`migration_59`, `migration_62`).
   - Identity verification workflow with encrypted document storage (`migration_60`, `migration_82`–`87`).
6. **Tenant Websites & CMS Foundation (Phase 1)**:
   - Core data model for multi-page customizable business websites anchored to `organizers.id` (`db/migration_125_tenant_websites.sql`).
   - RLS privilege segregation fixing DELETE permissions so `editor` roles cannot execute destructive drops on websites, pages, or navigation trees (`db/migration_126_website_delete_rls_fix.sql`, DEC-0011).
   - Server action CRUD services with entity role authorization and navigation tree sanitization (`lib/actions/website.ts`, `lib/website-nav.ts`).
   - Tenant dashboard settings interface for themes, header/footer configuration, pages management, navigation menu builder, and SEO metadata (`app/dashboard/org/[id]/website/`).
7. **Public Website Rendering Engine (Phase 2)**:
   - Dynamic catch-all SSR public route (`app/site/[slug]/[[...page]]/page.tsx`) with standalone isolated segment layout (`app/site/[slug]/layout.tsx`).
   - Pre-stream status gate in `proxy.ts` (`checkWebsiteAccess`) ensuring unlisted/draft sites return true HTTP 404 to anonymous visitors while allowing authenticated entity preview.
   - Branded `SiteHeader` and `SiteFooter` with live navigation staleness pruning (`filterPublishedNavItems`) and draft preview banner (`DraftPreviewBanner`).
   - Structured JSON-LD metadata (`WebSite`, `Organization`, `WebPage`) and dynamic OpenGraph metadata generation (`lib/website-structured-data.ts`).
   - Reserved platform slugs validator (`RESERVED_WEBSITE_SLUGS`) in `lib/website-nav.ts` and `lib/actions/website.ts`.
   - Test suite in `lib/__tests__/website-engine.test.cjs` registered in `package.json`.
8. **Website Design System & Block Catalog (Phase 3)**:
   - Complete TypeScript block type schema for all 10 block types + 2 legacy types in `lib/website-blocks.ts`:
     - `hero` (split, center, video_bg variants), `features`, `about`, `gallery`, `testimonials`, `contact`, `faq`, `events_embed`, `products_embed`, `fundraiser_embed`, `rich_text`, `cta_banner`.
   - Write-time validation (`validateBlock`) with length bounds, array item caps (max 12), UUID format checks, and URL safety backed directly by `sanitizeUrl()` from `lib/sanitize-html.ts`. Protocol-relative (`//evil.com`) and dangerous scheme URLs are rejected at both write-time and render-time with no drift risk.
   - Fallback parser (`parseBlock` / `parseBlocks`) for resilient rendering of stored JSONB without hard failures.
   - Six responsive theme palette presets (`default`/`zinc_orange`, `dark`, `slate`, `warm_amber`, `forest`) with `resolveThemeTokens()` and `themeTokensToStyle()` CSS variable generation.
   - Live embed block server-side resolvers in `lib/website-embeds.ts`:
     - `resolveEventsEmbed`: scoped to `events.organizer_id = tenantId` with status gating and LIMIT clamp 1..12.
     - `resolveProductsEmbed`: resolved via `businesses.organizer_id = tenantId → products.business_id` (two-step join, no cross-tenant `owner_id` fallback).
     - `resolveFundraiserEmbed`: scoped to `fundraisers.organizer_id = tenantId` with `deleted_at IS NULL` guard.
   - Full 12-type visual block component library in `components/site/blocks/BlockRenderer.tsx` (async Server Component):
     - All 10 standard blocks with Aldriva design primitives (`rounded-xl`, `shadow-xs`, zinc/orange tokens).
     - Embed blocks call resolvers server-side with injected `tenantId` + `isTeamMember` gating; never exposes DB queries to client.
     - Draft badge shown to authenticated team members only.
   - Theme tokens applied via `resolveThemeTokens` + `themeTokensToStyle` in `app/site/[slug]/[[...page]]/page.tsx`, scoped to the `<div>` wrapper, isolated from dashboard/admin layouts.
   - Test suites registered in `package.json`: `website-blocks.test.cjs` (15 tests), `website-embeds.test.cjs` (9 tests).
   - **Stage A (Template Registry — 2026-09-21)**: Code-owned immutable registry in `lib/website-template-registry.ts` (6 templates, `id@1.0.0`, `category/supportedCategories/style/previewColor/theme/header/footer/pages[]+navigation`). Backward-compat shim in `lib/website-templates.ts` (legacy `WEBSITE_TEMPLATES.defaultBlocks` derived from `pages[0].blocks`). Centralized helpers `getTemplateById`, `getTemplateByIdVersion`, `getTemplatesByCategory`, `getCompatibleTemplatesForCategory`, `formatTemplateRef`.
   - **Stage B (Section Envelope & Stable IDs — 2026-09-21)**: `SectionEnvelope {id, visible, spacing, background, hiddenOnMobile}` + `WithItemId` on all repeatable items (`features.items`, `gallery.images`, `testimonials.items`, `faq.items`, `about.highlights`). `lib/website-blocks.ts` helpers `generateStableId`, `normalizeBlock(s)`, `cloneBlockWithNewIds`, `isBlockVisible`, envelope-aware `validateBlock`/`parseBlock` (preserves `id`/item ids). `components/dashboard/website/builder/defaultBlocks.ts` generates ids via `normalizeBlock`; `builderReducer.ts` normalizes on `SET_BLOCKS`/`ADD_BLOCK` and uses `cloneBlockWithNewIds` for duplication. `lib/actions/website-builder.ts` normalizes draft/live blocks on `savePageDraft`/`getPageBuilderData`.
    - **Stage C (Category Mapping — 2026-09-21)**: `lib/website-category.ts` defines `WebsiteCategory` (business/restaurant/retail/service/professional/creative/organization), `WEBSITE_CATEGORIES`, `mapOrgTypeToWebsiteCategory`, `refineWebsiteCategoryFromBusinessCategory`, `isTemplateCompatibleWithCategory`/`getCompatibleTemplates` (centralized filtering). `db/migration_130_website_category_and_metadata.sql` adds `tenant_websites.metadata JSONB` (stores `websiteCategory`, future `templateId`/`templateVersion`) + GIN index. `lib/actions/website.ts` persists `metadata`/`websiteCategory`; `app/dashboard/org/[id]/website/new/NewWebsiteClient.tsx` stores selected `websiteType` in `metadata` and uses `homePage.blocks` from registry. `components/dashboard/website/TemplateGallery.tsx` now renders from `TEMPLATE_REGISTRY` via `pages[0].blocks`.
    - **Stage E (Atomic Template Instantiation — 2026-09-24)**: `db/migration_131_website_atomic_creation.sql` creates transactional RPC `create_website_from_template` with `ON CONFLICT (tenant_id) DO NOTHING` race boundary, `creationRequestId` idempotency, pages+drafts+navigation single transaction, `SECURITY DEFINER` + `search_path=public,pg_temp` + `REVOKE PUBLIC/anon/authenticated`/`GRANT service_role`. `lib/website-hydration.ts` whitelisted hydration (`ALLOW_HYDRATION_FIELDS`, `TOKEN_MAP`). `lib/actions/website-instantiation.ts` validates auth/`requireTenantContext`/template/version/category compatibility/reserved slugs/bounded slug retry, then `cloneBlockWithNewIds`+`normalizeBlocks`+`hydrateBlocks`+`validateBlocks` before RPC. `TemplateGallery` → `NewWebsiteClient` uses `crypto.randomUUID()` creationRequestId.
    - **Stage G (Controlled Element Editing — 2026-09-24)**: `lib/website-block-edit-schema.ts` whitelisted editable paths (`isEditablePath`, `getFieldDef`, `setElementValue`) with `__proto__`/`prototype`/`constructor` rejection. `builderReducer` `SELECT_BLOCK_BY_ID`/`SELECT_ELEMENT`/`UPDATE_ELEMENT` with stable item ids, history/dirty, undo/redo. `CanvasBlockPreview` editor-only `data-element-path` + `ring-brand-600`; `BlockRenderer` has no editor overlays. `BlockInspector` section controls remain available when element selected.
    - **Stage G2 (Section Controls — 2026-09-24)**: `lib/section-helpers.ts` (`getSpacingClass`, `getHiddenOnMobileClass`, `getBackgroundStyle`, `isValidSpacing`). `SectionInspector` for `visible`/`hiddenOnMobile`/`spacing`/`background` (color/image/overlay) with `sanitizeUrl` sanitization. `builderReducer` `UPDATE_SECTION` sanitizes invalid values, clears dangerous `javascript:`/`data:text/html` images. Public `BlockRenderer` `SectionEnvelopeWrapper` respects `isBlockVisible`/`hiddenOnMobile`/`spacing`/`background`.
    - **Stage H1 (Container/Layout — 2026-09-24)**: `SectionEnvelope.container` `constrained|wide|narrow|full` (`lib/website-blocks.ts`). `lib/section-helpers.ts` `getContainerClass` (`constrained→max-w-6xl`, `narrow→max-w-3xl`, `wide→max-w-7xl`, `full→w-full`). `BlockRenderer` outer `background/style` vs inner `containerClass` separation. `CanvasBlockWrapper` shows `Container:` visual. `SectionInspector` container picker.
    - **Stage J (Stable Reordering — 2026-09-24)**: `builderReducer` `MOVE_BLOCK` via `splice(fromIndex,1)` + insert, history 1 entry, `isDirty:true`, selection reconciliation by `blockId`, envelope/item IDs preserved, array order only, first/last boundaries disabled, `aria-label` on palette/canvas buttons. No `dnd-kit`/`react-beautiful-dnd`/`puck`. Public `page.tsx` `blocks.map` order preserved (no sort).
    - **Stage K (Template Library + Preview — 2026-09-24)**: `components/dashboard/website/TemplatePreview.tsx` read-only `homePage.blocks` (no clone), respects envelope/helpers, desktop/mobile modes. `TemplateGallery` uses `isTemplateCompatibleWithCategory` + `WEBSITE_CATEGORY_LABELS` + `supportedCategories` display, `Preview` dialog + `Use this template` with `disabled/Applying` guard. `lib/website-templates.ts` shim derives `WEBSITE_TEMPLATES` from registry.
    - **Stage I (My Media — 2026-09-24)**: `lib/media/my-media.ts` tenant-scoped `cms-media/<tenant_id>/<heroes|gallery|team|avatars|blocks>` with `isValidTenantId` UUID + `isSafeTenantPath` traversal block, bounded `limit:100` `sortBy updated_at desc`, `getPublicUrl` + `sanitizeUrl`, `deleteTenantMedia` tenant-scoped `remove`. `MyMediaPicker` (loading skeleton, `No media yet`, `Couldn't load`, `Try again`/`Refresh`, `grid-cols-2 sm:grid-cols-3`, `Use`/`Delete` + `ConfirmDialog destructive`, sanitized thumbnails). `MediaUploadField` 3 tabs `Upload | My Media | Direct URL`. Wired across 5 surfaces (Hero/Gallery/About/Testimonials/Section). No `media_assets` table, no new bucket, no Connected Media (Instagram/Facebook excluded, verified).
 9. **Aldriva AI Core & Safety Architecture**:

   - Provider abstraction layer (`gemini-3.6-flash`, `openrouter`) with reasoning-token stripping (`lib/ai/providers/*`).
   - Hard-coded safe-column allowlists (`SAFE_COLUMNS`) on all 14 tools (`lib/ai/tools/*`, `lib/ai/tools/tenant/*`).
   - Application-layer output guard screening for PII, system prompt echoes, and ungrounded UUIDs (`lib/ai/output-guard.ts`, ADR-0002).
   - Rejection audit persistence and admin review panel (`/admin/ai/rejections`, `migration_89`).
   - Facebook automated publishing via Meta Graph API with Page Access Token caching (`lib/facebook.js`, `lib/facebookPublisher.js`).

10. **Visual Website Builder & Editor (Phase 4 — Complete & Verified)**:
   - Dedicated `website_page_drafts` table with tenant-isolated RLS and auto-incrementing version trigger (`migration_129_website_page_drafts_and_publishing_guard.sql`).
   - Server action suite in `lib/actions/website-builder.ts`: `savePageDraft`, `publishPageDraft` (atomic RPC with `p_expected_version` concurrency check, eliminating TOCTOU races), `discardPageDraft`, `reorderPageBlocks`, `getPageBuilderData`, `getBuilderEmbedOptions`.
   - Centralized tenant access resolution with direct organizer ownership fallback (`checkTenantAccess()` in `lib/entity-auth.ts`).
   - RPC security hardening: `publish_page_draft` revoked from `authenticated`, granted strictly to `service_role`.
    - Property Inspector components in `components/dashboard/website/builder/inspectors/`:
      - 10 modern + 2 legacy inspectors with 100% `BLOCK_LIMITS` parity, draft-tolerant editing with "Required to publish" indicators, URL safety checks, and pure tenant embed filter functions (`filterTenantEvents`, `filterTenantProducts`, `filterTenantFundraisers`).
      - Media upload integration: `MediaUploadField` targeting `cms-media` bucket under `<tenant_id>/...` with `Upload | My Media | Direct URL` tabs.
      - Main dispatcher: `BlockInspector` (now dispatches `SectionInspector` before element mode, `onSectionChange` for envelope).
      - Controlled element editing: `lib/website-block-edit-schema.ts` whitelisted paths, `builderReducer` `UPDATE_ELEMENT`/`SELECT_ELEMENT` with stable item ids, `CanvasBlockPreview` `data-element-path` overlay.
      - Section/container controls: `SectionInspector` (visible/hiddenOnMobile/spacing/background/container), `section-helpers.ts` tokens, `BlockRenderer` `SectionEnvelopeWrapper` outer/inner parity.
      - Stable reordering: `MOVE_BLOCK` splice, history/dirty, selection reconciliation, `BlockPalette`/`CanvasBlockWrapper` Move Up/Down with disabled boundaries, no drag library.
      - Template library: `TemplateGallery` (category-compatible, `supportedCategories` display) + `TemplatePreview` (read-only, desktop/mobile).
      - My Media: `MyMediaPicker` tenant-scoped `cms-media` bounded listing with `Use`/`Delete` + `ConfirmDialog`, wired across 5 surfaces.
    - Three-panel visual builder workspace at `app/dashboard/org/[id]/website/builder/page.tsx`:
      - Palette (`BlockPalette.tsx`), Canvas (`BuilderCanvas.tsx`), Inspector (`BlockInspector.tsx`), Toolbar (`BuilderToolbar.tsx`).
      - Responsive device preview (Desktop 100%, Tablet 768px, Mobile 375px), inline reorder, duplicate, remove, undo/redo reducer history, debounce autosave with publish synchronization.
    - Settings integration in `WebsiteSettingsClient.tsx` with "Edit in Builder" links for all page rows and header action.
    - Payout KYC verification gate in `lib/payouts.ts` (`requestRecipientPayout()`) ensuring funds movement is strictly blocked for unverified organizer/business identities.
      - Regression test suites registered in `package.json`: `website-builder-actions.test.cjs`, `website-builder-inspectors.test.cjs`, `website-builder-canvas.test.cjs`, `website-builder-integration.test.cjs`, `migration129-publishing-guard.test.cjs`, `payout-verification-authz.test.cjs`, `dashboard-profile-architecture.test.cjs`, `website-atomic-instantiation.test.cjs`, `website-builder-g.test.cjs`, `website-builder-g2.test.cjs`, `website-builder-h1j.test.cjs`, `website-builder-hj.test.cjs`, `website-template-library.test.cjs`, `my-media.test.cjs`, `i18n.test.cjs`, `fundraiser-donations-donors.test.cjs`. Total platform test suite: **650/650 passing across 36 suites**.

11. **Aldriva Dashboard & Profile Architecture (Personal Ownership, Privacy & Navigation)**:
    - Four clearly separated contexts:
      1. **Personal Account ("My ...")**: Items directly owned by user (`organizer_id IS NULL` for campaigns/events/businesses/articles, `business_id IS NULL` for products, purchased `ticket_orders`, and user `donations`).
      2. **Aggregate Organizer Resources**: User-managed collective resources across authorized organizers (`/dashboard/events`, `/dashboard/fundraisers`, `/dashboard/businesses`, `/dashboard/articles`, `/dashboard/products`).
      3. **Organizer Workspace**: Tenant workspace context (`/dashboard/org/[id]/overview`).
      4. **Entity Management**: Individual entity dashboards (`/dashboard/events/[id]/overview`, etc.).
    - Public User Profile (`/profile/[id]`): External visitors see only public personal items + follower/following counts. Private organizer lists and organizer-owned campaigns/events are hidden from public profile.
    - Follower & Following Privacy: Server-side authorization in `/api/profile/[id]/followers` and `/api/profile/[id]/following` strictly returns 403 Forbidden to non-owners; only profile owners can view follower/following user lists.
    - **Profile Navigation Cleanup** (final state):
      - **Global account dropdown** (`components/Navbar.tsx`): Shows **Profile** link only — no Dashboard, My Tickets, My Donations, My Library, or Log Out in dropdown. All nav lives inside Explore.
      - **Explore control** (`components/profile/ProfileSettingsModal.tsx`): Renamed from "Settings" → **Explore** (Compass icon). Starts **CLOSED** on page load. Desktop renders a compact absolute popover (`w-72`); mobile renders a bottom sheet. Organizers accordion starts collapsed. Closes on Escape, outside-click, and navigation.
      - **Content Tabs**: Dynamic tabs (Overview, Campaigns, Events, Businesses, Articles, Products) — only tabs with real content are rendered; defaults to Overview.
      - **Overview tab**: Digital summary metrics (no zero cards), collapsible Impact/Donation section (starts **closed**).
      - **Profile header**: Clean borderless section with subtle bottom divider (no heavy card wrapper). White page background.
      - **Mobile bottom nav**: 4-item bar (Home, Tickets, Dashboard, **Explore**) — no menu dumping.
      - **External viewers**: No Explore button; owner-only management navigation hidden server-side.
    - Comprehensive regression test suite `lib/__tests__/dashboard-profile-architecture.test.cjs` (20 tests) verifying ownership isolation, profile privacy, profile menu generation, Explore UX controls, dynamic tab logic, digital summary metrics, Impact/organizer collapsed defaults, mobile nav labels, and navbar minimal structure. Full platform test suite: **499/499 passing** across 27 suites.

---

### B. PARTIALLY COMPLETE (Foundations Laid / In Progress)
1. **Business Directory vs Full Business Management**:
   - *Current State*: Basic business directory listings exist (`businesses` table, `app/businesses`, `app/dashboard/businesses`), along with entity linkage to `organizers`.
   - *Missing*: Multi-page mini-website builder, custom domain routing, branch management, service bookings, and POS sync (planned for Phases 1–8, 11–12).
2. **Connected Accounts & Multi-Channel Messaging**:
   - *Current State*: Schema for `connected_accounts`, `channel_assets`, `customer_identities`, `conversations`, and `messages` deployed (`migration_108`–`115`).
   - *Missing*: OAuth redirect handlers and webhook receivers for live Instagram, WhatsApp, and TikTok channel assets.
3. **AI Growth Studio Channels**:
   - *Current State*: Meta/Facebook photo and caption auto-publishing is live and verified.
   - *Missing*: Instagram feed/reels publishing, WhatsApp direct messaging tools, and generative image/voice pipelines (fal.ai, ElevenLabs keys provisioned in env but calling code not yet written).

---

### C. NOT IMPLEMENTED / PLANNED
1. **Services & Restaurant Menu Subsystems** (Phase 5).
2. **Appointment & Reservation Engine** (Phase 7).
3. **Business Management ERP & Multi-Branch Hub** (Phase 8).
4. **Public Developer API & Webhook Dispatch System** (Phases 9–10).
5. **POS Integration Framework** (Square, Clover, Toast, Shopify) (Phase 11).
6. **Custom Domain Proxy & SSL Auto-Provisioning** (Phase 12).
7. **External AI Developer Marketplace** (Phase 14).

---

## 2. Recent Repository Activity & Git Commits

- `Business + Event Taxonomy — Full Checklist (2026-09-23)` — feat: `lib/business-taxonomy.ts` (Industry→Category→Business Type 18/40+/80+ + CAPABILITIES 30+), `lib/event-taxonomy.ts` (20 categories→subcategories + legacy alias map), migrations 132/133 **manually applied** (no duplicate creation, verified via `db/migration_132_business_type_and_branches.sql` + `db/migration_133_add_event_subcategory.sql` + `supabase/migrations/20260915000000/1`), `lib/actions/businesses.ts` canonical validation, `NewBusinessFormClient`/`EditBusinessFormClient` controlled cascades with legacy `(legacy)` fallback + `MediaUploadField`, `NewWebsiteClient` business picker + `derivedWebsiteCategory` inheritance + `metadata.business_id` persistence (both blank + template paths) + `TemplateGallery initialCategory`, `app/create-event/page.tsx` + `app/events/edit/[id]/page.tsx` Category→Subcategory cascades via `lib/event-taxonomy.ts`, `lib/business-dashboard-modules.ts` capability registry + `app/dashboard/businesses/[id]/layout.tsx` capability-filtered nav + `app/dashboard/businesses/[id]/branches` CRUD (`lib/actions/business-branches.ts` generic error messages), `ImageUploadWithCrop` close modal error reset + `MediaUploadField` value sync, `lib/event-data.ts`/`lib/events-filters.ts`/`app/events/search/EventsSearchResultsSection.tsx`/`app/admin/events/page.tsx` canonical event taxonomy filtering. Verified: `npx tsc --noEmit` 0, `npx eslint` 0 errors (1 `no-img-element` warning in `NewWebsiteClient.tsx` preserved), `npm test` 612/612, `npm run build` compiled successfully.
- `Business Taxonomy — Creation/Editing UI` — feat: controlled Industry → Category → Business Type dropdowns in `NewBusinessFormClient.tsx`/`EditBusinessFormClient.tsx` via canonical `lib/business-taxonomy.ts` (INDUSTRIES, getCategoriesForIndustry, getBusinessTypesForCategory), cascade invalidation resets, legacy record fallback `(legacy)` for Industry/Category/Business Type in EDIT only, `MediaUploadField` for business logos, wired `business_type` to `businesses.business_type` (migration_132), server validation `lib/actions/businesses.ts` remains canonical. `npx tsc --noEmit` 0 errors, `npx eslint` 0 errors for taxonomy files, no duplicate taxonomy arrays, `npm test` 612/612.
  - `Phase 3 Stages A–C` — feat: code-owned immutable template registry (`lib/website-template-registry.ts` 6 templates @1.0.0, multi-page schema, legacy shim), section envelope & stable IDs (`lib/website-blocks.ts` normalize/clone, `defaultBlocks` + `builderReducer` + `website-builder` actions), business category vs template family (`lib/website-category.ts`, `migration_130 metadata JSONB`, `NewWebsiteClient` + `TemplateGallery` centralization). Backward compatible, no DB template mirror. 478/478 tests passing.
  - `Business Mini Website Extended — Hardening & Landing (2026-09-24)` — landed atomic instantiation (migration 131 `create_website_from_template` ON CONFLICT + creationRequestId), whitelisted hydration, element editing with prototype-pollution guard, section/container controls with outer/inner rendering parity, stable MOVE_BLOCK reordering, template library read-only preview, My Media tenant-scoped picker (5 surfaces). Parallel platform updates: migrations 132–135 (business_type/branches, event subcategory, homepage promotions, profile locale/i18n), capability-driven dashboard + branches, profile navigation, donations/donors. Verified: `npx tsc --noEmit --skipLibCheck` 0, `npx eslint` 0, `npm test` 650/650 (36 suites), `npm run build` compiled successfully.
- `Phase 4` — feat: visual website builder & editor — full 3-panel workspace, 12 property inspectors with client/server validation parity, state reducer with undo/redo/autosave, settings integration, consolidated `checkTenantAccess()` authorization, atomic RPC publish with TOCTOU version checks, and comprehensive regression test suites (411/411 tests passing → 478/478 after A–C).
- `Phase 3` — feat: website design system & block catalog — 10-type block schema (lib/website-blocks.ts), live embed resolvers (lib/website-embeds.ts), full visual block component library (BlockRenderer.tsx), 6 theme palettes with CSS token generation, draft badge gating, tenant-isolated embed queries, 339/339 tests passing.
- `Phase 2` — feat: public website rendering engine at `/site/[slug]/[[...page]]`, pre-stream proxy status gate, modular block renderer, JSON-LD structured data, nav staleness filter, and reserved slugs validation.
- `Phase 1` — feat: tenant websites CMS foundation schema, RLS privilege segregation (migrations 125 & 126), server actions, and org dashboard settings.

---

## 3. Active Blockers & Explicit Non-Goals

> [!CAUTION]
> **WHAT NOT TO BUILD YET:**
> - DO NOT alter existing event ticketing, seating, or fundraising ledgers — these are verified, live subsystems.
> - DO NOT construct raw SQL tools for AI — all tool additions must adhere to ADR-0002.
> - DO NOT attempt to replace Stripe with custom escrow or Stripe Connect without an explicit architectural decision.

---

## 4. Next Actionable Milestone

**Completed Checklist (2026-09-23):** `[✓]` business taxonomy, `[✓]` event taxonomy, `[✓]` migrations 132/133 applied, `[✓]` business create/edit cascades, `[✓]` website business inheritance, `[✓]` event create/edit cascades, `[✓]` capability-driven dashboard + branches, `[✓]` ImageUploadWithCrop sync, `[✓]` event search/filter/admin taxonomy, `[✓]` verification (tsc 0, eslint 0 errors, tests 612/612, build Pass).

**Completed Checklist (2026-09-24 — Hardening & Landing):** `[✓]` atomic instantiation migration 131 + hydration + idempotency, `[✓]` element editing with prototype guard, `[✓]` section/container controls with sanitized backgrounds, `[✓]` stable MOVE_BLOCK reordering, `[✓]` template library read-only preview, `[✓]` My Media tenant-scoped picker (5 surfaces, no Connected Media), `[✓]` migrations 134/135 present (homepage promotions, profile locale/i18n), `[✓]` verification (tsc 0, eslint 0, tests 650/650, build Pass).

**Next:** **Phase 5 — Products, Services & Menus** — migration 136 `services`/`menu_sections`/`menu_items`. See `docs/phases/phase-05-products-services.md`. Do NOT start until this hardening is committed and documented (this file).

