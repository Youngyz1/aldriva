-- migration_85_fix_organizer_verification_storage_rls_rollback.sql
-- Rollback migration 85 by restoring previous (defective) policies if ever needed.

BEGIN;

DROP POLICY IF EXISTS "Organizer can read own verification docs" ON storage.objects;
CREATE POLICY "Organizer can read own verification docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'organizer-verification-docs'
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id::text = (storage.foldername(organizers.name))[1]
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
      WHERE organizers.id::text = (storage.foldername(organizers.name))[1]
        AND organizers.user_id = auth.uid()
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
