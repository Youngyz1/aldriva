# Aldriva Rental Engine — Slice 3 Handoff & Implementation Report

> **Branch:** `feat/rental-overview`  
> **Worktree:** `C:\Users\Youngyz\aldriva-scanner-p0`  
> **Status:** Slice 3 Complete (Ready for Review & Manual Migration)  
> **Date:** 2026-11-09  

---

## 1. Executive Summary

Slice 3 delivers the complete **Public Storefront, Public Data Layer, Database Hardening, Storefront Settings, and Stripe Checkout Flow** for the Aldriva Vehicle Rental Engine.

### Key Invariants & Architectural Guarantees:
- **Zero Direct Public Writes:** Public visitors never write to PostgreSQL tables directly. All submissions flow through server actions using the service role admin client with server-side recomputation, strict input guards, and honeypot/rate limiting.
- **Privacy & PII Containment:** Public pages and API responses never expose vehicle plates, VINs, mileage, internal vehicle IDs, driver license numbers, or dates of birth. Availability counts are capped at 5 for competitor defense.
- **Custodial Deposit Invariant:** Security deposits (`deposit_required_amount`, `deposit_status`) are displayed separately and are **never** added to `rental_amount` or reported as gross revenue.
- **Two Confirmation Modes:**
  - `approval` (default): 24-hour hold (`expires_at`), sends organizer notification, owner reviews and confirms or declines from dashboard.
  - `instant`: 35-minute hold (with 30-minute Stripe session expiration), creates Stripe Checkout session in snapshot currency with rental description, customer pays online, webhook idempotently confirms booking and sets `payment_status = 'paid'`.
- **Hardened Hierarchy & Permissions:** Triggers `trg_rental_bookings_hierarchy` and `trg_rental_blocks_hierarchy` enforce tenant and category integrity at the database layer (SQLSTATE RB004/RB005/RB006). All internal functions revoke execute permissions from `PUBLIC`, `anon`, and `authenticated`.
- **Cron Auto-Reconciliation:** Scheduled job `/api/cron/rentals/reconcile` (registered in `vercel.json` every 15 min) expires abandoned pending holds and reconciles overdue active rentals.

---

## 2. Files Changed & Created

### Database Migrations (Written, NOT Applied)
- `db/migration_226_rental_hardening.sql` — Explicit function grant revokes, hierarchy validation triggers for bookings and blocks, authenticated INSERT policy drops.
- `db/migration_226_rental_hardening_rollback.sql` — Rollback twin dropping triggers and hierarchy functions.
- `supabase/migrations/20261109120000_migration_226_rental_hardening.sql` — Exact Supabase mirror (SHA256 identical).
- `db/migration_227_rental_storefront_settings.sql` — Per-business rental storefront configuration columns on `public.businesses`.
- `db/migration_227_rental_storefront_settings_rollback.sql` — Rollback twin removing storefront settings columns.
- `supabase/migrations/20261109130000_migration_227_rental_storefront_settings.sql` — Exact Supabase mirror (SHA256 identical).

### Server Actions & Backend
- `lib/actions/rental-public.ts` — Public server actions:
  - `listPublicRentalCategories(organizerId, businessId?)`
  - `listPublicRentalBranches(businessId)`
  - `checkCategoryAvailability(params)` (server-side calculation with privacy cap of 5)
  - `getRentalQuote(params)` (recomputes rates, separates deposit)
  - `submitPublicRentalBooking(input)` (honeypot, IP rate-limit, notice check, age check, capacity lock, Stripe session creation)
- `lib/actions/rental-settings.ts` — Owner settings server actions:
  - `getRentalSettings(organizerId, businessId)`
  - `updateRentalSettings(organizerId, businessId, input)`
- `app/api/webhooks/stripe/route.ts` — Added `fulfillRentalBooking` handler for `meta.kind === "rental"`:
  - Idempotent gate checking `payment_status === "paid"`
  - Status transition to `confirmed` on instant mode
  - In-app organizer notification
  - Customer confirmation email dispatch via Resend
- `app/api/cron/rentals/reconcile/route.ts` — Cron endpoint expiring abandoned holds and reconciling overdue rentals.
- `vercel.json` — Registered cron schedule `*/15 * * * *` for `/api/cron/rentals/reconcile`.

