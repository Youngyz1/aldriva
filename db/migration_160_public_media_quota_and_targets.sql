-- Purpose-scoped public media targets and atomic daily upload reservations.
-- Quota: 40 upload reservations and 200 MiB per user per UTC day.
BEGIN;

ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS target_id UUID;

ALTER TABLE public.media
  DROP CONSTRAINT IF EXISTS media_owner_scope_check;

ALTER TABLE public.media
  ADD CONSTRAINT media_owner_scope_check CHECK (
    (purpose IN ('event_image', 'article_image', 'product_image', 'campaign_image', 'logo')
      AND tenant_id IS NOT NULL AND owner_user_id IS NULL)
    OR (purpose IN ('avatar', 'cms') AND tenant_id IS NULL AND owner_user_id IS NOT NULL)
    OR (purpose = 'event_image' AND tenant_id IS NULL AND owner_user_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS media_target_created_idx
  ON public.media (target_id, created_at DESC) WHERE target_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.public_media_upload_daily_quota (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL,
  upload_count INTEGER NOT NULL CHECK (upload_count >= 0),
  uploaded_bytes BIGINT NOT NULL CHECK (uploaded_bytes >= 0),
  PRIMARY KEY (user_id, quota_date)
);

COMMENT ON TABLE public.public_media_upload_daily_quota IS
  'Atomic public-image upload reservations; counters are per user and UTC day, capped at 40 uploads and 200 MiB.';
COMMENT ON COLUMN public.media.target_id IS
  'Optional event id for event-banner and invitation-image media; tenant_id or owner_user_id still controls ownership.';

ALTER TABLE public.public_media_upload_daily_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_media_upload_daily_quota FROM anon, authenticated;
GRANT ALL ON TABLE public.public_media_upload_daily_quota TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_public_media_upload(
  p_user_id UUID,
  p_bytes BIGINT
)
RETURNS TABLE (allowed BOOLEAN, remaining_count INTEGER, remaining_bytes BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_bytes BIGINT;
BEGIN
  IF p_user_id IS NULL OR p_bytes IS NULL OR p_bytes < 1 OR p_bytes > 209715200 THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  INSERT INTO public.public_media_upload_daily_quota AS current_quota
    (user_id, quota_date, upload_count, uploaded_bytes)
  VALUES (p_user_id, (timezone('utc', now()))::DATE, 1, p_bytes)
  ON CONFLICT (user_id, quota_date) DO UPDATE
    SET upload_count = current_quota.upload_count + 1,
        uploaded_bytes = current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes
    WHERE current_quota.upload_count < 40
      AND current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes <= 209715200
  RETURNING upload_count, uploaded_bytes INTO v_count, v_bytes;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 40 - v_count, 209715200 - v_bytes;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_public_media_upload(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_public_media_upload(UUID, BIGINT) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
