# Platform UI simplification audit

Date: 2026-10-23

Status: implemented and locally verified in the staging working tree.

## Scope scanned

- The App Router contains **217 `page.tsx` route modules** (including localized and route-group copies): 94 dashboard, 40 admin, 7 events, 10 fundraisers, 5 invitations, 5 site, 4 articles, 4 products, 3 gated pages, 3 kitchen, 2 courier, and the remaining account, commerce, marketing, public, and platform routes.
- A filesystem/JSX surface scan covered **808 TSX files** under `app/` and `components/`, including route pages, shared components, builders, and templates. Static review focused on repeated card-like wrappers, table frames, form/empty-state containers, and nested surfaces; candidates were reviewed for workflow purpose before editing.
- Template-owned public business websites and guest invitation renderers were treated as their own visual systems and not globally restyled. Their builders were checked separately; changes there remove nested decoration from the block palette and flatten ordinary builder forms while retaining the preview canvas and selectable/reorderable records.

## Shared components changed

- `components/layout/Section.tsx`: semantic, unboxed, unpadded defaults; optional bordered sections no longer get a shadow.
- `components/ui/card.tsx`, `components/ui/button.tsx`, `components/layout/PageHeader.tsx`: removed default utility shadows.
- `components/dashboard/DashboardTableCard.tsx`: removed the decorative card frame around ordinary tables while keeping horizontal scrolling, loading feedback, empty content, and pagination.
- `components/ui/profile-card.tsx`, `components/dashboard/MyThingsView.tsx`, `components/courier/CourierDashboard.tsx`, `components/dashboard/kitchen/CourierPerformancePanel.tsx`, menu editors, and website/invitation builder pieces: removed redundant information/form/preview wrappers and stacked decoration.

## Route families and changes

