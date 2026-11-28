-- ============================================================
-- Companion verification SQL for migration_236_branch_cover_image.sql.
-- Read-only queries to run AFTER the forward migration is applied.
-- Do NOT execute inside a transaction that modifies the schema.
-- ============================================================

-- 1. Column exists, type text, nullable.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'business_branches' AND column_name = 'cover_image_url';
-- Expect one row: cover_image_url | text | YES.

-- 2. The CHECK exists with the expected definition.
SELECT pg_get_constraintdef(oid) AS cover_image_url_check_definition
FROM pg_constraint
WHERE conrelid = 'public.business_branches'::regclass
  AND conname = 'business_branches_cover_image_url_check';
-- Expect: CHECK (cover_image_url IS NULL OR (char_length(cover_image_url) <= 500 AND cover_image_url ~ '^https://'::text))

-- 3. Every existing row has NULL (this migration never backfills a value).
SELECT COUNT(*) AS non_null_cover_image_count
FROM public.business_branches
WHERE cover_image_url IS NOT NULL;
-- Expect 0.

-- 4. Both existing policies still exist, unchanged.
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.business_branches'::regclass
  AND polname IN ('Owners can manage branches', 'Public can view branches');
-- Expect two rows:
--   Owners can manage branches | * (ALL)
--   Public can view branches   | r (SELECT)

-- 5. Both unique indexes still exist.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'business_branches'
  AND indexname IN ('business_branches_id_business_id_key', 'idx_business_branches_code_unique_within_business');
-- Expect two rows, both present.
