-- db/migration_15_profile_privacy_settings.sql
-- Adds privacy_settings jsonb column to public.profiles.
-- Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Ensure no null values exist
UPDATE public.profiles
SET privacy_settings = '{}'::jsonb
WHERE privacy_settings IS NULL;

-- Notify PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
