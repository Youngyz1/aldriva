# Rental Payment Design

**Branch:** `feat/rental-overview`  
**Worktree:** `C:\Users\Youngyz\aldriva-scanner-p0`  
**Status:** DESIGN ONLY — no application code, no migration files, no test files  
**Author:** Antigravity (AI design agent)  
**Date:** 2026-11-10  
**Migration Schedule:**
- **Migration 228:** DDL — Tables (`rental_payments`, `rental_checkout_sessions`, `rental_booking_events`), columns, backfills, constraints
- **Migration 229:** DDL — Function rewrites (`create_rental_booking`, `confirm_rental_booking`, overlap triggers, `record_rental_payment`, `prepare_rental_checkout_session`, `commit_rental_checkout_session`, `record_rental_balance_and_pickup`)
- **Migration 230:** Inspections (moved from 228)

---

## 1. Audit Findings & Verified System Realities

### 1.1 Instant-Mode Payment Flow End-to-End (Today)

**File:** `lib/actions/rental-public.ts` — `submitPublicRentalBooking()` (lines 598–659)

1. **Submission:** Customer submits storefront booking form.
2. **Hold Reservation:** `createRentalBookingInternal()` calls `create_rental_booking` SQL RPC inside an advisory lock. Booking inserted with `status = 'pending'`, `payment_status = 'unpaid'`:
   - Instant mode: `expires_at = now() + 35 min` (booking hold window).
   - Approval mode: `expires_at = now() + 24 h` (owner review window).
3. **Stripe Session:** Checkout session created:
   - `expires_at = now() + 30 min` (Stripe enforces checkout session expiry 5 minutes before booking hold expires).
   - Metadata: `kind = "rental"`, `rental_booking_id`, `confirmation_mode = "instant"`, `organizer_id`.
   - `success_url` / `cancel_url` point to `/rentals/lookup/{lookup_token}`.
4. **Payment & Webhook:** On checkout completion, `checkout.session.completed` fires `/api/webhooks/stripe`, dispatching to `fulfillRentalBooking(session, meta)` (`route.ts:970–1145`).
5. **Approval Mode Discrepancy Today:** `meta.confirmation_mode` is not `"instant"`. Line 1067 sets `nextStatus = snapshot.status` (leaves it `'pending'`). A payment can currently arrive for a pending booking without confirming it.

### 1.2 Real Current Schema & Functions (Live Definitions from Staging)

The key differences from design document:
- `reconcile_rental_overdue` currently only marks `is_overdue` for active bookings past `ends_at + 60m` - **does not expire bookings**
- `create_rental_booking` function has **23 parameters** (not 24)
- `snapshot_confirmation_mode` is **nullable** in current implementation, not NOT NULL
- `recipient_ledger_entries` has **`idx_recipient_ledger_entries_source_dedup`** unique index that affects rental credits
- `record_ticket_and_credit` uses **`stripe_payment_intent_id`** and **`stripe_session_id`** for idempotency checks
- **No `expired_at` column** currently exists in `rental_bookings`
- **No `rental_payment_policy` column** currently exists in `businesses`

---

### 1.2 Payout & Ledger Model

**Architecture:** Single Platform Stripe Account (no Stripe Connect, no `transfer_data`).

- **Tickets:** `record_ticket_and_credit` (`db/migration_72_ledger_credit_rpcs.sql`, `migration_118_multi_seat_instances.sql`) inserts `ticket_orders` + writes `credit` to `recipient_ledger_entries` (`source_type = \'ticket_order\'`).
- **Products:** `markProductOrderPaid()` (`lib/productOrders.ts`) calls `record_product_paid_and_credit` (`migration_72`) writing `credit` to `recipient_ledger_entries` (`source_type = \'product_order\'`).
- **Rentals **TODAY:** `fulfillRentalBooking` does **NOT** write to `recipient_ledger_entries`. Rental revenue is currently absent from the payout ledger.
- **Recipient Resolution:** Existing RPCs resolve organizer recipient via:
  ```sql
  v_recipient_id := resolve_recipient(\'organizer\', NULL, v_organizer_id, NULL);
  ```
  If resolution returns `NULL`, tickets/products alert via `payment_reconciliation_failures` (`route.ts:53–95`). Rentals must replicate this pattern: **credit payout ledger ONLY when `method = \'stripe\'`**. Offline methods (cash, mobile money, offline card) never credit the ledger.

**Current Ledger Indexes & Triggers (from live definitions):**
- `recipient_ledger_entries` has **`idx_recipient_ledger_entries_source_dedup`** unique index that **excludes refunds**: `CREATE UNIQUE INDEX idx_recipient_ledger_entries_source_dedup ON public.recipient_ledger_entries USING btree (source_type, source_id, entry_type) WHERE ((source_id IS NOT NULL) AND (entry_type <> \'refund\'))`
- This **single unique index ensures at most one credit per booking** in the payout ledger
- `record_ticket_and_credit` maintains idempotency via **`stripe_payment_intent_id`** and **`stripe_session_id`** uniqueness checks
- No other triggers affect `recipient_ledger_entries` - it's **append-only** via `prevent_ledger_entry_mutation()` trigger

---

### 1.3 Ledger Units & Platform Fee Analysis

**Units Analysis (Verified against Migrations 05, 71, 72, 118, and `route.ts`):**
- In `route.ts:450`, Stripe's minor-unit amount is normalized: `stripeAmount = pi.amount / 100`.
- In `route.ts:562`, `payment_reconciliation_failures.amount` receives `totalAmount` in **major units** (dollars/euros decimal, e.g. `150.00`).
- In `migration_72` and `migration_118`, `recipient_ledger_entries.amount` is `NUMERIC` and receives `p_total_amount` in **major units** (e.g. `150.00`), NOT cents.
- Both `recipient_ledger_entries.amount` and `payment_reconciliation_failures.amount` store **major currency units** (`numeric(12,2)`).

### 1.3 Ledger Units & Platform Fee Analysis

**Units Analysis (Verified against Migrations 05, 71, 72, 118, and `route.ts`):**
- In `route.ts:450`, Stripe's minor-unit amount is normalized: `stripeAmount = pi.amount / 100`.
- In `route.ts:562`, `payment_reconciliation_failures.amount` receives `totalAmount` in **major units** (dollars/euros decimal, e.g. `150.00`).
- In `migration_72` and `migration_118`, `recipient_ledger_entries.amount` is `NUMERIC` and receives `p_total_amount` in **major units** (e.g. `150.00`), NOT cents.
- Both `recipient_ledger_entries.amount` and `payment_reconciliation_failures.amount` store **major currency units** (`numeric(12,2)`).

**Platform Fee Mechanism in Existing System (Code Citations):**
**REAL CURRENT IMPLEMENTATION (from live definitions):**
- **At Checkout:** `app/api/checkout/route.ts:153–168` creates line items where `unit_amount = Math.round(unitPrice * 100)`. **No platform fee is added** to the buyer's price.
- **At Webhook / Fulfillment:** **TWO SEPARATE PATHS with DIFFERENT IMPLEMENTATIONS:**
  - **`record_product_paid_and_credit`** (`migration_72`): inserts 100% of `p_total_amount` into `recipient_ledger_entries` with `entry_type = \'credit\'`. **No fee entry is written**.
  - **`record_ticket_and_credit`** (`migration_118`): inserts full amount into `recipient_ledger_entries` with `entry_type = \'credit\'`. **No fee entry is written**.
- **At Payout:** `db/migration_73_payouts_and_balance_rpcs.sql:230–260` checks available balance and debits `entry_type = \'payout\'`, **deducting no fee**.
- **Result:** In Aldriva today, platform fees are **not deducted at checkout, not deducted at fulfillment, and not deducted at payout**. The platform completely absorbs Stripe\'s processing fee (~2.9% + $0.30).
- **Rental Decision:** Rentals will credit gross rental payment (`p_amount`) to `recipient_ledger_entries` and write **no fee entry** until the owner sets a rental platform fee rate.
- **Current Implementation Reality:** Both `record_ticket_and_credit` and `record_product_paid_and_credit` write full amounts with no fee deduction (verified in live definitions).

**Current Implementation Evidence:**
- `record_ticket_and_credit` (from live definitions) writes full `p_total_amount` with no fee
- `record_product_paid_and_credit` (from live definitions) writes full `v_total_amount` with no fee

**Future Migration Requirements Once Rate is Set:**
When the owner selects a rate (e.g. $R\%$):
 1. Add a setting column (e.g. `businesses.rental_platform_fee_percent` or read `platform_settings`).
 2. In `record_rental_payment`, write a second row to `recipient_ledger_entries`:
     `entry_type = \'platform_fee\'`, `amount = -ROUND(p_amount * v_fee_percent / 100.0, 2)`, `source_type = \'rental_booking\'`, `source_id = p_booking_id`.

**Worked Example ($150.00 Rental Payment):**
- Customer pays $150.00 online. Stripe charges `15000` cents.
- Webhook passes `p_amount = 150.00`, `p_currency = \'usd\'`.
- `rental_payments` row:
  - `amount = 150.00`, `currency = \'usd\'`, `method = \'stripe\'`, `direction = \'credit\'`, `kind = \'rental_charge\'`, `applied = true`.
- `recipient_ledger_entries` row 1:
  - `entry_type = \'credit\'`, `amount = 150.00`, `currency = \'usd\'`, `source_type = \'rental_booking\'`, `source_id = booking_id`.
