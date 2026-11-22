-- migration_217_reservation_booking_details_rollback.sql
-- Fail-closed rollback for migration 217.
--
-- SAFETY: Drops the booking_details column (and its index, if one exists from
-- an earlier draft) from public.reservations.
-- Operators should archive any booking_details data before running this rollback.
-- Uses IF EXISTS so it does not error if the column/index was never added.

BEGIN;

DROP INDEX IF EXISTS idx_reservations_booking_details_gin;

ALTER TABLE public.reservations
  DROP COLUMN IF EXISTS booking_details;

COMMIT;

NOTIFY pgrst, 'reload schema';
