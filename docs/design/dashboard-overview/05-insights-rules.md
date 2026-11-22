# 05 — Insights & Attention Rules

Two separate things, deliberately:

- **Attention** = something needs a decision now (blocking or time-sensitive). Rendered in the grouped
  attention card.
- **Insight** = a fact worth knowing, computed from real numbers, with one action. Rendered as `InsightCard`,
  max 2.

No rule may fire without meeting its `minData` threshold, and no copy may contain advisory fluff
("donations typically spike 48 h after each post" in `lib/fundraiser-dashboard.ts:71` is removed — it is a claim
without a source in this product's data).

---

## 1. Rule registry format

```ts
// lib/dashboard/rules.ts
export interface Rule {
  id: string;                          // stable: "orders.pending_overdue"
  domain: "orders"|"bookings"|"reservations"|"catalog"|"events"|"donations"|"reviews"|"setup";
  capabilities: Capability[];          // [] = always evaluated
  severity: "critical"|"warning"|"info";
  minData: { events: number; windowDays: number };   // threshold gate
  evaluate(ctx: RuleContext): RuleHit | null;
  action: (ctx: RuleContext) => { href: string; labelKey: string };
  i18n: { titleKey: string; evidenceKey: string };
}
```

`RuleHit = { params: Record<string, number|string>; rank: number }`. Ranking: severity, then age, then value.
Only the top **2** insight hits render; attention renders the top 3 with the same rank (if >3 items exist, "See all" expands the card in place; the standalone `/attention` route is dropped). No dismissal table: rules stop firing when their conditions clear.

Every rule needs: a pure `evaluate` (unit-testable without Supabase), a stated threshold, and an `href` that
resolves to a page (tested against the module registry, per `02-module-contract.md` §1).

## 2. Rules — orders (restaurant, retail, generic commerce)

| id | Condition | minData | Severity | Action |
|---|---|---|---|---|
| `orders.pending_overdue` | `pending` order older than 10 min | 1 order | critical | `/orders?tab=needs_attention` |
| `orders.dine_in_pending` | `orders.dine_in_confirmation = 'pending'` older than 10 min | 1 order | critical | `/orders?tab=needs_attention` |
| `orders.accepted_stale` | `accepted` > 20 min with no `preparing` | 1 | warning | same |
| `orders.courier_overdue` | `out_for_delivery` > 20 min past expected | 1 | critical | `/orders?tab=delivery` |
| `orders.unpaid_ready` | `ready` + `payment_status='unpaid'` | 1 | warning | `/orders?tab=unpaid` |
| `orders.refunds_today` | ≥1 order `payment_status='refunded'` today | 1 | info | `/orders?tab=refunded` |
| `orders.no_orders_7d` | capability ORDERS, 0 orders in 7d, site published | 7 days | info | `/website/builder` |

Thresholds 10/20 min match `lib/order-overdue.ts` (audit `05`); do not fork them.

## 3. Rules — bookings (`booking_type in appointment,rental`)

| id | Condition | minData | Severity | Action |
|---|---|---|---|---|
| `bookings.pending_over_2h` | request `pending` > 2h | 1 | critical | `/bookings?tab=pending` |
| `bookings.tomorrow_unconfirmed` | `pending` starting within 24h | 1 | critical | same |
| `bookings.no_services` | capability BOOKINGS, 0 active `services` | 0 rows is the trigger | warning | `/services` |
| `bookings.disabled_but_capable` | `isGeneralBookingsLive(...) === false` while capability present | — | warning | `/bookings` (shows the toggle) |
| `bookings.no_show_high` | no-show rate > 20% over ≥10 completed in 30d | 10 | info | `/bookings?tab=history` |

`bookings.disabled_but_capable` duplicates a setup step by design; it is suppressed while the setup banner is
visible, so the same message never appears twice on one screen.

## 4. Rules — table reservations

| id | Condition | minData | Severity | Action |
|---|---|---|---|---|
| `reservations.pending_today` | `pending` with `starts_at` today, >1h old | 1 | critical | `/reservations?tab=needs_action` |
| `reservations.no_hours` | capability TABLES, hours not configured | — | warning | `/settings#hours` |
| `reservations.capacity_conflict` | confirmed covers ≥ `seat_capacity` for a service window | 1 slot | warning | `/reservations?date=today` |

## 5. Rules — catalog

| id | Condition | minData | Severity | Action |
|---|---|---|---|---|
| `catalog.menu_empty` | capability MENU, 0 `menu_items` | — | warning | `/menu` |
| `catalog.menu_no_photo` | ≥1 published item with no image | 1 | info | `/menu` |
| `catalog.services_no_price` | ≥1 active service with `price IS NULL` (allowed by 219) | 1 | info | `/services` |
| `catalog.products_no_image` | ≥1 active product with no image | 1 | info | `/products` |

No stock rule: there is no inventory table (see `03` §3).

## 6. Rules — events

| id | Condition | minData | Severity | Action |
|---|---|---|---|---|
| `events.soon_no_tickets` | event within 7d, `tickets` rows = 0 | 1 event | warning | `/events/{id}/ticket-design` |
| `events.checked_in_lag` | event started, check-ins = 0, tickets sold > 0 | 1 | info | `/events/{id}/scan` |
| `events.draft_unpublished` | event `draft` within 14d | 1 | critical | `/events/{id}` |

Ticket revenue rules are withheld until `ticket_orders` money columns are verified (audit UNKNOWN).

## 7. Rules — donations

| id | Condition | minData | Severity | Action |
|---|---|---|---|---|
| `donations.goal_reached` | raised ≥ goal, `status != completed` | 1 | info | `/fundraisers/{id}/settings` |
| `donations.no_update_14d` | active campaign, last update ≥14d | 1 | warning | `/fundraisers/{id}/updates` |
| `donations.no_end_date` | `end_date IS NULL` (after migration 230) | 1 | info | `/fundraisers/{id}/settings` |
| `donations.stalled_7d` | 0 gifts in 7d after ≥5 gifts total | 5 | warning | `/fundraisers/{id}/donations` |

No shares/views/conversion rules: those columns do not exist.

## 8. Rules — reviews and setup

| id | Condition | minData | Severity | Action |
|---|---|---|---|---|
| `reviews.low_recent` | avg < 4.0 over ≥5 reviews in 30d | 5 | warning | `/reviews` |
| `setup.site_draft` | site has unpublished changes | — | info | `/website/builder` |
| `setup.not_published` | website status ≠ published | — | warning | `/website` |
| `setup.no_hours` | no opening hours in `website_content` and ORDERS/RESERVATIONS | — | warning | `/settings#hours` |
| `approval.pending` | org approval `pending` | — | critical | `/settings` |
| `approval.rejected` | org approval `rejected` | — | critical | `/settings` |

## 9. Fundraiser health score — documented formula (replaces the 0–65 cap)

Current code: `Math.round(clamp(paceRatio*65))` (`lib/fundraiser-dashboard.ts:29-34`), so 100 is unreachable
except via `completed`; `inferStatus` also assumes a **90-day** campaign (`:19-27`) and `getDaysRemaining`
returns a hardcoded 30 when there is no end date (`:9-16`).

Replacement, only when `fundraisers.end_date IS NOT NULL` and `goal > 0`:

```
progress  = min(raised / goal, 1)
daysTotal = max(1, ceil((end_date - created_at) / 1d))
daysLeft  = max(0, ceil((end_date - now) / 1d))
expected  = min((daysTotal - daysLeft) / daysTotal, 1)
paceRatio = requiredDaily > 0 ? min(avgDaily / requiredDaily, 1) : 1
timeAdj   = expected > 0 ? min(progress / expected, 1) : 1
score     = completed ? 100 : round(100 * (0.5*progress + 0.3*paceRatio + 0.2*timeAdj))
```

- Bands: 0–39 `at_risk`, 40–69 `behind`, 70–89 `on_track`, 90–100 `strong`. Bands are labels, not advice.
- `avgDaily = raised / max(1, daysElapsed since created_at)`, same primary-currency total as the KPIs.
- `timeAdj` ensures that elapsed time only improves the score if funding kept pace with that elapsed time (`min(progress / expected, 1)`), rather than rewarding elapsed time alone. When `expected == 0` (day 0, nothing has elapsed), `timeAdj = 1`.
- **When `end_date IS NULL`:** no score, no days left, no pace, no projected finish (Decision 9); status is one
  of `active` / `paused` / `completed` derived from `raised >= goal` and the stored status only.
- `inferStatus`'s 90-day assumption is deleted; elapsed comes from `created_at` → `end_date`.
- Tests: table of `(completed, raised, goal, daysTotal, daysLeft, avgDaily, requiredDaily) → score` vectors in
  `lib/__tests__/fundraiser-health.test.cjs`:
  1. **Completed**: `completed = true` → `score = 100`.
  2. **Day 0, 0 raised** (`raised = 0, goal = 1000, daysTotal = 30, daysLeft = 30, avgDaily = 0, requiredDaily = 33.33`):
     - `progress = 0 / 1000 = 0`
     - `expected = (30 - 30) / 30 = 0`
     - `paceRatio = min(0 / 33.33, 1) = 0`
     - `timeAdj = 1` (since `expected == 0`)
     - `score = round(100 * (0.5*0 + 0.3*0 + 0.2*1)) = round(20) = 20`
  3. **Mid-campaign on pace** (`raised = 500, goal = 1000, daysTotal = 30, daysLeft = 15, avgDaily = 33.33, requiredDaily = 33.33`):
     - `progress = 500 / 1000 = 0.5`
     - `expected = (30 - 15) / 30 = 0.5`
     - `paceRatio = min(33.33 / 33.33, 1) = 1.0`
     - `timeAdj = min(0.5 / 0.5, 1) = 1.0`
     - `score = round(100 * (0.5*0.5 + 0.3*1.0 + 0.2*1.0)) = round(100 * (0.25 + 0.30 + 0.20)) = 75` (`on_track`)
  4. **Mid-campaign behind pace** (`raised = 200, goal = 1000, daysTotal = 30, daysLeft = 15, avgDaily = 13.33, requiredDaily = 53.33`):
     - `progress = 200 / 1000 = 0.2`
     - `expected = (30 - 15) / 30 = 0.5`
     - `paceRatio = min(13.33 / 53.33, 1) = 0.25`
     - `timeAdj = min(0.2 / 0.5, 1) = 0.4`
     - `score = round(100 * (0.5*0.2 + 0.3*0.25 + 0.2*0.4)) = round(100 * (0.10 + 0.075 + 0.08)) = round(25.5) = 26` (`at_risk`)
  5. **Fully funded before deadline** (`raised = 1000, goal = 1000, daysTotal = 30, daysLeft = 10, avgDaily = 50, requiredDaily = 0`):
     - `progress = 1.0`
     - `expected = (30 - 10) / 30 = 0.667`
     - `paceRatio = 1.0` (requiredDaily <= 0)
     - `timeAdj = min(1.0 / 0.667, 1) = 1.0`
     - `score = round(100 * (0.5*1.0 + 0.3*1.0 + 0.2*1.0)) = 100` (`strong`)
  6. **Expired with 0 raised** (`raised = 0, goal = 1000, daysTotal = 30, daysLeft = 0, avgDaily = 0, requiredDaily = 0`):
     - `progress = 0`
     - `expected = 1.0`
     - `paceRatio = 0`
     - `timeAdj = min(0 / 1.0, 1) = 0`
     - `score = round(100 * (0.5*0 + 0.3*0 + 0.2*0)) = 0` (`at_risk`)

## 10. Copy rules (enforced in review)

- Title states the fact: "4 orders waiting 26 min" — not "Get ahead of the rush".
- Evidence line contains only numbers the RPC returned.
- Every insight has exactly one action.
- No rule may fire from a zero denominator; `requiredDaily` of 0 → skip, not "0% of pace".
- All copy is `messages/en.json` + `messages/fr.json` keys; pluralisation via ICU (`{count, plural, …}`).