### Public Storefront Blocks & Pages
- `components/site/blocks/rental/types.ts` — `StorefrontRentalConfig` interface.
- `components/site/blocks/rental/BookingBarBlock.tsx` — Mobile-first pickup/return date/time selector with branch filters.
- `components/site/blocks/rental/FleetCardsBlock.tsx` — Category cards with photo, transmission, passenger specs, rates, and booking CTA.
- `components/site/blocks/rental/FleetGridBlock.tsx` — Catalog grid with transmission and seat filters.
- `components/site/blocks/rental/BookingFormBlock.tsx` — 3-step public booking form (dates + vehicle → driver details → review & submit/pay).
- `components/site/blocks/BlockRenderer.tsx` — Wired all 4 rental blocks into the template renderer.
- `app/site/[slug]/[[...page]]/page.tsx` — Server data fetcher injecting `rentalConfig` into `BlockRenderer`.
- `app/rentals/lookup/[token]/page.tsx` — Scrubbed public booking confirmation page with `?paid=true` / `?cancelled=true` banner states.

### Owner Dashboard UI
- `components/dashboard/rentals/RentalSettingsClient.tsx` — 3-section settings form (Confirmation rules, driver requirements, policy copy).
- `app/dashboard/org/[id]/rentals/settings/page.tsx` — Server component hosting the rental settings view.
- `app/dashboard/org/[id]/rentals/page.tsx` — Added Settings link button to rentals header.

### Template Registry & Validation
- `lib/website-blocks.ts` — Registered `booking_bar`, `fleet_cards`, `fleet_grid`, `booking_form` in `KNOWN_BLOCK_TYPES`, schemas, and parsers.
- `lib/website-template-v2.ts` — Converted `RENTAL_DRIVELINE` sections from `pendingBlock` to active `block`; removed `legacy: true`.
- `lib/website-template-resolver.ts` — Added block generators for rental blocks.

### Automated Tests
- `lib/__tests__/rental-storefront-booking.test.cjs` — 11 regression tests covering price recomputation, deposit segregation, duration limits, driver age, notice window, availability cap, public data scrubbing, and webhook idempotency.
- `test-files.json` — Registered new test suite.

---

## 3. Migration Review

### Migration 226 (`db/migration_226_rental_hardening.sql`)
**SHA256:** `B92DE8F7349CE1F3C012EBC786EE4FB326BAC5601AE128B7E80D81E970319CFD`  
**Supabase Mirror:** `supabase/migrations/20261109120000_migration_226_rental_hardening.sql` (Identical)

```sql
-- Explicitly revoke execute permissions from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.create_rental_booking(...) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_rental_overdue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_booking_block_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_booking_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_rental_updated_at() FROM PUBLIC, anon, authenticated;

-- Ensure get_public_rental_booking is accessible to anon/authenticated for public lookup
GRANT EXECUTE ON FUNCTION public.get_public_rental_booking(uuid) TO anon, authenticated, service_role;

-- Grant internal execution to service_role only
GRANT EXECUTE ON FUNCTION public.create_rental_booking(...) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_rental_overdue() TO service_role;

-- Cross-table hierarchy trigger on rental_bookings
CREATE OR REPLACE FUNCTION public.check_rental_booking_hierarchy() ...
-- Cross-table hierarchy trigger on rental_blocks
CREATE OR REPLACE FUNCTION public.check_rental_block_hierarchy() ...

-- Drop authenticated INSERT policies (all writes use createSupabaseAdmin())
DROP POLICY IF EXISTS rental_bookings_staff_insert ON public.rental_bookings;
DROP POLICY IF EXISTS rental_blocks_staff_insert ON public.rental_blocks;
```

### Migration 227 (`db/migration_227_rental_storefront_settings.sql`)
**SHA256:** `A3CEF855CC9809821720A95F975712DBD3DA26839CAF95839637230D1C9CB241`  
**Supabase Mirror:** `supabase/migrations/20261109130000_migration_227_rental_storefront_settings.sql` (Identical)

