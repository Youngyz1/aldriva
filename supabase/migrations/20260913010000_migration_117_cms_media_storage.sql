-- 20260913010000_migration_117_cms_media_storage.sql
--
-- Dedicated storage bucket for CMS and SEO media (hero backgrounds, landing
-- page banners, SEO/OG social share cards).
--
-- Public read access: objects are served via getPublicUrl for landing pages,
-- SEO meta tags, and social crawler link previews.
-- Admin-only write: INSERT, UPDATE, and DELETE on storage.objects for cms-media
-- are restricted to users with profiles.role = 'admin' and profiles.status = 'active',
-- matching the isAdmin() gate on admin API routes.
--
-- File limit: 5MB, allowed MIME types: image/jpeg, image/png, image/webp, image/gif, image/avif.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cms-media',
  'cms-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

DROP POLICY IF EXISTS "CMS media is public for SELECT" ON storage.objects;
CREATE POLICY "CMS media is public for SELECT"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cms-media');

DROP POLICY IF EXISTS "Admins can upload CMS media" ON storage.objects;
CREATE POLICY "Admins can upload CMS media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cms-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can update CMS media" ON storage.objects;
CREATE POLICY "Admins can update CMS media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cms-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can delete CMS media" ON storage.objects;
CREATE POLICY "Admins can delete CMS media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cms-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
