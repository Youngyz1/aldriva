# 07 — Mobile UX Measurements

> **Method: STATIC ANALYSIS ONLY.** No staging URL is configured and Playwright is not installed
> (`node_modules/.bin` has no `playwright`; `package.json` has no e2e script). Every number below is derived from
> Tailwind class values at the default 16px root, not from a rendered page. Anything needing a real viewport is
> marked **UNMEASURED**. Screenshot capture was not possible for the same reason; no files were fabricated.

## H1. Chrome budget per screen (height consumed before content)

Fixed heights: navbar **56px** mobile / 64px `sm:+` (`Navbar.tsx:116`); workspace sub-header ≈ **60px**
(`px-4 py-3` + 36px button, `ManagementShell.tsx:57`); entity switcher strip ≈ **44–52px**
(`px-3 py-2` + control, `:63`); `ManagementShell` content padding `py-6` = 24px (`:78`);
`OverviewShell` padding `p-4`=16px and header block ≈ 96–110px (`badge 12+ h1 30 + subtitle 20 + pb-5 20`,
`OverviewShell.tsx:39-58`).

| Screen | Chrome before first metric | 360×640 | 390×844 | 414×896 | 768 | 1280 |
|---|---|---|---|---|---|---|
| Fundraiser overview | 56 + 60 + ~48 + 16 (page pad) + ~110 (header card) + 24 (`space-y-6`) = **~314px** | **49%** | **37%** | **35%** | ~31% | ~24% |
| Org overview (business) | 56 + 60 + 0 banner + 16 (`p-4`) + ~100 (`OverviewShell` header) + 24 = **~256px** | **40%** | **30%** | **29%** | ~26%* | ~20%* |
| Event overview | 56 + 60 + ~48 switcher + 24 (`py-6`) + ~62 header = **~250px** | **39%** | **30%** | **28%** | ~26%* | ~20%* |
| Business overview | redirect to org → same as org | — | — | — | — | — |

\* At `lg` (1024px) the desktop sidebars appear (240px `AppSidebar`, 60/300px org sidebar) and the sub-headers
disappear; the percentages above use the mobile header because the question is about the mobile first viewport.

**Effect:** on a 360×640 phone the fundraiser overview shows roughly **half a screen** of chrome before the
"Campaign Health" card. On 390×844 (the common modern baseline) it is still more than a third.
**CONFIRMED by class arithmetic; UNMEASURED in a browser.**

The two-column KPI grid the design direction wants is **not** what ships today: the org overview's first content
widget after the header is the attention/setup stack, and the fundraiser KPI grid is `grid-cols-2` for the four
primary cards (`page.tsx:299`) but `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` for the six secondary cards
(`:337`) — i.e. a 2-col grid **is** already used for the primary KPIs. That is the one piece of the proposed
direction already present. **CONFIRMED**

## H2. Horizontal overflow

