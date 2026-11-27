-- ============================================================
-- Migration 236: branch cover image
--
-- Adds a single nullable, format-checked cover_image_url column to
-- public.business_branches. No default, no NOT NULL, no new index, no
-- change to any existing policy or constraint.
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent and safe to re-run after a partial
-- application.
-- ============================================================

-- 0. PREFLIGHT (read-only). Confirms business_branches exists and still
--    has the unique index business_branches_id_business_id_key. Passes
--    whether cover_image_url is absent (first run) or already present
--    (resumed run) -- this preflight does not care which.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'business_branches'
  ) THEN
    RAISE EXCEPTION 'public.business_branches does not exist -- aborting migration 236';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'business_branches'
      AND indexname = 'business_branches_id_business_id_key'
  ) THEN
    RAISE EXCEPTION 'public.business_branches is missing the expected unique index business_branches_id_business_id_key -- aborting migration 236';
  END IF;
END;
$$;

-- 1. Add the column. Nullable, no default. Idempotent via IF NOT EXISTS.
ALTER TABLE public.business_branches
  ADD COLUMN IF NOT EXISTS cover_image_url text NULL;

-- 2. Add the format CHECK, guarded by name so a resumed run does not
--    try to add a duplicate constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_branches'::regclass
      AND conname = 'business_branches_cover_image_url_check'
  ) THEN
    ALTER TABLE public.business_branches
      ADD CONSTRAINT business_branches_cover_image_url_check
      CHECK (
        cover_image_url IS NULL
        OR (char_length(cover_image_url) <= 500 AND cover_image_url ~ '^https://')
      );
  END IF;
END;
$$;
