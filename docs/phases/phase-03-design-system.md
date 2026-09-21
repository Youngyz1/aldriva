# Phase 3: Website Design System

## 1. Objective
Create a modular, accessible, and responsive block component catalog for business websites, enabling businesses to construct custom pages from pre-built layout blocks following Aldriva design primitives.

## 2. Scope
- Define TypeScript JSON block schema (`WebsiteBlockSchema`) and validation in `lib/website-blocks.ts`.
- Implement server-side live embed resolvers for events, products, and fundraisers in `lib/website-embeds.ts`.
- Build all 10 visual block components in `components/site/blocks/BlockRenderer.tsx`:
  - `HeroBlock` (split, center, video_bg variants)
  - `FeaturesGridBlock` (2/3/4-col icon grids)
  - `AboutBlock` (story prose, mission callout, metrics, founder bio)
  - `GalleryBlock` (grid, masonry, carousel)
  - `TestimonialsBlock` (star ratings, grid/carousel, avatar initials fallback)
  - `ContactBlock` (email/phone/address/hours icon cards + Google Maps link)
  - `FAQBlock` (details/summary accordion)
  - `EventsEmbedBlock` (live events feed — server-side resolver)
  - `ProductsEmbedBlock` (live store feed — server-side resolver)
  - `FundraiserEmbedBlock` (live campaign banner — server-side resolver)
- Provide responsive theme palettes: `default`/`zinc_orange`, `dark`, `slate`, `warm_amber`, `forest`.

## 3. Out of Scope
- Visual canvas editor (deferred to Phase 4).
- Custom CSS code injection.

## 4. Existing Dependencies
- Shared UI primitives in `components/ui/`.
- Phase 2 Public Website Engine (`app/site/[slug]/[[...page]]/page.tsx`).
- `sanitizeUrl()` and `sanitizeArticleHtml()` from `lib/sanitize-html.ts` (write-time and render-time XSS protection).

## 5. Tasks
- [x] Task 3.1: Define block component interfaces and validation in `lib/website-blocks.ts`.
- [x] Task 3.2: Implement live embed block resolvers in `lib/website-embeds.ts`.
- [x] Task 3.3: Implement full 12-type visual block component library in `components/site/blocks/BlockRenderer.tsx` and wire theme token generation to `app/site/[slug]/[[...page]]/page.tsx`.
- [x] Task 3.4: Update repository documentation (`CURRENT-STATE.md`, `CHANGELOG.md`, `DECISIONS.md`, phase doc).

## 6. Acceptance Criteria
- [x] All 10 block components render reliably across mobile, tablet, and desktop viewports.
- [x] Live embedded event/product/fundraiser blocks correctly pull tenant data (server-side, tenant-isolated).
- [x] All tests passing (339/339).

## 7. Current Status
**COMPLETE** — Verified September 2026. 339/339 tests passing, 0 TypeScript errors, 0 ESLint warnings.

## 8. Completed Work

### Task 3.1 — `lib/website-blocks.ts`
- 12 TypeScript block type interfaces (10 standard + 2 legacy: `rich_text`, `cta_banner`).
- `validateBlock()` with length bounds, array item caps (max 12 per array field), UUID format regex on `selectedEventIds` / `selectedProductIds` / `selectedFundraiserIds`, and URL safety backed directly by `sanitizeUrl()` from `lib/sanitize-html.ts` — no separate regex, no drift risk.
- Fallback `parseBlock()` / `parseBlocks()` for resilient JSONB rendering without hard failures.
- Six theme palette presets with `resolveThemeTokens()` and `themeTokensToStyle()` generating CSS custom properties (`--site-primary`, `--site-bg`, `--site-text`, etc.).
- 15 unit tests in `lib/__tests__/website-blocks.test.cjs` (registered in `package.json`).

### Task 3.2 — `lib/website-embeds.ts`
- `resolveEventsEmbed(block, tenantId, isTeamMember)`: scoped to `events.organizer_id = tenantId`, status gating, LIMIT clamped 1–12.
- `resolveProductsEmbed(block, tenantId, isTeamMember)`: two-step join `businesses.organizer_id = tenantId → products.business_id`. **No `owner_id` fallback** — returns `[]` if no business linked (cross-tenant safety decision, DEC-0012).
- `resolveFundraiserEmbed(block, tenantId, isTeamMember)`: scoped to `fundraisers.organizer_id = tenantId` with `deleted_at IS NULL` guard.
- All resolvers use `createSupabaseAdmin()` (service-role, bypasses RLS) but enforce `organizer_id` equality explicitly.
- Draft badge shown only to authenticated `isTeamMember`; public visitors see only published/active records.
- 9 unit tests in `lib/__tests__/website-embeds.test.cjs` (registered in `package.json`), including multi-tenant cross-contamination regression test.

### Task 3.3 — `components/site/blocks/BlockRenderer.tsx` + `app/site/[slug]/[[...page]]/page.tsx`
- Replaced Phase 2's 7-type sync dispatcher with a 12-type async Server Component.
- `DraftBadge` and `SectionHeading` reusable primitives added inline.
- All embed block renderers `await` resolvers server-side — DB queries never exposed to client.
- `tenantId` injected from server route (`tenant_websites.tenant_id`) — never trusted from block JSON.
- Theme tokens applied in `page.tsx`: `resolveThemeTokens()` + `themeTokensToStyle()` merged with `themeConfigToStyle()` (font/radius), scoped to public site `<div>` wrapper — no bleed into dashboard/admin layouts.
- Design system compliance: `rounded-xl` cards, `shadow-xs`, zinc/orange tokens, `var(--site-primary, #c2410c)` fallbacks, no gradients on interactive elements, no glassmorphism.
- Test added: structural assertion in `website-blocks.test.cjs` §7 verifying all 12 `case "X":` dispatchers, resolver call sites, and theme wiring in `page.tsx`.

### Task 3.4 — Documentation
- `docs/CURRENT-STATE.md`: Updated phase banner, test count, Phase 3 entry in COMPLETE section, advanced next milestone to Phase 4.
- `docs/CHANGELOG.md`: Phase 3 entry added (Tasks 3.1–3.3 summary with verification results).
- `docs/DECISIONS.md`: DEC-0012 (server-side embed resolution + no `owner_id` fallback) and DEC-0013 (`sanitizeUrl()` reuse over separate regex) added.
- This file: all `[ ]` tasks checked, status set to COMPLETE.

## 9. Remaining Work
- None. All tasks complete.

## 10. Known Issues
- None.

## 11. Verification Requirements (Actual Results)
- `npx eslint components/site/blocks/BlockRenderer.tsx lib/website-blocks.ts lib/website-embeds.ts app/site/[slug]/[[...page]]/page.tsx` → exit 0, 0 errors, 0 warnings. ✅
- `npx tsc --noEmit` → exit 0, 0 type errors. ✅
- `npm test` → **339/339 tests pass, 0 failures** (20 suites). ✅

## 12. Next Step
Phase 4: Visual Website Editor Canvas — drag-and-drop block placement UI using the `lib/website-blocks.ts` schema.
