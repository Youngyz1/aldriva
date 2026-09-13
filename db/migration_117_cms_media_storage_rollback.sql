-- migration_117_cms_media_storage_rollback.sql

BEGIN;

DROP POLICY IF EXISTS "Admins can delete CMS media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update CMS media" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload CMS media" ON storage.objects;
DROP POLICY IF EXISTS "CMS media is public for SELECT" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'cms-media';

COMMIT;

NOTIFY pgrst, 'reload schema';
