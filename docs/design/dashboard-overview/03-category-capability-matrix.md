# 03 — Category → Module Matrix (final)

Derived from audit `10-proposed-capability-module-matrix.md` and `03-data-availability-matrix.md`, corrected
for the real booking model (§1) and filtered by the rule: **no real data source → no module**.

---

## 1. Correction to the audit: Bookings are backed by `reservations`

The audit recorded `bookings ◐` on the assumption that "no staff availability table exists". That is no longer
true, and the model is larger than the audit knew.

| Claim | Verified evidence |
|---|---|
| General booking writes to `reservations`, not a `bookings` table | `lib/actions/general-booking.ts:315-337` inserts into `reservations` |
| Discriminator | `booking_type text NOT NULL DEFAULT 'table' CHECK (booking_type IN ('table','rental','appointment'))` — `db/migration_176_reservations.sql:40` |
| Booking number | `GBK-${dateStamp}-${4 digits}`, `dateStamp` = `toISOString().slice(2,10)` → `GBK-YYMMDD-NNNN` — `general-booking.ts:291-292` |
| Its payload beyond the row | `booking_details jsonb NOT NULL DEFAULT '{}'` with `service_type`, `alt_starts_at`, `terms_accepted_at`, `marketing_opt_in` — `db/migration_217_reservation_booking_details.sql` (committed in `b1e099621`), built at `general-booking.ts:302-307` and inserted at `:335` |
| Service list | `reservation_service_catalog` (duration, buffer, price, currency) — `db/migration_216_reservation_booking_schema.sql` §4; **not referenced by any app code** (`grep -rn reservation_service_catalog lib app components` → 0 hits) |
| Staff / resources / availability | `reservation_staff`, `reservation_resources`, `reservation_staff_schedules`, `reservation_staff_breaks`, `reservation_staff_exceptions`, `reservation_resource_schedules`, `reservation_resource_exceptions` — migration 216 §2-3, §6-7 |
| Reservation columns added | `staff_id`, `resource_id`, `service_id`, `hold_expires_at` — migration 216 §9 |
| Status vocabulary | `pending, confirmed, declined, seated, completed, no_show, cancelled, pending_hold` — migration 216 §9 |
| Capacity math ignores appointments | migration 218 skips the covers check when `booking_type <> 'table'` |
| Customer-facing gate | `isGeneralBookingsLive(capabilities, settingsEnabled, reservationsApproved)` — `lib/storefront-features.ts:459-469`; requires `BOOKINGS` or `APPOINTMENTS`, the shared reservations setting, and approval not false |
| Dashboard page | exists only on `feat/fresh-home-redesign` (`git ls-tree` → `app/dashboard/org/[id]/bookings/page.tsx`), reads `reservations` filtered `.eq("booking_type","appointment")` and `services` where `is_active` |

**Verdict:** `BOOKINGS`/`APPOINTMENTS` moves from ◐ to **✅ for capture, ◐ for management**. The dashboard page,
Confirm/Decline, and the "Accept online bookings" toggle exist on another branch, not in this worktree.

