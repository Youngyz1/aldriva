-- migration_232_vehicle_photo_rollback.sql
-- Reverses migration_232_vehicle_photo.sql. Fail-closed: only drops the
-- column if it exists, so this is safe to run even if the forward
-- migration was never applied.

BEGIN;

ALTER TABLE public.vehicles
  DROP COLUMN IF EXISTS photo_url;

COMMIT;

NOTIFY pgrst, 'reload schema';

