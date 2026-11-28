# 07 — Implementation Plan

Eight PRs, each independently shippable (the app renders correctly after every merge). Order follows the
brief; the mobile nav is its own PR (8). No PR may be combined with the untracked migrations 215/216/220.

**Migration numbers:** This plan consumes **223** (overview aggregation). Needs forward + `_rollback` twins in `db/`.

---

## PR 1 — Status maps + module registry (no visual change)

**Goal:** one registry, one status vocabulary, tests updated deliberately.

Files:
- `lib/dashboard/status-map.ts` (new): `STATUS_MAP[domain][value] = { labelKey, tone }` for
  `order`, `order_payment`, `reservation`, `reservation_payment`, `booking` (alias of reservation), `event`, `fundraiser`, `donation`, `payout`.
- `lib/dashboard/modules.ts` (new): `ModuleDefinition`, `ModuleContext`, `ModuleResult` per `02`.
- `lib/dashboard/types.ts` (new): `Metric`, `Delta`, `SeriesPoint`.
- `lib/org-dashboard-modules.ts`, `lib/business-dashboard-modules.ts` → adapters over the registry.
- `lib/overview-resolver.ts` → reads registry capabilities, keeps attention logic for now.
- `lib/__tests__/org-dashboard-modules.test.cjs`, `lib/__tests__/phase5-overview.test.cjs` → update the
  expected arrays **in the same commit**, with a comment naming this effort.
- New: `lib/dashboard/__tests__/status-map.test.cjs`, `lib/dashboard/__tests__/module-registry.test.cjs`
  (appended to `test-files.json`).

Status map correctness gate: values are taken from the **live CHECK constraints**, not from code.
**Live DB status note:** Migration 216 is **NOT applied on staging** (the live `reservations_status_check` has no `pending_hold`),
so `pending_hold`, `reservation_staff`, and `reservation_service_catalog` are not live.
Verified live values:
- `orders.status`: `pending, accepted, preparing, ready, picked_up, out_for_delivery, delivered, completed, cancelled`
- `orders.payment_status`: `unpaid, paid, refunded`
- `orders.fulfilment_type`: `pickup, delivery, dine_in`
- `orders.dine_in_confirmation`: `not_applicable, pending, confirmed, declined`
- `reservations.status`: `pending, confirmed, declined, seated, completed, no_show, cancelled` (no `pending_hold`)
- `reservations.payment_status`: `unpaid, deposit_pending, deposit_paid, paid, refunded, waived`
- `reservations.booking_type`: `table, rental, appointment`
For unverified domains (`events`, `fundraisers`, `donations`, `payouts`, `tickets`, `ticket_orders`), values are taken from the repo's DDL (`db/`, `prod_schema.sql`, `staging_schema.sql`) and marked `unverified`.

Risk: `bookings` label collision — `StatusChip` domain `booking` reuses the reservation vocabulary, because
bookings are reservations (`03` §1).

**Verification:** nav labels per business type byte-identical to today (tests), `tsc`, `npm test`.

---

## PR 2 — Shell + shared components + aggregation (migration 223)

**Goal:** the new overview skeleton renders for every workspace, using only modules whose data source exists.

Migration **223** (`overview rollups`): 6 functions per `02` §3, forward + rollback.

Files:
- `components/dashboard/overview/` → `EntityHeader`, `AttentionCard`, `LiveCard`, `StatCard`, `InsightCard`,
  `QuickActionTile`, `PeriodSelector`, `TrendChart`, `EmptyState`, `SetupBanner`.
- `components/dashboard/overview/OverviewShell.tsx` → padding-free wrapper (§01 §3).
- `app/dashboard/org/[id]/overview/page.tsx` → header + 10 sections, each module in its own `<Suspense>`.
- `lib/overview-resolver.ts` → split into `lib/dashboard/loaders/*.ts` (one per domain).
- `app/dashboard/org/[id]/layout.tsx` → remove double gutter, add bottom-bar padding.
- `messages/en.json`, `messages/fr.json` → `Overview.*` keys.

Tests: `lib/dashboard/__tests__/loaders.test.cjs` (mock client, `42P01` → `unavailable`),
`lib/dashboard/__tests__/period.test.cjs` (site timezone incl. DST boundary), `overview-render.test.cjs`
(section presence per capability matrix).

