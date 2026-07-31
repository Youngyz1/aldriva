-- migration_01_profiles.sql
-- Creates the profiles table linked to auth.users.
-- Safe to re-run: uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role       TEXT NOT NULL DEFAULT 'user'
               CHECK (role IN ('admin', 'organizer', 'user')),
  status     TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add any columns that may be missing if the table already existed.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('admin', 'organizer', 'user'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Trigger: auto-insert a profile row whenever a new auth user is created.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, role, status)
  VALUES (NEW.id, 'user', 'active')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own profile" ON profiles;
CREATE POLICY "Users can read their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Only the service role (backend) may update role or status.
-- No UPDATE policy for regular users intentionally.

NOTIFY pgrst, 'reload schema';
