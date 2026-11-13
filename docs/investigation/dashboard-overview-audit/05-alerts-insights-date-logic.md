# 05 — Alerts, Insights, Health, and Date Logic

Every formula/threshold below is copied from the named file. Nothing here is a recommendation.

## E1. Alerts — where each one is computed

| Alert | Computed in | Threshold / condition | Navigates to |
|---|---|---|---|
| "N pending orders awaiting acceptance" | `lib/overview-resolver.ts:145-158` | `counts.pendingOrders > 0`, where pending is `orders.status='pending'` (page `:176-200`) | `/dashboard/org/{id}/orders?tab=needs_attention` |
| "N orders overdue" | `lib/overview-resolver.ts:161-173` + `lib/order-overdue.ts` | pending > 10 min since `created_at`; accepted/preparing past `estimated_ready_at`; ready+delivery > 20 min waiting for courier | same orders page |
| "N table requests awaiting response" | `lib/overview-resolver.ts:175-196` | `pendingReservations > 0` **and** `counts.hasReservationsModule` | `/dashboard/org/{id}/reservations?tab=needs_action` |
| Business approval in review / rejected / archived | `lib/overview-resolver.ts:198-215` | `getApprovalState(businesses.status[])` → `pending`/`rejected`/`archived` | none (no href) |
| Unpublished website changes | `lib/overview-resolver.ts:217-230` | `hasUnpublishedChanges && isSitePublished` | `/dashboard/org/{id}/website/builder` |
| Pending reservations for row-existence gating | `app/dashboard/org/[id]/overview/page.tsx:262-303` | exact count where `status='pending'` | — |

**Thresholds are not configurable and live in three files** (`order-overdue.ts`, the page, the resolver).
The 10-minute pending timeout and 20-minute courier wait are hardcoded (`lib/order-overdue.ts:31,72`).
**CONFIRMED**

**Minimum data assumptions:**
- Pending/overdue assume `orders.created_at` and (optionally) `estimated_ready_at` exist. The page has a
  column-missing fallback that sets overdue to `created_at`-only (`page.tsx:181-196`). CONFIRMED.
- Table-request alert assumes `reservations` exists (migration 176). On error the count stays 0 and the widget
  disappears — silent degradation, no "setup pending" notice. CONFIRMED (`:296-302`).
- Overdue is **render-time only**; there is no cron/background job and no `overdue` column
  (`lib/order-overdue.ts:1-8`). Two users see different counts seconds apart. CONFIRMED (by design, but it
  means any "needs attention" badge can change without a data event).

## E2. Campaign health score — exact formula

`lib/fundraiser-dashboard.ts:29-34`:

```
if (status === "completed") return 100;
if (dailyPaceRequired === undefined || dailyPaceRequired <= 0) return 100;
paceRatio = averageDailyRaised / dailyPaceRequired;
health = clamp(0, 100, round(paceRatio * 65));
```

- **Maximum from pace alone is 65.** The remaining 35 points are unreachable, so a campaign raising *exactly* the
  required pace scores 65/100 — visually "failing". CONFIRMED.
- Any `dailyPaceRequired <= 0` (goal reached or goal 0) returns 100 even if `status !== "completed"`.
  CONFIRMED.
- `dailyPaceRequired` in the overview is `(goal - raised) / 30` where **30 is a constant**
  (`app/dashboard/fundraisers/[id]/overview/page.tsx:120-121`). So "required pace" is always "finish in 30 days
  from today", regardless of campaign age. CONFIRMED.
- `averageDailyRaised = round(raised / daysElapsed)`, `daysElapsed = max(1, floor((now - created_at)/86400000))`
  (`:117-119`). A campaign that raises its whole goal on day 1 then idles shows a health score that decays as
  `daysElapsed` grows. CONFIRMED.

## E3. Projected finish — exact formula

`lib/fundraiser-dashboard.ts:36-42`:

```
if (goal > 0 && raised >= goal) return null;
if (averageDailyRaised <= 0) return null;
daysToGoal = ceil((goal - raised) / averageDailyRaised);
return now + daysToGoal days;
```

Rendered as "Goal reached" / "Not enough data yet" / a date (`page.tsx:160-164`). It is **not** compared to any
deadline (there is none). CONFIRMED.

## E4. Status inference — exact formula

`lib/fundraiser-dashboard.ts:19-27`:

```
days = endDate ? max(0, ceil((endDate - now)/day)) : 30;   // DEFAULT_DAYS_REMAINING
if (days === 0 || (goal > 0 && raised >= goal)) return "completed";
progress = goal > 0 ? raised/goal : 0;
elapsed = 1 - days/90;
if (progress >= elapsed + 0.05) return "ahead";
if (progress <  elapsed - 0.10) return "behind";
return "on_track";
```

Called with `endDate = null` from the overview (`page.tsx:124`), so `elapsed = 1 - 30/90 = 0.667`: a campaign
is "ahead" once it passes **66.7%** funded, "behind" below **56.7%**, regardless of when it started.
CONFIRMED.

## E5. Insights — where and on what minimum data

`buildFundraiserInsights` (`lib/fundraiser-dashboard.ts:139-160`) composes up to four:

| Insight | Condition | Data needed |
|---|---|---|
| almost-there | `pct >= 90 && remaining > 0` | goal, raised |
| today-activity | `todayCount > 0` | donations, **UTC day** |
| pace-ahead / pace-behind | `dailyPaceRequired > 0 && status !== completed` | 30-day constant, avg/day |
| stale-update | no updates at all, or ≥ 7 days since last update | `fundraiser_updates` |

Empty state: "Not enough data yet" list (`page.tsx:392-402`). CONFIRMED.

**Insight strings are US-dollar-only.** `formatCurrency` in this file hardcodes `"USD"`
(`lib/fundraiser-dashboard.ts:75-77`) and strips `.00`. So insights say `$` while the KPI cards say `FCFA`.
CONFIRMED — same class of bug as the header goal.

## E6. Duplicated insight/alert logic

- **Health/pacing appears twice:** the pure lib (`fundraiser-dashboard.ts`) and the page recompute
  `avgDaily`, `daysRemaining`, `dailyPaceRequired`, `pct`, `remaining` inline (`page.tsx:117-125`).
  Changing the model requires editing both. CONFIRMED.
- **Overdue logic appears twice on the same request:** the resolver builds the alert list
  (`overview-resolver.ts:161-173`) from counts that the page computed with `computeOrderOverdue`
  (`page.tsx:185-200`), and `OrdersClient`/`OrderCard` likely recompute for list badges. At minimum the
  count and the per-row badge are two computations. CONFIRMED for the count; INFERRED for the badge
  (`components/dashboard/orders/OrderCard.tsx` not fully read).
- **Two "today" definitions:** site-timezone day (orders/reservations) and UTC day (donations). CONFIRMED.
- **Two event/revenue aggregators:** `DashboardView.tsx` (USD-only, unused) and `EventMetricsWidget`
  (per-flag) compute overlapping metrics on different surfaces. CONFIRMED.

## F. Date range & period selectors — current state

- **There is no period selector anywhere in the dashboard overviews.** `OverviewShell` has only a Refresh
  button (`components/dashboard/overview/OverviewShell.tsx:36-52`). CONFIRMED.
- The only date-range-like UI in the workspace is cook performance ("Today / 7 days / 30 days",
  `messages/en.json` → `Organizer.cookPerformance.dateRanges`) on the kitchen page. CONFIRMED.
- "Today" is server-computed relative to `tenant_websites.metadata.timezone`
  (`app/dashboard/org/[id]/overview/page.tsx:113-128`); display order uses the browser clock
  (`RecentOrdersWidget.tsx:27-36`). CONFIRMED.
- `Africa/Abidjan` is the default and is printed verbatim in the Today heading (`TodayStrip.tsx:43`).
  CONFIRMED.
- Fundraiser analytics chart uses `dailySeries` built from UTC day keys (`lib/fundraiser-dashboard.ts:246-260`),
  labelled with `toLocaleDateString("en-US")` — no site timezone. CONFIRMED.

## F2. Timezone off-by-one risks (actionable, not fixed)

1. A donation at 23:30 local (UTC+1 site) lands on the previous UTC day → "Today's Donations" can read 0 right
   after a gift. CONFIRMED by code path.
2. Reservation "today" has no upper bound and a 200-row cap → today's rows may be truncated out.
   CONFIRMED (`page.tsx:272-285`).
3. The Today strip's open/closed badge is computed from the **live** hours doc but `isOpen` defaults to `true`
   when no hours exist (`page.tsx:403-404`) → "Open for orders" at 3am on a business with no hours. CONFIRMED.
4. `hoursBadgeState` returns `saved-unpublished` → the badge says "Hours saved, website not published" but
   `isOpen` stays `true`, so the card title still says "Open for orders". CONFIRMED
   (`page.tsx:411-413`, `TodayStrip.tsx:90`).
