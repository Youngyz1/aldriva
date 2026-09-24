-- migration_135_profile_locale.sql
-- Adds optional locale preference to profiles (en/fr) for hierarchy:
-- 1. saved user preference (profiles.locale) 2. cookie 3. Accept-Language 4. default en

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locale TEXT CHECK (locale IS NULL OR locale IN ('en', 'fr'));
COMMENT ON COLUMN profiles.locale IS 'User preferred locale (en/fr). Nullable — falls back to cookie/Accept-Language when null.';

CREATE INDEX IF NOT EXISTS idx_profiles_locale ON profiles(locale) WHERE locale IS NOT NULL;

COMMIT;
NOTIFY pgrst, 'reload schema';
