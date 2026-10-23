# Phase 1A — Information density, interaction, typography, and icons

Date: 2026-10-23

Status: implemented and verified in the staging working tree.

## Objective

Continue the platform-wide UI simplification under DEC-0054. Make primary tasks, typography, and interface icons consistent while revealing secondary information on demand. Keep the existing Zinc + Orange platform identity and preserve backend rules, tenant permissions, and template-owned visuals.

## Implementation

- Replaced application Lucide interface-icon imports with verified @tabler/icons-react exports and removed lucide-react as a dependency. Kept react-icons for intentional brand marks.
- Updated dynamic homepage-category icon rendering to an explicit alias map plus a safe Tabler fallback; navigation uses components/nav/platform-nav-icons.ts.
- Cook and courier create forms open only after the primary action. Errors keep the form open and retain values; successful submissions close, refresh, and preserve the existing invitation/action flow.
- Cook and courier records use compact native disclosure rows. Secondary contact, invitation, and management details remain in the expanded region; destructive actions are confirmed.
- Lazy-mounted cook/courier performance panels. Kept essential kitchen/order actions visible and simplified supporting text/typography.
- Organization Menu sections and items use page background, compact rows, and separators. Option-group editor text and controls are larger and touch-friendly; item/section icon actions have accessible names.
- Increased sidebar label, description, and badge contrast/readability in shared, organization, mobile, and admin navigation. Kept active, hover, and focus states.

## Scope boundary

The separate Phase 2 investigation into staging-only blank Website Builder and Invitation Builder routes is not part of this work. No claim is made that those failures are fixed.

## Verification

- `npm test`: **2,732 passed, 0 failed, 0 skipped** across 220 files.
- `npm run build`: passed; Next.js TypeScript check passed and all **386** static pages generated. The separate `npx tsc --noEmit -p tsconfig.build.json --pretty false` check also passed. The default development tsconfig check was stopped after exceeding 2 GB while traversing generated development types; the production check and build both completed.
- Focused ESLint on five representative changed files: **0 errors, 3 existing `<img>` optimization warnings** in `HomepageCmsTabs.tsx`. The full broad changed-file lint was not completed.
- `git diff --check`: passed after the final documentation and code changes.
- Authenticated Playwright login passed. The admin screenshot checks passed for users, organizers, fundraisers, businesses, and events at 1440px and 1100px (10/12 checks); both `/admin/articles` checks timed out waiting for a row/list item. The read-only route smoke returned HTTP 200 for that articles route.
- Authenticated read-only smoke visited 40 admin routes: **39 passed**. `/admin/workforce/sentinel/incidents/[id]` returned HTTP 200 but the smoke classifier flagged a `500` marker in its body. The dynamic detail screen needs a data-aware follow-up before it can be called clean.
- Authenticated organization pages `/dashboard/organizations`, Menu, Orders, Kitchen, and Promotions loaded at 1440px without browser page errors. The QA workspace has no menu items or orders and no business linked to Kitchen, so only empty states were reviewed. The Orders empty state was subsequently flattened and rechecked after the final build.

The separate Phase 2 investigation into staging-only blank Website Builder and Invitation Builder routes remains out of scope. No database or migration work was performed; no commit or push was made.
