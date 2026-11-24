-- migration_232_vehicle_photo.sql
-- Adds an optional per-vehicle photo, independent of the vehicle_categories
-- photo already added by migration_224. Until this is applied, the Fleet
-- card grid falls back to the vehicle's category photo
-- (components/dashboard/fleet/FleetDirectoryClient.tsx), which already
-- exists and is already uploadable via CategoryFormDialog.tsx. No code in
-- this change set selects or writes vehicles.photo_url yet — this file is
-- authored only, NOT applied; apply it before wiring the vehicle form's
-- own upload control and switching the card to prefer this column.

BEGIN;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS photo_url text
    CHECK (photo_url IS NULL OR char_length(photo_url) <= 2048);

COMMENT ON COLUMN public.vehicles.photo_url IS 'Optional per-vehicle representative photo URL (Supabase Storage, cms-media bucket). Falls back to vehicle_categories.photo_url when null.';

COMMIT;

NOTIFY pgrst, 'reload schema';

