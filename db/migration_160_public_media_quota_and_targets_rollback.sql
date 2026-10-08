-- Removes quota counters and event target metadata added in migration 160.
BEGIN;

-- Check every condition that would violate the pre-migration ownership rule
-- before changing any schema. Raising here aborts the transaction cleanly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.media WHERE target_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back migration 160 while media rows with target_id exist; resolve target-scoped media first';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.media
    WHERE purpose = 'event_image'
      AND tenant_id IS NULL
      AND owner_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back migration 160 while owner-scoped event images exist; reassign or remove them first';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.reserve_public_media_upload(UUID, BIGINT) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.reserve_public_media_upload(UUID, BIGINT);

DROP TABLE IF EXISTS public.public_media_upload_daily_quota;
DROP INDEX IF EXISTS public.media_target_created_idx;

ALTER TABLE public.media
  DROP CONSTRAINT IF EXISTS media_owner_scope_check;

ALTER TABLE public.media
  DROP COLUMN IF EXISTS target_id;

ALTER TABLE public.media
  ADD CONSTRAINT media_owner_scope_check CHECK (
    (purpose IN ('event_image', 'article_image', 'product_image', 'campaign_image', 'logo')
      AND tenant_id IS NOT NULL AND owner_user_id IS NULL)
    OR (purpose IN ('avatar', 'cms') AND tenant_id IS NULL AND owner_user_id IS NOT NULL)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
