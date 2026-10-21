-- Rollback for migration 187: read-only cook performance report.
-- Owner applies this SQL manually. This file does not connect to a database.

BEGIN;

DROP FUNCTION IF EXISTS public.get_business_cook_performance(
  uuid,
  uuid,
  timestamptz,
  timestamptz
);

NOTIFY pgrst, 'reload schema';
COMMIT;
