-- migration_224_rental_fleet_schema_rollback.sql
-- Fail-closed rollback for migration 224 (Fleet Inventory & Management Core).
--
-- Refuses to run if any public.vehicles or public.vehicle_categories row exists,
-- preventing silent data loss of tenant fleet assets or configured rate plans.
-- Operators must clear or migrate that data first. Uses to_regclass so it does
-- not error if the tables were never created.

BEGIN;

DO $$
DECLARE
  v_vehicle_count integer := 0;
  v_category_count integer := 0;
BEGIN
  IF to_regclass('public.vehicles') IS NOT NULL THEN
    SELECT count(*) INTO v_vehicle_count FROM public.vehicles;
    IF v_vehicle_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_224_ROLLBACK_BLOCKED: % vehicles row(s) exist. Delete or migrate them first.',
        v_vehicle_count;
    END IF;
  END IF;

  IF to_regclass('public.vehicle_categories') IS NOT NULL THEN
    SELECT count(*) INTO v_category_count FROM public.vehicle_categories;
    IF v_category_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_224_ROLLBACK_BLOCKED: % vehicle_categories row(s) exist. Delete or migrate them first.',
        v_category_count;
    END IF;
  END IF;
END
$$;

DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.vehicle_categories CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
