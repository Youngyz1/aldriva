-- migration_82_organizer_verification_storage.sql
-- Phase 1 of the Organizer Verification System: private storage bucket for
-- verification documents.
--
-- Two public buckets already exist in this app (profile-images, article-audio),
-- both with fully-public SELECT policies. This is the first private (non-public)
-- bucket. "private" here means:
--   1. bucket.public = false  → Supabase Storage rejects unauthenticated fetches
--      at the CDN layer, before any RLS is even evaluated.
--   2. Storage RLS policies grant SELECT only to: (a) the organizer owner who
--      uploaded the file, and (b) admins via the service role or an admin-profile
--      read. Nobody else can retrieve a URL that resolves to an actual file.
--
-- Path convention: {organizer_id}/{document_type}_{timestamp_ms}_{filename}
-- Using organizer_id (not user_id) as the first path segment because:
--   - Submissions are per-organizer, not per-user.
--   - RLS can then safely scope reads to "your organizer_id" via an EXISTS check
--     against organizers.user_id = auth.uid(), which is both clear and testable.
--   - A user who owns multiple organizers can only read docs under organizer_ids
--     they own — not docs for other organizers they don't own.
--
-- No DELETE policy for any role: documents must be retained for audit integrity
-- once a submission is made. Replacement is handled by uploading a new file with
-- a newer timestamp in the path, not by deleting the old one.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('organizer-verification-docs', 'organizer-verification-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Organizer owner can upload docs to their own organizer's folder.
-- First path segment must equal an organizer_id that the authenticated user owns.
DROP POLICY IF EXISTS "Organizer can upload verification docs" ON storage.objects;
CREATE POLICY "Organizer can upload verification docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'organizer-verification-docs'
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id::text = (storage.foldername(name))[1]
        AND organizers.user_id = auth.uid()
    )
  );

-- Organizer owner can read (SELECT) their own docs — needed to show upload
-- confirmation in the submission wizard, and to let them view what they submitted.
DROP POLICY IF EXISTS "Organizer can read own verification docs" ON storage.objects;
CREATE POLICY "Organizer can read own verification docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'organizer-verification-docs'
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id::text = (storage.foldername(name))[1]
        AND organizers.user_id = auth.uid()
    )
  );

-- Admins can read all docs in this bucket for review purposes.
-- Reads go through the admin API which uses supabaseAdmin (service role,
-- auth.uid() IS NULL) — but this policy also covers the case where an admin
-- makes a read as their authenticated profile (e.g. generating a signed URL
-- via the PostgREST layer for the drawer UI).
DROP POLICY IF EXISTS "Admins can read all verification docs" ON storage.objects;
CREATE POLICY "Admins can read all verification docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'organizer-verification-docs'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