Adds 8 configuration columns to `public.businesses`:
- `rental_confirmation_mode` text DEFAULT 'approval' CHECK IN ('approval', 'instant')
- `rental_min_notice_hours` integer DEFAULT 2 CHECK (0 <= val <= 168)
- `rental_billing_boundary` text DEFAULT 'rolling_24h' CHECK IN ('rolling_24h', 'calendar_day')
- `rental_require_license_dob` boolean DEFAULT true
- `rental_min_driver_age` integer DEFAULT 21 CHECK (16 <= val <= 100)
- `rental_deposit_policy` text NULL
- `rental_cancellation_policy` text NULL
- `rental_terms` text NULL

---

## 4. Stripe Webhook Implementation

In `app/api/webhooks/stripe/route.ts`:
- Handled when `session.metadata.kind === "rental"` in `checkout.session.completed` (and fallback in `payment_intent.succeeded`).
- **Idempotency Gate:** Checks if `rental_bookings.payment_status === 'paid'`. If already paid, silently exits without duplicate side-effects.
- **Status Updates:** Sets `payment_status = 'paid'`, `updated_at = now()`. If `confirmation_mode === 'instant'`, sets `status = 'confirmed'`.
- **Organizer In-App Alert:** Queries `organizers.user_id` and dispatches `createNotification` with deep-link `/dashboard/org/[id]/rentals/[bookingId]`.
- **Customer Confirmation Email:** If `RESEND_API_KEY` is present, sends branded confirmation email to `customer_email` detailing booking number, schedule, amount paid, and reminder to bring license + deposit card.

---

## 5. Manual Testing Matrix (Mobile & Desktop)

Test viewports: **360px** (small mobile), **390px** (iPhone 14/15), **430px** (Pro Max), **1280px** (Desktop).

### Scenario A: Storefront Settings Configuration
1. Navigate to `/dashboard/org/[id]/rentals/settings`.
2. Toggle confirmation mode between **Host Approval** and **Instant Confirmation**.
3. Adjust minimum notice (e.g. 4 hours) and driver age (e.g. 25).
4. Save settings and verify toast confirmation and persistent database reload.

### Scenario B: Public Approval-Mode Booking
1. Open public website `/site/[slug]`.
2. Select pickup date/time and vehicle category.
3. Complete Step 2 with customer name, phone, email, license number, and DOB.
4. Review quote on Step 3: verify deposit is presented separately from rental total.
5. Click **Submit Reservation Request**:
   - Redirects to `/rentals/lookup/[token]`.
   - Displays "Pending Confirmation" amber badge.
   - PII guarantee check: confirm no plates, VINs, or license numbers appear in the DOM.
6. Verify organizer receives in-app notification in `/dashboard/org/[id]/rentals`.
7. As owner, click Confirm on the booking detail page to transition to `confirmed`.

### Scenario C: Public Instant-Mode Booking (Stripe)
1. Ensure business setting `rental_confirmation_mode` is set to `instant`.
2. Complete booking form on storefront and click **Proceed to Payment**.
3. Verifies redirect to Stripe Checkout with product name `Rental: [Category]` and rental period description.
4. On Stripe return:
   - Success redirect to `/rentals/lookup/[token]?paid=true`: green payment confirmed banner displayed.
   - Cancel redirect to `/rentals/lookup/[token]?cancelled=true`: amber incomplete hold notice displayed.

---

## 6. Security & Isolation Verification

| Threat / Test Case | Guard | Verification |
|---|---|---|
| Tenant crossover in booking submission | Trigger `check_rental_booking_hierarchy` | Raises `RB004`/`RB005`/`RB006` |
| Overbooking category capacity | Function advisory lock `pg_advisory_xact_lock` | Raises `RB001` (409 Conflict) |
| Maintenance period conflict | Bi-directional triggers | Raises `RB002` (409 Conflict) |
| Direct client database insert | Dropped authenticated `INSERT` policy | REST inserts rejected; service-role only |
| Tampered client pricing | Pure server recomputation | Client total ignored; computed from DB rates |
| Scraped fleet size | `checkCategoryAvailability` | Count capped at 5 max |
| Competitor PII scraping | `get_public_rental_booking` RPC | Excludes plates, VINs, license, DOB |
| Webhook replay attack | `booking.payment_status === 'paid'` gate | Exits immediately without re-processing |

---

## 7. Migration Checklist for Owner

1. Review and apply `db/migration_226_rental_hardening.sql`.
2. Review and apply `db/migration_227_rental_storefront_settings.sql`.
3. Verify cron endpoint `/api/cron/rentals/reconcile` in Vercel project settings.
