-- migration_30_public_profiles_and_donor_user_ids.sql
-- Add first-party user links for donation/comment attribution without exposing full profiles.

ALTER TABLE donations
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE comments
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_donations_user_id
  ON donations(user_id);

CREATE INDEX IF NOT EXISTS idx_comments_user_id
  ON comments(user_id);

CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  display_name,
  COALESCE(avatar_url, profile_photo) AS avatar_url
FROM profiles
WHERE status = 'active'
  AND COALESCE(privacy_settings->>'profile_visibility', 'public') = 'public';

REVOKE ALL ON public_profiles FROM anon;
REVOKE ALL ON public_profiles FROM authenticated;

GRANT SELECT ON public_profiles TO anon;
GRANT SELECT ON public_profiles TO authenticated;
GRANT SELECT ON public_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
