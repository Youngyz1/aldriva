-- migration_07_fix_profiles_signup_trigger.sql
-- Repairs the auth.users -> public.profiles signup trigger.
-- Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'organizer', 'user'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'user',
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN preferences SET DEFAULT '{}'::jsonb;

UPDATE public.profiles
SET
  role = COALESCE(role, 'user'),
  status = COALESCE(status, 'active'),
  created_at = COALESCE(created_at, now()),
  preferences = COALESCE(preferences, '{}'::jsonb);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status, preferences)
  VALUES (NEW.id, 'user', 'active', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, role, status, preferences, created_at)
SELECT users.id, 'user', 'active', '{}'::jsonb, COALESCE(users.created_at, now())
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
WHERE profiles.id IS NULL;

NOTIFY pgrst, 'reload schema';
