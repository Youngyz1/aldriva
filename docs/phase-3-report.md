# Aldriva Menu Options Upgrade — Phase 3 Checkpoint D

**Status:** Checkpoint D review; awaiting approval. **No migrations or database writes were run.** The report records repository evidence and the checks run in the authoritative staging checkout.

## Recovered state

- **[VERIFIED]** Working branch at recovery: `feat/menu-options-phase-3`; Phase 2 tip: `15bb0d9`.
- **[VERIFIED]** The Phase 3 commits already present at recovery were `3663011`, `0105c8a`, `911bce8`, `67f6935`, and `54385d4`. The original tracked working tree was clean; the only untracked files were the six protected scratch files listed below.
- **[VERIFIED]** Follow-up fixes were committed separately: `df91b61` (selection validation and stale cart cleanup), `2e94ab4` (cart price fingerprints and v4 migration), and `cc9b2b3` (menu image dimensions).
- **[VERIFIED]** The six pre-existing untracked scratch files remain untouched: `.tmp-soundcloud-proof.cjs`, `StorefrontBrowse.3b6c660.bak`, `StorefrontBrowse.broken.bak`, `StorefrontBrowse.head.bak`, `test-files.json`, and `tsc-output.txt`.
- **[VERIFIED]** Twenty PNGs are present in `docs/phase-3-screenshots/`; each has a modification time newer than the Phase 2 tip. The inventory and review limits are below.

## Feature check

| Item | Status | Evidence and coverage |
|---|---|---|
| **0.1 Reused-group upgrade guard** | **DONE — [VERIFIED]** | `lib/actions/menu-option-groups.ts:487-494` rejects reused groups whose item assignment still contains legacy hidden IDs or price overrides. `lib/__tests__/phase0-menu-options-regressions.test.cjs:207-215` covers the guard and clean assignment data. Migration 183 SHA-256 is `83B29AC2DA5065F0C8806BDC9124183F69D0C06A677E8F9774A0F804E4E9C3E0`, matching the required hash. |
| **0.2 Duplicate JSON groups** | **DONE — [VERIFIED]** | `lib/menu-option-backfill.cjs:56-70` deduplicates by normalized signature and keeps the first position. `lib/__tests__/phase0-menu-options-regressions.test.cjs:200-210` checks one group, one assignment, and first position retained. |
| **A. Customization sheet** | **DONE — [VERIFIED]** | `components/site/blocks/StorefrontBrowse.tsx:1377-1400,1519-1555,1633-1669,1719-1732` uses the shared satisfaction/rules helpers, reports and focuses the first unsatisfied group, exposes the dialog, option descriptions/allergens/thumbnails and max-quantity controls, and announces the live total. Thumbnails render only with an image URL and use lazy loading plus fixed dimensions. Focus handling, Escape, defaults, and customer/server pricing parity are covered in `lib/__tests__/storefront-browse.test.cjs:131-183,296-318,960-980,1092-1128`. |
| **B. One-tap add** | **DONE — [VERIFIED]** | `lib/storefront-browse.ts:88-120` removes unavailable choices before deciding whether a group is selectable; `components/site/blocks/StorefrontBrowse.tsx:503-510` blocks sold-out/customizable items from direct add and announces success. `lib/__tests__/storefront-browse.test.cjs:967-1015` covers the option-free, unavailable-only, customizable, sold-out, and blocked cases. |
| **C. Cart** | **PARTIAL — [VERIFIED]** | `lib/storefront-cart.ts:4-69,76-110,130-157` migrates v1-v3 data to v4, keeps stable IDs and option references, reconciles missing/unavailable/sold-out items, enforces group/option limits, and caps merges at `MAX_LINE_QUANTITY`. New v4 lines save only references plus `priceVersion`, a price fingerprint; the live price is recalculated and compared at `components/site/blocks/StorefrontBrowse.tsx:496-500,2098-2117`. Edit/merge/cap flows and migration are covered at `lib/__tests__/storefront-browse.test.cjs:185-234,1080-1128`. **Limitation:** v3 lines created before this fix have only the former item update timestamp, not a prior price fingerprint. Migration preserves the line and selections but drops that timestamp; a “Price updated” warning cannot be reconstructed for that old local line without a historic price or timestamp resolver field. Current v4 lines detect changed base or option prices. |
| **D. Browsing** | **DONE — [VERIFIED]** | `components/site/blocks/StorefrontBrowse.tsx:815-845,760-765,393-430,920-937` implements sticky category tabs, roving tabindex/arrow keys, scroll-spy, header/tab scroll margin, and near-viewport section rendering; initial/active sections and no-`IntersectionObserver` fallback are covered at `lib/__tests__/storefront-browse.test.cjs:292-303,1020-1075`. Bottom padding protects the last section from the floating cart bar (`StorefrontBrowse.tsx:666-670,1154-1158`). Search and no-results state are at `StorefrontBrowse.tsx:846-908`. The cap notice is rendered by `components/site/blocks/BlockRenderer.tsx:2212,2421-2425`, outside the lazily populated groups, so lazy rendering does not hide it. **[VERIFIED]** `lib/website-embeds.ts:121-122,374,387-388,442` retains the 100/500 caps; the resolver is unchanged from Phase 2. |
| **E. Order views** | **DONE — [VERIFIED]** | `lib/order-option-display.ts:1-24` formats group name, kind, option name, and quantity with old-snapshot fallback. It is used by `components/dashboard/orders/OrderCard.tsx:809`, `components/site/OrderTrackingView.tsx:418`, and `lib/order-notifications.ts:123`; test coverage is at `lib/__tests__/storefront-browse.test.cjs:234-245`. |
| **F. Budget and images** | **DONE — [VERIFIED]** | `components/site/blocks/StorefrontBrowse.tsx:231,944,976,1004,1450-1456,1542,1587,1656` and `components/site/blocks/CatalogCard.tsx:53-62` use lazy image loading and intrinsic dimensions; menu static markup does the same at `components/site/blocks/BlockRenderer.tsx:2370,2375,2409`. The image-source regression is `lib/__tests__/storefront-browse.test.cjs:278-288`. `package.json` and `package-lock.json` are unchanged from Phase 2. Current bundle evidence is below. |

