# 03 — Data Availability Matrix

**Method:** no live database was reachable in this environment (no read-only connection configured; see `00`).
Evidence is from `prod_schema.sql` (2026-10-30 dump), `staging_schema.sql` (same date), and
`db/migration_*.sql`. Anything not present in those files is marked **UNKNOWN**, not assumed missing.
Timezone/index/RLS columns are quoted from the migration that introduced the table.

## C0. Domain tables that exist

`orders` (`db/migration_171_orders.sql:27`), `reservations` (`db/migration_176_reservations.sql:35`),
`menu_sections`, `menu_items` (`prod_schema.sql:9524`), `services` (`:10372`), `products` (`:9992`),
`donations` (`:8807`), `reviews` (`:10286`), `organizer_follows` (`:9705`), `ticket_orders` (`:10585`),
`tickets`, `guests`, `ticket_checkins`, `event_staff_checkins`, `business_branches`, `promo_codes`,
`promotions`, `payouts`, `recipient_ledger_entries`, `customer_identities`, `event_memories`.
**CONFIRMED** from the dump table list.

**Tables that do NOT exist anywhere in the repo:** `expenses`, `refunds`, `bookings`, `vehicles`, `inventory_items`,
`customers` (as a CRM table). Grep for `CREATE TABLE … expenses` across `db/` returns nothing; `grep -rln "expenses"
db/ lib/ app/` returns nothing. **CONFIRMED absent** from the repo's schema sources.

## C-1. Correction — 2026-11-08 (Stage 2 verification)

This audit understated the booking model. Verified against `lib/actions/general-booking.ts`, migrations
216/217/218 (216 is untracked in `db/`; 217/218 are committed in `b1e099621`) and the dashboard page on
`feat/fresh-home-redesign`:

- **There is still no `bookings` table.** General bookings are `reservations` rows with
  `booking_type = 'appointment'` (`db/migration_176_reservations.sql:40`), inserted at
  `lib/actions/general-booking.ts:299-330` with numbers `GBK-YYMMDD-NNNN` (`:262-263`).
- **Staff availability now exists for bookings:** `reservation_staff`, `reservation_resources`,
  `reservation_service_catalog`, `reservation_staff_schedules`, `reservation_staff_breaks`,
  `reservation_staff_exceptions`, `reservation_resource_schedules/exceptions`, plus
  `reservations.staff_id/resource_id/service_id/hold_expires_at` and status `pending_hold` — all migration 216.
- `booking_details jsonb` (migration 217) carries `service_type`, `alt_starts_at`, `terms_accepted_at`,
  `marketing_opt_in`.
- The dashboard Bookings page reads `services` (`is_active`), **not** `reservation_service_catalog`; that new
table has zero app references (`grep -rn reservation_service_catalog lib app components` → 0).

Consequence for the rows below: **Bookings/appointments moves from ◐ to ✅ for capture, ◐ for management**
(two competing service catalogs), and **Staff availability moves from “no table” to ✅ for booking staff only**
(no general shifts/rosters). The downstream design matrix is `docs/design/dashboard-overview/03`.

## C1. Module-by-module matrix

Legend: **T** tenant-scoped (organizer_id + RLS) · **Z** timezone-aware storage (`timestamptz`) **I** indexed for
date-range / listing · **—** not available.

