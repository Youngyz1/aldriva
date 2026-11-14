-- Migration 227: rental storefront settings
-- Part of Slice 3 of the Aldriva Vehicle Rental Engine.
-- Documentation: docs/design/rental/architecture.md §4 (Slice 3)
-- DO NOT apply manually — the user applies migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Add rental storefront settings columns to public.businesses
-- ---------------------------------------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS rental_confirmation_mode text NOT NULL DEFAULT 'approval'
    CHECK (rental_confirmation_mode IN ('approval', 'instant')),
  ADD COLUMN IF NOT EXISTS rental_min_notice_hours integer NOT NULL DEFAULT 2
    CHECK (rental_min_notice_hours >= 0 AND rental_min_notice_hours <= 168),
  ADD COLUMN IF NOT EXISTS rental_billing_boundary text NOT NULL DEFAULT 'rolling_24h'
    CHECK (rental_billing_boundary IN ('rolling_24h', 'calendar_day')),
  ADD COLUMN IF NOT EXISTS rental_require_license_dob boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rental_min_driver_age integer NOT NULL DEFAULT 21
    CHECK (rental_min_driver_age >= 16 AND rental_min_driver_age <= 100),
  ADD COLUMN IF NOT EXISTS rental_deposit_policy text NULL,
  ADD COLUMN IF NOT EXISTS rental_cancellation_policy text NULL,
  ADD COLUMN IF NOT EXISTS rental_terms text NULL;

COMMENT ON COLUMN public.businesses.rental_confirmation_mode IS 'Approval required before confirmation vs instant booking on payment.';
COMMENT ON COLUMN public.businesses.rental_min_notice_hours IS 'Minimum lead time in hours between booking creation and rental pickup.';
COMMENT ON COLUMN public.businesses.rental_billing_boundary IS 'Rolling 24-hour clock from pickup time vs calendar day boundary.';
COMMENT ON COLUMN public.businesses.rental_require_license_dob IS 'Whether driver license number and date of birth are required online.';
COMMENT ON COLUMN public.businesses.rental_min_driver_age IS 'Minimum driver age enforced on online bookings.';
COMMENT ON COLUMN public.businesses.rental_deposit_policy IS 'Storefront text explaining the security deposit collection and return policy.';
COMMENT ON COLUMN public.businesses.rental_cancellation_policy IS 'Storefront cancellation and refund policy text.';
COMMENT ON COLUMN public.businesses.rental_terms IS 'Custom rental agreement terms displayed and agreed to during booking.';

COMMIT;

NOTIFY pgrst, 'reload schema';
