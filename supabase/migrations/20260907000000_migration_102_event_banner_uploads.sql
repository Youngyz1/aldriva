-- 20260907000000_migration_102_event_banner_uploads.sql
--
-- Supabase-CLI mirror of db/migration_102_event_banner_uploads.sql (canonical).
-- See the canonical file for the full security rationale.

BEGIN;

DROP POLICY IF EXISTS "Event managers can upload event banners" ON storage.objects;
CREATE POLICY "Event managers can upload event banners"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (
    bucket_id = 'event-banners'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::text = (storage.foldername(storage.objects.name))[1]
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND o.user_id = auth.uid()
          )
        )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