| Candidate module | Tables / columns / RPC | T | Z | I | What is missing |
|---|---|---|---|---|---|
| **Revenue (today/period)** | `orders.total_amount`, `currency`, `payment_status`, `created_at` | ✅ | ✅ `created_at timestamptz` | ✅ `idx_orders_created_at (created_at DESC)`, `idx_orders_organizer_id` | No period selector; no refunds netting; no expenses so no profit |
| **Orders** | `orders.status` ∈ `pending,accepted,preparing,ready,completed,cancelled`; `payment_status` ∈ `unpaid,paid,refunded`; `fulfilment_type` ∈ `pickup,delivery`; `order_number`, `tracking_token`, `items jsonb`, `estimated_ready_at`, `scheduled_for`, `status_history` | ✅ | ✅ | ✅ | No `out_for_delivery`/`delivered` in the CHECK constraint, yet the UI styles them (`RecentOrdersWidget.tsx:17-19`) — **schema/UI drift** |
| **Order channel** | `orders.fulfilment_type`; `provider`, `provider_reference`; `table_id`, `table_session_id` (later migrations) | ✅ | ✅ | partial | No "channel" enum (web / QR / POS); `dine_in` exists only as an **offering fact**, not an order field |
| **Overdue orders** | `created_at`, `estimated_ready_at`, `status_history` | ✅ | ✅ | ✅ | Computed at render time (`lib/order-overdue.ts`), never stored — no query can sort by overdue |
| **Avg order value** | derivable from `orders.total_amount` | ✅ | ✅ | — | Not precomputed; per-currency only |
| **Outstanding payments** | `payment_status='unpaid'` | ✅ | ✅ | ✅ | No accounts-receivable table, no due dates |
| **Reservations / table requests** | `reservations.status` ∈ `pending,confirmed,declined,seated,completed,no_show,cancelled`; `party_size`, `starts_at`, `duration_minutes`, `ends_at` (mig 204/217), `deposit_amount/currency`, `owner_note`, `internal_note` (mig 205), `status_history` | ✅ | ✅ `starts_at timestamptz` | ✅ `idx_reservations_organizer_starts`, `idx_reservations_organizer_status_starts` | `booking_type` also carries `rental`/`appointment`; no separate bookings model |
| **Bookings / appointments** | `reservations.booking_type='appointment'`; `booking_details jsonb` (217); `staff_id`/`resource_id`/`service_id`/`hold_expires_at` (216); status `pending_hold` (216) | ✅ | ✅ | ✅ (same indexes + 216 `idx_reservations_staff_window`, `idx_reservations_resource_window`) | Two competing service models (`services` vs `reservation_service_catalog`); no recurring series; no booking-specific settings key |
| **Services** | `services` (+ `service_tiers`) | ✅ | — | partial | No `duration`/`price` guarantee asserted here (UNKNOWN — column list not dumped in `03` scope) |
| **Staff availability** | Booking staff only: `reservation_staff`, `reservation_staff_schedules`, `reservation_staff_breaks`, `reservation_staff_exceptions`, `reservation_resource_schedules/exceptions` (migration 216). General workforce: `entity_members`, `business_workers`, `business_worker_sessions` | ✅ | partial | ✅ (`idx_reservation_staff_schedules_staff_weekday`, `idx_reservation_staff_breaks_staff_date`) | **No shift/roster table for non-booking staff**; booking availability tables are unused by any app code so far |
| **Customers (new vs returning)** | `orders.customer_name/phone/email`, `customer_identities`, `reservations.customer_*` | ✅ | ✅ | — | No canonical customer table; identity stitching is `customer_identities` (UNKNOWN coverage). "Returning" requires email/phone matching |
| **Vehicles / rentals / returns / maintenance** | **none** — no `vehicles` table; `VEHICLE_RENTAL` capability exists but no persistence found | — | — | — | Entire module unimplemented. `Fleet` is `routeExists:false` (`lib/org-dashboard-modules.ts:79`) |
| **Inventory / low stock** | no `inventory_items`; `products` table exists (UNKNOWN whether it has stock columns) | partial | — | — | No stock ledger, no low-stock threshold table in repo sources |
| **Events / ticket sales / check-ins / guests** | `events`, `ticket_orders.quantity/status`, `tickets`, `guests`, `ticket_checkins`, `event_staff_checkins` | ✅ | ✅ event_date | partial | Overview only counts guests + tickets; no check-in count, no revenue, no RSVP breakdown |
| **Fundraising / donations / donors / goal / pace** | `donations` (amount, currency, status, donor_name/email, user_id, created_at), `fundraisers` (goal, raised, raised_amount, status, created_at) | ✅ | ✅ | partial | **No `end_date` column** on `fundraisers` → the UI fakes 30 days (`page.tsx:120`) |
| **Reviews** | `reviews` (+ `organizers.average_rating`, `review_count`) | ✅ | ✅ | UNKNOWN | Overview shows aggregate only |
| **Followers** | `organizer_follows` (+ `organizers.follower_offset` display offset) | ✅ | ✅ | partial | Offset is display-only; not real followers |
| **Expenses / profit** | **none** | — | — | — | **No expenses table at all.** Profit cannot be computed |
| **Refunds** | only `orders.payment_status='refunded'` and `donations.status` filtering | ✅ | ✅ | — | No refund amount/date/reason; refunded orders are excluded from "today" by `neq('status','cancelled')` only, so refunded orders still count in sales |

## C2. Currency handling

- Storage: per-row `currency` text on `orders` (default `USD`, `db/migration_171_orders.sql:45`), `donations`,
  `reservations.deposit_currency`, `products`/`services` (UNKNOWN per-row currency — not read).
- Display: **one** formatter `formatMoney` (`lib/money.ts:96-133`). `XOF`/`XAF` render as `FCFA` with zero
  decimals and are **never summed across currencies** (`:6-16`, `:147-176`). CONFIRMED.
- Online card payment only supports **USD** today: `ONLINE_PAYMENT_CURRENCIES = ["USD"]`
  (`lib/storefront-features.ts:49-56`). Everything else is "needs setup — currency not supported".
- Fundraiser goal has **no currency column** (comment at `app/dashboard/fundraisers/[id]/overview/page.tsx:111`)
  → goal is displayed with the primary donation currency for `formatMoney` but with a literal `$` in the header
  (`:187`). CONFIRMED defect.