**New ambiguity (reported, not resolved here):** the Bookings page reads **`services`**
(`is_active`, from `b1e099621`'s page at `:60-64`), while migration 216 introduces
**`reservation_service_catalog`** for the same job and nothing uses it. Two service models now compete; see
`08-open-questions.md` Q2. Until that is decided, overview modules must **not** count
`reservation_service_catalog` (it is always empty in practice).

## 2. Final module list per category

Legend: **M** main section, **S** secondary/rail, **—** not rendered. Every M/S cites its source. "Zero state"
means the capability exists and renders with zeros/empty copy.

### 2.1 Restaurant / café / bakery

| Module | Slot | Source | Zero state |
|---|---|---|---|
| attention | M | orders + approval | hidden |
| live_orders | M | `orders` (status, created_at, fulfilment_type) | "No live orders" |
| live_reservations (next 2h, waitlist/pending) | M | `reservations` where `booking_type='table'` (capability TABLES) | "No reservations today" |
| kpi_sales (count, collected, outstanding, avg ticket) | M | `orders` | zeros |
| kpi_reservations (covers today, pending, confirmed 30d) | M | `reservations` where `booking_type='table'` (capability TABLES) | zeros |
| trend_sales | M | `orders` by day | replaced by activity list if <2 days |
| catalog_menu (sections, items, items without price/photo) | M | `menu_sections`, `menu_items` | "Add your first dish" |
| orders_today / kitchen_queue | S | `orders` (`preparing`, `ready`) | "Nothing in the kitchen" |
| reviews (rating, count 30d) | S | `reviews` | "No reviews yet" |

Blocked: table turnover (no seating sessions), prep-time analytics (no timestamps per stage beyond
`status_history`), inventory, profit.

### 2.2 Service business (clinic, salon, cleaning, studio, photography)

| Module | Slot | Source | Zero state |
|---|---|---|---|
| attention | M | reservations (`booking_type in appointment,rental`) + approval | hidden |
| live_bookings (next 2h, pending requests) | M | `reservations`, `booking_details.service_type` | "No bookings today" |
| kpi_bookings (requests, confirmed, completed 30d, no-show 30d) | M | `reservations` | zeros |
| trend_bookings | M | `reservations` by day | activity list if <2 days |
| catalog_services (active services, missing price) | M | `services` (`is_active`, `price` nullable since 219) | "Add your first service" |
| availability | S | `reservation_staff_schedules` etc. (216) | "Set your hours" |
| reviews | S | `reviews` | "No reviews yet" |

Blocked: per-staff utilisation (schedules exist, but no dashboard read model and no link from `services` to
`reservation_service_catalog`), treatment/medical records, recurring appointments (no series table).

### 2.3 Retail / boutique / grocery

| Module | Slot | Source | Zero state |
|---|---|---|---|
| attention | M | orders + approval | hidden |
| live_orders | M | `orders` | "No live orders" |
| kpi_sales | M | `orders` | zeros |
| trend_sales | M | `orders` | activity list |
| catalog_products (active, missing image) | M | `products` | "Add your first product" |
| reviews | S | `reviews` | "No reviews yet" |

Blocked: stock/low-stock (no inventory ledger), variants, returns/refunds amounts.

### 2.4 Rental (deferred track)

Rental is **DEFERRED** to a separate later track. Car, motorcycle, van rental and any rental business type use the generic fallback (§2.8) until that track ships. Fleet tables (`vehicles`) do not exist, and `booking_type='rental'` has no confirmed writer in the application codebase.

### 2.5 Event organizer

| Module | Slot | Source | Zero state |
|---|---|---|---|
| attention | M | event approval + check-in anomalies | hidden |
| live_events (today/next 24h) | M | `events.event_date`, `status` | "No events in the next 24h" |
| kpi_events (upcoming, tickets sold, checked in, guests confirmed, revenue) | M | `tickets`, `ticket_orders`, `ticket_checkins`, `guests` | zeros |
| trend_tickets | M | `ticket_orders` by day | activity list |
| next_event | S | `events` | hidden |

Event revenue is permitted: `ticket_orders` has verified columns `total_amount`, `currency`, and `status`. The status vocabulary in DDL (`ticket_orders_status_check` in `db/schema.sql:679`, `db/ticket_orders_and_seats_schema.sql:55`, `prod_schema.sql:10603`) is `pending`, `valid`, `used`, `cancelled`, `refunded`. Only paid-equivalent statuses (`valid`, `used`) are counted toward revenue (`pending`, `cancelled`, and `refunded` are excluded). Note: these status values are taken from repository DDL and remain unverified against the live DB. Blocked: refunds per ticket type; seating occupancy analytics.

### 2.6 Fundraiser

| Module | Slot | Source | Zero state |
|---|---|---|---|
| kpi_raised (raised, donors, avg gift, % of goal) | M | `donations`, `fundraisers.goal` | zeros |
| trend_donations | M | `donations` by day | activity list |
| progress_goal | M | `goal` + raised | "No goal set" |
| days_left / pace / projected finish | M | **only when `fundraisers.end_date IS NOT NULL`** (migration 230) | omitted |
| recent_donations | S | `donations` | "No donations yet" |
| updates | S | fundraiser updates table | hidden |

Blocked: shares, views, conversion, visitor counts — no columns exist; `FundraiserAnalytics.client.tsx` lists
`visitors`, `conversion`, `shares` as "not tracked" (`:7-13`) and those tabs are removed.

### 2.7 Nonprofit

| Module | Slot | Source | Zero state |
|---|---|---|---|
| kpi_fundraising | M | `donations` | zeros |
| trend_donations | M | `donations` | activity list |
| live_events | M | `events` | "No events in the next 24h" |
| kpi_events / tickets | S | `ticket_orders` | zeros |
| reviews/followers | S | `reviews`, `organizers` | "No reviews yet" |

Blocked: memberships, grants, volunteer hours, program outcomes — no tables.

### 2.8 Generic fallback (unmapped business types)

The taxonomy maps 26 types (`lib/business-taxonomy.ts:163-197`); everything else falls back to
`CONTENT/GALLERY/CUSTOMERS/REVIEWS`.

| Module | Slot | Source | Zero state |
|---|---|---|---|
| attention | M | approval, missing hours, unpublished site | hidden |
| kpi_reviews (rating, count 30d) | M | `reviews` | "No reviews yet" |
| live_* | — | none | — |
| recent_activity | M | catalog edits? **no audit table** → only orders/bookings if capabilities present | omitted |
| quick_actions (add service/product, publish site, share link) | S | routes | — |

A generic business with no capability and no activity gets: attention, a setup banner, quick actions, reviews.
That is a legitimate page, not a placeholder grid.

## 3. Blocked by data (do not build)

| Proposed module | Missing |
|---|---|
| Fleet / vehicles / rentals | `vehicles`, rental contract/return tables; `booking_type='rental'` has no confirmed writer in application code (rental track deferred) |
| Inventory / low stock / POS | stock ledger |
| Rooms / hotel availability | rooms + date-range inventory |
| Customers / CRM | no customer table; only denormalised name/phone on orders/reservations |
| Expenses / profit / margin | no `expenses` table (`grep -rl expenses db lib app` → 0) |
| Refund amounts | only `orders.payment_status='refunded'`, no amount/date |
| Staff shifts / rosters | `reservation_staff_schedules` covers bookings only, not general shifts |
| Quotes / invoices / subscriptions / memberships / maintenance | no tables |
| Fundraiser shares/views/conversion | no columns |
| Kitchen throughput / prep time | no per-stage timestamps outside `status_history` JSON |

## 4. Navigation availability vs module availability

Capability-absent modules do not render. But **data-empty capability modules still render their empty state**,
and their nav entry must exist so the empty state's action is reachable. Two cases need a guard:

- `MENU` + 0 rows → module shows "Add your first dish"; nav already hides Menu on `menuRows` (audit, nav
  "rows always win" rule). Keep the rule, but the empty state's action links to the **route** even when the nav
  entry is hidden — hence the module contract requirement that `href` resolves to an existing page, not that
  the nav shows it.
- `BOOKINGS` capability + 0 active services: render the module with `reason: "not_configured"` and the action
  "Add a service"; do not hide it, because that is the only place the owner learns bookings are unreachable.
