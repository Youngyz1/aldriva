# 04 — Shared Components

Rules that apply to every component below:

- Tap target ≥ 44×44 CSS px. `Button size="sm"` is `h-8` = **32px** (`components/ui/button.tsx:25`) and is
  therefore banned in dashboard surfaces; use `default` (40) inside a 44px wrapper or a dedicated 44px row.
- Tokens only: `--primary` = `--brand-700` = `#c2410c` (`app/globals.css:72,103`); zinc neutrals; semantic
  colours only for real states. No `orange-*` literals (current `OverviewShell.tsx:44` uses `text-orange-600`).
- No shadow on cards/buttons/sections. `shadow-xs` appears in `AttentionStrip.tsx:68`, `QuickActions.tsx:89,105`,
  `SetupChecklist.tsx:81` and is removed.
- `rounded-xl` for controls and justified standalone cards only; sections stay unboxed.
- Text: 15–16px primary/label, 14–15px secondary. Money and IDs `tabular-nums`.

---

## 1. `EntityHeader`

The sticky 48px workspace header from `01`.

```ts
type EntityHeaderProps = {
  kind: "business" | "event" | "fundraiser";
  name: string;                     // truncated, never the ID
  subtitle?: string;                // business type, or date
  status?: { labelKey: string; tone: Tone } | null;   // null = render nothing
  businessSwitcher?: { items: {id,name,type}[]; selectedId: string; onChange(id:string):void };
  period: PeriodValue; onPeriodChange(v: PeriodValue): void;
  onRefresh?: () => void; refreshing?: boolean;
};
```

States: default; `refreshing` (icon spins, no layout shift); long name (single line, `truncate`, full name in
`title`); no period (`period` prop omitted → selector hidden for non-range pages, e.g. event overview).
Height is fixed at 48 so the bottom of the header is predictable; `sticky top-14 sm:top-16 z-20`.

## 2. `StatCard`

```ts
type StatCardProps = {
  labelKey: string;
  value: number; format: "count"|"money"|"percent"|"duration"; currency?: string;
  delta?: { value: number; direction: "up"|"down"|"flat" };   // omit when not comparable
  href?: string;                     // whole tile is the link when present
  hintKey?: string;                  // one line of definition ("excludes refunds")
};
```

States: default; `zero` (value 0 renders `0`, not "—"); `multiCurrency` (value + `+2 currencies`); `loading`
(skeleton with the exact 88px height); no-data (component not mounted). Delta renders only with
`value !== null`; never compute it from a zero previous period. No icon by default — icons on 4 tiles become
noise at 360px.

## 3. `StatusChip`

```ts
type StatusChipProps = {
  domain: "order" | "payment" | "reservation" | "booking" | "event" | "fundraiser" | "payout";
  value: string;
  size?: "sm" | "md";               // 20px vs 24px tall
  dot?: boolean;
};
```

Renders `label` from the **shared status map** (`lib/dashboard/status-map.ts`, new) — not the raw enum
(`RecentOrdersWidget.tsx:70,88`, `fundraisers/.../page.tsx:187`, `events/.../page.tsx:31` currently print enums).
Unknown value → `title` attribute + humanised fallback (`out_for_delivery` → "Out for delivery"), and a test
asserts every CHECK value has a key. Tones: neutral (default), info (blue), success (emerald), warning (amber),
danger (red) — same 5 for every domain.

## 4. `LiveCard`

```ts
type LiveCardProps = {
  domain: "order"|"booking"|"reservation"|"event"|"donation";
  title: string;                    // customer first name or short reference
  reference: string;                // FULL number, e.g. GBK-261108-4821 — never sliced
  status: { domain: StatusChipProps["domain"]; value: string };
  primaryNumber: string;            // "12 min", "19:30", "2 guests"
  secondary?: string;
  actions: Array<{ labelKey: string; href?: string; onClick?(): void; variant: "primary"|"ghost" }>;
  urgency?: "normal" | "overdue";
};
```

- Width 240px, 148px tall, snap-aligned; one action visible, second behind a 44px `⋯` menu.
- `reference` wraps (`break-all`, max 2 lines) rather than truncating; the audit's "no truncated order IDs"
  requirement is enforced by a test on `<LiveCard>` output.
- Skeleton: same box, two grey lines.

## 5. `AttentionCard`

One grouped card (not one per item — `AttentionStrip.tsx:36-83`).

```ts
type AttentionCardProps = {
  items: Array<{ id; titleKey; detailKey; params; tone: "danger"|"warning"|"info";
                 icon: TablerIconName; href: string; actionLabelKey: string }>;
  max?: number;                     // default 3
  seeAllHref?: string;              // rendered only when the route exists
};
```

Row height 56, divider between rows (no per-row border/background), tone shown as a 3px left bar or 8px dot.
Whole row is a link; the trailing action is text, not a black pill (`AttentionStrip.tsx:76` uses
`bg-zinc-900`). Empty → component returns null.

## 6. `InsightCard`

