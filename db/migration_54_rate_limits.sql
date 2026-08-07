-- migration_54_rate_limits.sql
--
-- Application-level rate limiting (HIGH-3), built on Postgres because that is
-- infrastructure this project already has. In-memory counters are not an option
-- on Vercel: each serverless instance would keep its own count and cold starts
-- would reset it, so an attacker gets the full limit per instance.
--
-- Fixed-window counter. Simpler than a sliding window or token bucket, and the
-- worst case (2x the limit across a window boundary) is well within tolerance
-- for the endpoints being protected.
--
-- Rollback: db/migration_54_rate_limits_rollback.sql

BEGIN;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key    text        NOT NULL,
  window_start  timestamptz NOT NULL,
  request_count integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Supports the sweep in check_rate_limit().
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON rate_limits (window_start);

-- No policies are created, so with RLS enabled the table is unreachable by
-- anon/authenticated. Only the SECURITY DEFINER function below touches it.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

/**
 * Atomically counts one request against a bucket and reports whether it is
 * allowed.
 *
 * The INSERT ... ON CONFLICT DO UPDATE is what makes this race-safe: two
 * concurrent requests cannot both read a stale count, because the increment
 * happens inside a single statement holding a row lock.
 *
 * Returns retry_after in seconds so the caller can set a Retry-After header.
 */
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  IF p_limit <= 0 OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'invalid rate limit parameters';
  END IF;

  -- Snap to the start of the current fixed window.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO rate_limits (bucket_key, window_start, request_count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  -- Opportunistic sweep so the table cannot grow without bound. Cheap and
  -- rarely fires; avoids needing another cron job.
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < now() - interval '24 hours';
  END IF;

  IF v_count > p_limit THEN
    RETURN QUERY SELECT
      false,
      0,
      GREATEST(
        1,
        ceil(extract(epoch FROM
          (v_window_start + make_interval(secs => p_window_seconds)) - now()
        ))::integer
      );
  ELSE
    RETURN QUERY SELECT true, (p_limit - v_count), 0;
  END IF;
END;
$$;

-- Only the service role may call this. Exposing it to anon/authenticated would
-- let a caller burn someone else's bucket by passing their key, or probe how
-- close an identity is to its limit.
REVOKE ALL ON FUNCTION check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
