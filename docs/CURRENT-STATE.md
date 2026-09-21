# Aldriva — Current Implementation State & Living Status

> **WHERE ARE WE RIGHT NOW?**  
> **Current Phase**: **Phase 4 — Visual Website Builder & Editor** (COMPLETE & FULLY VERIFIED — Tasks 4.1, 4.2, 4.3 & 4.4)  
> **Prerequisites for Phase 4**: **migration_128 & migration_129 (website_page_drafts, publishing guard, atomic RPC)** (Completed & Verified)  
> **Next Step**: **Phase 5 — Services, Menus & Catalog Subsystems**  
> **Last Verified**: September 2026  
> **Test Suite**: 411/411 passing (21 suites, 0 failures)  
> **TypeScript Health**: 0 errors (`npx tsc --noEmit` verified)  
> **Build Health**: Next.js production build verified (`npm run build` exits code 0)

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
     - Media upload integration: `MediaUploadField` targeting `cms-media` bucket under `<tenant_id>/...`.
     - Main dispatcher: `BlockInspector`.
   - Three-panel visual builder workspace at `app/dashboard/org/[id]/website/builder/page.tsx`:
     - Palette (`BlockPalette.tsx`), Canvas (`BuilderCanvas.tsx`), Inspector (`BlockInspector.tsx`), Toolbar (`BuilderToolbar.tsx`).
     - Responsive device preview (Desktop 100%, Tablet 768px, Mobile 375px), inline reorder, duplicate, remove, undo/redo reducer history, debounce autosave with publish synchronization.
   - Settings integration in `WebsiteSettingsClient.tsx` with "Edit in Builder" links for all page rows and header action.
   - Payout KYC verification gate in `lib/payouts.ts` (`requestRecipientPayout()`) ensuring funds movement is strictly blocked for unverified organizer/business identities.
   - Regression test suites registered in `package.json`: `website-builder-actions.test.cjs`, `website-builder-inspectors.test.cjs`, `website-builder-canvas.test.cjs`, `website-builder-integration.test.cjs`, `migration129-publishing-guard.test.cjs`, `payout-verification-authz.test.cjs`. Total platform test suite: 411/411 passing.

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

- `Phase 4` — feat: visual website builder & editor — full 3-panel workspace, 12 property inspectors with client/server validation parity, state reducer with undo/redo/autosave, settings integration, consolidated `checkTenantAccess()` authorization, atomic RPC publish with TOCTOU version checks, and comprehensive regression test suites (411/411 tests passing).
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

**Phase 5: Services, Menus & Catalog Subsystems**
- Data models & dashboard management interfaces for salon/spa/professional services and restaurant menus.
- Embed blocks and public site renderers for services and menu items.

