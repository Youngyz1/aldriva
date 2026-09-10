-- migration_102_event_banner_uploads.sql
--
-- Allow event managers to upload event banners through the browser upload
-- pipeline (ImageUploadWithCrop -> lib/uploadImage -> storage event-banners
-- bucket), which previously failed with "new row violates row-level security
-- policy" for every user.
--
-- Background: event-banners is a public bucket with no storage.objects INSERT
-- policy, so with Storage RLS default-deny, no authenticated browser upload
-- could succeed there (only service_role could write). Every sibling media
-- bucket has an authenticated-upload policy; event banners additionally scope
-- the upload to events the uploader is authorized to manage.
--
-- Authorization model (mirrors the application edit gate in
-- app/events/edit/[id]/page.tsx and app/create-event/page.tsx): the uploader
-- must own the event (events.user_id) or own the event's organizer profile
-- (organizers.user_id via events.organizer_id). No second authorization
-- system is introduced here.
--
-- Path convention (lib/uploads.ts buildUploadPath): "<eventId>/<unique-file>".
-- The policy binds the first path segment to events.id, so a user authorized
-- for Event A cannot write into Event B's prefix (or any other prefix), and
-- uploads to non-existent event paths are denied.
--
-- storage.objects.name is explicitly qualified (see migration_85) so it
-- cannot bind to events/organizers columns inside the EXISTS clauses.

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
