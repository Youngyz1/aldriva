# Menu Options Upgrade — Phase 3 Customer Ordering

**Status:** Implemented in the working tree; Checkpoint D review pending. No database operation or migration was run.

## Summary

- Added an item customization sheet with required groups first, real rule badges, available option details, default selections, per-option quantity controls, shared client/server pricing helpers, live totals, and actionable validation that focuses the first unsatisfied group.
- Added direct one-tap add for available items with no visible option groups. Cards with any available group still open the sheet; sold-out items cannot be added.
- Moved cart behavior into version 3 helpers. Cart lines keep item/option references rather than prices, migrate old formats, reconcile removed menu data, edit in place, merge identical selections, cap quantity at 50, and show when current pricing differs.
- Added keyboard-operable category tabs, scroll-spy, near-viewport section rendering with a no-IntersectionObserver fallback, and client-side search over the data already loaded.
- Found and fixed an order-display gap: the three old displays showed option names without the new group context. They now render group name, option kind, and quantity for new snapshots and retain legacy rendering for old snapshots.
- The Phase 0 carry-over fixes are already isolated in HEAD commit `3663011` (`fix: dedupe legacy menu option upgrades`): converter assignments for reused groups contain no legacy IDs or overrides, and identical JSON groups deduplicate while keeping the first position.

## Evidence by Feature

| Feature | Evidence |
|---|---|
| Customization, validation, defaults, live price | `components/site/blocks/StorefrontBrowse.tsx:1171` (sheet), `:1521` and `:1635` (required feedback), `:1731` (live announcement/total); `lib/storefront-browse.ts:82` (defaults and rules); `lib/menu-pricing.ts:328` (shared selected-price calculation). |
| One-tap add | `components/site/blocks/StorefrontBrowse.tsx:507` (eligibility), `:979` and `:1027` (card buttons); `components/site/blocks/CatalogCard.tsx:98` (carousel card action). |
| Cart versioning/edit/merge | `lib/storefront-cart.ts:4`, `:16`, `:62`, `:109`, `:142`; `components/site/blocks/StorefrontBrowse.tsx:462` (feedback/focus), `:1124` (edit opens the sheet), `:2116` (price change notice). |
| Longer menus | `components/site/blocks/StorefrontBrowse.tsx:323` and `:414` (active category and scroll-spy), `:759` (navigation), `:924` (sticky offset), `:933` (lazy section rendering); the no-IntersectionObserver fallback is tested in `lib/__tests__/storefront-browse.test.cjs:977`. |
| Order snapshot display | `lib/order-option-display.ts:8`; used by `components/dashboard/orders/OrderCard.tsx:809`, `components/site/OrderTrackingView.tsx:418`, and `lib/order-notifications.ts:123`. Legacy snapshots continue through the formatter fallback and tests at `lib/__tests__/storefront-browse.test.cjs:206` and `:577`. |
| Carry-over | `lib/actions/menu-option-groups.ts:488` rejects per-item legacy IDs/overrides when reusing a group. The converter and duplicate-group regression live in `lib/__tests__/phase0-menu-options-regressions.test.cjs:207`; commit `3663011` is separate from Phase 3. |

## Files Changed

