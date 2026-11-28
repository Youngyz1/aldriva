# 04 — Components, Design System, Dark Mode, i18n

## D1. Every component on the fundraiser overview

| Component | File | Props | Coupling to fundraising | Reusability |
|---|---|---|---|---|
| `FundraisingProgressRing` | `components/ui/FundraisingProgressRing.tsx` | `raised?, goal?, percentage?, size=220, strokeWidth=16, animated=true, showDetails=true, className?, textColor?, trackColor='#154D40', progressColor?, currency='USD'` | **None in code** — pure numeric/currency. Only the name says fundraising. | **High.** Accepts `percentage` alone, so it can show order-completion or capacity. Caveats: fixed square `width/height` from `size` (`:143-146`) with `max-w-full` — it shrinks visually only if the parent constrains width; default track colour is a hardcoded dark green `#154D40` unrelated to the zinc/orange tokens; gradient `#22C55E→#84CC16→#EAB308→#F97316` (`:97-102`) is a **gradient on a data viz element** (allowed) but not tokenised. |
| `FundraiserQuickActions` | `components/fundraisers/FundraiserQuickActions.client.tsx` | `fundraiserId, slug, className?` | **High** — hardcodes `/dashboard/fundraisers/{id}/updates`, `/api/dashboard/donations/export?fundraiser_id=`, `/fundraisers/{slug}` | Low. 6 tiles, of which 3 are `disabled` "Coming soon" (`:76-105`) and 2 call the same `handleShare` (`:40-50`, `:88-96`). |
| `FundraiserAnalytics` | `components/fundraisers/FundraiserAnalytics.client.tsx` | UNKNOWN (not read) | High | It renders `MiniAreaChart` (`components/fundraisers/MiniAreaChart.tsx`), which is a thin **recharts** wrapper — that wrapper is reusable. |
| `FundraiserHeaderActions` | `components/fundraisers/FundraiserHeaderActions.client.tsx` | `fundraiserId, slug, title, hasDonations` | High | Low |
| `StatusBadge` | **inline function** in `app/dashboard/fundraisers/[id]/overview/page.tsx:20-40` | `status, healthScore` | High (campaign status union) | **None — not extracted.** The same 7-status badge is rendered twice on the page (header + health card). |
| KPI cards | **inline JSX**, repeated 10× | — | n/a | **None.** `components/ui/stat-card.tsx` exists but is not used; the page hand-rolls `rounded-xl border … p-5` ten times (`:300-371`). |
| `ProgressBar` / `ProgressRing` (generic) | `components/ui/ProgressBar.tsx`, `components/ui/ProgressRing.tsx` | UNKNOWN | none | Exists but the fundraiser page uses its own bar (`:195-200`) and `FundraisingProgressRing`, not these. **Three progress implementations in the repo.** |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | `components/ui/card.tsx` | shadcn-style | none | Used by **event** and **business** pages, **not** by the org overview or fundraiser page. **Two card idioms.** |
| `Button` | `components/ui/button.tsx` | `variant`, `size` (`default h-10`, `sm h-8`, `lg h-11`, `icon h-10`) | none | Used by event/business pages; org overview and fundraiser page hand-roll links/buttons. |

**CONFIRMED** (files read; `FundraiserAnalytics`/`ProgressRing` internals not read → marked UNKNOWN).

## D2. Shared UI kit and chart library

- UI kit: `components/ui/` (39 files, `ls components/ui | wc -l`) includes `card, button, badge, input, select,
  tabs, switch, dialog, sheet, dropdown-menu, tooltip, progress, ProgressBar, ProgressRing, stat-card, state,
  RouteLoading, sticky-table-toolbar`.
  The dashboard overview does **not** use it. **CONFIRMED**
- Charts: **recharts `^3.8.1`** (`package.json:79`), used by `components/fundraisers/MiniAreaChart.tsx` and
  `app/dashboard/reports/DashboardCharts.tsx`, always inside `ResponsiveContainer`. **CONFIRMED**
- Motion: Framer Motion v12 (`framer-motion`) used by `HomeAdaptiveNav`, `OrgDashboardSidebar`.
- Icons: `@tabler/icons-react` only, aliased per import (`IconX as X`). Consistent with AGENTS.md.
  **CONFIRMED**
- Skeletons/loading: only 5 `loading.tsx` under `app/dashboard`
  (`/`, `/donations`, `/events`, `/fundraisers`, `/settings`); **the org workspace has none**
  (`find app/dashboard/org -name loading.tsx` → nothing), so org navigation blocks on the 8-query layout with no
  skeleton. **CONFIRMED**
- Error: `app/dashboard/error.tsx` exists (dashboard scope only). No per-overview error boundary.
  **CONFIRMED**
- Empty states: inline per widget (`OrgOverviewClient.tsx:100-142`, fundraiser `:392-402`, `:404-416`).
  `components/ui/state.tsx` exists but is not used by any overview. **CONFIRMED**
- Tokens (`app/globals.css`): `--brand-700: #c2410c` (`:72`), `--primary: var(--brand-700)` (`:103`),
  radii `sm .5rem / md .75rem / lg 1rem / xl 1.25rem` (`:87-90`), dark overrides at `:454-459`.
  **CONFIRMED**
- **Token usage is inconsistent in the overviews:** the org overview uses `orange-*` utilities
  (`TodayStrip.tsx` icon tiles, `QuickActions.tsx:105` `bg-orange-700`), the fundraiser page uses `brand-*`
  (`page.tsx:246`, `:321`), and `OverviewShell` uses `text-orange-600` (`:44`). `--primary` is not used.
  **CONFIRMED**