- `recipient_ledger_entries` row 2 (if platform fee of 2.5% applied in future):
  - `entry_type = \'platform_fee\'`, `amount = -3.75`, `currency = \'usd\'`, `source_type = \'rental_booking\'`, `source_id = booking_id`.
  - Net organizer balance: `$\$150.00 - \$3.75 = \$146.25$.

---

### 1.4 Ledger Constraints & Unique Index Idempotency

From live database introspection of `recipient_ledger_entries` (`migration_71_recipient_ledger_entries.sql`):
- `entry_type = 'adjustment'` is verified as a valid entry type in `recipient_ledger_entries_entry_type_check` (`CHECK entry_type IN ('credit', 'debit', 'platform_fee', 'refund', 'payout', 'adjustment')`) and `recipient_ledger_entries_amount_sign` (`CHECK (adjustment AND amount <> 0)`).
- `idx_recipient_ledger_entries_source_dedup`:
  ```sql
  CREATE UNIQUE INDEX idx_recipient_ledger_entries_source_dedup
    ON recipient_ledger_entries (source_type, source_id, entry_type)
    WHERE source_id IS NOT NULL AND entry_type <> 'refund';
  ```
  Because `source_type = 'rental_booking'` and `source_id = booking_id`, this partial unique index allows at most **one credit per booking** in the payout ledger.
- **Idempotency & Race Protection Decision (Blocker B5):**
  Only one online Stripe credit is expected per rental booking (balance is collected offline). If a second legitimate or concurrent Stripe credit is attempted for the same booking:
  An unhandled duplicate would raise constraint violation `23505`, roll back the transaction, and cause Stripe webhooks to retry endlessly.
  **Design Choice:** Inside `record_rental_payment`, write the ledger entry with:
  ```sql
  INSERT INTO public.recipient_ledger_entries (
    recipient_id, entry_type, amount, currency, source_type, source_id, description
  ) VALUES (
    v_recipient_id, 'credit', p_amount, v_normalized_cur,
    'rental_booking', p_booking_id, 'Rental booking payment received'
  )
  ON CONFLICT (source_type, source_id, entry_type)
    WHERE source_id IS NOT NULL AND entry_type <> 'refund'
  DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
    INSERT INTO public.payment_reconciliation_failures (
      kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
    ) VALUES (
      'rental_booking',
      p_stripe_payment_intent_id,
      p_amount,
      v_normalized_cur,
      v_buyer_email,
      jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id, 'stripe_session_id', p_stripe_session_id),
      'Duplicate ledger credit prevented by unique index'
    );
  END IF;
  ```
  The `rental_payments` financial ledger row is **never rolled back**, and Stripe receives HTTP 200 without retrying.
- Trigger `prevent_ledger_entry_mutation()` prevents `UPDATE` or `DELETE` on `recipient_ledger_entries`, guaranteeing an append-only accounting ledger.

---

### 2.1 Real Current Function Signatures (from live definitions)

**create_rental_booking (23 parameters):**
```sql
CREATE OR REPLACE FUNCTION public.create_rental_booking(
  p_organizer_id            uuid,
  p_business_id             uuid,
  p_category_id             uuid,
  p_starts_at               timestamptz,
  p_ends_at                 timestamptz,
  p_customer_name           text,
  p_customer_email          text,
  p_snapshot_daily_rate     numeric,
  p_rental_amount           numeric,
  p_vehicle_id              uuid DEFAULT NULL,
  p_source                  text DEFAULT 'office',
  p_pickup_branch_id        uuid DEFAULT NULL,
  p_return_branch_id        uuid DEFAULT NULL,
  p_customer_phone          text DEFAULT NULL,
  p_driver_license_number   text DEFAULT NULL,
  p_driver_license_country  text DEFAULT NULL,
  p_driver_dob              date DEFAULT NULL,
  p_snapshot_weekly_rate    numeric DEFAULT NULL,
  p_snapshot_currency       text DEFAULT 'USD',
  p_deposit_required_amount numeric DEFAULT 0.00,
  p_notes                   text DEFAULT NULL,
  p_expires_at              timestamptz DEFAULT NULL,
  p_booking_number          text DEFAULT NULL,
  p_customer_locale         text DEFAULT 'en'
)
RETURNS rental_bookings
```

**record_rental_payment (13 parameters):**
```sql
CREATE OR REPLACE FUNCTION public.record_rental_payment(
  p_booking_id               uuid,
  p_organizer_id             uuid,
  p_kind                     text,
  p_method                   text,
  p_amount                   numeric,
  p_currency                 text,
  p_direction                text DEFAULT 'credit',
  p_stripe_session_id        text DEFAULT NULL,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_refund_id         text DEFAULT NULL,
  p_recorded_by              uuid DEFAULT NULL,
  p_notes                    text DEFAULT NULL
) RETURNS TABLE (...)
```

### 2.2 Migration 229 Critical Fixes

**Drop old signatures first:**
```sql
-- Drop exact 23-parameter overload from migration 226 before defining 24-parameter version
DROP FUNCTION IF EXISTS public.create_rental_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric, uuid, text, uuid, uuid, text, text, text, date, numeric, text, numeric, text, timestamptz, text);

DROP FUNCTION IF EXISTS public.record_rental_payment(uuid, uuid, text, text, numeric, text, text, text, text, uuid, text);
```

**add_missing_reconcile_overdue:**
- **Need to ADD `expired_at` column to `rental_bookings`** - currently missing but required by requirement #7
- `reconcile_rental_overdue` only marks `is_overdue` for active bookings past `ends_at + 60m` - **does not expire bookings**
- Add expiry of rental bookings in one place - TypeScript `reconcileExpiredBookings` needs to handle both `expires_at < now()` AND `payment_due_at < now()`
- Add `reconcileExpiredBookings` to `rental-public.ts`
- Add `checkCategoryAvailability` to TypeScript list in rental-public.ts

### 2.3 create_rental_booking - Office Source Behavior

**REAL CURRENT CODE BEHAVIOR:**
```sql
IF p_source = 'office' THEN
  v_initial_status    := 'confirmed';
  v_conf_mode         := 'instant';
  v_pay_policy        := 'offline';
  v_adv_pct           := NULL;
  v_amount_due_online := 0.00;
  v_expires_at        := NULL;
END IF;
```

**MUST PRESERVE:**
- Source = 'office' bookings **MUST NOT be forced into pending or online payment**
- Office bookings are **confirmed immediately** regardless of business settings
- Policy snapshot is **'offline'** for office bookings
- **NO Stripe session created for office bookings**

Online bookings follow the matrix (instant + full_online → pending → Stripe, etc.)

### 2.4 Snapshot Timing & confirm_rental_booking RPC

**Snapshot Rule:** Settings are snapshotted onto `rental_bookings` **at creation** (what the customer saw or desk terms).

**Missing confirm_rental_booking RPC:**
```sql
CREATE OR REPLACE FUNCTION public.confirm_rental_booking(
  p_booking_id   uuid,
  p_organizer_id uuid,
  p_actor_id     uuid
) RETURNS TABLE (
  booking_id     uuid,
  status         text,
  payment_due_at timestamptz,
  payment_policy text,
  amount_due     numeric
)
```

**Requirements for confirm_rental_booking RPC:**
- **Lock the row** (advisory + FOR UPDATE)
- **pending only** (cannot confirm already confirmed/awaiting_payment bookings)
- **compute payment_due_at** using business.rental_payment_link_hours
- **Apply 30-minute rule:** raise error if scheduled pickup within 30 minutes
- **Set awaiting_payment or confirmed per matrix** based on snapshot_payment_policy
- **Write audit event** to rental_booking_events

### 2.4 Mandatory Expiry Defaulting in SQL (Blocker B6)

Pending bookings must never hold capacity forever due to missing caller parameters.
Inside `create_rental_booking`:
- If `v_initial_status <> 'confirmed'` and `p_expires_at IS NULL`:
  - If `p_source = 'online'` and `v_conf_mode = 'instant'`: `v_expires_at := now() + interval '35 minutes'`.
  - If `p_source = 'online'` and `v_conf_mode = 'approval'`: `v_expires_at := now() + interval '24 hours'`.
  - If `p_source = 'office'`: `v_expires_at := NULL`.

### 2.5 TypeScript Files Mirroring Capacity Status Lists

The status list `['pending', 'awaiting_payment', 'confirmed', 'active']` holds fleet capacity. The following application files must be updated to mirror this list:
1. `lib/rental/allocation.ts` (booked vehicle exclusion query)
2. `lib/actions/rental-bookings.ts` (capacity checks and vehicle assignment validator)
3. `lib/actions/rental-public.ts` (`checkCategoryAvailability` capacity check)
4. `app/api/cron/rentals/reconcile/route.ts` (`reconcileExpiredBookings`)
5. `components/dashboard/overview/modules/RentalFleetSection.tsx` (fleet utilization and counts)
6. `components/dashboard/rentals/BookingListClient.tsx` (filters and status badges)
7. `app/dashboard/org/[id]/rentals/[bookingId]/page.tsx` (booking detail badge and actions)
8. `app/rentals/lookup/[token]/page.tsx` (public customer status banners)

---

## 3. Confirmation Mode × Payment Policy Matrix & Snapshots

### 3.1 Behavior Matrix

| Confirmation Mode | Payment Policy | Source | Storefront / Office Submission | Owner "Confirm" in Dashboard |
|---|---|---|---|---|
| **Any** | Any | **`office`** | Created directly as `status = 'confirmed'`, `payment_status = 'unpaid'`, policy snapshot `'offline'`, `amount_due_online = 0.00`. | N/A (Already confirmed) |
| **`instant`** | `offline` | `online` | Created directly as `status = 'confirmed'`, `payment_status = 'unpaid'`. Immediate confirmation shown. No Stripe session. | N/A (Already confirmed) |
| **`instant`** | `full_online` | `online` | Created as `status = 'pending'`. Customer redirected to Stripe Checkout for 100% of `rental_amount`. Webhook sets `status = 'confirmed'`, `payment_status = 'paid'`. | N/A (Automated) |
| **`instant`** | `advance_online` | `online` | Created as `status = 'pending'`. Customer redirected to Stripe Checkout for advance. Webhook sets `status = 'confirmed'`, `payment_status = 'partially_paid'`. Balance due offline at pickup. | N/A (Automated) |
| **`approval`** | `offline` | `online` | Created as `status = 'pending'`, `payment_status = 'unpaid'`. Request received email sent. | Owner clicks "Confirm" → booking flips to `status = 'confirmed'`. Customer receives approval confirmation email. |
| **`approval`** | `full_online` | `online` | Created as `status = 'pending'`, `payment_status = 'unpaid'`. Request received email sent. | Owner clicks "Confirm" → booking flips to `status = 'awaiting_payment'`. `payment_due_at` set. Customer receives approved-pay email with lookup link. |
| **`approval`** | `advance_online` | `online` | Created as `status = 'pending'`, `payment_status = 'unpaid'`. Request received email sent. | Owner clicks "Confirm" → booking flips to `status = 'awaiting_payment'`. `payment_due_at` set. Customer receives approved-pay email with lookup link for advance. |

### 3.2 Booking Snapshots (Snapshotted at Creation)

**Rule:** Settings are snapshotted onto `rental_bookings` **at creation** (representing what the customer saw on the storefront, or the desk terms set at office creation).
- `snapshot_confirmation_mode text NOT NULL` (`'instant'`, `'approval'`) — (Should Fix S1)
- `snapshot_payment_policy text NOT NULL` (`'offline'`, `'full_online'`, `'advance_online'`)
- `snapshot_advance_pct integer NULL` (10–90)
- `amount_due_online numeric(12,2) NOT NULL DEFAULT 0.00`
  - Formula for `advance_online`: `ROUND(rental_amount * snapshot_advance_pct / 100.0, 2)`
  - Formula for `full_online`: `rental_amount`
  - Formula for `offline` or `office` source: `0.00`

The Stripe webhook, `record_rental_payment`, and pickup guard **must evaluate the snapshot columns**, never live business settings.

**Storefront Policy Race Protection (Minor M3):**
If business settings change between when the storefront renders and when the customer submits the booking, the submission must pass `expected_payment_policy`. The server action verifies `business.rental_payment_policy = expected_payment_policy`; on mismatch, it rejects the submission with `POLICY_CHANGED_REFRESH`.

**Unapproved Approval Bookings & Premature Payments (Correction 3):**
If a customer somehow attempts to pay a booking in `snapshot_confirmation_mode = 'approval'` while `status = 'pending'` (before the owner confirms it):
`record_rental_payment` detects `v_curr_status = 'pending' AND v_snapshot_conf_mode = 'approval'`.
It **refuses** to apply the payment or transition status:
- Inserts row into `rental_payments` with `applied = false`.
- Does NOT write a credit to `recipient_ledger_entries`.
- Inserts an alert into `payment_reconciliation_failures` (`reason = 'approval_pending_payment_refused'`).
- Returns `was_new = false, applied = false` so no confirmation email is triggered.

---

## 4. Migration 228: Complete DDL & Rollback Listing

### 4.1 Owner Pre-Apply Step
> [!IMPORTANT]
> **Owner Pre-Apply Instruction (Minor M1 & Blocker B7):** Before applying Migration 228/229, the owner must capture and save the live schema definitions from staging using exact `pg_get_functiondef()` and `pg_get_constraintdef()` queries:
> ```sql
> -- 1. Capture function definitions
> SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'create_rental_booking';
> SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'check_rental_booking_block_overlap';
> SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'check_rental_block_booking_overlap';
> SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'reconcile_rental_overdue';
> SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'record_rental_payment';
>
> -- 2. Capture live ledger constraint definition (Blocker B7)
> SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'recipient_ledger_entries_source_type_check';
> ```

### 4.2 Forward Migration (`db/migration_228_rental_payment_infra.sql`)

```sql
BEGIN;

