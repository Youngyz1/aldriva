# 01 — Overview Page Anatomy (mobile-first)

Scope: the **single workspace overview** rendered at `/dashboard/org/{org}/overview`, plus the entity
overviews that move onto the same shell (`/dashboard/events/{id}/overview`,
`/dashboard/fundraisers/{id}/overview`). Desktop navigation is unchanged by this effort.

Evidence date: 2026-11-08. Branch `feat/dashboard-overview-redesign` (created from `303ed15ed`).
Measurements are **arithmetic from Tailwind classes**, not rendered pixels — Playwright is not installed
(`npx --no-install playwright --version` → not recognized) and no authenticated server is running.
Every existing-code claim carries `file:line`.

---

## 1. Structure, top to bottom (360–414px first)

Order is fixed. A section that has no data source is **not rendered**; a section whose capability exists but
has no activity renders its empty state in place (Decision 10 in the brief).

| # | Section | Height target @390 | Rendered when |
|---|---|---|---|
| 0 | `Navbar` (existing, unchanged) | 56 | always |
| 1 | Workspace header (sticky) | 48 | always |
| 2 | Setup banner (slim, dismissible-by-completion) | 44 | setup incomplete |
| 3 | Needs attention | 1 row = 56; max 3 rows + footer | ≥1 real item |
| 4 | Live now (horizontal snap) | 148 | capability with live states |
| 5 | KPI grid (2 × 2) | 2 × 88 + gap 12 | ≥1 KPI with a source |
| 6 | Main trend | 196 | ≥2 time buckets |
| 7 | Business modules | variable | capability + data |
| 8 | Recommendations | 1 card = 92; max 2 | a rule fires |
| 9 | Recent activity | 5 × 48 | ≥1 event in period |
| 10 | Quick actions | 1 primary 48 + grid 2 × 72 | always (≥1 real action) |
| 11 | Bottom bar (fixed) | 56 + safe area | dashboard layouts only (always 4 tabs: Overview, Live ops / Website, Manage, More; §06) |

### 1.1 Workspace header

One sticky row, 48px tall, `sticky top-14` (56px navbar at `<640px`; `components/Navbar.tsx:116` uses
`h-14 sm:h-16`). Contents, left to right:

- **Business switcher**: button, min 44×44 hit area, shows the selected business name truncated to one line
  (`text-[15px] font-semibold`, `truncate`) + chevron. Opens a bottom sheet listing every eligible business
  with name, type, and a check on the current one. Persisted default = `?business=` in the URL, falling back to
  a saved preference, falling back to **oldest `businesses.created_at`** (the Q2 stopgap; the current query has
  no `.order()` — `app/dashboard/org/[id]/overview/page.tsx:74-78` — so the fallback is deterministic only
  after that ordering lands in PR 1).
- **Status**: only a real, derived state — `Draft`, `Paused`, or nothing. Never "Open for orders" unless hours
  are configured *and* the site is published; `isOpen = true` at `page.tsx:403` is removed.
- **Period selector**: one button `Today` with chevron → sheet with `Today / 7 days / 30 days / This month /
  Custom`. Writes `?period=` and optional `?from=&to=` to the URL; server reads them. Never local state only.
- **No hamburger.** The drawer is removed in PR 8; `MobileDrawer` is only referenced by
  `ManagementShell.tsx:62` and `OrgMobileHeader.tsx` today.
- **Refresh**: the 60s auto-refresh (`OverviewShell.tsx:22-32`) moves into the header as a 44×44 icon button;
  the visible "Refresh" label is dropped on mobile.

### 1.2 Needs attention

**One grouped card**, not one card per item (`AttentionStrip.tsx:12-83` currently renders a full bordered,
shadowed, red/amber/blue card per item). Spec:

- Card header: `Needs attention` + count badge (`text-[13px]`, orange-dot icon).
- Up to **3 rows**, each 56px: 16px semantic icon, one-line title (`text-[15px] font-semibold`),
  one-line detail (`text-[14px] text-zinc-600`, truncate), right chevron.
- Footer row when more than 3: `See all {count}` expands the attention card in place to reveal all items;
  the standalone `/attention` route is dropped (Decision Q9).
