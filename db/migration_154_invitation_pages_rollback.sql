-- migration_154_invitation_pages_rollback.sql
-- Rollback for migration_154_invitation_pages.sql
--
-- NOTE: Does not DELETE from storage.buckets (precedent: migration_116).
-- If desired, delete the 'invitation-media' bucket manually via Supabase Dashboard
-- or Storage API after verifying all stored objects are removed.

BEGIN;

-- Drop storage policies
DROP POLICY IF EXISTS "Event managers can delete invitation media" ON storage.objects;
DROP POLICY IF EXISTS "Event managers can upload invitation media" ON storage.objects;

-- Drop updated_at trigger and function
DROP TRIGGER IF EXISTS trg_event_invitation_pages_updated_at ON public.event_invitation_pages;
DROP FUNCTION IF EXISTS update_event_invitation_pages_updated_at();

-- Drop tables & policies
DROP TABLE IF EXISTS public.invitation_page_preview_tokens CASCADE;
DROP TABLE IF EXISTS public.event_invitation_pages CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
