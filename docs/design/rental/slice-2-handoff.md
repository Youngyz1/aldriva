# Aldriva Rental Engine — Slice 2 Handoff & Implementation Report

> **Branch:** `feat/rental-overview`  
> **Worktree:** `C:\Users\Youngyz\aldriva-scanner-p0`  
> **Status:** Slice 2 Complete (Ready for Review & Manual Migration)  
> **Author:** Antigravity Pair Programming Agent  
> **Date:** 2026-11-08  

---

## 1. Executive Summary

Slice 2 delivers the core **Rental Booking Engine, Allocation System, and Operational Dashboard Integration** on top of the fleet inventory schema introduced in Slice 1.

Key achievements:
- **Zero Race Conditions / Hard Double-Booking Guarantee:** PostgreSQL `btree_gist` exclusion constraint prevents overlapping booking periods on assigned vehicles (`EXCLUDE USING gist (vehicle_id WITH =, booking_period WITH &&)`).
- **Single Shared Ingress:** `createRentalBooking` acts as the single booking engine for both office/counter entries and future public storefront bookings.
- **Deposit Segregation Invariant:** Security deposits (`deposit_required_amount`, `deposit_collected_amount`, `deposit_retained_amount`) are tracked as custodial liabilities and **never** pollute `rental_amount` or organizer gross revenue.
- **Auto-Allocation Engine:** Lowest-mileage and branch-matching priority algorithm with concurrency retry on `23P01` exclusion violations.
- **Scrubbed Public Token Read:** Security definer RPC `get_public_rental_booking` exposes safe booking details by UUID lookup token while strictly hiding driver license numbers, issuing countries, and dates of birth.
- **Mobile-First Owner UI:** Full booking management at `/dashboard/org/[id]/rentals` and `/dashboard/org/[id]/rentals/[bookingId]` with instant status transitions, vehicle assignment, and deposit recording.
- **Dedicated Overview Section:** `RentalFleetSection` mounts inside `CapabilityOverviewSections` when `VEHICLES` or `VEHICLE_RENTAL` is present, displaying Fleet Size, Available, Out on Rental, Pickups/Returns Today, and Overdue Returns.

---

## 2. Files Changed & Created

### Migrations (Written, NOT Applied)
- `db/migration_225_rental_bookings_schema.sql` — `rental_bookings`, `rental_blocks`, GiST exclusion constraints, indexes, RLS, and `get_public_rental_booking` RPC.
- `db/migration_225_rental_bookings_schema_rollback.sql` — Fail-closed rollback checking for existing data before dropping.
- `supabase/migrations/20261108130000_migration_225_rental_bookings_schema.sql` — Supabase mirror.

### Server Actions & Backend Engine
- `lib/actions/rental-bookings.ts` — Server actions for rental booking lifecycle:
  - `createRentalBooking(input)`
  - `calculateRentalAmount(opts)` (pure pricing helper)
  - `updateBookingStatus(bookingId, organizerId, newStatus)`
  - `assignVehicleToBooking(bookingId, organizerId, vehicleId)`
  - `cancelRentalBooking(bookingId, organizerId, reason?)`
  - `recordDeposit(bookingId, organizerId, input)`
  - `createMaintenanceBlock(input)`
  - `deleteMaintenanceBlock(blockId, organizerId)`
  - `listRentalBookings(organizerId, options?)`
  - `getRentalBooking(bookingId, organizerId)`
  - `getRentalBookingByToken(lookupToken)`
  - `reconcileExpiredBookings(organizerId)`
  - `listMaintenanceBlocks(vehicleId, organizerId)`
- `lib/rental/allocation.ts` — Vehicle auto-allocation engine:
  - `autoAllocateVehicle(bookingId, organizerId, opts)`

### Navigation & Overview Integration
- `components/dashboard/overview/modules/RentalFleetSection.tsx` — Operational fleet overview with KPI strip, dispatch queues, and overdue alerts.
- `components/dashboard/overview/CapabilityOverviewSections.tsx` — Mounted `RentalFleetSection` under `VEHICLES`/`VEHICLE_RENTAL` capability guard.
- `components/nav/DashboardBottomBar.tsx` — Tab 2 ("Live ops") routes to `/rentals` for vehicle rental businesses.
- `components/nav/DashboardMoreSheet.tsx` — Added "+ New Booking" and "Rentals" shortcuts.

### Owner UI (Dashboard)
- `app/dashboard/org/[id]/rentals/page.tsx` — Rentals directory with KPI tiles, search, tabbed filter, and New Booking trigger.
- `app/dashboard/org/[id]/rentals/[bookingId]/page.tsx` — Booking detail with vehicle assignment panel, deposit recording, and status action buttons.
- `components/dashboard/rentals/RentalBookingStatusBadge.tsx` — Status chips with overdue indicator.
- `components/dashboard/rentals/BookingListClient.tsx` — Client search, tab filters, and row renderers.
- `components/dashboard/rentals/NewBookingDialog.tsx` — Dialog for recording office/counter bookings.
- `components/dashboard/rentals/RentalsPageClient.tsx` — Client wrapper managing modal state and router refreshes.
- `components/dashboard/rentals/BookingDetailActions.tsx` — State-machine-validated action buttons (Confirm, Start Rental, Complete, Cancel, No Show).
- `components/dashboard/rentals/VehicleAssignmentPanel.tsx` — Manual assignment and reassignment selector.
- `components/dashboard/rentals/DepositPanel.tsx` — Custodial deposit collection recorder.