- All overview grids start at one column below `sm`:
  `TodayStrip` `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (`:47`), `EventMetricsWidget`
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (`:40`), fundraiser KPI grid `grid-cols-2 sm:grid-cols-4`
  (`:299`), setup checklist rows are `flex … justify-between` with `min-w-0` + `truncate`
  (`SetupChecklist.tsx:141-160`). **No horizontal overflow is expected** on these screens. **INFERRED**
- `OverviewShell` uses `max-w-7xl mx-auto p-4` (`:38`) inside the org content wrapper which already has `px-4`
  (`layout.tsx:160`) → **double 16px gutter** on the org overview, 32px per side at 360px width. That reduces
  usable content width to 296px. **CONFIRMED** by class composition.
- The only horizontal scrollers are the pill navs (`MobilePillNav` `overflow-x-auto`), which are unused, and the
  org drawer's flat list. **CONFIRMED**

## H3. Truncated text

- `RecentOrdersWidget` renders a **2-column grid on mobile** inside a flex row that also holds a
  `shrink-0` status chip (`:63-92`): columns are order number + fulfilment, then customer, then time, then total.
  With `truncate` on the order number (`:67`) and a 296–328px content width minus chip (~84px) and gaps, the
  order-number cell is ≈90–110px → `ORD-26103…` is exactly the expected render. **CONFIRMED mechanism**
  (the observed truncation is **INFERRED** from widths).
- `AttentionStrip` titles use `text-sm` with no truncate but a `min-w-0` wrapper; long strings wrap. OK.
- `EventMetricsWidget` recent-event titles use `truncate` (`:148`) next to a `shrink-0` "Manage" button → titles
  longer than ~18 characters truncate on 360px. **CONFIRMED**
- Fundraiser header title uses `break-words` (`:184`) → no truncation; but the beneficiary chip and category chip
  share a `flex-wrap` row, so the header can grow to 3 lines at 360px. **CONFIRMED**

## H4. Tap targets under 44px

| Control | Size | File | Verdict |
|---|---|---|---|
| `Button size="sm"` | **h-8 = 32px** (`px-3 text-xs`) | `components/ui/button.tsx:25` | Used **6×** on the event overview (Manage guests, Check-ins, Open scanner, Team, Seating, Operations) and on business stubs → all below 44px. **CONFIRMED** |
| `MobileHamburgerButton` | **h-9 w-9 = 36px** | `components/nav/MobileDrawer.tsx:8-18` | Below 44px. **CONFIRMED** |
| Org sidebar collapsed icons | **h-9 w-9 = 36px** | `OrgDashboardSidebar.tsx:84-91` | Only at `md:`+ (tablet), below 44px. **CONFIRMED** |
| `MobilePillNav` items | `min-h-11` = 44px | `MobilePillNav.tsx:44` | ✅ |
| `AttentionStrip` action | `min-h-[44px]` | `AttentionStrip.tsx:69` | ✅ |
| `QuickActions` buttons | `min-h-[44px]` | `QuickActions.tsx:64,89` | ✅ |
| `SetupChecklist` Show/Hide + Configure | `min-h-[44px]` | `SetupChecklist.tsx:122,152` | ✅ |
| Fundraiser "Recommended Action" CTA | `min-h-[44px]` | fundraiser `page.tsx:246` | ✅ |
| Fundraiser quick-action tiles | `min-h-[72px]` / `min-h-[76px]` | `FundraiserQuickActions.client.tsx:44-105` | ✅ |
| Profile bottom nav items | icon 20px + 10px label, no min height | `ProfileClient.tsx:727-760` | ≈36px → below 44px. **CONFIRMED** |

## H5. Tables vs cards

The overviews use **cards only** — no `<table>` on any overview. Order and reservation *list* pages use
`OrderCard` / `ReservationCard` inside `OrdersClient` / `ReservationsClient` (client components), not tables.
The only table-like layouts are admin pages with `sticky-table-toolbar`. **CONFIRMED** for the overviews; the
orders/reservations clients were not read in full (**UNKNOWN** exact mobile behaviour, but they are card-based by
component name and the presence of `OrderCard.tsx` / `ReservationCard.tsx`).

## H6. Content hidden behind fixed bars

| Surface | Fixed/fixed-like element | Content padding | Result |
|---|---|---|---|
| Profile page | bottom nav `fixed bottom-0 z-40` (`ProfileClient.tsx:723`) | `pb-24 sm:pb-16` (`:177`) | **OK** |
| Org workspace | none mounted (bar component unused) | `pt-6 … lg:pb-6`, no mobile bottom pad (`layout.tsx:160`) | OK **today**; breaks the moment `OrgMobileNav` is re-enabled |
| Event/fundraiser/business management | none mounted | `py-6` (`ManagementShell.tsx:78`) | OK today |
| Website builder | mobile tab bar (in-flow sticky, `WebsiteBuilderClient.tsx:512`) | builder layout | UNMEASURED |
| Cookie consent | banner `fixed bottom-0 z-50` (`CookieConsent.tsx:59`) | — | **Covers** the profile bottom nav (`z-40`) and any future `z-40` bar. **CONFIRMED z-order.** |
| Any iOS safe-area bar | `env(safe-area-inset-bottom)` | — | Resolves to **0** because `viewportFit:"cover"` is absent → bars overlap the home indicator. **CONFIRMED** |

## H7. What the design direction would hit (feasibility notes, no UI proposed)

| Direction element | Current-code obstacle |
|---|---|
| Compact two-column KPI grid | Already possible (`grid-cols-2` used on fundraiser KPIs); the org overview has **no KPI grid at all** — it has order-shaped cards, so the KPI set must be defined per capability first |
| Global period selector in the header | `OverviewShell` has no slot for controls and every query is hardcoded to "today"/"last 5". Needs new query params + a shared date-range helper (`lib/date-timezone.ts` has day bounds, not week/month) |
| Grouped "needs attention" card | `AttentionStrip` renders one card **per item** (`:12-83`) and is `role="status" aria-live="polite"`, so grouping changes both markup and the live-region behaviour |
| Horizontally scrollable live-operation cards | No live-operation widget exists on the org overview beyond `recent_orders`; would need orders+reservations merge (two different status enums, two tables) |
| Progress rings with remaining counts | Ring component is fundraising-named and takes a goal; orders have no target. Reservations have `seat_capacity` (`businesses.seat_capacity`) so capacity rings are supportable |
| Status chips | Enums exist; only 8 of the order statuses have a colour map (`RecentOrdersWidget.tsx:10-20`) and reservation statuses have none |
| One bottom nav of 4 + More | Two unused bar components collide with the fix; `DashboardLayoutClient` returns bare `children` for every entity route, so a shared bar must be added at a level that survives all four shells |