## Required invariants

- **[VERIFIED]** `git diff feat/menu-options-phase-2..HEAD -- db/ supabase/migrations/` is empty. Migration 182/183, RLS policy files, and database schema were not changed; no migration or DB write was run.
- **[VERIFIED]** `lib/order-submit.ts` is unchanged from Phase 2, so the chosen-option snapshot shape remains unchanged (`id`, `name`, `price_delta`, optional variant `price`, `group_id`, `group_name`, `group_kind`, `qty`); Phase 3 only changes display formatting.
- **[VERIFIED]** The server still computes submitted prices through the existing shared pricing functions in `lib/menu-pricing.ts:300-357,484-510`. The follow-up changes affect selection validation for empty/unavailable groups and do not alter the pricing formula or server defaults.
- **[VERIFIED]** No dependency was added; the menu item caps remain 100 per section and 500 overall.

## Checks

| Check | Result |
|---|---|
| Phase 2 baseline | **[INFERRED]** The user-supplied task gives 2,497 passing tests across 196 files. The Phase 2 tip was not rerun. |
| Pre-fix Phase 3 attempt | **[VERIFIED from recovery notes; ran in a mirror, not staging]** 2,505 passed and 1 failed in chunk 6 (`r2-media-amendment.test.cjs`). That file passed 13/13 when run alone. |
| Focused storefront suite after fixes | **[VERIFIED]** 47 passed, 0 failed. |
| `npm run test:chunked` after fixes | **[VERIFIED]** 2,507 passed, 0 failed; 196 files across 7 chunks. |
| `npx tsc --noEmit --pretty false` | **[VERIFIED]** Passed in staging. The successful production build also completed its TypeScript phase. |
| ESLint on changed source and test files | **[VERIFIED]** Passed with no diagnostics. |
| `npm run build` | **[VERIFIED]** Next.js 16.3.4 / Turbopack build completed: optimized compile, TypeScript, and 366/366 static pages. |
| `git diff --check` | **[VERIFIED]** Passed after code changes; rerun after this report commit. |

### Bundle measurement

- **[VERIFIED] Current:** the successful Turbopack build’s `/site/[slug]/[[...page]]` client-reference manifest references 15 unique JavaScript chunks totaling **743,019 raw bytes / 218,496 gzip bytes**. This measures unique route client chunks from the manifest.
- **[NOT FOUND] Baseline artifact:** no Phase 2 client-reference manifest is present in the repo to independently reproduce the earlier number. The prior report claims **728,529 raw / 214,624 gzip / 15 chunks** for Phase 2. If that claim is accurate, the inferred change is **+14,490 raw / +3,872 gzip bytes** (about +2.0% / +1.8%). Treat that delta as directional, not independently verified. The prior report’s Webpack Phase 3 figure is superseded by this successful same-bundler build.

## Screenshot inventory and visual QA

**[VERIFIED]** The 20 files below exist; PNG headers confirm 375×812 or 1440×960 pixel dimensions, and file sizes are listed in bytes. Filename-derived flow descriptions are not proof of every screenshot’s contents. I visually inspected only the seven marked “checked”; the remaining files were not individually opened. All files predate the recovery fixes, so they do not visually verify the new unavailable-only one-tap case, price fingerprint notice, or image attributes.

