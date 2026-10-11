-- scripts/cleanup/website-test-delete.sql
--
-- STAGE S2 test-site deletion (WRITE — human-supervised only, NEVER in CI).
-- Do NOT run until website-inventory.sql output has been verified row by row.
--
-- 0. PRE-DELETE BACKUP (run these first, keep the outputs):
--      pg_dump <conn> -t public.tenant_websites -t public.website_pages \
--        -t public.website_navigation -t public.website_page_drafts \
--        -t public.website_content -t public.website_content_drafts \
--        -F c -f website-test-backup.dump
--    Plus a storage listing per tenant prefix (see
--    website-storage-inventory.sql) saved to a file.
--
-- 1. Fill in the explicit website id list below (from inventory output).
--    NEVER a bare DELETE, NEVER WHERE true — the statement refuses to run
--    with an empty list (cardinality check raises before deleting).
-- 2. The transaction ends in ROLLBACK by default: it shows you the affected
--    ids and counts, then undoes everything. Only after verifying every
--    returned row is test data, change the final ROLLBACK to COMMIT and rerun.
-- 3. Storage cleanup is separate (website actions never delete storage
--    objects): after COMMIT, remove the exact cms-media/<tenant_id>/ prefixes
--    listed in the storage inventory via the dashboard or API, then rerun the
--    storage inventory to confirm empty.

BEGIN;

-- === HUMAN STEP: replace with verified test website ids ===
-- Example: 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
WITH doomed(website_id) AS (
  VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid) -- placeholder: REPLACE ME
),
guard AS (
  SELECT COUNT(*) AS n FROM doomed WHERE website_id <> '00000000-0000-0000-0000-000000000000'::uuid
),
assert_nonempty AS (
  SELECT CASE WHEN (SELECT n FROM guard) = 0
    THEN (SELECT 1 / 0) -- aborts: refusing to run with an empty id list
    ELSE 1 END
),
deleted AS (
  DELETE FROM public.tenant_websites tw
  USING doomed d, assert_nonempty
  WHERE tw.id = d.website_id
    AND d.website_id <> '00000000-0000-0000-0000-000000000000'::uuid
  RETURNING tw.id, tw.slug, tw.tenant_id
)
SELECT id AS deleted_website_id, slug, tenant_id FROM deleted;

-- Cascades verified in-repo (do NOT rely on this comment — the RETURNING
-- above plus website-post-delete-verify.sql prove it):
--   website_pages.website_id -> CASCADE (db/migration_125:35)
--   website_navigation.website_id -> CASCADE (db/migration_125:65)
--   website_page_drafts.page_id -> CASCADE via pages (db/migration_129:29)
--   website_content / website_content_drafts .website_id -> CASCADE (db/migration_168)

-- === DEFAULT: show + undo. Change to COMMIT only after human verification. ===
ROLLBACK;
