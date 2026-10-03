-- migration_130_website_category_and_metadata_rollback.sql
-- Rollback for migration_130: remove metadata column and index

BEGIN;

DROP INDEX IF EXISTS public.idx_tenant_websites_metadata_category;

ALTER TABLE public.tenant_websites
  DROP COLUMN IF EXISTS metadata;

COMMIT;

NOTIFY pgrst, 'reload schema';
