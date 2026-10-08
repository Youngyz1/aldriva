-- Adds configurable limits to the atomic daily public-media reservation RPC.
-- Migration 160's two-argument function remains available during rollout.
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_public_media_upload(
  p_user_id UUID,
  p_bytes BIGINT,
  p_max_count INTEGER,
  p_max_bytes BIGINT
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
  IF p_user_id IS NULL
    OR p_bytes IS NULL
    OR p_max_count IS NULL
    OR p_max_bytes IS NULL
    OR p_bytes < 1
    OR p_max_count < 1
    OR p_max_bytes < 1
    OR p_bytes > p_max_bytes THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  INSERT INTO public.public_media_upload_daily_quota AS current_quota
    (user_id, quota_date, upload_count, uploaded_bytes)
  VALUES (p_user_id, (timezone('utc', now()))::DATE, 1, p_bytes)
  ON CONFLICT (user_id, quota_date) DO UPDATE
    SET upload_count = current_quota.upload_count + 1,
        uploaded_bytes = current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes
    WHERE current_quota.upload_count < p_max_count
      AND current_quota.uploaded_bytes + EXCLUDED.uploaded_bytes <= p_max_bytes
  RETURNING upload_count, uploaded_bytes INTO v_count, v_bytes;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 0::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, p_max_count - v_count, p_max_bytes - v_bytes;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_public_media_upload(UUID, BIGINT, INTEGER, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_public_media_upload(UUID, BIGINT, INTEGER, BIGINT)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
