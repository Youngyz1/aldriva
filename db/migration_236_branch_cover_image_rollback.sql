-- ============================================================
-- Rollback for migration_236_branch_cover_image.sql.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
--
-- WARNING: step 2 deletes every branch cover photo URL stored in this
-- column. Do not run this rollback after cover photos exist in
-- production unless that data loss is intended.
-- ============================================================

-- 1. Drop the CHECK, guarded by name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_branches'::regclass
      AND conname = 'business_branches_cover_image_url_check'
  ) THEN
    ALTER TABLE public.business_branches
      DROP CONSTRAINT business_branches_cover_image_url_check;
  END IF;
END;
$$;

-- 2. Drop the column. WARNING: this deletes every branch cover photo
--    URL stored in it -- do not run after photos exist unless intended.
ALTER TABLE public.business_branches
  DROP COLUMN IF EXISTS cover_image_url;