-- ── 1. Columns on businesses ────────────────────────────────────────────────
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS rental_payment_policy text NOT NULL DEFAULT 'offline'
    CHECK (rental_payment_policy IN ('offline', 'full_online', 'advance_online')),
  ADD COLUMN IF NOT EXISTS rental_advance_pct integer NULL
    CHECK (rental_advance_pct IS NULL OR (rental_advance_pct BETWEEN 10 AND 90)),
  ADD COLUMN IF NOT EXISTS rental_payment_link_hours integer NOT NULL DEFAULT 48
    CHECK (rental_payment_link_hours BETWEEN 1 AND 168);

COMMENT ON COLUMN public.businesses.rental_payment_policy IS
  'offline=pay at pickup; full_online=100% via Stripe; advance_online=advance pct online, balance at pickup.';
COMMENT ON COLUMN public.businesses.rental_advance_pct IS
  'Percentage charged online when policy=advance_online. Between 10 and 90.';
COMMENT ON COLUMN public.businesses.rental_payment_link_hours IS
  'Payment window in hours from owner confirmation. Default 48, max 168.';

-- ── 2. Columns on rental_bookings ───────────────────────────────────────────
-- Add nullable first so existing rows do not violate NOT NULL
ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS payment_due_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS customer_locale text NOT NULL DEFAULT 'en'
    CHECK (customer_locale IN ('en', 'fr')),
  ADD COLUMN IF NOT EXISTS snapshot_confirmation_mode text NULL,
  ADD COLUMN IF NOT EXISTS snapshot_payment_policy text NULL,
  ADD COLUMN IF NOT EXISTS snapshot_advance_pct integer NULL
    CHECK (snapshot_advance_pct IS NULL OR (snapshot_advance_pct BETWEEN 10 AND 90)),
  ADD COLUMN IF NOT EXISTS amount_due_online numeric(12,2) NOT NULL DEFAULT 0.00
    CHECK (amount_due_online >= 0),
  ADD COLUMN IF NOT EXISTS expired_at timestamptz NULL;

-- ── 3. Backfills ────────────────────────────────────────────────────────────
-- Backfill instant-mode businesses to full_online to preserve live behavior
UPDATE public.businesses
   SET rental_payment_policy = 'full_online'
 WHERE rental_confirmation_mode = 'instant';

-- Backfill snapshot_confirmation_mode from business or default to instant
UPDATE public.rental_bookings rb
   SET snapshot_confirmation_mode = COALESCE(b.rental_confirmation_mode, 'instant')
  FROM public.businesses b
 WHERE rb.business_id = b.id
   AND rb.snapshot_confirmation_mode IS NULL;

UPDATE public.rental_bookings
   SET snapshot_confirmation_mode = 'instant'
 WHERE snapshot_confirmation_mode IS NULL;

-- Backfill existing bookings snapshot_payment_policy to offline
UPDATE public.rental_bookings
   SET snapshot_payment_policy = 'offline'
 WHERE snapshot_payment_policy IS NULL;

-- Backfill amount_due_online for existing pending online bookings
UPDATE public.rental_bookings rb
   SET snapshot_payment_policy = b.rental_payment_policy,
       amount_due_online = CASE
         WHEN b.rental_payment_policy = 'full_online' THEN rb.rental_amount
         WHEN b.rental_payment_policy = 'advance_online' AND b.rental_advance_pct IS NOT NULL
           THEN ROUND(rb.rental_amount * b.rental_advance_pct / 100.0, 2)
         ELSE 0.00
       END
  FROM public.businesses b
 WHERE rb.business_id = b.id
   AND rb.status = 'pending'
   AND rb.source = 'online';

-- ── 4. Set NOT NULL and CHECK constraints after backfill (Blocker B1) ───────
ALTER TABLE public.rental_bookings
  ALTER COLUMN snapshot_confirmation_mode SET NOT NULL,
  ALTER COLUMN snapshot_payment_policy SET NOT NULL;

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_snapshot_conf_mode;
ALTER TABLE public.rental_bookings
  ADD CONSTRAINT chk_rental_bookings_snapshot_conf_mode
    CHECK (snapshot_confirmation_mode IN ('instant', 'approval'));

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_snapshot_payment_policy;
ALTER TABLE public.rental_bookings
  ADD CONSTRAINT chk_rental_bookings_snapshot_payment_policy
    CHECK (snapshot_payment_policy IN ('offline', 'full_online', 'advance_online'));

-- ── 5. Exact constraint modifications (Idempotent: DROP before ADD) ─────────
-- Update recipient_ledger_entries_source_type_check with rental_booking
ALTER TABLE public.recipient_ledger_entries
  DROP CONSTRAINT IF EXISTS recipient_ledger_entries_source_type_check;

ALTER TABLE public.recipient_ledger_entries
  ADD CONSTRAINT recipient_ledger_entries_source_type_check
  CHECK (source_type IN (
    'donation',
    'ticket_order',
    'product_order',
    'order',
    'payout',
    'manual',
    'reservation_payment',
    'rental_booking'
  ));

-- Update rental_bookings_status_check by exact name only
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_status_check;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_status_check
  CHECK (status IN (
    'pending', 'awaiting_payment', 'confirmed', 'active',
    'completed', 'cancelled', 'expired', 'no_show'
  ));

-- Update rental_bookings_payment_status_check by exact name only
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_payment_status_check;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_payment_status_check
  CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded'));

-- Update GiST exclusion constraint to include awaiting_payment
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS uq_rental_bookings_no_overlap;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT uq_rental_bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    booking_period WITH &&
  )
  WHERE (vehicle_id IS NOT NULL
    AND status IN ('pending', 'awaiting_payment', 'confirmed', 'active'));

-- ── 6. rental_payments table (Should Fix S7, Blocker B2) ────────────────────
CREATE TABLE IF NOT EXISTS public.rental_payments (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id               uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  organizer_id             uuid NOT NULL REFERENCES public.organizers(id) ON DELETE RESTRICT,
  kind                     text NOT NULL CHECK (kind IN ('rental_charge', 'advance', 'balance', 'refund', 'late_fee', 'other')),
  method                   text NOT NULL CHECK (method IN ('stripe', 'cash', 'mobile_money', 'card_offline', 'other')),
  amount                   numeric(12,2) NOT NULL CHECK (amount > 0),
  currency                 text NOT NULL CHECK (currency = lower(currency) AND currency ~ '^[a-z]{3}$'),
  direction                text NOT NULL DEFAULT 'credit' CHECK (direction IN ('credit', 'debit')),
  applied                  boolean NOT NULL DEFAULT true,
  stripe_session_id        text UNIQUE,
  stripe_payment_intent_id text,
  stripe_refund_id         text,
  recorded_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rental_payments_refund_debit CHECK (kind <> 'refund' OR direction = 'debit')
);