- `components/dashboard/orders/OrderCard.tsx`
- `components/site/OrderTrackingView.tsx`
- `components/site/blocks/BlockRenderer.tsx`
- `components/site/blocks/CatalogCard.tsx`
- `components/site/blocks/StorefrontBrowse.tsx`
- `lib/__tests__/storefront-browse.test.cjs`
- `lib/menu-pricing.ts`
- `lib/order-notifications.ts`
- `lib/order-option-display.ts` (new)
- `lib/storefront-browse.ts`
- `lib/storefront-cart.ts` (new)
- `lib/website-embeds.ts`
- `docs/CURRENT-STATE.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `docs/phase-3-report.md`
- `docs/phase-3-screenshots/` (local visual captures)

No migration, `package.json`, order snapshot schema, or server pricing rule changed. The local preview fixture route was removed after screenshot capture.

## Verification

| Check | Before Phase 3 | After Phase 3 |
|---|---:|---:|
| `npm run test:chunked` | 2,497 / 2,497 (Phase 2 checkpoint) | **2,506 / 2,506**, 196 files, 7 chunks |
| Focused storefront suite | — | **46 / 46** |
| `npx tsc --noEmit --pretty false` | — | Passed |
| ESLint on changed source and test files | — | Passed, no diagnostics |
| Full-project `npm run lint -- --no-warn-ignored` | — | 8 errors, 299 warnings; errors are in untouched `app/dashboard/DashboardView.tsx` and `e2e/fixtures.ts` |
| `git diff --check` | — | Passed before handoff |

The first parallel validation attempt hit memory pressure while a production build was collecting 366 static pages; three test chunks failed to start in that run and TypeScript hit the Node heap limit. The checks were rerun without that contention: the full suite and standalone TypeScript then passed.

### Bundle impact

The baseline production manifest associates **728,529 raw bytes / 214,624 gzip bytes across 15 JavaScript chunks** with the `/site/[slug]/[[...page]]` client modules. The Phase 3 Webpack compile emitted **829,107 raw bytes / 257,129 gzip bytes across 32 chunks** for those modules: a directional difference of **+100,578 raw bytes / +42,505 gzip bytes**.

This is not an apples-to-apples final comparison: the baseline manifest was built with Turbopack; the isolated feature build used Webpack because Turbopack rejects the temporary `node_modules` junction. Webpack completed compilation (with one existing `libheif-js` dynamic-require warning), then page generation ran out of memory. The figures come from the emitted route client-module manifests before that failure and should be treated as indicative, not a final budget result. No dynamic sheet import was added because the comparison cannot establish the actual Phase 3 increase; a clean, same-bundler production build remains the verification needed to make that call.

### Browser screenshots

Playwright captured and checked the five requested flows at 375px and 1440px in the light public-site theme. Each run checked for horizontal overflow and browser/page errors; the final run captured 10 screenshots with no errors.

| Flow | 375px | 1440px |
|---|---|---|
| Required group unsatisfied | [Screenshot](phase-3-screenshots/light-375-required-unsatisfied.png) | [Screenshot](phase-3-screenshots/light-1440-required-unsatisfied.png) |
| Required group satisfied and live total | [Screenshot](phase-3-screenshots/light-375-required-satisfied-total.png) | [Screenshot](phase-3-screenshots/light-1440-required-satisfied-total.png) |
| One-tap add and cart bar | [Screenshot](phase-3-screenshots/light-375-one-tap-cart-bar.png) | [Screenshot](phase-3-screenshots/light-1440-one-tap-cart-bar.png) |
| Cart line edited | [Screenshot](phase-3-screenshots/light-375-cart-edited-options.png) | [Screenshot](phase-3-screenshots/light-1440-cart-edited-options.png) |
| Category tabs selected by keyboard | [Screenshot](phase-3-screenshots/light-375-category-tabs-active.png) | [Screenshot](phase-3-screenshots/light-1440-category-tabs-active.png) |

The customer public-site styles do not provide a separate dark palette: their `--ps-*` colors stay template-owned. Forced `.dark` captures were used to verify this and are not presented as dark-theme QA.

## Manual QA Checklist for Localhost

Use a local fixture or test site. Stop before submitting an order; order creation would write data. At 375px:

1. Open an item with a required option group. Tap **Add to order** without choosing an option. Confirm the group scrolls into view, receives focus, shows the visible error indicator and message, and the button remains actionable.
2. Choose a required option. Confirm the selected row is checked, the total updates, and a free add-on default is already checked. If an option allows quantity greater than one, raise/lower it and confirm the total reflects the quantity.
3. Open a variant item. Confirm the default (or first available option) is selected, the displayed price follows the variant, and the item promo strikethrough is hidden.
4. Tap the **+** on an option-free item. Confirm it adds directly and updates the cart bar. Tap the rest of that card and confirm it opens the sheet. Confirm a sold-out item has no add action.
5. Open the cart and edit a line. Confirm its option choices and quantity are prefilled, then update it and verify the same line changes in place. Add an identical selection again and verify it merges. Check the 50-item cap and the cap message.
6. Change a menu price in the local fixture, reload the menu, and confirm the cart line says **Price updated** while its total uses the current price.
7. Use Left/Right arrow keys on category tabs and click a tab. Confirm focus and `aria-selected` move, the section scroll offset clears the sticky header, and long sections populate as they approach. Search by a name and description, check the no-results state, and clear the search.
8. At 1440px, confirm the sheet is centered and constrained to 520px; at both widths, check the option group names/rules, text-only option rows, close button, and reduced-motion behavior.
9. Review a new-format order fixture in the staff order card, tracking view, and notification preview. Confirm old-format snapshots still render without a group label.

## Intentionally Not Done

- No migrations, database reads/writes, schema changes, order snapshot shape changes, or RLS changes.
- No server-side application of defaults; submitted prices remain server-computed.
- No paid add-on defaults, cart upsell, promotional behavior beyond the required variant display rule, new special-instructions field, analytics, popup, or server-side search/pagination.
- No customer-facing dark palette was added.

## Open Product Questions

1. Should public business sites get a deliberate dark palette in a later design phase? The current public-site token system has no distinct dark palette.
2. Should paid add-on defaults ever become preselected customer choices? Phase 3 preserves the Phase 1 free-default-only rule.
