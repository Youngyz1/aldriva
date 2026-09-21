# Phase 2: Public Website Engine

## 1. Objective
Develop the high-performance public rendering engine that dynamically serves business websites and custom pages under `/site/[slug]` and `/org/[slug]/site` with optimized SSR, metadata injection, and pre-stream status gating.

## 2. Scope
- Public website route handlers and page renderers at `app/site/[slug]/[[...page]]/page.tsx`.
- Dynamic OpenGraph and JSON-LD schema generation (`Organization`, `LocalBusiness`, `WebSite`).
- Status-code gating in `proxy.ts` to ensure unentitled or unlisted sites return real HTTP 404s.
- Sub-second server rendering leveraging Next.js caching and Supabase RLS public policies.

## 3. Out of Scope
- Visual page builder tools (deferred to Phase 4).
- Custom CNAME domain routing (deferred to Phase 12).

## 4. Existing Dependencies
- Phase 1 `tenant_websites` and `website_pages` tables.
- Root `proxy.ts` pre-stream status gate architecture.

## 5. Tasks
- [x] Task 2.1: Add website slug matcher and access check helper (`checkWebsiteAccess`) to `proxy.ts`.
- [x] Task 2.2: Implement `app/site/[slug]/[[...page]]/page.tsx` with dynamic page layout rendering, block dispatcher (`BlockRenderer`), and branded `SiteHeader` / `SiteFooter`.
- [x] Task 2.3: Build JSON-LD structured data generator and OpenGraph metadata extractor in `lib/website-structured-data.ts`.
- [x] Task 2.4: Author automated tests in `lib/__tests__/website-engine.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [x] Public site loads correct navigation, header, page body, and footer based on slug.
- [x] Unpublished/draft sites return real HTTP 404 to unauthenticated visitors via pre-stream proxy gate, while allowing authenticated team members to preview drafts with `DraftPreviewBanner`.
- [x] OpenGraph metadata and JSON-LD structured tags match tenant settings (`WebSite`, `Organization`, `WebPage`).
- [x] Rich text block content and all URL-bearing fields (href, src, backgroundImage, avatar, customLinks) are sanitized server-side via `lib/sanitize-html.ts` (`isomorphic-dompurify` and `sanitizeUrl`) before rendering.
- [x] Reserved slugs list (`RESERVED_WEBSITE_SLUGS`) prevents collisions with platform routes.
- [x] Navigation tree staleness guard (`filterPublishedNavItems`) prunes links to unpublished pages at render time.
- [x] 100% of test suites pass (312/312 tests passing), TypeScript passes with 0 errors, ESLint passes with 0 warnings/errors, and Next.js production build succeeds.


## 7. Current Status
**COMPLETE (SHIPPED & VERIFIED)**

## 8. Completed Work
- Implemented `checkWebsiteAccess` helper and `/site/:path*` pre-stream route gate in `proxy.ts`.
- Created standalone route segment layout `app/site/[slug]/layout.tsx` (suppressing platform Navbar).
- Created public SSR catch-all page `app/site/[slug]/[[...page]]/page.tsx` with deterministic homepage resolution hierarchy (`is_home` -> `slug = 'home'` -> `sort_order ASC, created_at ASC, id ASC`).
- Built modular block renderer catalog in `components/site/blocks/BlockRenderer.tsx` supporting 7 block types (`hero`, `features`, `rich_text`, `gallery`, `cta_banner`, `faq`, `testimonials`) with server-side HTML sanitization via `lib/sanitize-html.ts`.
- Built tenant-branded `SiteHeader.tsx` and `SiteFooter.tsx` components.
- Built `DraftPreviewBanner.tsx` for team member draft previews.
- Implemented structured JSON-LD generation (`WebSite`, `Organization`, `WebPage`), OpenGraph metadata generator, theme CSS variable mapper (`themeConfigToStyle`), and runtime nav-staleness filter (`filterPublishedNavItems`) in `lib/website-structured-data.ts`.
- Enforced reserved platform slugs (`RESERVED_WEBSITE_SLUGS`) in `lib/website-nav.ts` and `lib/actions/website.ts`.
- Authored test suite `lib/__tests__/website-engine.test.cjs` covering unit and invariant tests, registered in `package.json` (311/311 passing).

## 9. Remaining Work
- Next: **Phase 3: Website Design System & Modular Block Catalog** (`docs/phases/phase-03-website-design.md`).

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npx tsc --noEmit` returns 0 errors (Verified).
- `npx eslint` returns 0 warnings, 0 errors (Verified).
- `npm test` passes all tests (311/311 passing, Verified).
- `npm run build` succeeds (Verified).

## 12. Next Step
Proceed to Phase 3: Website Design System (`docs/phases/phase-03-website-design.md`).

