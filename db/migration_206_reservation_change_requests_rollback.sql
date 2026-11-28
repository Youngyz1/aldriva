-- migration_206_reservation_change_requests_rollback.sql
-- Fail-closed rollback for migration 206.
--
-- SAFETY: Raises an exception (and rolls back) if any change request rows exist.
-- Operators must drain/archive data before running this rollback.
-- Uses to_regclass so it does not error if the table was never created.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.reservation_change_requests') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.reservation_change_requests LIMIT 1) THEN
      RAISE EXCEPTION
        'Rollback aborted: reservation_change_requests table has data. '
        'Delete or archive all rows before rolling back migration 206.';
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.approve_reservation_change_with_capacity(uuid, uuid, uuid, text);

DROP INDEX IF EXISTS public.reservation_change_requests_organizer_status_created;
DROP INDEX IF EXISTS public.reservation_change_requests_one_pending;

DROP TABLE IF EXISTS public.reservation_change_requests;

COMMIT;
