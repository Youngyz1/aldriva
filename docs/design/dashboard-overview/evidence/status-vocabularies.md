# Status Vocabularies — Verified vs Unverified

This document records the exact database constraints and vocabulary sources for every platform status domain used in `lib/dashboard/status-map.ts`.

---

## 1. Verified Live Status Groups

These groups were verified against the live staging database check constraints (or confirmed by direct environment verification).

| Table / Column | Verified Live Vocabulary | Verification Notes |
|---|---|---|
| `orders.status` | `pending, accepted, preparing, ready, picked_up, out_for_delivery, delivered, completed, cancelled` | Verified live CHECK constraint (`orders_status_check`). Defined across `migration_171_orders.sql:41` and delivery workflows `175/189`. |
| `orders.payment_status` | `unpaid, paid, refunded` | Verified live CHECK constraint. |
| `orders.fulfilment_type` | `pickup, delivery, dine_in` | Verified live CHECK constraint (`orders_fulfilment_type_check`). |
| `orders.dine_in_confirmation` | `not_applicable, pending, confirmed, declined` | Verified live CHECK constraint. |
| `reservations.status` | `pending, confirmed, declined, seated, completed, no_show, cancelled` | Verified live CHECK constraint (`reservations_status_check`). Note: Migration 216 (`pending_hold`) is **NOT applied on staging**. |
| `reservations.payment_status` | `unpaid, deposit_pending, deposit_paid, paid, refunded, waived` | Verified live CHECK constraint (`reservations_payment_status_check`). |
| `reservations.booking_type` | `table, rental, appointment` | Verified live CHECK constraint (`db/migration_176_reservations.sql:40`). |

---

## 2. Unverified Status Groups (from Repository DDL)

These groups are taken directly from committed repository DDL in `db/`, `prod_schema.sql`, or `staging_schema.sql`. They remain **unverified against the live database**.

| Domain / Column | Status Vocabulary | Source DDL (file:line) | Status |
|---|---|---|---|
| `events.status` | `pending, approved, rejected, draft` | `db/migration_155_event_kind.sql:54`, `prod_schema.sql:9005` | UNVERIFIED |
| `fundraisers.status` | `pending_review, published, rejected` (+ derived `active, paused, completed`) | `db/migration_41_fundraiser_approval.sql:42`, `prod_schema.sql:9100` | UNVERIFIED |
| `donations.status` | `pending, succeeded, completed, failed, refunded` | `db/migration_14_fundraiser_fixes.sql:94`, `prod_schema.sql:8825` | UNVERIFIED |
| `payouts.status` | `requested, processing, completed, failed, cancelled` | `db/migration_73_payouts_and_balance_rpcs.sql:28`, `prod_schema.sql:9863` | UNVERIFIED |
| `ticket_orders.status` | `pending, valid, used, cancelled, refunded` | `db/schema.sql:679`, `prod_schema.sql:10603` | UNVERIFIED |
| `tickets.status` | *(none)* | `db/schema.sql:687-692` has no `status` column on `tickets` | UNVERIFIED (column absent) |

---

## 3. Revenue Counting Rules

- **Orders**: Count `orders.payment_status = 'paid'`. Exclude `refunded` and `unpaid`.
- **Ticket Orders**: Count only paid-equivalent statuses: `valid` and `used`. Exclude `pending`, `cancelled`, and `refunded`. (Status vocabulary unverified against live DB).
- **Donations**: Count `donations.status = 'succeeded'` or `'completed'`. Exclude `pending`, `failed`, and `refunded`. Period rollups aggregate `donations.amount` rows filtered by `created_at` (joined via `fundraisers.organizer_id`), NOT cached `fundraisers.raised` or `raised_amount`.
