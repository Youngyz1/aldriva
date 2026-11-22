-- migration_223_overview_rollups_rollback.sql
-- Rollback twin for migration_223_overview_rollups.sql.

BEGIN;

DROP FUNCTION IF EXISTS public.overview_activity_feed(uuid, int);
DROP FUNCTION IF EXISTS public.overview_catalog_counts(uuid);
DROP FUNCTION IF EXISTS public.overview_donations_rollup(uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.overview_events_rollup(uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.overview_bookings_rollup(uuid, uuid, timestamptz, timestamptz, text[], text);
DROP FUNCTION IF EXISTS public.overview_sales_rollup(uuid, uuid, timestamptz, timestamptz, text);

COMMIT;