- Tone is a single left border or dot, never a fill + border + shadow triple. Semantic colours only for the
  actual state (red = blocking, amber = waiting, blue = informational).
- Empty: the section is not rendered at all (matches today's early return, `AttentionStrip.tsx:13`).

### 1.3 Live now

Horizontally scrollable row (`overflow-x-auto snap-x`, cards 240px wide, 12px gap, `scroll-padding-inline: 16px`).
One card per *in-progress* record across the workspace's live domains, ordered by urgency:

1. Payment/confirmation blockers, 2. overdue orders (`lib/order-overdue.ts`: pending > 10 min, courier > 20 min),
3. bookings starting within 2h, 4. tables seated now, 5. live events (same-day).

Card contents: status chip, title (customer first name or order number — **never a truncated ID**), the one
number that matters (`12 min`, `19:30`, `2 guests`), and a single next action (`Accept`, `View`). Time text is
`tabular-nums` and computed server-side in the site timezone (`lib/date-timezone.ts:59-155`).

Empty: one 56px row `No live activity right now` — not a card, not an illustration.
`TodayStrip.tsx:52-95` (four metric cards, "Open for orders") is replaced by this row + the KPI grid.

### 1.4 KPI grid

Two columns at 360–767px, four at ≥768px. **Maximum 4 tiles.** Each tile: label 13px uppercase-tracking,
value 24px/800 tabular, delta line 13px.

- Delta only when the previous period has a comparable bucket (`previous > 0`); otherwise the delta line is
  omitted, not "—" and not "+100%".
- Money tiles render one currency. Mixed-currency results render the largest currency and a `+2 currencies`
  disclosure — `orders.currency` exists with a `USD` default (`db/migration_171_orders.sql:40`), so mixing is
  possible and must not be summed.
- Refunds are excluded from collected; outstanding is its own tile (Decision 5).
- A tile with no data source is not in the grid (not even as zero).

### 1.5 Main trend

Exactly one chart per overview. Reuses `recharts` (already a dependency, `package.json:79`, used by
`components/fundraisers/MiniAreaChart.tsx`) with an accessible `<table>` fallback behind a "View as table"
disclosure.

- `<2` buckets → render the recent-activity list instead of a chart (no single-point area charts).
- Y axis starts at 0; no dual axis; no gradient fill (DESIGN.md forbids gradients on interactive elements;
  use a 10% flat fill).
- Period label is explicit (`Last 7 days · Africa/Abidjan` — the timezone is shown once, in the section
  subtitle, not per value).

### 1.6 Business modules

Category-specific blocks, one component per module, each its own Suspense boundary (§02). Module order per
category is fixed in `03-category-capability-matrix.md`. All are unboxed sections on the page background per
the permanent page-surface rule; only the records inside them may be cards.

### 1.7 Recommendations

Max **2** `InsightCard`s from the rule registry (`05-insights-rules.md`). Each: rule title (a fact, not advice
copy), the evidence line with real numbers, one action link. No dismissal until a persisted store exists
(no table today) — instead, rules must stop firing when the condition clears.

### 1.8 Recent activity

Last 5 events from one feed RPC: order placed/accepted, booking requested/confirmed, donation received, review
received. Row: 32px domain icon, `text-[15px]` summary, relative time (`2h ago`) with absolute time in
`title`. No pagination on the overview; `See all` links to the domain page.

### 1.9 Quick actions

- **1 primary**: the single most likely next action, full-width 48px solid `--primary` (#c2410c).
- Up to **4 secondary** tiles in a 2-col grid: icon, label 15px, **one-line description 14px**, 44px min height.
- Every action must point at a route reachable from the new nav (Decision 1); ids are stable strings because
  `lib/__tests__/phase5-overview.test.cjs` asserts exact arrays and PR 1 updates that spec deliberately.
- No disabled tiles. No "Coming soon" (`FundraiserQuickActions.client.tsx:76-112` currently has three).
- No duplicate destinations (Share/Copy Link both call `handleShare`, `:61-68` and `:88-96`).

### 1.10 Setup checklist → slim banner

Current `SetupChecklist` is a multi-row card with `shadow-xs` (`SetupChecklist.tsx:81`). Replace with a 44px
single-line banner directly under the header:

`Finish setup · 2 of 4` + chevron → opens a sheet listing the four steps, each linking to the real page.
Steps are capability-derived (e.g. add hours, add a menu item, publish the site, accept first order).
When all complete: **not rendered**, and the completion state is derived from data, never a stored flag.

---

## 2. First-viewport budget (arithmetic)

Base: mobile navbar 56 (`Navbar.tsx:116`), workspace header 48, bottom bar 56 + iOS inset 34.
Content viewport = device height − 56 − 48 − 90.

| Device | Viewport | Content | Reaches |
|---|---|---|---|
| 360 × 640 | 640 | 446 | attention (44 + 132) + live row (148) → 228px used; KPI partially visible |
| 390 × 844 | 844 | 650 | + KPI grid (188) + trend header → first chart pixels visible |

Rules:
- The **first actionable item must be visible without scrolling** at 640px height: that is the attention row
  or, when empty, the first live card.
- No section may push the attention block below the fold — hence the header is 48px, not the current
  title + subtitle + badge block (`OverviewShell.tsx:40-46`, ~96px).
- Keep an `sr-only <h1>` on every overview page for screen readers and semantic accessibility (e.g. `<h1 className="sr-only">{workspaceName} Overview</h1>`). The business name in the header provides visible orientation while the route label lives in the document title.

## 3. Double gutter removal (BUG-23)

Confirmed: `app/dashboard/org/[id]/layout.tsx:187` wraps content in `px-4 pt-6 … lg:pb-6`, and
`OverviewShell.tsx:52` adds `max-w-7xl mx-auto p-4 sm:p-6`. At 360px that is 32px per side (18% of width).

Spec: the layout owns horizontal padding and bottom padding; `OverviewShell` becomes padding-free
(`w-full max-w-6xl mx-auto`, no `p-*`). Result: 16px gutters at 360, 24px at 640, 32px at 1024.
Also adds `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` to the content wrapper (§06) so the last card is
never under the bar.

## 4. Tablet (768–1023)

- Header stays sticky and single-row; business switcher shows name + type.
- Needs attention rows get an inline action button on the right (no chevron-only row).
- Live now becomes a 2-col grid (no horizontal scroll) with 4 cards max, `+N` link.
- KPI grid 4 columns; values 28px.
- Two-column body: main (attention, live, KPI, trend, modules) 2/3; rail (recommendations, quick actions)
  1/3, rail starts at the top of the body.
- Bottom bar still present (tablet portrait is a touch device); More sheet is 480px wide, bottom-anchored.

## 5. Desktop (≥1024)

- Sidebar navigation unchanged (`OrgDashboardSidebar`). Bottom bar hidden.
- Body grid 12 columns: main 8, rail 4, `gap-8`, max width 1152 (`max-w-6xl`).
- Header is not sticky on desktop (the sidebar provides orientation); period selector sits in the page
  header row, right-aligned with the title.
- Attention: 3 rows + `See all`; Live now: 3 cards per row; KPI 4 across; trend full main column.
- Rail is `sticky top-6` with recommendations then quick actions.

## 6. Section states (every section)

| State | Rendering |
|---|---|
| capability absent | section not in the tree (not `hidden`, not `null` card) |
| capability present, no rows | in-place empty line: one sentence + one link to create |
| loader error | section-level boundary: `Could not load {section}` + Retry; other sections unaffected |
| migration not applied (`42P01`/`42703`) | treated as capability absent **and** logged once; never a fake zero |
| loading | skeleton matching the final height (±8px) to avoid layout shift |

## 7. What is explicitly removed

- `TodayStrip` as a standalone card row (`TodayStrip.tsx:52-95`).
- One-card-per-alert presentation (`AttentionStrip.tsx:36-83`) and its `shadow-xs`/`bg-zinc-900` action.
- The duplicate page title block (`OverviewShell.tsx:40-46`) and the visible "Refresh" text on mobile.
- Every "Not tracked yet" block (`fundraisers/[id]/overview/page.tsx:349-367`) and every disabled
  "Coming soon" action (`FundraiserQuickActions.client.tsx:76-112`).
- The event overview's Scan card and Quick actions row as separate navigation blocks
  (`events/[id]/overview/page.tsx:37`, `:44-50`) — they become module launchers in `manage`, not page chrome.