- `DashboardView.tsx:99-101` hardcodes USD (`Intl.NumberFormat(..., currency: 'USD')`). CONFIRMED but that
  component appears unused.

## C3. Timezone

- Business timezone source of truth: `tenant_websites.metadata.timezone`, resolved by
  `resolveWebsiteTimezone` / `resolveSiteTimezone`, default `Africa/Abidjan`
  (`lib/date-timezone.ts:6, 140-170`). CONFIRMED.
- "Today" is computed **on the server** with `getStartOfTodayInTimezone(siteTimezone, now)`
  (`app/dashboard/org/[id]/overview/page.tsx:126-128`) and then re-filtered client-agnostically by
  `isTodayInTimezone` (`:206-210`). Unit-tested for Africa/Abidjan and America/New_York
  (`lib/__tests__/phase5-overview.test.cjs`, "getStartOfTodayInTimezone" / "isTodayInTimezone").
  CONFIRMED.
- The timezone is printed in the UI: "Today · {timeZone}" (`TodayStrip.tsx:43`). Users see
  `Africa/Abidjan` as an IANA string — CONFIRMED raw-value exposure.
- **Off-by-timezone risks that remain:**
  1. Orders query uses `.gte('created_at', startOfTodayIso)` **then** filters with `isTodayInTimezone`; correct,
     but the DB-side bound is computed for the *site* timezone while the row timestamps are UTC — safe because
     both are absolute instants. CONFIRMED safe.
  2. Fundraiser "today" uses **UTC day** (`isSameUtcDay`, `lib/fundraiser-dashboard.ts:64-66`), not the site
     timezone, and the overview has no timezone at all. For a UTC+0 site it matches; for Paris/Lagos a gift at
     00:30 local is counted as "yesterday". CONFIRMED divergence.
  3. `fundraiser` relative dates and `RecentOrdersWidget.formatTimeAgo` use the **browser** clock, not the site
     timezone (`RecentOrdersWidget.tsx:27-36`). Display-only, but inconsistent with the server's Today window.
     CONFIRMED.
  4. Reservations "today" filters `.gte('starts_at', startOfTodayIso)` **without an upper bound** and then
     slices to 200 rows, so a busy tenant with 200+ future reservations can hide *today's* rows entirely.
     CONFIRMED (`app/dashboard/org/[id]/overview/page.tsx:272-285`).
  5. `getStartOfTodayInTimezone` derives the offset by formatting a UTC guess and subtracting a day/hour diff;
     for DST-transition days this can be off by an hour. The unit tests cover summer and winter dates but not a
     transition day. **INFERRED risk**, not proven wrong.

## C4. RLS / indexing quality summary

| Table | RLS enabled | Policies | Indexes relevant to dashboard |
|---|---|---|---|
| `orders` | ✅ (`migration_171:60`) | SELECT team roles, UPDATE managers, service_role full | organizer_id, website_id, created_at DESC, tracking_token |
| `reservations` | ✅ (`migration_176:62`) | SELECT team roles, UPDATE managers | organizer_id+starts_at DESC, organizer_id+status+starts_at DESC, lookup_token unique |
| `donations` | UNKNOWN in `03` scope (not read) | — | — |
| `reviews`, `organizer_follows`, `menu_items`, `services` | UNKNOWN (not read) | — | — |

**Missing index for the overview's actual hot query:** the page issues three separate `orders` queries scoped by
`organizer_id` + status/today. A composite `(organizer_id, status, created_at DESC)` is referenced in a code
comment as "migration 174 composite index" (`app/dashboard/org/[id]/overview/page.tsx:130`) but **migration 174 is
not in the repo tree** (`db/` has 171 then 176+). So the comment references an index whose DDL is not verifiable
here. **UNKNOWN / needs DB confirmation.**

## C5. What is missing for the proposed design (mobile-first overview)

| Design element | Data support |
|---|---|
| Compact two-column KPI grid | ✅ Supported per-currency from `orders`/`donations`/`ticket_orders` |
| Global period selector (today/week/month) | ✅ Raw timestamps + indexes allow it; **no API/date range helper exists** — every query is hardcoded to "today" or "last 5" |
| "Needs attention" grouped card | ✅ orders (pending/overdue), reservations (pending), approvals, drafts; ❌ no unified RPC — three separate queries per page load |
| Horizontally scrollable live-operation cards | ✅ orders + reservations rows exist |
| Progress rings with remaining counts | ✅ fundraiser goal/raised; orders have no target so rings only fit goals/capacity |
| Status chips | ✅ enums exist but are raw; need a label map (only `RecentOrdersWidget.STATUS_VARIANTS` has one, for 8 of the possible statuses) |
| One bottom nav of 4 + More | No data dependency — pure navigation work |