CREATE INDEX IF NOT EXISTS idx_rental_payments_booking_id ON public.rental_payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_organizer_id ON public.rental_payments (organizer_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_stripe_pi ON public.rental_payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_payments_stripe_refund_id ON public.rental_payments (stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;

ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rental_payments TO service_role;

-- ── 7. rental_checkout_sessions table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_checkout_sessions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id        uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  kind              text NOT NULL CHECK (kind IN ('full', 'advance')),
  amount            numeric(12,2) NOT NULL CHECK (amount > 0),
  expires_at        timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index guarantees at most ONE open checkout session per booking (Blocker B4)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_checkout_sessions_booking_open
  ON public.rental_checkout_sessions (booking_id)
  WHERE status = 'open';

ALTER TABLE public.rental_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_checkout_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rental_checkout_sessions TO service_role;

-- ── 8. rental_booking_events table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_booking_events (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id   uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN (
                 'status_change',
                 'payment_link_sent',
                 'deadline_extended',
                 'payment_override',
                 'email_sent',
                 'email_failed'
               )),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_booking_events_booking_id ON public.rental_booking_events (booking_id);

ALTER TABLE public.rental_booking_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_booking_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rental_booking_events TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

### 4.3 Rollback Twin (`db/migration_228_rental_payment_infra_rollback.sql`)

```sql
BEGIN;

-- Fail-closed checks (Blocker B7):
-- 1. Refuse rollback if rental_payments rows exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rental_payments LIMIT 1) THEN
    RAISE EXCEPTION 'MIGRATION_228_ROLLBACK_BLOCKED: rental_payments rows exist. Financial ledger data cannot be dropped.';
  END IF;
END;
$$;

-- 2. Refuse rollback if recipient_ledger_entries contains rental_booking entries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.recipient_ledger_entries
     WHERE source_type = 'rental_booking'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_228_ROLLBACK_BLOCKED: recipient_ledger_entries contains rental_booking rows. Payout ledger records cannot be invalidated.';
  END IF;
END;
$$;

-- 3. Refuse rollback if bookings hold awaiting_payment or partially_paid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rental_bookings
     WHERE status = 'awaiting_payment' OR payment_status = 'partially_paid'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_228_ROLLBACK_BLOCKED: bookings exist with status awaiting_payment or payment_status partially_paid. Revert or complete them before restoring historical constraints.';
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.rental_booking_events;
DROP TABLE IF EXISTS public.rental_checkout_sessions;
DROP TABLE IF EXISTS public.rental_payments;

-- Restore GiST exclusion constraint without awaiting_payment
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS uq_rental_bookings_no_overlap;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT uq_rental_bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    booking_period WITH &&
  )
  WHERE (vehicle_id IS NOT NULL
    AND status IN ('pending', 'confirmed', 'active'));

-- Restore payment_status constraint
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_payment_status_check;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid', 'refunded'));

-- Restore status constraint
ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS rental_bookings_status_check;

ALTER TABLE public.rental_bookings
  ADD CONSTRAINT rental_bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired', 'no_show'));

-- Restore recipient_ledger_entries source_type constraint from captured pg_get_constraintdef output
-- (Pre-apply captured staging baseline: CHECK ((source_type = ANY (ARRAY['donation'::text, 'ticket_order'::text, 'product_order'::text, 'order'::text, 'payout'::text, 'manual'::text, 'reservation_payment'::text]))))
ALTER TABLE public.recipient_ledger_entries
  DROP CONSTRAINT IF EXISTS recipient_ledger_entries_source_type_check;

ALTER TABLE public.recipient_ledger_entries
  ADD CONSTRAINT recipient_ledger_entries_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'donation'::text,
    'ticket_order'::text,
    'product_order'::text,
    'order'::text,
    'payout'::text,
    'manual'::text,
    'reservation_payment'::text
  ]));

ALTER TABLE public.rental_bookings
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_snapshot_conf_mode,
  DROP CONSTRAINT IF EXISTS chk_rental_bookings_snapshot_payment_policy,
  DROP COLUMN IF EXISTS payment_due_at,
  DROP COLUMN IF EXISTS customer_locale,
  DROP COLUMN IF EXISTS snapshot_confirmation_mode,
  DROP COLUMN IF EXISTS snapshot_payment_policy,
  DROP COLUMN IF EXISTS snapshot_advance_pct,
  DROP COLUMN IF EXISTS amount_due_online,
  DROP COLUMN IF EXISTS expired_at;

ALTER TABLE public.businesses
  DROP COLUMN IF EXISTS rental_payment_policy,
  DROP COLUMN IF EXISTS rental_advance_pct,
  DROP COLUMN IF EXISTS rental_payment_link_hours;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

---

## 5. Migration 229: Function Rewrites

### 5.1 Drop Old Signatures First

To prevent duplicate function overloads in Postgres:
```sql
-- Drop exact 23-parameter overload from migration 226 before defining 24-parameter version
DROP FUNCTION IF EXISTS public.create_rental_booking(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric,
  uuid, text, uuid, uuid, text, text, text, date, numeric, text, numeric,
  text, timestamptz, text
);

DROP FUNCTION IF EXISTS public.record_rental_payment(
  uuid, uuid, text, text, numeric, text, text, text, text, uuid, text
);
```

### 5.2 Deadlock Prevention Architecture (Should Fix S6)

**Enforced Lock Order:**
Every function modifying rental bookings MUST acquire locks in this exact order:
$$\text{Category Advisory Lock} \longrightarrow \text{Vehicle Advisory Lock (if assigned)} \longrightarrow \text{Booking Row Lock (\texttt{FOR UPDATE})}$$

Inside `record_rental_payment`:
```sql
-- Step 1: Look up category_id & vehicle_id without FOR UPDATE
SELECT category_id, vehicle_id INTO v_category_id, v_vehicle_id
  FROM public.rental_bookings WHERE id = p_booking_id;

-- Step 2: Acquire advisory locks in consistent order
PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
IF v_vehicle_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_vehicle_id::text));
END IF;

-- Step 3: Now acquire row lock FOR UPDATE
SELECT ... FROM public.rental_bookings WHERE id = p_booking_id FOR UPDATE;
```
This guarantees zero AB-BA deadlocks between checkout payments and concurrent booking creation.

---

### 5.3 `create_rental_booking`

```sql
CREATE OR REPLACE FUNCTION public.create_rental_booking(
  p_organizer_id uuid,
  p_business_id uuid,
  p_category_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_snapshot_daily_rate numeric,
  p_rental_amount numeric,
  p_vehicle_id uuid DEFAULT NULL,
  p_source text DEFAULT 'office',
  p_pickup_branch_id uuid DEFAULT NULL,
  p_return_branch_id uuid DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_driver_license_number text DEFAULT NULL,
  p_driver_license_country text DEFAULT NULL,
  p_driver_dob date DEFAULT NULL,
  p_snapshot_weekly_rate numeric DEFAULT NULL,
  p_snapshot_currency text DEFAULT 'USD',
  p_deposit_required_amount numeric DEFAULT 0.00,
  p_notes text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_booking_number text DEFAULT NULL,
  p_customer_locale text DEFAULT 'en'
)
RETURNS public.rental_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requested_period tstzrange;
  v_available_capacity integer;
  v_booking_number text;
  v_new_booking public.rental_bookings;
  v_conf_mode text;
  v_pay_policy text;
  v_adv_pct integer;
  v_initial_status text := 'pending';
  v_amount_due_online numeric(12,2) := 0.00;
  v_expires_at timestamptz := p_expires_at;
BEGIN
  -- 1. Validate duration
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'ends_at must be strictly after starts_at' USING ERRCODE = '22000';
  END IF;

  -- 2. Validate tenant & business hierarchy
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND organizer_id = p_organizer_id
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: business % does not belong to organizer %', p_business_id, p_organizer_id
      USING ERRCODE = 'RB004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_categories
    WHERE id = p_category_id AND business_id = p_business_id AND organizer_id = p_organizer_id
  ) THEN
    RAISE EXCEPTION 'CATEGORY_MISMATCH: category % does not belong to business/organizer', p_category_id
      USING ERRCODE = 'RB005';
  END IF;

  -- 3. Vehicle validation (migration 226 rule: active, not out_of_service or maintenance)
  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE id = p_vehicle_id
        AND category_id = p_category_id
        AND business_id = p_business_id
        AND organizer_id = p_organizer_id
        AND is_active = true
        AND status NOT IN ('out_of_service', 'maintenance')
    ) THEN
      RAISE EXCEPTION 'VEHICLE_INVALID: vehicle % does not belong to category/business or is inactive/out_of_service/maintenance', p_vehicle_id
        USING ERRCODE = 'RB006';
    END IF;
  END IF;

  v_requested_period := tstzrange(p_starts_at, p_ends_at, '[)');

  -- 4. Acquire exclusive advisory locks in strict order: Category, then Vehicle
  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || p_category_id::text));
  IF p_vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || p_vehicle_id::text));
  END IF;

  -- 5. Write-time expiry LIMITED TO THE CATEGORY BEING BOOKED
  -- Skips bookings with an active open checkout session
  UPDATE public.rental_bookings rb
     SET status = 'expired',
         expired_at = now(),
         updated_at = now()
   WHERE rb.category_id = p_category_id
     AND rb.status = 'pending'
     AND rb.expires_at IS NOT NULL
     AND rb.expires_at < now()
     AND NOT EXISTS (
       SELECT 1 FROM public.rental_checkout_sessions cs
        WHERE cs.booking_id = rb.id
          AND cs.status = 'open'
          AND cs.expires_at > now()
     );

  UPDATE public.rental_bookings rb
     SET status = 'expired',
         expired_at = now(),
         updated_at = now()
   WHERE rb.category_id = p_category_id
     AND rb.status = 'awaiting_payment'
     AND rb.payment_due_at IS NOT NULL
     AND rb.payment_due_at < now()
     AND rb.payment_status = 'unpaid'
     AND NOT EXISTS (
       SELECT 1 FROM public.rental_checkout_sessions cs
        WHERE cs.booking_id = rb.id
          AND cs.status = 'open'
          AND cs.expires_at > now()
     );

  -- 6. Maintenance block check for assigned vehicle
  IF p_vehicle_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.rental_blocks b
      WHERE b.vehicle_id = p_vehicle_id
        AND b.block_period && v_requested_period
    ) THEN
      RAISE EXCEPTION 'VEHICLE_MAINTENANCE_BLOCKED: vehicle % has a maintenance block during requested period', p_vehicle_id
        USING ERRCODE = 'RB002';
    END IF;
  END IF;

  -- 7. Category capacity calculation (including awaiting_payment)
  WITH eligible_vehicles AS (
    SELECT v.id
    FROM public.vehicles v
    WHERE v.category_id = p_category_id
      AND v.business_id = p_business_id
      AND v.is_active = true
      AND v.status NOT IN ('out_of_service', 'maintenance')
      AND NOT EXISTS (
        SELECT 1 FROM public.rental_blocks b
        WHERE b.vehicle_id = v.id
          AND b.block_period && v_requested_period
      )
  ),
  conflicting_assigned AS (
    SELECT count(DISTINCT rb.vehicle_id) AS cnt
    FROM public.rental_bookings rb
    WHERE rb.vehicle_id IN (SELECT id FROM eligible_vehicles)
      AND rb.booking_period && v_requested_period
      AND rb.status IN ('pending', 'awaiting_payment', 'confirmed', 'active')
  ),
  conflicting_unassigned AS (
    SELECT count(*) AS cnt
    FROM public.rental_bookings rb
    WHERE rb.category_id = p_category_id
      AND rb.business_id = p_business_id
      AND rb.vehicle_id IS NULL
      AND rb.booking_period && v_requested_period
      AND rb.status IN ('pending', 'awaiting_payment', 'confirmed', 'active')
  )
  SELECT
    (SELECT count(*) FROM eligible_vehicles) -
    (SELECT cnt FROM conflicting_assigned) -
    (SELECT cnt FROM conflicting_unassigned)
  INTO v_available_capacity;

  IF v_available_capacity <= 0 THEN
    RAISE EXCEPTION 'CATEGORY_CAPACITY_EXCEEDED: No available capacity in this category for requested period'
      USING ERRCODE = 'RB001';
  END IF;

  -- 8. Snapshot settings & determine initial status
  SELECT rental_confirmation_mode, rental_payment_policy, rental_advance_pct
    INTO v_conf_mode, v_pay_policy, v_adv_pct
    FROM public.businesses
   WHERE id = p_business_id;

  v_conf_mode := COALESCE(v_conf_mode, 'instant');
  v_pay_policy := COALESCE(v_pay_policy, 'offline');

  IF p_source = 'office' THEN
    -- Real office booking behavior: confirmed immediately with offline snapshot
    v_initial_status := 'confirmed';
    v_conf_mode := 'instant';
    v_pay_policy := 'offline';
    v_adv_pct := NULL;
    v_amount_due_online := 0.00;
    v_expires_at := NULL;
  ELSIF v_conf_mode = 'instant' AND v_pay_policy = 'offline' THEN
    -- Instant + offline confirms immediately
    v_initial_status := 'confirmed';
    v_amount_due_online := 0.00;
    v_expires_at := NULL;
  ELSE
    v_initial_status := 'pending';
    IF v_pay_policy = 'full_online' THEN
      v_amount_due_online := p_rental_amount;
    ELSIF v_pay_policy = 'advance_online' AND v_adv_pct IS NOT NULL THEN
      v_amount_due_online := ROUND(p_rental_amount * v_adv_pct / 100.0, 2);
    ELSE
      v_amount_due_online := 0.00;
    END IF;

    -- Mandatory Defaulting for non-confirmed bookings (Blocker B6)
    IF v_expires_at IS NULL THEN
      IF v_conf_mode = 'instant' THEN
        v_expires_at := now() + interval '35 minutes';
      ELSE
        v_expires_at := now() + interval '24 hours';
      END IF;
    END IF;
  END IF;

  -- 9. Booking number generation
  IF p_booking_number IS NOT NULL AND p_booking_number <> '' THEN
    v_booking_number := p_booking_number;
  ELSE
    v_booking_number := 'RBK-' || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD') || '-' || lpad(nextval('public.rental_booking_number_seq')::text, 4, '0');
  END IF;

  -- 10. Insert booking record (including snapshot_confirmation_mode)
  INSERT INTO public.rental_bookings (
    organizer_id, business_id, category_id, vehicle_id, source, booking_number,
    starts_at, ends_at, expires_at, pickup_branch_id, return_branch_id,
    customer_name, customer_email, customer_phone, customer_locale,
    driver_license_number, driver_license_country, driver_dob,
    status, payment_status, rental_amount, snapshot_daily_rate, snapshot_weekly_rate,
    snapshot_currency, snapshot_confirmation_mode, snapshot_payment_policy, snapshot_advance_pct, amount_due_online,
    deposit_required_amount, notes, created_at, updated_at
  ) VALUES (
    p_organizer_id, p_business_id, p_category_id, p_vehicle_id, p_source, v_booking_number,
    p_starts_at, p_ends_at, v_expires_at, p_pickup_branch_id, p_return_branch_id,
    p_customer_name, p_customer_email, p_customer_phone, COALESCE(p_customer_locale, 'en'),
    p_driver_license_number, p_driver_license_country, p_driver_dob,
    v_initial_status, 'unpaid', p_rental_amount, p_snapshot_daily_rate, p_snapshot_weekly_rate,
    p_snapshot_currency, v_conf_mode, v_pay_policy, v_adv_pct, v_amount_due_online,
    p_deposit_required_amount, p_notes, now(), now()
  )
  RETURNING * INTO v_new_booking;

  RETURN v_new_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_rental_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rental_booking TO service_role;
