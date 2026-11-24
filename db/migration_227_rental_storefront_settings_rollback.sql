-- Rollback for Migration 227: rental storefront settings
-- DO NOT apply manually — the user applies rollbacks.
--
-- WARNING: This rollback permanently destroys owner-entered rental storefront
-- settings (deposit policy, cancellation policy, rental terms, confirmation
-- mode, billing boundary, notice hours, driver age, licence/DOB requirement).
-- The DO block below counts affected businesses and emits a WARNING for each
-- one so the DBA can verify before proceeding.  Run in a transaction and
-- ROLLBACK if you need to export the data first.

BEGIN;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.businesses
  WHERE rental_deposit_policy IS NOT NULL
     OR rental_cancellation_policy IS NOT NULL
     OR rental_terms IS NOT NULL
     OR rental_confirmation_mode IS DISTINCT FROM 'approval'
     OR rental_min_notice_hours IS DISTINCT FROM 2
     OR rental_billing_boundary IS DISTINCT FROM 'rolling_24h'
     OR rental_min_driver_age IS DISTINCT FROM 21
     OR rental_require_license_dob = false;

  IF v_count > 0 THEN
    RAISE WARNING
      'migration_227 rollback: % business(es) have non-default rental storefront settings that will be '
      'permanently lost when the columns are dropped. '
      'Export data before proceeding (e.g. SELECT id, rental_deposit_policy, rental_cancellation_policy, '
      'rental_terms, rental_confirmation_mode, rental_min_notice_hours, rental_billing_boundary, '
      'rental_min_driver_age, rental_require_license_dob FROM public.businesses '
      'WHERE rental_deposit_policy IS NOT NULL OR rental_cancellation_policy IS NOT NULL '
      'OR rental_terms IS NOT NULL OR rental_confirmation_mode IS DISTINCT FROM ''approval'' '
      'OR rental_min_notice_hours IS DISTINCT FROM 2 OR rental_billing_boundary IS DISTINCT FROM ''rolling_24h'' '
      'OR rental_min_driver_age IS DISTINCT FROM 21 OR rental_require_license_dob = false).',
      v_count;
  ELSE
    RAISE NOTICE 'migration_227 rollback: no businesses have non-default rental settings; safe to drop columns.';
  END IF;
END;
$$;

ALTER TABLE public.businesses
  DROP COLUMN IF EXISTS rental_confirmation_mode,
  DROP COLUMN IF EXISTS rental_min_notice_hours,
  DROP COLUMN IF EXISTS rental_billing_boundary,
  DROP COLUMN IF EXISTS rental_require_license_dob,
  DROP COLUMN IF EXISTS rental_min_driver_age,
  DROP COLUMN IF EXISTS rental_deposit_policy,
  DROP COLUMN IF EXISTS rental_cancellation_policy,
  DROP COLUMN IF EXISTS rental_terms;

COMMIT;

NOTIFY pgrst, 'reload schema';