| Flow implied by filename | 375 light | 375 dark | 1440 light | 1440 dark |
|---|---|---|---|---|
| Required group unsatisfied | [`light-375-required-unsatisfied.png`](phase-3-screenshots/light-375-required-unsatisfied.png) · 375×812 · 39,590 B — checked | [`dark-375-required-unsatisfied.png`](phase-3-screenshots/dark-375-required-unsatisfied.png) · 375×812 · 40,786 B — checked | [`light-1440-required-unsatisfied.png`](phase-3-screenshots/light-1440-required-unsatisfied.png) · 1440×960 · 79,340 B — checked | [`dark-1440-required-unsatisfied.png`](phase-3-screenshots/dark-1440-required-unsatisfied.png) · 1440×960 · 82,161 B — filename only |
| Required group satisfied / live total | [`light-375-required-satisfied-total.png`](phase-3-screenshots/light-375-required-satisfied-total.png) · 375×812 · 38,841 B — checked | [`dark-375-required-satisfied-total.png`](phase-3-screenshots/dark-375-required-satisfied-total.png) · 375×812 · 41,040 B — filename only | [`light-1440-required-satisfied-total.png`](phase-3-screenshots/light-1440-required-satisfied-total.png) · 1440×960 · 77,960 B — filename only | [`dark-1440-required-satisfied-total.png`](phase-3-screenshots/dark-1440-required-satisfied-total.png) · 1440×960 · 80,283 B — filename only |
| One-tap add / cart bar | [`light-375-one-tap-cart-bar.png`](phase-3-screenshots/light-375-one-tap-cart-bar.png) · 375×812 · 49,648 B — checked | [`dark-375-one-tap-cart-bar.png`](phase-3-screenshots/dark-375-one-tap-cart-bar.png) · 375×812 · 51,246 B — filename only | [`light-1440-one-tap-cart-bar.png`](phase-3-screenshots/light-1440-one-tap-cart-bar.png) · 1440×960 · 61,521 B — filename only | [`dark-1440-one-tap-cart-bar.png`](phase-3-screenshots/dark-1440-one-tap-cart-bar.png) · 1440×960 · 66,217 B — filename only |
| Cart edited options | [`light-375-cart-edited-options.png`](phase-3-screenshots/light-375-cart-edited-options.png) · 375×812 · 41,097 B — checked | [`dark-375-cart-edited-options.png`](phase-3-screenshots/dark-375-cart-edited-options.png) · 375×812 · 42,737 B — filename only | [`light-1440-cart-edited-options.png`](phase-3-screenshots/light-1440-cart-edited-options.png) · 1440×960 · 55,459 B — filename only | [`dark-1440-cart-edited-options.png`](phase-3-screenshots/dark-1440-cart-edited-options.png) · 1440×960 · 56,856 B — filename only |
| Category tabs active | [`light-375-category-tabs-active.png`](phase-3-screenshots/light-375-category-tabs-active.png) · 375×812 · 48,384 B — checked | [`dark-375-category-tabs-active.png`](phase-3-screenshots/dark-375-category-tabs-active.png) · 375×812 · 50,067 B — filename only | [`light-1440-category-tabs-active.png`](phase-3-screenshots/light-1440-category-tabs-active.png) · 1440×960 · 55,232 B — filename only | [`dark-1440-category-tabs-active.png`](phase-3-screenshots/dark-1440-category-tabs-active.png) · 1440×960 · 57,742 B — filename only |

- **[NOT FOUND]** No capped-menu-notice screenshot exists in the screenshot directory.
- **[VERIFIED]** A localhost recapture was not run: port 3101 was closed and `app/phase3-preview/page.tsx` is absent. I did not start a browser against a missing preview. The dark-named sample reviewed shows a mostly white sheet; public-site tokens do not define a separate dark palette, so these captures do not establish dark-theme support.

## Manual QA checklist for localhost at 375px

Run against a local fixture and stop before submitting an order.

1. Open an item with a required group and try adding without a choice. Confirm the group is brought into view and focus, a visible message/highlight appears, and the add button remains available.
2. Pick the required choice. Confirm selection and total update. Check a free add-on default; for a `max_qty > 1` option, increment/decrement and verify its quantity and total.
3. Open a variant item. Confirm the default-or-first available variant is selected, its full price is used, and promo strikethrough is absent.
4. Add an item with no available groups using `+`; confirm direct add and the “Added to order” announcement. Confirm an item with an available group opens the sheet and a sold-out item cannot be added.
5. Open the cart, edit a line and save; confirm the same line ID updates. Add the same selection twice and confirm merge. Test the 50-item cap and message. Change a selected item/option price, reload, and verify a v4 line shows “Price updated” while using the new total.
6. With a menu containing more than 100 section items or 500 total items, confirm the cap notice remains visible while scrolling/lazy sections load.
7. Use Left/Right arrows and clicks on category tabs; verify active tab/focus, header offset, and that the floating cart bar does not cover the last content. Search by name/description, check no-results, and clear search.
8. At 1440px, verify the sheet is centered; at both widths inspect group labels, option details, image crops, close behavior, and reduced-motion behavior.
9. Review a new-format order fixture in staff card, tracking view, and notification preview; also confirm an old snapshot still renders.

## Deferred / product questions

- **[NOT FOUND]** No capped-notice screenshot and no post-fix browser capture; manual visual QA remains for localhost.
- **[INFERRED]** Existing v3 local cart lines cannot receive an accurate price-change warning after migration because they contain no historic price/version fingerprint and the resolver is intentionally unchanged. Decide whether that compatibility warning is needed for pre-release local carts.
- **[INFERRED]** Should public business sites gain a deliberate dark palette in a later design phase? Current token styles and reviewed captures do not show a separate public-site dark theme.
- **[INFERRED]** Should paid add-on defaults ever be preselected? Phase 3 preserves the existing free-default-only behavior.