```ts
type InsightCardProps = {
  ruleId: string; severity: "info"|"warning"|"critical";
  titleKey: string; params: Record<string,string|number>;
  action: { labelKey: string; href: string };
  evidenceKey?: string;             // exact numbers, e.g. "4 orders waiting 26 min"
};
```

One card per rule, max 2 rendered. No dismiss button until a persisted store exists. Severity colour is a
left border + icon only; never a full tinted background (current insight blocks use full fills).

## 7. `ProgressRing`

Reuse `components/ui/ProgressRing.tsx` **only** where a bounded percentage is real (fundraiser % of goal).
Props: `value` (0-100), `size` 56/72/96, `label`, `tone`. Never for "health" unless the formula is documented
(`05-insights-rules.md` §4). `stroke` uses `currentColor`; track `zinc-200`; label `text-[13px]`.

Existing `components/ui/progress.tsx` (bar) is used for setup progress.

## 8. `QuickActionTile`

```ts
type QuickActionTileProps = {
  icon: TablerIconName;
  labelKey: string;
  descriptionKey: string;            // one line, 14px, required — no tile without it
  href: string;
  variant: "primary" | "secondary";
  disabled?: never;                  // type-level ban: no "Coming soon"
};
```

Primary: full-width 48px, solid `--primary`, white text. Secondary: 2-col grid, 72px tall, icon 20px,
label 15px, description 14px `text-zinc-600`, `rounded-xl`, 1px zinc border, no shadow. Long description:
2 lines max, `line-clamp-2`.

## 9. `PeriodSelector`

```ts
type PeriodValue = { kind: "today"|"7d"|"30d"|"month"|"custom"; from?: string; to?: string };
type PeriodSelectorProps = { value: PeriodValue; onChange(v: PeriodValue): void; timezone: string };
```

- Trigger: 44px tall, text `Today` + chevron, `aria-haspopup="dialog"`.
- Sheet: 5 options, 48px rows, current one checked; custom reveals two date inputs (`type="date"`), applied
  with a 44px Apply button. No free-text date parsing.
- Writes URL params via `router.replace` (`scroll: false`); server reads them. Disabled custom if `to < from`.
- The timezone is displayed once beneath the sheet title (`Times in Africa/Abidjan`).

## 10. `EmptyState`

Rewrites `components/ui/state.tsx` for dashboard use:

```ts
type EmptyStateProps = {
  variant: "inline" | "section" | "blocked";
  titleKey: string; descriptionKey?: string;
  action?: { labelKey: string; href: string };
  icon?: TablerIconName;
};
```

- `inline`: 56px row, no border, one line + text link. Default for a module with no rows.
- `section`: 120px, dashed 1px top/bottom border only, no fill, no illustration.
- `blocked`: for `unavailable`/`error` — one sentence + Retry.
No decorative gradient, no icon tile with a border (`state.tsx:27-31` currently adds one).

## 11. Lift vs rewrite

| Existing | Decision | Why |
|---|---|---|
| `components/fundraisers/MiniAreaChart.tsx` | **Lift** (rename `TrendChart`) | recharts, ssr:false, already responsive |
| `components/ui/ProgressRing.tsx` | **Lift** | neutral, size/label props |
| `components/ui/progress.tsx` | **Lift** | setup banner |
| `components/ui/badge.tsx` | **Base only**, add `StatusChip` on top | 8 raw colour variants (`neutral, orange, emerald, blue, purple, amber, rose, outline`) with no semantic status names; map tones explicitly |
| `FundraiserHeaderActions.client.tsx` | **Rewrite** into `EntityHeader` actions slot | two of its actions are share duplicates |
| `FundraiserQuickActions.client.tsx` | **Rewrite** → `QuickActionTile` grid | 3 disabled "Coming soon", 2 duplicate shares |
| `FundraiserAnalytics.client.tsx` | **Rewrite** → `TrendChart` + `StatCard` | visitors/conversion/shares untracked |
| local `StatusBadge` in `fundraisers/[id]/overview/page.tsx:22` | **Delete**, use `StatusChip` | not shared, encodes health score |
| `components/ui/state.tsx` | **Rewrite** (dashboard variant) | icon tile + dashed box too heavy for inline empties |
| `AttentionStrip.tsx` | **Rewrite** | one card per alert, shadow, black pill |
| `TodayStrip.tsx` | **Delete** | replaced by Live now + KPI grid |
| `SetupChecklist.tsx` | **Rewrite** → banner | multi-row card |

## 12. Accessibility contract

- Every icon-only control has an `aria-label`; icons are `aria-hidden`.
- Live region: attention count announces once on change, not per row.
- Focus ring: `focus-visible:ring-2 ring-brand-600 ring-offset-2` (already the pattern in
  `OrgMobileHeader.tsx:59`), never removed.
- Horizontal scroller is keyboard-scrollable (`tabindex="0"`, `role="region"`, `aria-label`).
- Colour is never the only signal: status chips carry text; deltas carry an arrow glyph.
- `maximumScale: 1` is removed (audit BUG-07); components must survive 200% zoom.
