-- migration_12_profile_account_info.sql
-- Adds private user account details for the account settings page.
-- Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_info JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_photo TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.profiles
  ALTER COLUMN account_info SET DEFAULT '{}'::jsonb;

UPDATE public.profiles
SET account_info = COALESCE(account_info, '{}'::jsonb)
WHERE account_info IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_status_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Role and status cannot be changed from account settings.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_status_self_update ON public.profiles;
CREATE TRIGGER prevent_profile_role_status_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_status_self_update();

DROP POLICY IF EXISTS "Users can update their own account settings" ON public.profiles;
CREATE POLICY "Users can update their own account settings"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload profile images" ON storage.objects;
CREATE POLICY "Users can upload profile images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update profile images" ON storage.objects;
CREATE POLICY "Users can update profile images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'profile-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Profile images are public" ON storage.objects;
CREATE POLICY "Profile images are public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-images');

NOTIFY pgrst, 'reload schema';