Risk: service-role reads must stay tenant-scoped; every loader takes `organizerId` and filters on it, and the
page still calls `checkTenantAccess` before any loader runs.
Risk: migration 223 not applied on staging → all six modules render `unavailable` (by design, no fake zeros),
which is acceptable for the first deploy but must be called out in the PR description.

**Verification:** a seeded org with 3 orders (1 refunded, 1 unpaid) shows collected = 2 orders' paid amount,
outstanding = 1, refunds excluded; switching `?period=7d` changes the numbers and survives reload; the
timezone label matches `tenant_websites.metadata.timezone`.

---

## PR 3 — Fundraiser onto the shell (migration 230)

Migration **230**: `ALTER TABLE public.fundraisers ADD COLUMN IF NOT EXISTS end_date date NULL;` + index
`(organizer_id, end_date)` optional; rollback drops it. No backfill (null must mean "no deadline"). Update the
register in `docs/HANDOFF.md` §6 and `docs/DATABASE.md` in the same PR.

Files:
- `app/dashboard/fundraisers/[id]/overview/page.tsx` → new shell; delete `StatusBadge` local (`:22`), the
  `daysRemaining = 30` (`:120`), the `$` goal (`:187`), the three "Not tracked yet" blocks (`:349-367`).
- `lib/fundraiser-dashboard.ts` → `end_date` aware `getDaysRemaining`, `inferStatus` without the 90-day
  assumption, documented health formula (`05` §9), `formatCurrency` takes currency (no USD literal).
- `components/fundraisers/FundraiserQuickActions.client.tsx` → `QuickActionTile` grid, drop disabled actions
  and the duplicate share.
- `components/fundraisers/FundraiserAnalytics.client.tsx` → `TrendChart`; remove visitors/conversion/shares.
- `app/dashboard/fundraisers/[id]/layout.tsx` → bottom-bar padding + header slot.

Tests: `fundraiser-health.test.cjs`, `fundraiser-currency.test.cjs`, update
`lib/__tests__/fundraiser-dashboard*.test.cjs` (existing expectation of 30 days must change), `test-files.json`.

Risk: existing tests assert `getDaysRemaining(null) === 30`; that expectation is the bug and is updated with a
comment. Risk: campaigns with no end date change appearance (pace/projection disappear) — intended.

**Verification:** campaign with `end_date = today+10`, goal 1000, raised 400 → days left 10, required/day 60,
score matches the documented formula; set `end_date = NULL` → none of days/pace/projection/score render;
XOF campaign → `FCFA` everywhere, no `$`.

---

## PR 4 — Restaurant modules

Files: `lib/dashboard/loaders/orders.ts`, `lib/dashboard/loaders/catalog.ts`,
`components/dashboard/overview/modules/RestaurantModules.tsx`, `TodayStrip.tsx` deleted,
`RecentOrdersWidget.tsx` → `LiveCard`/`StatusChip` (removes raw `fulfilment_type`/`status` at `:70,88`),
`app/dashboard/org/[id]/orders/page.tsx` unchanged.

Risk: the "live" query must bound by `ends_at`/today **and** limit; the audit's 200-row cap bug
(`overview page.tsx:272-285`) must not be reproduced — use `starts_at < end_of_today` in SQL (RPC handles it).

**Verification:** 4 orders in different statuses render 4 live cards ordered by urgency; accepting one
updates it within the 60s refresh; a refunded order appears in neither collected nor outstanding.

---

## PR 5 — Service / clinic / salon + Bookings

**Blocked dependency:** the Bookings page and its Confirm/Decline exist only on `feat/fresh-home-redesign`
(`08` Q2). This PR cannot start until that page is in this branch (or the PR adds a read-only bookings module
that links to `/reservations`, which is worse).

Files: `lib/dashboard/loaders/bookings.ts`, `modules/ServiceModules.tsx`, bookings route wiring in the
registry (`BOOKINGS`/`APPOINTMENTS`), `services` empty-state action.

