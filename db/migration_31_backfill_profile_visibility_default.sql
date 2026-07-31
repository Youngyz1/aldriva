-- migration_31_backfill_profile_visibility_default.sql
-- Make the product default explicit for existing profile privacy settings.

UPDATE profiles
SET privacy_settings = jsonb_set(
  COALESCE(privacy_settings, '{}'::jsonb),
  '{profile_visibility}',
  '"public"'::jsonb,
  true
)
WHERE privacy_settings->>'profile_visibility' IS NULL
   OR btrim(privacy_settings->>'profile_visibility') = '';

CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  display_name,
  COALESCE(avatar_url, profile_photo) AS avatar_url
FROM profiles
WHERE status = 'active'
  AND COALESCE(NULLIF(btrim(privacy_settings->>'profile_visibility'), ''), 'public') = 'public';

GRANT SELECT ON public_profiles TO anon;
GRANT SELECT ON public_profiles TO authenticated;
GRANT SELECT ON public_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
