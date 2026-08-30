-- migration_85_fix_organizer_verification_storage_rls.sql
-- Fix storage RLS policies for organizer-verification-docs:
-- Explicitly qualify storage.objects.name so it doesn't bind to organizers.name inside the EXISTS clause.

BEGIN;

DROP POLICY IF EXISTS "Organizer can read own verification docs" ON storage.objects;
CREATE POLICY "Organizer can read own verification docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'organizer-verification-docs'
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id::text = (storage.foldername(storage.objects.name))[1]
        AND organizers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Organizer can upload verification docs" ON storage.objects;
CREATE POLICY "Organizer can upload verification docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'organizer-verification-docs'
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id::text = (storage.foldername(storage.objects.name))[1]
        AND organizers.user_id = auth.uid()
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