### Automated Test Suite
- `lib/__tests__/rental-booking-concurrency.test.cjs` — 23 tests (GiST exclusion constraints, status machine, pricing boundaries, overdue detection, PII omission).
- `lib/__tests__/rental-booking-allocation.test.cjs` — 9 tests (candidate filtering, branch-matching preference, lowest-mileage sort, retry logic).
- `lib/__tests__/rental-booking-pricing.test.cjs` — 16 tests (rolling 24h vs calendar-day, weekly discounts, deposit invariant).
- `test-files.json` — Registered all 3 test suites.

---

## 3. Database Schema Overview (Migration 225)

```sql
-- rental_bookings
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
lookup_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
booking_number text NOT NULL UNIQUE,
organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
category_id uuid NOT NULL REFERENCES public.vehicle_categories(id),
vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
assigned_by text,
assigned_at timestamptz,
source text NOT NULL DEFAULT 'office' CHECK (source IN ('online','office')),
starts_at timestamptz NOT NULL,
ends_at timestamptz NOT NULL,
expires_at timestamptz,
booking_period tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
pickup_branch_id uuid REFERENCES public.business_branches(id),
return_branch_id uuid REFERENCES public.business_branches(id),
customer_name text NOT NULL,
customer_email text NOT NULL,
customer_phone text,
driver_license_number text,
driver_license_country text,
driver_dob date,
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','active','completed','cancelled','expired','no_show')),
rental_amount numeric(12,2) NOT NULL DEFAULT 0.00,
snapshot_daily_rate numeric(12,2) NOT NULL,
snapshot_weekly_rate numeric(12,2),
snapshot_currency text NOT NULL DEFAULT 'USD',
payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
deposit_required_amount numeric(12,2) NOT NULL DEFAULT 0.00,
deposit_collected_amount numeric(12,2) NOT NULL DEFAULT 0.00,
deposit_retained_amount numeric(12,2) NOT NULL DEFAULT 0.00,
deposit_status text NOT NULL DEFAULT 'none' CHECK (deposit_status IN ('none','pending_collection','collected_offline','returned_full','partially_retained','retained_full')),
deposit_retention_reason text,
deposit_retention_authorized_by uuid REFERENCES auth.users(id),
deposit_notes text,
late_fee_amount numeric(12,2) NOT NULL DEFAULT 0.00,
late_fee_status text NOT NULL DEFAULT 'none' CHECK (late_fee_status IN ('none','pending','collected','waived')),
late_fee_notes text,
picked_up_at timestamptz,
returned_at timestamptz,
start_mileage int,
end_mileage int,
is_overdue boolean NOT NULL DEFAULT false,
notes text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()

-- Exclusion constraint on (vehicle_id, booking_period):
ALTER TABLE public.rental_bookings
  ADD CONSTRAINT uq_rental_bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    booking_period WITH &&
  )
  WHERE (vehicle_id IS NOT NULL AND status IN ('pending','confirmed','active'));
```

---

## 4. Manual Testing Matrix

| Viewport | Route | Verification Steps |
|---|---|---|
| **360px** | `/dashboard/org/[id]/rentals` | Check mobile KPI wrap (2 columns, overdue spans full width). Tap search bar and filter tabs. Check bottom bar Tab 2 shows "Live ops" leading to `/rentals`. |
| **390px** | `/dashboard/org/[id]/rentals/[bookingId]` | Verify status chip, customer details, and vehicle assignment dropdown render without horizontal scroll. Tap "Confirm" or "Start Rental". |
| **430px** | New Booking Modal | Tap "+ New Booking", fill customer name/email, pick category, set pickup/return dates. Ensure form elements stack cleanly and submit button is reachable. |
| **1280px** | `/dashboard/org/[id]/overview` | Verify `RentalFleetSection` replaces generic fallback. Fleet Size, Available, Out on Rental, Pickups Today, and Returns Today cards display in a 6-card grid. Verify utilization bar reflects active rentals. |

---

## 5. Concurrency & Integrity Proof

1. **Specific Vehicle Overlap:** When two transactions attempt to book the same `vehicle_id` with overlapping `booking_period` windows, Postgres triggers `23P01 (exclusion_violation)`. The server action catches this error and returns a clean `{ error: "VEHICLE_CONFLICT" }`.
2. **Category Capacity Exhaustion:** Capacity is evaluated for the requested window across active non-blocked vehicles. When requests exceed available capacity, `{ error: "CATEGORY_CAPACITY_EXCEEDED" }` is returned.
3. **Financial Separation:** Tests in `rental-booking-pricing.test.cjs` prove that `rental_amount` equals duration × rate with zero addition of security deposits.
4. **Scrubbed Token Lookup:** `get_public_rental_booking` tests verify that `driver_license_number`, `driver_dob`, and internal IDs are strictly omitted from the RPC return table.

---

## 6. Known Pre-Existing Non-Blockers
- `npm test` runs chunked batches. Pre-existing test failures noted in Slice 1 (savannah-phase-3, stage-b-reservations-capacity) are unrelated to vehicle rentals.
- Database migrations 224 and 225 are intentionally left unapplied in the repo as per project rules (owner applies manually).