```

---

### 5.4 `confirm_rental_booking`

```sql
CREATE OR REPLACE FUNCTION public.confirm_rental_booking(
  p_booking_id   uuid,
  p_organizer_id uuid,
  p_actor_id     uuid
)
RETURNS TABLE (
  booking_id     uuid,
  status         text,
  payment_due_at timestamptz,
  payment_policy text,
  amount_due     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.rental_bookings;
  v_link_hours integer;
  v_deadline timestamptz;
  v_new_status text;
BEGIN
  -- 1. Lock category advisory lock then booking row FOR UPDATE
  SELECT * INTO v_booking
    FROM public.rental_bookings
   WHERE id = p_booking_id
     AND organizer_id = p_organizer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not belong to organizer %', p_booking_id, p_organizer_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_booking.category_id::text));
  IF v_booking.vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_booking.vehicle_id::text));
  END IF;

  SELECT * INTO v_booking
    FROM public.rental_bookings
   WHERE id = p_booking_id
     AND organizer_id = p_organizer_id
     FOR UPDATE;

  IF v_booking.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: only pending bookings can be confirmed (current status: %)', v_booking.status;
  END IF;

  -- 2. Read business link hours setting
  SELECT rental_payment_link_hours INTO v_link_hours
    FROM public.businesses
   WHERE id = v_booking.business_id;

  v_link_hours := COALESCE(v_link_hours, 48);

  -- 3. Evaluate confirmation path per snapshot payment policy
  IF v_booking.snapshot_payment_policy = 'offline' THEN
    v_new_status := 'confirmed';
    v_deadline := NULL;
  ELSE
    -- Online payment required: calculate deadline capped at scheduled pickup
    v_deadline := LEAST(now() + (v_link_hours || ' hours')::interval, v_booking.starts_at);

    -- Enforce 30-minute minimum rule
    IF v_deadline - now() < interval '30 minutes' THEN
      RAISE EXCEPTION 'PAYMENT_WINDOW_TOO_SHORT: Scheduled pickup is within 30 minutes. Stripe session cannot be created. Confirm offline or decline.'
        USING ERRCODE = 'RB030';
    END IF;

    v_new_status := 'awaiting_payment';
  END IF;

  -- 4. Update booking record
  UPDATE public.rental_bookings
     SET status = v_new_status,
         payment_due_at = v_deadline,
         updated_at = now()
   WHERE id = p_booking_id;

  -- 5. Record audit event
  INSERT INTO public.rental_booking_events (
    booking_id, organizer_id, event_type, actor_id, payload
  ) VALUES (
    p_booking_id, p_organizer_id, 'status_change', p_actor_id,
    jsonb_build_object(
      'from_status', 'pending',
      'to_status', v_new_status,
      'payment_due_at', v_deadline,
      'snapshot_payment_policy', v_booking.snapshot_payment_policy,
      'amount_due_online', v_booking.amount_due_online
    )
  );

  RETURN QUERY SELECT
    v_booking.id,
    v_new_status,
    v_deadline,
    v_booking.snapshot_payment_policy,
    v_booking.amount_due_online;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_rental_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_rental_booking TO service_role;
```

---

### 5.5 Overlap Trigger Functions

```sql
CREATE OR REPLACE FUNCTION public.check_rental_booking_block_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL AND NEW.status IN ('pending', 'awaiting_payment', 'confirmed', 'active') THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || NEW.category_id::text));
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

    IF EXISTS (
      SELECT 1 FROM public.rental_blocks b
      WHERE b.vehicle_id = NEW.vehicle_id
        AND b.block_period && NEW.booking_period
    ) THEN
      RAISE EXCEPTION 'VEHICLE_MAINTENANCE_BLOCKED: vehicle % has a maintenance block during requested period', NEW.vehicle_id
        USING ERRCODE = 'RB002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.check_rental_block_booking_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
BEGIN
  SELECT category_id INTO v_category_id FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v_category_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

  IF EXISTS (
    SELECT 1 FROM public.rental_bookings rb
    WHERE rb.vehicle_id = NEW.vehicle_id
      AND rb.status IN ('pending', 'awaiting_payment', 'confirmed', 'active')
      AND rb.booking_period && NEW.block_period
  ) THEN
    RAISE EXCEPTION 'VEHICLE_BOOKING_EXISTS: vehicle % already has an active booking during requested block period', NEW.vehicle_id
      USING ERRCODE = 'RB003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_rental_booking_block_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_booking_overlap() FROM PUBLIC, anon, authenticated;