Risk: `booking_details` JSON shape is read app-side (`service_type`, `alt_starts_at`); a missing key must render
"—" not "undefined". Risk: 218's capacity filter means appointment rows are not capacity-checked — do not add a
"capacity" metric for bookings.

**Verification:** appointment rows appear under Bookings, table rows under Reservations, neither leaks into the
other's counts; a `pending_hold` row is excluded from live counts.

---

## PR 6 — Event overview

Files: `app/dashboard/events/[id]/overview/page.tsx` (79 lines) → shell; `EventMetricsWidget` reused;
Scan/Quick actions become Live-ops/Manage entries (see `08` §A); `lib/event-dashboard-navigation.ts` unchanged.

Risk: role tab set differs per role (`getEventSubNavTabs`); the Manage grid must filter by the same role map.

**Verification:** owner sees 12 tabs in More; scanner role sees 3 and no Manage catalog entries; overview shows
tickets sold/checked-in only when `ticket_checkins` has rows.

---

## PR 7 — Remaining categories + generic fallback + retire duplicates (Q13)

Files: `modules/NonprofitModules.tsx`, `modules/GenericModules.tsx` (rental track is deferred);
`app/dashboard/businesses/[id]/overview/page.tsx` and `.../orders/page.tsx` → redirects (keep `branches`,
`edit`); `lib/business-dashboard-modules.ts` → registry adapter; delete placeholder
`businesses/[id]/analytics|reviews` pages.

Risk: redirect loops between business and org shells; test both directions with a linked and an unlinked
business.

---

## PR 8 — Mobile navigation (own PR)

Files: `components/nav/DashboardBottomBar.tsx`, `components/nav/DashboardMoreSheet.tsx`,
`app/dashboard/org/[id]/layout.tsx`, `app/dashboard/events/[id]/layout.tsx`,
`app/dashboard/fundraisers/[id]/layout.tsx`, `app/dashboard/businesses/[id]/layout.tsx`,
`app/globals.css` (z-scale + `--app-navbar-h` + `--bottom-bar-h`), `app/layout.tsx`,
`app/[locale]/layout.tsx` (viewport), `components/CookieConsent.tsx`, `components/nav/HomeAdaptiveNav.tsx`,
delete `DashboardMobileNav.tsx` + `OrgMobileNav.tsx`, remove hamburger from `ManagementShell`/`OrgMobileHeader`.

Risk: `viewportFit: cover` turns 27 currently-inert inset values live; double padding is the most likely
regression. Risk: removing the hamburger strands a destination not in the bar or sheet — the More sheet is
generated from the registry, so a registry test asserts every nav module is reachable from bar ∪ sheet.

**Verification:** §06 §9 checklist, at 360/390/414/768, with the cookie banner unaccepted.

---

## Collisions with in-flight work

| In flight | Where | Effect on this plan | Mitigation |
|---|---|---|---|
| Reservations engine (215/216 untracked, 218 committed) | `db/`, `lib/actions/reservations.ts` | PR 2/5 read `booking_type`, `booking_details`, `pending_hold` | Do not modify 215/216; 231 only reads. Rebase before PR 5. |
| General booking (b1e099621) | `lib/actions/general-booking.ts`, `services` | PR 5 depends on the dashboard page (other branch) | Q2 gate |
| Scanner phases 3–4 + 215 order hardening | `lib/actions/*scan*`, orders statuses | PR 4 status map must include `picked_up`/`out_for_delivery`/`delivered` | Owner confirms live CHECK before PR 1 |
| Service categories (220) | `db/`, `lib/actions/service-categories.ts` | PR 5 catalog counts services by `is_active` | Do not count categories until the table is applied |
| Invitation removal (HEAD) | `app/dashboard/org/[id]/overview/page.tsx:7,500-505` | PR 2 rewires the same page | Merge order: PR 2 after this branch is stable |
| `feat/fresh-home-redesign` bookings page | other worktree | PR 5 blocker | Q2 |

## Global verification per PR

`npx eslint <files>` → `npx tsc --noEmit` → `npm test` → `npm run build`. New test files **must** be added to
`test-files.json` or they never run (AGENTS.md). Manual checks use a seeded staging org for each category;
no metric is accepted from a screenshot alone — the same numbers must be reproducible with a SQL count against
staging (owner-run, read-only).
