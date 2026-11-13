-- migration_222_services_booking_mode_rollback.sql
-- Fail-closed rollback for migration 222.
--
-- Refuses to run if any public.services row uses booking_mode = date_only,
-- since dropping the column would silently discard that owner-entered data.
-- Operators must revert those services to timed first. Uses to_regclass so it
-- does not error if the column was never created.

BEGIN;

DO $$
DECLARE
  v_services_using_date_only integer := 0;
BEGIN
  IF to_regclass('public.services') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'booking_mode'
    ) THEN
      SELECT count(*) INTO v_services_using_date_only
      FROM public.services
      WHERE booking_mode IS DISTINCT FROM 'timed';

      IF v_services_using_date_only > 0 THEN
        RAISE EXCEPTION
          'MIGRATION_222_ROLLBACK_BLOCKED: % services row(s) use booking_mode = date_only. Revert them to timed first.',
          v_services_using_date_only;
      END IF;
    END IF;
  END IF;
END
$$;

ALTER TABLE public.services
  DROP COLUMN IF EXISTS booking_mode;

COMMIT;

NOTIFY pgrst, 'reload schema';
