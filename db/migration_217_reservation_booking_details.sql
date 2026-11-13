-- migration_217_reservation_booking_details.sql
-- Stage: Extend reservations with booking_details JSONB for non-table booking types.
--
-- Adds:
--   public.reservations.booking_details jsonb NOT NULL DEFAULT '{}'::jsonb
--     Keys: service_type, alt_starts_at, terms_accepted_at, marketing_opt_in
--
-- Convention: forward migration here; rollback twin in _rollback file.
-- Independent of migration 216; only needs the public.reservations table; no index.

BEGIN;

-- ── 1. Verify the reservations table exists ─────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.reservations') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_217_PREREQ_MISSING: public.reservations table is required.';
  END IF;
END $$;

-- ── 2. booking_details column ───────────────────────────────────────────────

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS booking_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.reservations.booking_details IS
  'booking_details stores non-table booking request data. Keys: service_type (text), alt_starts_at (timestamptz ISO), terms_accepted_at (timestamptz ISO), marketing_opt_in (boolean).';

COMMIT;

NOTIFY pgrst, 'reload schema';