- **Dashboard lists and event management:** articles, businesses, products, guests, event overview/seating, and eight organization-scoped blog/events/fundraisers/products listings now use direct table/section/empty-state content. The shared table frame change also reaches events, donations, attendees, fundraisers, organizers, and check-in history. Dashboard analytics metrics now use spacing and separators instead of nested icon tiles/cards; loading states mirror the unboxed tables.
- **Account, public search, and confirmations:** login/signup/password forms, guest ticket lookup, event search, ticket-search empty states, donation/payment explanatory copy, and comment eligibility panels are unboxed.
- **Kitchen and courier:** kitchen management, courier management/performance, and the courier dashboard use simpler section hierarchy. Per-order kitchen records, active delivery tasks, offer tasks, and per-courier performance records remain individually identifiable; nested metric tiles and informational subpanels were flattened.
- **Fundraising:** beneficiary and explanatory/form copy wrappers were removed without changing frozen green/lime colors or the existing checkout surfaces.
- **Admin workforce:** seven detail routes and the approval detail route use section separators for ordinary data. Incident/task/agent/knowledge/QA/report list records and contextual confirmation dialogs remain distinct.
- **Builders:** website block choices retain one selectable item surface; decorative icon tiles and empty-state frames were removed. Invitation builder event fields are unboxed; editable story moments remain independent reorderable records. Device/preview canvases remain visually distinct.
- **Organization Menu and promotions follow-up:** organization menu sections now use headings/actions on the page background, menu items use compact rows separated by dividers, and item/section forms and the empty state are unboxed. Promotion form groups use separators; the live promotion preview remains a purposeful preview surface. Option groups remain individually bordered as independent editable records, while option rows and the option preview are unboxed.
- **Sidebar contrast follow-up:** shared `SidebarNavList` light/dark tones, mobile pill navigation and drawers, both organization sidebar variants, personal dashboard settings, the profile account menu, and admin navigation now use stronger text/icon/badge contrast and visible keyboard focus. Active light navigation uses brand-700 (#c2410c) text on brand-50 (#fff7ed), 4.88:1; white on brand-700 is 5.18:1. Zinc-600 on white is 7.73:1, slate-300 on slate-950 is 13.59:1, brand-600 focus ring on white is 3.56:1, and violet-400 focus ring on slate-950 is 7.41:1. These representative foreground/background pairs meet WCAG AA for ordinary text or the 3:1 UI-graphic threshold; alpha-composited and status states were checked against their rendered background.

## Exceptions retained

- Kitchen orders, courier deliveries/offers, reservations, and independently editable product/menu/event/story records remain card-like where their independent actionability or selection benefits from a visible boundary.
- Meaningful metrics/charts, selectable templates, business/event overview metrics, and creation choices remain visual units.
- Device previews, map canvases, template previews, dialogs/sheets, semantic alert/confirmation regions, upload/drop zones, and input controls keep the boundaries needed for their function or accessibility.
- Public business-site template styling and invitation guest-template styling remain owned by their respective systems. Fundraising colors remain frozen as specified in `DESIGN.md` §2.3.

## Permanent rule

`DESIGN.md`, `AGENTS.md`, and `CLAUDE.md` now say that ordinary content belongs directly on the page background by default; ordinary text, forms, filters, toolbars, tabs, tables, lists, settings, and empty states are unboxed; cards are reserved for meaningful independent units; nested cards need a functional reason; and new pages must follow these rules. Sidebar text must meet 4.5:1 and icons/focus indicators 3:1 against actual light/dark surfaces. Platform controls/cards have no default shadow. `docs/DECISIONS.md` records the design rules in DEC-0054.

## Verification

- `git diff --check`: passed.
- Changed-file ESLint: passed with 0 errors and 22 warnings (existing unused-variable and `<img>` advisories in changed files).
- Production TypeScript check (`npx tsc --noEmit -p tsconfig.build.json --pretty false`): passed.
- `npm test`: passed 2,730/2,730 tests across 219 files, 0 failures, 0 skipped.
- `npm run build`: passed; Next.js compiled and generated 386 static pages.
- Playwright browser review: `/login`, `/find-tickets`, and `/events` at 375px, 768px, 1024px, and 1440px (12 page/viewport combinations). All returned HTTP 200 with no horizontal overflow or page errors. This checks responsive framing for public representative routes, not every route's content.
- **Remaining visual limitation:** a fresh local browser context redirects protected dashboard/kitchen/courier/builder pages to login; no authenticated screenshots of those areas were available. The `/events` CMS banner artwork includes a baked-in brand mark/tagline that overlaps the live headline, a separate artwork/content issue.

## Follow-up verification — Menu and navigation (2026-10-23)

- Changed-file ESLint passed with 0 errors and 29 advisory warnings; a final focused run over navigation, menu, account, and organization sidebar components passed with 0 errors and 7 warnings. Warnings are unused-variable, `<img>`, and internal `window.location.href` advisories.
- Production TypeScript passed. `npm test` passed 2,730 tests across all 219 registered files (0 failures, 0 skipped). `npm run build` compiled and generated all 386 static pages. `git diff --check` passed.
- Contrast calculations include light active navigation (brand-700 on brand-50, 4.88:1), white on brand-700 (5.18:1), zinc-600 on white (7.73:1), slate-300 on slate-950 (13.59:1), brand-600 focus on white (3.56:1), and violet-400 focus on slate-950 (7.41:1).
- No authenticated screenshots of Organization Menu, Orders, Kitchen, Delivery, Website Builder, Invitation Builder, or authenticated dashboard sidebars could be captured. The existing e2e login expects `QA_TEST_EMAIL` and `QA_TEST_PASSWORD`, which are absent from `.env.local`, and its OS-temp storage-state file is absent. The current pasted-text attachment directory contains the text brief only, no screenshot image file; implementation follows its written description of the Menu screenshot.
- Existing public-route browser review remains `/login`, `/find-tickets`, and `/events` at 375px, 768px, 1024px, and 1440px; this follow-up did not claim authenticated viewport coverage.

No database or migration work was performed. No commit or push was made. Existing untracked files in the worktree were preserved.

## Phase 1A follow-up verification (2026-10-23)

- Replaced the app's Lucide interface imports with verified Tabler exports, documented the permanent icon/readability/progressive-disclosure rules, added on-demand staff forms and expandable records, and flattened the Orders empty state. See `docs/phases/phase-1a-platform-ui.md` for changed behavior and scope.
- **Build and tests:** `npm run build` passed with its TypeScript phase and generated 386 static pages; `npx tsc --noEmit -p tsconfig.build.json --pretty false` passed; `npm test` passed 2,732/2,732 tests across 220 files; focused ESLint on five representative files had 0 errors and 3 `<img>` advisories; `git diff --check` passed. Full changed-file ESLint was not completed. The default development TypeScript pass was stopped after exceeding 2 GB while reading generated dev types.
- **Authenticated admin review:** login passed. Screenshot/layout checks passed for users, organizers, fundraisers, businesses, and events at 1440px and 1100px (10/12 checks). `/admin/articles` returned HTTP 200 in route smoke but the screenshot test could not find a row/list item. The 40-route read-only admin smoke had 39 passes; `/admin/workforce/sentinel/incidents/[id]` returned HTTP 200 but the classifier flagged a `500` marker in the body.
- **Authenticated organization review:** organization list, Menu, Orders, Kitchen, and Promotions loaded at 1440px with no browser page errors. The QA data had no menu items or orders and no business linked to Kitchen, so populated list/personnel flows were not visually checked. Orders was re-screenshotted after its final empty-state flattening.
- These screenshots used the existing QA login setup and were saved under the OS temp `opencode/aldriva-admin` directory, outside the repository. Earlier statements in this audit that no authenticated session was available describe the earlier verification pass and are superseded here.
- No database or migration work was performed. No commit or push was made. The separate Phase 2 blank Builder investigation was not started.
