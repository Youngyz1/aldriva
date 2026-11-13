# 10 — DRAFT Capability → Module Matrix (PROPOSAL ONLY)

> **This is a proposal based strictly on data that exists today** (`03-data-availability-matrix.md`).
> It is not a design, not a UI spec, and not an implementation plan. No code was changed.
> Cells say what the **data** can support, not what should be built first.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Table/columns exist, tenant-scoped, timezone-aware, indexed — safe to build on |
| ◐ | Exists but incomplete (missing a field, a table, or an index) — needs a data decision |
| ✗ | No data model exists — building the module requires a migration first |
| ⛔ | Capability exists in the taxonomy but nothing maps to it (dead capability) |

**Module columns**

`T` Today/KPI strip · `A` Needs attention · `O` Orders · `R` Table/space requests ·
`B` Bookings & appointments · `C` Catalog (menu/services/products) · `S` Staff · `U` Customers ·
`V` Vehicles/fleet · `I` Inventory · `E` Events & tickets · `F` Fundraising · `W` Reviews ·
`G` Followers · `N` Analytics

## 1. Capability → data support

| Capability | Module | Support | Evidence |
|---|---|---|---|
| `MENU` | C | ✅ | `menu_sections`, `menu_items` |
| `PRODUCTS` | C | ◐ | `products` exists; stock/low-stock columns not verified |
| `SERVICES` | C | ✅ | `services`, `service_tiers` |
| `ORDERS`, `ONLINE_ORDERING` | O, T, A | ✅ (◐ for channel) | `orders` + indexes; no channel enum, no `dine_in` column |
| `RESERVATIONS`, `TABLES` | R, T, A | ✅ | `reservations` + `(organizer,status,starts_at)` index |
| `BOOKINGS`, `APPOINTMENTS` | B | ◐ | only `reservations.booking_type='appointment'`; **no staff availability/shift table** |
| `STAFF` | S | ◐ | `entity_members`, `business_workers`; no availability/schedule |
| `CUSTOMERS` | U | ◐ | no customer table; identity via `customer_identities` + order email/phone |
| `VEHICLES`, `VEHICLE_RENTAL` | V | ✗ | no `vehicles` / rental / return / maintenance table anywhere |
| `INVENTORY`, `POS` | I | ✗ | no stock ledger, no POS table |
| `ROOMS` | — | ✗ | no rooms/inventory-by-date table |
| `BRANCHES` | — | ✅ | `business_branches` (but the overview has no branch dimension) |
| `MAINTENANCE` | — | ✗ | nothing |
| `QUOTES`, `INVOICING` | — | ✗ | nothing |
| `SUBSCRIPTIONS`, `MEMBERSHIPS` | — | ✗ | nothing |
| `PAYMENTS` | T | ◐ | `orders.payment_status`, `payouts`; no refunds table |
| `EVENTS`, `TICKETING` | E, T | ✅ | `events`, `tickets`, `ticket_orders`, `ticket_checkins`, `guests` |
| `DONATIONS` | F, T | ✅ (◐ dates) | `donations`; **no `fundraisers.end_date`** |
| `REVIEWS` | W | ✅ | `reviews` + organizer aggregates |
| `GALLERY`, `PORTFOLIO`, `CONTENT`, `BLOG` | — | ◐ | `media`, `articles`; no per-business portfolio model |
| `MARKETING`, `MESSAGING` | — | ◐ | `promotions`, `promo_codes`, `messages` |
| `ANALYTICS` | N | ✗ | no aggregate/rollup tables; every metric is computed live |
| `ONLINE_PAYMENT` | T | ◐ | USD-only (`ONLINE_PAYMENT_CURRENCIES`) |

**Dead capabilities (capability exists, nothing maps):** `ROOMS, MAINTENANCE, QUOTES, INVOICING, SUBSCRIPTIONS,
MEMBERSHIPS, INVENTORY, POS, VEHICLES, VEHICLE_RENTAL, BOOKINGS, APPOINTMENTS` — 12 of 37.
**CONFIRMED** by the table grep in `03`.

## 2. Business category → modules the data can actually fill

| Business type (the 26 mapped ones) | T | A | O | R | B | C | S | U | V | I | E | F | W | G | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Full-Service Restaurant | ✅ | ✅ | ✅ | ✅ | ◐ | ✅menu | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅org | ✗ |
| Fast Food / QS | ✅ | ✅ | ✅ | ✗ | – | ✅menu | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Coffee Shop / Bakery Café | ✅ | ✅ | ✅ | ✗ | – | ✅ | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Boutique / Supermarket / Grocery | ✅ | ✅ | ✅ | ✗ | – | ✅products | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| General Clinic / Dental | ✅* | ✅* | ✗ | ✗ | ◐ | ✅services | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Hair Salon / Barbershop | ✅* | ✅* | ✗ | ✗ | ◐ | ✅services | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Residential / Commercial Cleaning | ✅* | ✅* | ✗ | ✗ | ◐ | ✅services | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Gym / Yoga Studio | ✅* | ✅* | ✗ | ✗ | ◐ | ✗ (no plans) | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Photography / Wedding | ✅* | ✅* | ✗ | ✗ | ◐ | ✅services | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Car / Motorcycle / Van Rental | ✅* | ✅* | ✗ | ◐ (rental rows) | – | ✗ | ◐ | ◐ | ✗ | ✗ | – | – | ◐ | ✅ | ✗ |
| Boutique Hotel | ✗ | ◐ | ✗ | ◐ (rental rows) | ◐ | ✗ | ◐ | ◐ | ✗ | ✗ | – | – | ✅ | ✅ | ✗ |
| Nonprofit Organization | ✅* | ✅* | ✗ | ✗ | – | ✗ | ◐ | ◐ | ✗ | ✗ | ✅ | ✅ | ✅ | ✅ | ✗ |
| *Unmapped types* (Hotel, Legal, Pharmacy, School, Church, Farm, Plumber, Travel, …) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ | ✅ | ✅ | ✗ |

`*` = the module can technically render because the current `isCommerceOrg` rule fires, but the **only**
meaningful metric for that category is orders (which do not exist). That is BUG-01, not a supported module.
`org` = follower counts exist on `organizers`, not per business.

## 3. Organizer-level surfaces (outside business category)

| Organizer kind | Data-supported overview |
|---|---|
| Events-only | event count, tickets sold, check-ins (`ticket_checkins`), recent events, followers, rating |
| Fundraiser-only | raised per currency, donors, avg gift, updates, followers — **no end date, no shares/views/conversion** |
| Mixed events + fundraisers | union of the two above; the current page already does this (`events_metrics`) |
| Business-only | the category row above (**minus** the order modules when the capability is absent) |
| None | create-paths only (current behaviour, tested) |
| Personal (member, no org) | tickets, orders, donations, managed orgs (resolver already supports `personal_orders/tickets/donations`) |

## 4. Explicit non-goals for this matrix

- No decision on **which** modules should ship — that is Stage 2.
- No module for `expenses`/profit: **no expenses table exists**, so a profit KPI cannot be built without a schema
  decision.
- No refund module: only `payment_status='refunded'` exists; no amount/date/reason.
- No vehicle/fleet module: capability without persistence (`Fleet` nav is reserved, `routeExists:false`).
- No "live operations" merged widget: orders and reservations are separate tables with separate status enums and
  no common event stream; merging them is a product decision, not a data capability.
