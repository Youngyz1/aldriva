-- migration_129_website_page_drafts_and_publishing_guard_rollback.sql
--
-- Rollback for migration_129:
-- 1. Drops publish_page_draft RPC.
-- 2. Drops trg_enforce_website_page_publishing_guard trigger and enforce_website_page_publishing_guard function.
-- 3. Drops trg_set_website_page_draft_metadata trigger and set_website_page_draft_metadata function.
-- 4. Drops website_page_drafts table and RLS policies.
-- 5. Re-adds draft_blocks column to website_pages.

BEGIN;

DROP FUNCTION IF EXISTS public.publish_page_draft(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.publish_page_draft(UUID);

DROP TRIGGER IF EXISTS trg_enforce_website_page_publishing_guard ON public.website_pages;
DROP FUNCTION IF EXISTS public.enforce_website_page_publishing_guard();

DROP TRIGGER IF EXISTS trg_set_website_page_draft_metadata ON public.website_page_drafts;
DROP FUNCTION IF EXISTS public.set_website_page_draft_metadata();

DROP TABLE IF EXISTS public.website_page_drafts CASCADE;

ALTER TABLE public.website_pages ADD COLUMN IF NOT EXISTS draft_blocks JSONB DEFAULT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
