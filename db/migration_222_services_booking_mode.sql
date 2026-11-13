-- migration_222_services_booking_mode.sql
-- Phase: Per-service booking mode (timed / date_only).
--
-- Adds public.services.booking_mode text NOT NULL DEFAULT 'timed'
-- CHECK (booking_mode IN ('timed','date_only')). Additive and idempotent
-- (ADD COLUMN IF NOT EXISTS): existing services keep 'timed', no existing
-- row or query that does not select the column is affected. Does not touch
-- public.reservations or any general-booking table.
--
-- Migration-absent graceful degrade: server actions fall back to the
-- pre-222 column set when this column is absent (same isMissingTableError
-- convention as migration 220's category columns).
--
-- Rollback twin: db/migration_222_services_booking_mode_rollback.sql (fail-closed:
-- refuses to run while any service uses booking_mode = date_only).
-- Mirror: supabase/migrations/20261107000000_migration_222_services_booking_mode.sql (forward only).
--
-- Safe to re-run.

BEGIN;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'timed'
    CHECK (booking_mode IN ('timed', 'date_only'));

COMMENT ON COLUMN public.services.booking_mode IS
  'Booking mode for this service. timed = customers choose an available time slot; date_only = customers choose a date only (no time slots). Default timed.';

COMMIT;

NOTIFY pgrst, 'reload schema';