```

---

### 5.6 `record_rental_payment`

```sql
CREATE OR REPLACE FUNCTION public.record_rental_payment(
  p_booking_id               uuid,
  p_organizer_id             uuid,
  p_kind                     text,
  p_method                   text,
  p_amount                   numeric,
  p_currency                 text,
  p_direction                text DEFAULT 'credit',
  p_stripe_session_id        text DEFAULT NULL,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_refund_id         text DEFAULT NULL,
  p_recorded_by              uuid DEFAULT NULL,
  p_notes                    text DEFAULT NULL
) RETURNS TABLE (
  payment_id         uuid,
  new_payment_status text,
  new_booking_status text,
  was_new            boolean,
  applied            boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_id        uuid;
  v_vehicle_id         uuid;
  v_payment_id         uuid;
  v_recipient_id       uuid;
  v_new_payment_status text;
  v_new_booking_status text;
  v_rental_amount      numeric;
  v_net_paid           numeric;
  v_online_paid        numeric;
  v_buyer_email        text;
  v_curr_status        text;
  v_curr_pay_status    text;
  v_amount_due_online  numeric;
  v_snapshot_currency  text;
  v_snapshot_conf_mode text;
  v_is_terminal        boolean;
  v_is_refund          boolean;
  v_already_satisfied  boolean;
  v_applied            boolean := true;
  v_normalized_cur     text := lower(p_currency);
  v_row_count          integer;
BEGIN
  -- 1. Idempotency on stripe_refund_id (Blocker B2)
  IF p_stripe_refund_id IS NOT NULL THEN
    SELECT id INTO v_payment_id
      FROM public.rental_payments
     WHERE stripe_refund_id = p_stripe_refund_id;
    IF FOUND THEN
      SELECT payment_status, status INTO v_new_payment_status, v_new_booking_status
        FROM public.rental_bookings WHERE id = p_booking_id;
      RETURN QUERY SELECT v_payment_id, v_new_payment_status, v_new_booking_status, false, true;
      RETURN;
    END IF;
  END IF;

  -- 2. ENFORCE DEADLOCK-FREE LOCK ORDER: Category Advisory Lock -> Row Lock (Should Fix S6)
  SELECT category_id, vehicle_id INTO v_category_id, v_vehicle_id
    FROM public.rental_bookings
   WHERE id = p_booking_id AND organizer_id = p_organizer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not belong to organizer %', p_booking_id, p_organizer_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
  IF v_vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_vehicle_id::text));
  END IF;

  -- 3. Lock booking row FOR UPDATE
  SELECT rental_amount, payment_status, customer_email, status,
         amount_due_online, snapshot_currency, snapshot_confirmation_mode
    INTO v_rental_amount, v_curr_pay_status, v_buyer_email, v_curr_status,
         v_amount_due_online, v_snapshot_currency, v_snapshot_conf_mode
    FROM public.rental_bookings
   WHERE id = p_booking_id
     AND organizer_id = p_organizer_id
     FOR UPDATE;

  -- 4. Idempotency check on stripe_session_id under row lock
  IF p_stripe_session_id IS NOT NULL THEN
    SELECT id INTO v_payment_id
      FROM public.rental_payments
     WHERE stripe_session_id = p_stripe_session_id;
    IF FOUND THEN
      RETURN QUERY SELECT v_payment_id, v_curr_pay_status, v_curr_status, false, true;
      RETURN;
    END IF;
  END IF;

  -- 5. Currency verification
  IF v_normalized_cur <> lower(v_snapshot_currency) THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH: received %, expected %', p_currency, v_snapshot_currency;
  END IF;

  v_is_refund := (p_kind = 'refund' OR p_direction = 'debit');
  v_is_terminal := v_curr_status IN ('cancelled', 'expired', 'no_show');

  -- 6. Offline Payment Guard (Should Fix S2): Reject terminal or already fully paid
  IF p_method <> 'stripe' AND NOT v_is_refund THEN
    IF v_is_terminal THEN
      RAISE EXCEPTION 'CANNOT_RECORD_PAYMENT_TERMINAL: booking % is %', p_booking_id, v_curr_status;
    END IF;
    IF v_curr_pay_status = 'paid' AND p_kind IN ('rental_charge', 'advance', 'balance') THEN
      RAISE EXCEPTION 'PAYMENT_ALREADY_SATISFIED: booking % is already paid in full', p_booking_id;
    END IF;
  END IF;

  -- 7. Stripe Terminal, Unapproved, or Satisfied Guard (Correction 3)
  -- If in approval mode and still pending, payment is premature and refused
  v_already_satisfied := (
    NOT v_is_refund AND (
      (p_kind IN ('rental_charge', 'advance') AND v_curr_pay_status IN ('paid', 'partially_paid') AND v_curr_status = 'confirmed')
      OR (p_kind = 'balance' AND v_curr_pay_status = 'paid')
      OR (v_curr_status IN ('active', 'completed') AND p_kind IN ('rental_charge', 'advance'))
      OR (v_curr_status = 'pending' AND v_snapshot_conf_mode = 'approval')
    )
  );

  IF (v_is_terminal OR v_already_satisfied) AND NOT v_is_refund THEN
    v_applied := false;

    INSERT INTO public.rental_payments (
      booking_id, organizer_id, kind, method, amount, currency, direction,
      applied, stripe_session_id, stripe_payment_intent_id, stripe_refund_id,
      recorded_by, notes
    ) VALUES (
      p_booking_id, p_organizer_id, p_kind, p_method, p_amount, v_normalized_cur,
      p_direction, false, p_stripe_session_id, p_stripe_payment_intent_id, p_stripe_refund_id,
      p_recorded_by, p_notes
    ) RETURNING id INTO v_payment_id;

    IF p_stripe_session_id IS NOT NULL THEN
      UPDATE public.rental_checkout_sessions
         SET status = 'completed'
       WHERE stripe_session_id = p_stripe_session_id;
    END IF;

    IF p_method = 'stripe' THEN
      INSERT INTO public.payment_reconciliation_failures (
        kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
      ) VALUES (
        'rental_booking',
        p_stripe_payment_intent_id,
        p_amount,
        v_normalized_cur,
        v_buyer_email,
        jsonb_build_object(
          'booking_id', p_booking_id,
          'organizer_id', p_organizer_id,
          'stripe_session_id', p_stripe_session_id,
          'curr_status', v_curr_status,
          'curr_payment_status', v_curr_pay_status,
          'reason', CASE
            WHEN v_is_terminal THEN 'terminal_status'
            WHEN v_curr_status = 'pending' AND v_snapshot_conf_mode = 'approval' THEN 'approval_pending_payment_refused'
            ELSE 'already_satisfied'
          END
        ),
        'Payment received for ' || CASE
          WHEN v_is_terminal THEN 'terminal booking'
          WHEN v_curr_status = 'pending' AND v_snapshot_conf_mode = 'approval' THEN 'unapproved approval booking'
          ELSE 'already satisfied booking'
        END
      );
    END IF;

    -- Refused payment: was_new=false, applied=false (Should Fix S3)
    RETURN QUERY SELECT v_payment_id, v_curr_pay_status, v_curr_status, false, false;
    RETURN;
  END IF;

  -- 8. Record applied payment row
  INSERT INTO public.rental_payments (
    booking_id, organizer_id, kind, method, amount, currency, direction,
    applied, stripe_session_id, stripe_payment_intent_id, stripe_refund_id,
    recorded_by, notes
  ) VALUES (
    p_booking_id, p_organizer_id, p_kind, p_method, p_amount, v_normalized_cur,
    p_direction, true, p_stripe_session_id, p_stripe_payment_intent_id, p_stripe_refund_id,
    p_recorded_by, p_notes
  ) RETURNING id INTO v_payment_id;

  IF p_stripe_session_id IS NOT NULL THEN
    UPDATE public.rental_checkout_sessions
       SET status = 'completed'
     WHERE stripe_session_id = p_stripe_session_id;
  END IF;

  -- 9. Compute net paid and online paid (Blocker B3)
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE direction = 'credit' AND applied = true AND kind IN ('rental_charge', 'advance', 'balance')), 0) -
    COALESCE(SUM(amount) FILTER (WHERE direction = 'debit' AND applied = true AND kind IN ('rental_charge', 'advance', 'balance', 'refund')), 0),
    COALESCE(SUM(amount) FILTER (WHERE direction = 'credit' AND applied = true AND method = 'stripe' AND kind IN ('rental_charge', 'advance', 'balance')), 0)
    INTO v_net_paid, v_online_paid
    FROM public.rental_payments
   WHERE booking_id = p_booking_id;

  v_new_payment_status :=
    CASE
      WHEN v_net_paid >= v_rental_amount THEN 'paid'
      WHEN v_net_paid > 0                THEN 'partially_paid'
      WHEN v_net_paid <= 0 AND EXISTS (
        SELECT 1 FROM public.rental_payments WHERE booking_id = p_booking_id AND direction = 'debit' AND applied = true
      ) THEN 'refunded'
      ELSE 'unpaid'
    END;

  -- 10. Amount Validation & Confirmation Gate (Blocker B3 & Should Fix S1)
  -- A booking confirms ONLY when applied online credits >= amount_due_online
  -- Approval bookings require prior owner approval
  IF p_method = 'stripe' AND p_amount > v_amount_due_online + 0.01 THEN
    -- Overpayment: flag reconciliation alert
    INSERT INTO public.payment_reconciliation_failures (
      kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
    ) VALUES (
      'rental_booking',
      p_stripe_payment_intent_id,
      p_amount,
      v_normalized_cur,
      v_buyer_email,
      jsonb_build_object(
        'booking_id', p_booking_id,
        'organizer_id', p_organizer_id,
        'amount_paid', p_amount,
        'amount_due_online', v_amount_due_online,
        'reason', 'overpayment'
      ),
      'Online payment exceeds amount_due_online'
    );
  END IF;

  v_new_booking_status := v_curr_status;
  IF v_curr_status = 'pending' AND v_snapshot_conf_mode = 'instant' AND v_online_paid >= v_amount_due_online THEN
    v_new_booking_status := 'confirmed';
  ELSIF v_curr_status = 'awaiting_payment' AND v_online_paid >= v_amount_due_online THEN
    v_new_booking_status := 'confirmed';
  END IF;

  UPDATE public.rental_bookings
     SET payment_status = v_new_payment_status,
         status = v_new_booking_status,
         updated_at = now()
   WHERE id = p_booking_id;

  -- 11. Payout ledger credit / refund reversal (Blocker B2 & B5)
  IF p_method = 'stripe' THEN
    v_recipient_id := public.resolve_recipient('organizer', NULL, p_organizer_id, NULL);

    IF v_recipient_id IS NULL THEN
      INSERT INTO public.payment_reconciliation_failures (
        kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
      ) VALUES (
        'rental_booking',
        COALESCE(p_stripe_payment_intent_id, p_stripe_refund_id),
        p_amount,
        v_normalized_cur,
        v_buyer_email,
        jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id, 'stripe_session_id', p_stripe_session_id),
        'Cannot resolve recipient for organizer ' || p_organizer_id::text
      );
    ELSIF v_is_refund THEN
      -- Payout ledger refund reversal (Blocker B2)
      INSERT INTO public.recipient_ledger_entries (
        recipient_id, entry_type, amount, currency, source_type, source_id, external_reference, description
      ) VALUES (
        v_recipient_id, 'refund', -abs(p_amount), v_normalized_cur,
        'rental_booking', p_booking_id, p_stripe_refund_id, 'Rental booking refund processed'
      );
    ELSIF p_direction = 'credit' AND p_kind IN ('rental_charge', 'advance', 'balance') THEN
      -- Payout ledger credit with ON CONFLICT safety (Blocker B5 & Correction 2)
      INSERT INTO public.recipient_ledger_entries (
        recipient_id, entry_type, amount, currency, source_type, source_id, description
      ) VALUES (
        v_recipient_id, 'credit', p_amount, v_normalized_cur,
        'rental_booking', p_booking_id, 'Rental booking payment received'
      )
      ON CONFLICT (source_type, source_id, entry_type)
        WHERE source_id IS NOT NULL AND entry_type <> 'refund'
      DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count = 0 THEN
        INSERT INTO public.payment_reconciliation_failures (
          kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
        ) VALUES (
          'rental_booking',
          p_stripe_payment_intent_id,
          p_amount,
          v_normalized_cur,
          v_buyer_email,
          jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id, 'stripe_session_id', p_stripe_session_id),
          'Duplicate ledger credit prevented by unique index'
        );
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_payment_id, v_new_payment_status, v_new_booking_status, true, true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_rental_payment FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rental_payment TO service_role;
```

---

### 5.7 Atomic Balance & Pickup RPC (Should Fix S4 & Correction 5)

```sql
CREATE OR REPLACE FUNCTION public.record_rental_balance_and_pickup(
  p_booking_id       uuid,
  p_organizer_id     uuid,
  p_method           text,
  p_amount           numeric,
  p_currency         text,
  p_actor_id         uuid,
  p_override_reason  text DEFAULT NULL,
  p_notes            text DEFAULT NULL
) RETURNS TABLE (
  booking_id         uuid,
  payment_id         uuid,
  new_payment_status text,
  new_booking_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
  v_new_pay_status text;
  v_new_book_status text;
  v_booking public.rental_bookings;
  v_audit_entry text;
BEGIN
  -- 1. Call record_rental_payment for the balance
  SELECT payment_id, new_payment_status, new_booking_status
    INTO v_payment_id, v_new_pay_status, v_new_book_status
    FROM public.record_rental_payment(
      p_booking_id, p_organizer_id, 'balance', p_method, p_amount,
      p_currency, 'credit', NULL, NULL, NULL, p_actor_id, p_notes
    );

  -- 2. Lock and validate real pickup guards from lib/rental/pickup-guard.ts (Correction 5)
  SELECT * INTO v_booking FROM public.rental_bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking.vehicle_id IS NULL THEN
    RAISE EXCEPTION 'VEHICLE_NOT_ASSIGNED: A vehicle must be assigned before recording pickup.' USING ERRCODE = 'RB010';
  END IF;

  IF now() < v_booking.starts_at - interval '4 hours' THEN
    IF p_override_reason IS NULL OR length(trim(p_override_reason)) < 5 THEN
      RAISE EXCEPTION 'TOO_EARLY_FOR_PICKUP: Pickup cannot be recorded more than 4 hours before the scheduled start without a written reason (>= 5 chars).'
        USING ERRCODE = 'RB011';
    ELSE
      v_audit_entry := '[Early pickup override ' || now()::text || '] ' || trim(p_override_reason);
      UPDATE public.rental_bookings
         SET notes = CASE WHEN notes IS NOT NULL AND notes <> '' THEN notes || E'\n' || v_audit_entry ELSE v_audit_entry END
       WHERE id = p_booking_id;

      INSERT INTO public.rental_booking_events (
        booking_id, organizer_id, event_type, actor_id, payload
      ) VALUES (
        p_booking_id, p_organizer_id, 'payment_override', p_actor_id,
        jsonb_build_object('type', 'early_pickup', 'reason', trim(p_override_reason))
      );
    END IF;
  END IF;

  -- 3. Transition to active
  UPDATE public.rental_bookings
     SET status = 'active',
         picked_up_at = now(),
         updated_at = now()
   WHERE id = p_booking_id;

  -- 4. Status change audit event
  INSERT INTO public.rental_booking_events (
    booking_id, organizer_id, event_type, actor_id, payload
  ) VALUES (
    p_booking_id, p_organizer_id, 'status_change', p_actor_id,
    jsonb_build_object('from_status', v_new_book_status, 'to_status', 'active', 'picked_up_at', now(), 'balance_paid', p_amount)
  );

  RETURN QUERY SELECT p_booking_id, v_payment_id, v_new_pay_status, 'active'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.record_rental_balance_and_pickup FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rental_balance_and_pickup TO service_role;
```

---

### 5.8 Rollback Twin (`db/migration_229_rental_payment_functions_rollback.sql`)

```sql
BEGIN;

-- Safety check: require operator to confirm captured functions
DO $$
BEGIN
  RAISE EXCEPTION 'MIGRATION_229_ROLLBACK_HALTED: Verify and restore saved function definitions captured pre-apply (via pg_get_functiondef) before proceeding.';
END;
$$;

-- Drop migration 229 signatures and functions
DROP FUNCTION IF EXISTS public.create_rental_booking(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric, numeric,
  uuid, text, uuid, uuid, text, text, text, date, numeric, text, numeric,
  text, timestamptz, text, text
);
DROP FUNCTION IF EXISTS public.confirm_rental_booking(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.record_rental_payment(uuid, uuid, text, text, numeric, text, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.record_rental_balance_and_pickup(uuid, uuid, text, numeric, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.prepare_rental_checkout_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.commit_rental_checkout_session(uuid, text, text, numeric, timestamptz);

-- Restore historical overlap trigger functions from Migration 226
CREATE OR REPLACE FUNCTION public.check_rental_booking_block_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL AND NEW.status IN ('pending', 'confirmed', 'active') THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || NEW.category_id::text));
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

    IF EXISTS (
      SELECT 1 FROM public.rental_blocks b
      WHERE b.vehicle_id = NEW.vehicle_id
        AND b.block_period && NEW.booking_period
    ) THEN
      RAISE EXCEPTION 'VEHICLE_MAINTENANCE_BLOCKED: vehicle % has a maintenance block during requested period', NEW.vehicle_id
        USING ERRCODE = 'RB002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.check_rental_block_booking_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
BEGIN
  SELECT category_id INTO v_category_id FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v_category_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

  IF EXISTS (
    SELECT 1 FROM public.rental_bookings rb
    WHERE rb.vehicle_id = NEW.vehicle_id
      AND rb.status IN ('pending', 'confirmed', 'active')
      AND rb.booking_period && NEW.block_period
  ) THEN
    RAISE EXCEPTION 'VEHICLE_BOOKING_EXISTS: vehicle % already has an active booking during the requested block period', NEW.vehicle_id
      USING ERRCODE = 'RB003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_rental_booking_block_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_booking_overlap() FROM PUBLIC, anon, authenticated;

-- Restore historical create_rental_booking (23 parameters) from Migration 226
CREATE OR REPLACE FUNCTION public.create_rental_booking(
  p_organizer_id uuid, p_business_id uuid, p_category_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_customer_name text, p_customer_email text,
  p_snapshot_daily_rate numeric, p_rental_amount numeric,
  p_vehicle_id uuid DEFAULT NULL, p_source text DEFAULT 'office',
  p_pickup_branch_id uuid DEFAULT NULL, p_return_branch_id uuid DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_driver_license_number text DEFAULT NULL,
  p_driver_license_country text DEFAULT NULL, p_driver_dob date DEFAULT NULL,
  p_snapshot_weekly_rate numeric DEFAULT NULL, p_snapshot_currency text DEFAULT 'USD',
  p_deposit_required_amount numeric DEFAULT 0.00, p_notes text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL, p_booking_number text DEFAULT NULL
)
RETURNS public.rental_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
... (captured migration 226 body) ...
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

---

## 6. Checkout Sessions & Concurrency Architecture

### 6.1 Session Creation RPC Split (Should Fix S5, Blocker B4 & Correction 4)

```sql
-- Step 1: Prepare checkout session (Under lock: verifies payable state, cleans stale sessions, checks reusable session)
CREATE OR REPLACE FUNCTION public.prepare_rental_checkout_session(
  p_booking_id   uuid,
  p_organizer_id uuid
) RETURNS TABLE (
  booking_id          uuid,
  can_create          boolean,
  reusable_session_id text,
  amount_due          numeric,
  currency            text,
  customer_email      text,
  booking_number      text,
  payment_due_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.rental_bookings;
  v_open_session public.rental_checkout_sessions;
  v_is_payable boolean;
BEGIN
  -- Category advisory lock then row lock
  SELECT category_id, vehicle_id INTO v_booking.category_id, v_booking.vehicle_id
    FROM public.rental_bookings WHERE id = p_booking_id AND organizer_id = p_organizer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_booking.category_id::text));
  IF v_booking.vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_booking.vehicle_id::text));
  END IF;

  SELECT * INTO v_booking
    FROM public.rental_bookings
   WHERE id = p_booking_id FOR UPDATE;

  -- Verify booking is payable (Correction 4)
  v_is_payable := (
    v_booking.status IN ('pending', 'awaiting_payment')
    AND (v_booking.status <> 'pending' OR v_booking.snapshot_confirmation_mode = 'instant')
    AND (v_booking.status <> 'pending' OR v_booking.expires_at IS NULL OR v_booking.expires_at > now())
    AND (v_booking.status <> 'awaiting_payment' OR v_booking.payment_due_at IS NULL OR v_booking.payment_due_at > now())
    AND v_booking.amount_due_online > 0
    AND v_booking.payment_status <> 'paid'
  );

  IF NOT v_is_payable THEN
    RETURN QUERY SELECT
      v_booking.id, false, NULL::text,
      v_booking.amount_due_online, v_booking.snapshot_currency,
      v_booking.customer_email, v_booking.booking_number, v_booking.payment_due_at;
    RETURN;
  END IF;

  -- Check existing open session (Blocker B4)
  SELECT * INTO v_open_session
    FROM public.rental_checkout_sessions
   WHERE booking_id = p_booking_id AND status = 'open'
   FOR UPDATE;

  IF FOUND THEN
    IF v_open_session.amount = v_booking.amount_due_online
       AND v_open_session.expires_at > now() + interval '2 minutes' THEN
      -- Reusable open session! Return it directly without creating a new Stripe session
      RETURN QUERY SELECT
        v_booking.id, true, v_open_session.stripe_session_id,
        v_booking.amount_due_online, v_booking.snapshot_currency,
        v_booking.customer_email, v_booking.booking_number, v_booking.payment_due_at;
      RETURN;
    ELSE
      -- Stale or mismatched session: mark expired
      UPDATE public.rental_checkout_sessions
         SET status = 'expired'
       WHERE id = v_open_session.id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_booking.id, true, NULL::text,
    v_booking.amount_due_online, v_booking.snapshot_currency,
    v_booking.customer_email, v_booking.booking_number, v_booking.payment_due_at;
END;
$$;

-- Step 2: Commit checkout session (Called after Stripe session created, verifies payable state)
CREATE OR REPLACE FUNCTION public.commit_rental_checkout_session(
  p_booking_id        uuid,
  p_stripe_session_id text,
  p_kind              text,
  p_amount            numeric,
  p_expires_at        timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_id uuid;
  v_booking public.rental_bookings;
BEGIN
  SELECT * INTO v_booking FROM public.rental_bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking.status NOT IN ('pending', 'awaiting_payment')
     OR (v_booking.status = 'pending' AND v_booking.snapshot_confirmation_mode <> 'instant')
     OR (v_booking.status = 'awaiting_payment' AND v_booking.payment_due_at < now()) THEN
    RAISE EXCEPTION 'BOOKING_NOT_PAYABLE: booking % cannot accept checkout session in status %', p_booking_id, v_booking.status;
  END IF;

  -- Flip any remaining open session to expired before inserting
  UPDATE public.rental_checkout_sessions
     SET status = 'expired'
   WHERE booking_id = p_booking_id AND status = 'open';

  INSERT INTO public.rental_checkout_sessions (
    booking_id, stripe_session_id, kind, amount, expires_at, status
  ) VALUES (
    p_booking_id, p_stripe_session_id, p_kind, p_amount, p_expires_at, 'open'
  ) RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_rental_checkout_session FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_rental_checkout_session TO service_role;

REVOKE ALL ON FUNCTION public.commit_rental_checkout_session FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_rental_checkout_session TO service_role;
```

---

## 7. Cancellation, Refunds, Disputes & Dashboard Webhooks

### 7.1 Stripe Dashboard Refunds & Disputes (Should Fix S8 & Correction 1)

1. **`charge.refunded`:**
   - Webhook resolves booking and passes `p_currency := lower(charge.currency)`.
   - Calls `record_rental_payment(kind='refund', direction='debit', amount=refund_amount, currency=charge.currency, stripe_refund_id=refund.id)`.
   - Writes `entry_type = 'refund'` with negative amount and `external_reference = stripe_refund_id` to `recipient_ledger_entries`.
2. **`charge.dispute.created`:**
   - Webhook records an adjustment hold entry:
     ```sql
     INSERT INTO public.recipient_ledger_entries (
       recipient_id, entry_type, amount, currency, source_type, source_id, external_reference, description
     ) VALUES (
       v_recipient_id, 'adjustment', -abs(dispute_amount), lower(currency),
       'rental_booking', booking_id, dispute_id, 'Chargeback dispute hold'
     );
     ```
   - Flags alert in `payment_reconciliation_failures`.

---

## 8. Transactional Emails & Expired Booking Sweep

### 8.1 Expired Booking Notification Worker (Should Fix S1)

**Who sends the expired email?**
The automated cron job (`/api/cron/rentals/reconcile`):
1. **Criteria for Expired Emails:**
   - `status = 'expired'`
   - `snapshot_confirmation_mode = 'approval'` (Should Fix S1: clean exclusion of storefront instant abandoned checkouts)
   - `expired_at >= now() - interval '48 hours'` (within the last 48 hours)
   - **Batch cap:** Maximum 50 emails dispatched per cron run to respect Resend rate limits.
2. **Deduplication:**
   ```sql
   SELECT b.id, b.customer_email, b.customer_locale, b.booking_number
     FROM public.rental_bookings b
    WHERE b.status = 'expired'
      AND b.snapshot_confirmation_mode = 'approval'
      AND b.expired_at >= now() - interval '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.rental_booking_events e
         WHERE e.booking_id = b.id
           AND e.event_type = 'email_sent'
           AND e.payload->>'template' = 'expired'
      )
    ORDER BY b.expired_at DESC
    LIMIT 50;
   ```
3. Calls `sendRentalBookingEmail(booking, 'expired')` and logs `event_type = 'email_sent'` (or `'email_failed'`) to `rental_booking_events`.

---

## 9. Dashboard Actions & Pickup Guard

### 9.1 General "Record Payment" Action

Available to `owner`, `admin`, and `manager` on the booking detail page (`app/dashboard/org/[id]/rentals/[bookingId]/page.tsx`):
- Action modal for recording offline payments (cash, POS terminal, mobile money, check) for any booking policy.
- Fields: `kind` (`balance`, `rental_charge`, `advance`, `late_fee`, `other`), `method` (`cash`, `mobile_money`, `card_offline`, `other`), `amount`, `notes`.
- Calls server action invoking `record_rental_payment()` with `p_method <> 'stripe'`.
- Multi-installment cash/offline payments accumulate until full `rental_amount` is reached.

### 9.2 "Record Balance and Pick Up" Action (Should Fix S4)

On the booking detail page, when a booking has `snapshot_payment_policy = 'advance_online'` and `payment_status = 'partially_paid'`:
- Displays **"Record balance & pick up"**.
- Opens a dedicated modal pre-filled with the remaining contractual balance:
  $$\text{balance\_due} = \text{rental\_amount} - \text{net\_paid}$$
- Calls atomic SQL RPC `record_rental_balance_and_pickup()` in a single database round-trip.

---

## 10. Abuse Prevention & Currency Constraints

### 10.1 Abuse Protections & Rate Limits

1. **Open-Unpaid Booking Cap (Minor M4):**
   - Scoped to **both the same business and the same customer email**:
     A customer can have at most **2 open/unpaid active bookings** (`status IN ('pending', 'awaiting_payment')`) at the same rental business at any time.
   - *Security Note:* While email caps can be evaded by generating new emails, the IP-level rate limiting (`enforceRateLimit("rentalBooking", req)`) in `lib/rate-limit.ts` is the primary line of defense.
2. **Postgres-Backed Rate Limits (`lib/rate-limit.ts`):**
   - Storefront booking submission: 5 bookings per hour per IP.
   - Public Lookup "Pay Now" session generation: 10 requests per minute per IP.
   - Counters reside in Postgres (`migration_54_rate_limiting.sql`), working reliably across serverless instances and cold starts.

### 10.2 Zero-Decimal Currencies Note (Minor M2)

- Aldriva rentals are currently restricted to standard two-decimal currencies (`USD`, `EUR`, `CAD`, `GBP`). If zero-decimal currencies are introduced, all intake routes must use a currency helper:
  `stripeAmount = isZeroDecimalCurrency(currency) ? pi.amount : pi.amount / 100`.

---

## 11. Staging Verification Scripts (Test Plan)

Target Script: `scripts/test-rental-payments.cjs` (Node child-process, service-role client)
1. **`create_rental_booking` Contract Tests:**
   - Verifies `instant + offline` confirms immediately with `snapshot_payment_policy = 'offline'`.
   - Verifies `source = 'office'` confirms immediately regardless of business settings.
   - Verifies `p_expires_at` defaults to 35m (instant) or 24h (approval) when NULL (B6).
   - Verifies `awaiting_payment` bookings count toward category capacity.
   - Verifies write-time expiry inside `create_rental_booking` only touches the category being booked.
2. **Migration Idempotency & Function Overload Safety (B1):**
   - Executes Migration 228 twice to confirm clean idempotent execution.
   - Asserts exactly **one** function named `create_rental_booking` exists in `pg_proc`.
3. **Payment Idempotency & Deadlock Stress Test (S6, B5):**
   - Calls `record_rental_payment` twice with identical `stripe_session_id`. Verifies second call returns `was_new = false` and writes no duplicate ledger row.
   - Concurrently executes 20 parallel calls of `record_rental_payment`: confirms Category Advisory Lock -> Row Lock prevents deadlocks.
4. **Amount Validation & Overpayment/Underpayment (B3):**
   - Underpayment test: Stripe payment < `amount_due_online` sets `partially_paid`, keeps booking in `awaiting_payment`.
   - Overpayment test: Stripe payment > `amount_due_online` sets `confirmed`, inserts overpayment alert in `payment_reconciliation_failures`.
5. **Refunds on Terminal Bookings & Ledger Reversal (B2):**
   - Cancels a booking, then calls `record_rental_payment(kind='refund', direction='debit')`.
   - Confirms refund is applied, payment status flips to `refunded`, and negative `recipient_ledger_entries` row with `external_reference` is written.
   - Duplicate refund webhook test: asserts duplicate refund returns `was_new = false` via unique index `uq_rental_payments_stripe_refund_id`.
6. **Checkout Session RPC Lifecycle & Session Reuse (B4, S5):**
   - Calls `prepare_rental_checkout_session`, commits session, calls `prepare_rental_checkout_session` again: confirms existing open session URL is reused.
   - Simulates expired session: confirms old session flips to `'expired'`.
7. **Atomic Balance & Pickup RPC (S4):**
   - Calls `record_rental_balance_and_pickup`: confirms balance is paid and vehicle transitions to `active` in one transaction.

---

## 12. Implementation Phases & Testing Sequence

| Phase | Description | Testing & Verification Notes |
|---|---|---|
| **P1: Migration 228 (DDL)** | Tables (`rental_payments`, `rental_checkout_sessions`, `rental_booking_events`), columns, backfills, constraints. | Applied to staging. Verified with database introspection. Run twice to verify idempotency (B1). |
| **P2: Migration 229 (Functions)** | Parameter drop, function rewrites (`create_rental_booking`, `confirm_rental_booking`, triggers, `record_rental_payment`, `prepare_rental_checkout_session`, `commit_rental_checkout_session`, `record_rental_balance_and_pickup`). | Staging script `test-rental-payments.cjs` verifies single function overload and all RPC contracts. |
| **P3: Webhook & Reconciliation** | Update `fulfillRentalBooking` to call `record_rental_payment` and handle reconciliation alerts. | Stripe test-mode webhook test verifies end-to-end receipt. |
| **P4: Customer Pay Link & Lookup Page** | Dynamic Stripe session creation on "Pay Now" click via `prepare`/`commit` RPCs, session expiration, deadline countdown. | **Testing before P5:** Verified using instant-mode bookings (`full_online`) or by seeding a test booking in `awaiting_payment` directly, validating Stripe Checkout redirection prior to building the dashboard UI. |
| **P5: Dashboard Approval UI** | "Confirm" action calls `confirm_rental_booking`, 30-min window validation, "Copy Link" & WhatsApp buttons. | Manual walkthrough of owner approval flow in dashboard. |
| **P6: Balance & Offline Recording** | "Record balance & pick up" modal, general "Record payment" modal, payment pickup guard validation. | Verify balance recording and pickup handover on staging. |
| **P7: Overview Revenue Integration** | Include `rental_payments` credits in dashboard overview revenue totals. | Verify revenue cards display rental income. |

---

## 13. Review Fixes Applied

| ID | Issue Description | Status | Resolution / Evidence |
|---|---|---|---|
| **B1** | Migration 228 idempotency: missing `DROP CONSTRAINT IF EXISTS` | **FIXED** | Added `DROP CONSTRAINT IF EXISTS` before every `ADD CONSTRAINT`, including `chk_rental_bookings_snapshot_payment_policy`. Every statement is safe to run twice. |
| **B2** | Refunds on terminal bookings & ledger reversal | **FIXED** | In `record_rental_payment`, refunds/debits explicitly bypass terminal and satisfied checks. RPC writes negative `recipient_ledger_entries` refund row with `external_reference = stripe_refund_id`. Added unique index on `rental_payments.stripe_refund_id`. |
| **B3** | Online amount validation & under/overpayment | **FIXED** | Added explicit comparison with `amount_due_online`. Underpayment leaves booking unconfirmed with `partially_paid`. Overpayment confirms booking and logs reconciliation alert. |
| **B4** | Stale open checkout sessions & session reuse | **FIXED** | `prepare_rental_checkout_session` flips open rows to `'expired'`, but reuses existing open session if amount matches and not expired. |
| **B5** | Ledger dedup index rollback crash | **FIXED** | Added `ON CONFLICT (source_type, source_id, entry_type) WHERE source_id IS NOT NULL AND entry_type <> 'refund' DO NOTHING` with `GET DIAGNOSTICS ... = ROW_COUNT`. Duplicate credit logs alert in `payment_reconciliation_failures`; `rental_payments` row is never lost. |
| **B6** | Infinite hold for pending bookings | **FIXED** | In `create_rental_booking`, defaulted `v_expires_at` in SQL to `now() + 35m` (instant) or `now() + 24h` (approval) if caller passes `NULL`. |
| **B7** | Migration 228 rollback safety & constraint capture | **FIXED** | Rollback script refuses to run if bookings have `awaiting_payment` or `partially_paid`. Documented pre-apply capture step using `pg_get_constraintdef`. |
| **S1** | `snapshot_confirmation_mode` column | **FIXED** | Added `snapshot_confirmation_mode` to `rental_bookings`. Used in Section 8.1 expired email query and prevents manual payments from auto-confirming unapproved bookings. |
| **S2** | Flawed "already satisfied" and terminal logic | **FIXED** | Offline payments on terminal bookings or when already paid in full raise an exception. Incremental partial offline payments accumulate. Stripe payments on terminal/satisfied bookings insert with `applied = false` and alert reconciliation. |
| **S3** | Explicit `applied` return column in `record_rental_payment` | **FIXED** | Returned `applied` boolean. Returned `was_new = false` when `applied = false`, preventing false webhook confirmation emails. |
| **S4** | Atomic "Record balance & pick up" RPC | **FIXED** | Defined `record_rental_balance_and_pickup` SQL RPC consolidating payment, pickup guard validation, and status update in a single transaction. |
| **S5** | Checkout session creation RPC split | **FIXED** | Split session creation into `prepare_rental_checkout_session` (lock/clean/check reuse) and `commit_rental_checkout_session` (insert open session), keeping Stripe API calls outside the DB lock. |
| **S6** | Deadlock between payment row lock & overlap advisory lock | **FIXED** | Documented and implemented consistent lock order: Category Advisory Lock -> Vehicle Advisory Lock -> Row Lock `FOR UPDATE` in `record_rental_payment`, matching `create_rental_booking`. |
| **S7** | Financial table integrity & indexes | **FIXED** | Changed `ON DELETE CASCADE` to `ON DELETE RESTRICT` on `rental_payments` foreign keys. Added index on `stripe_payment_intent_id`. |
| **S8** | Stripe dashboard refunds & disputes | **FIXED** | Defined webhook handlers and ledger entries for `charge.refunded` (refund reversal) and `charge.dispute.created` (adjustment hold using `entry_type = 'adjustment'`). |
| **M1** | Function backup query correction | **FIXED** | Replaced `pg_dump -t` with explicit `pg_get_functiondef()` queries for all rental functions and triggers. |
| **M2** | Zero-decimal currencies note | **FIXED** | Documented restriction of rentals to two-decimal currencies for now, and specified `isZeroDecimalCurrency` conversion helper requirement. |
| **M3** | Storefront policy race condition | **FIXED** | Documented passing displayed policy and rejecting mismatches with `POLICY_CHANGED_REFRESH`. |
| **M4** | Email vs IP abuse limit note | **FIXED** | Noted that email limits are easily bypassed; Postgres-backed IP rate limit is the hard defense. |
| **M5** | Advisory key collision note | **FIXED** | Documented that `hashtext` collisions on 32-bit integer keys are harmless false contention. |