- Shadows: `shadow-xs` is applied to buttons/cards in the overview components
  (`QuickActions.tsx:89,105`, `OverviewShell.tsx:52`, `SetupChecklist.tsx:81`) despite the design rule
  "no default shadow on buttons, sections, or cards". **CONFIRMED** violation.
- Gradients: `FundraisingProgressRing` stroke gradient (`:97-102`) and its milestone `drop-shadow` filters
  (`:29-49`). No gradient on interactive elements. **CONFIRMED** (acceptable for data viz, worth noting).
- `rounded-2xl` and `rounded-full` appear on container/cards (`DashboardEmptyState`, profile), while the
  component-radius rule names `rounded-xl` for justified cards. **CONFIRMED** drift, low severity.

## D3. Dark mode status

**It is a global utility remap, not a designed theme.** `app/globals.css:4` defines
`@custom-variant dark (&:where(.dark, .dark *))`, and `:490-520` contains rules that rewrite *specific utility
classes* when `html.dark` is present, e.g.:

```
html.dark :is(.bg-white, .bg-zinc-50, .bg-gray-50):not(.public-site, .public-site *) { … }
html.dark :is(.text-zinc-950, .text-zinc-900, …):not(.public-site, .public-site *) { … }
```

That means any component that uses `bg-white` / `text-zinc-900` is darkened by string-matching its class list.
The overview/fundraiser components use exactly those classes and contain **zero `dark:` variants**
(`grep -n "dark:" components/dashboard/overview` → no matches in the widget files read). **CONFIRMED**

`DESIGN.md:206-217` states the requirement and the current exception:

> "Dark mode must be a real theme … Either it works properly or it is removed."
> "Fundraising colors remain untouched; system dark mode does not activate on fundraising routes."
> "Some UI still uses surface/color utilities outside the mapped zinc and gray families. Do not mark dark mode
> fully complete…"

So: **fundraising is explicitly excluded**, and the overview is only "dark" via the utility rewrite —
which cannot cover `bg-orange-50`, `bg-violet-50`, `bg-emerald-50`, `border-emerald-200`, etc. Every KPI tile in
the org overview uses one of those. **CONFIRMED broken surface** for the org overview under dark mode.
(Visual confirmation requires a browser — **UNKNOWN** exact rendering.)

## D4. Internationalization

- Two locales, EN/FR, message files `messages/en.json` / `messages/fr.json`, both with **24 top-level sections**
  and full key parity for `Dashboard` (48 keys) and `Organizer` (nav labels + cook performance).
  **CONFIRMED**
- **Dashboard strings are translated only where a key exists.** `DashboardSidebar.tsx:12-25` maps four labels
  through a local `keyMap`; `DashboardView.tsx` uses `t('…')` throughout. **CONFIRMED**
- **Org nav is translated by lowercasing the English label** and looking it up in `Organizer`:
  `app/dashboard/org/[id]/OrgMobileHeader.tsx:45-48`, `OrgDashboardSidebar.tsx:63-68`:
  ```ts
  const key = item.label.toLowerCase() as any;
  try { return { ...item, label: t(key) }; } catch { return item; }
  ```
  This silently falls back to English for any new item whose lowercase label is not a key. It is not a typed key
  and `try/catch` cannot catch a missing next-intl key (next-intl logs/`throws` depending on config — the
  behaviour is **UNKNOWN** in this setup, but the fallback is not reliable). **CONFIRMED fragile.**
- **Every overview widget string is hardcoded English**: `TodayStrip`, `AttentionStrip`, `QuickActions`,
  `SetupChecklist`, `RecentOrdersWidget`, `EventMetricsWidget`, `OverviewShell`, and the whole fundraiser and
  event overview pages. The test file documents this deliberately:
  `lib/__tests__/phase5-overview.test.cjs` → "Overview v2 components use hardcoded strings (i18n deferred to
  Phase 6)". **CONFIRMED**
- `lib/fundraiser-dashboard.ts` insights are English sentences built in a lib (not JSX), so they cannot use
  `t()` at all. **CONFIRMED**
- Locale-routing exists (`app/[locale]/layout.tsx`, `i18n/routing.ts`), but the dashboard lives **outside**
  `app/[locale]/`, so dashboard URLs are not locale-prefixed; `LocaleProvider` at root supplies the locale.
  **CONFIRMED** from the file tree.

## D5. Duplicated / near-duplicate components to consolidate

| Pair | Evidence | Note |
|---|---|---|
| `DashboardMobileNav.tsx` vs `OrgMobileNav.tsx` | `:12` vs `:28` — identical outer shell (`fixed bottom-0 … pb-[calc(0.5rem+env(safe-area-inset-bottom))] … lg:hidden`), identical inner `MobilePillNav` | Both **unused**; one generic bottom bar would replace both |
| `FundraisingProgressRing` vs `components/ui/ProgressRing` vs inline bar | three progress visuals | Pick one |
| `components/ui/stat-card.tsx` vs inline KPI cards vs `DashboardStatsCards` | three stat implementations | The overview should use one |
| `components/ui/card` vs hand-rolled `rounded-xl border bg-white` | event/business use Card; org overview/fundraiser do not | Same visual, different code |
| `MobileGlobalNav` vs `OrgMobileHeader` vs `ManagementShell` mobile header | three near-identical `sticky top-16 z-30 … px-4 py-3 lg:hidden` headers (`:13`, `:43`, `:57`) | One `MobileWorkspaceHeader` |
| `StatusBadge` (fundraiser) vs `STATUS_VARIANTS` (orders) vs raw status text (org/event) | three status presentations | One label/colour map keyed by enum |
| `formatTimeAgo` (RecentOrdersWidget) vs `toLocaleDateString` (fundraiser/event) vs `formatMoney` | three time/date idioms | — |
