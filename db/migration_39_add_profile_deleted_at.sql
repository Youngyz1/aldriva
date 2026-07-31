-- migration_39_add_profile_deleted_at.sql
-- Add deleted_at and purge_at to profiles, events, fundraisers, and organizers.
-- Recreate public_profiles view.
-- Create check_email_pending_deletion function.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS purge_at timestamp with time zone DEFAULT NULL;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS purge_at timestamp with time zone DEFAULT NULL;

ALTER TABLE public.fundraisers ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.fundraisers ADD COLUMN IF NOT EXISTS purge_at timestamp with time zone DEFAULT NULL;

ALTER TABLE public.organizers ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.organizers ADD COLUMN IF NOT EXISTS purge_at timestamp with time zone DEFAULT NULL;

CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  display_name,
  COALESCE(avatar_url, profile_photo) AS avatar_url
FROM public.profiles
WHERE status = 'active'
  AND deleted_at IS NULL
  AND COALESCE(NULLIF(btrim(privacy_settings->>'profile_visibility'), ''), 'public') = 'public';

CREATE OR REPLACE FUNCTION public.check_email_pending_deletion(p_email text)
RETURNS TABLE (pending_id uuid, purge_date timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, p.purge_at
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.email = p_email
    AND p.deleted_at IS NOT NULL
    AND p.purge_at > now();
END;
$$;

NOTIFY pgrst, 'reload schema';
