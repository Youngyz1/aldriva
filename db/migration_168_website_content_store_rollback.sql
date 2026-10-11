-- migration_168_website_content_store_rollback.sql
-- Rollback twin for migration_168 (canonical db/ only; never mirrored to supabase/).

BEGIN;

-- Drop the RPC first (dependents: none outside this migration).
DROP FUNCTION IF EXISTS public.publish_content_draft(UUID, INTEGER, JSONB);

-- Drop triggers, then tables children-first WITHOUT CASCADE.
DROP TRIGGER IF EXISTS trg_set_website_content_updated_at ON public.website_content;
DROP TRIGGER IF EXISTS trg_set_website_content_draft_metadata ON public.website_content_drafts;
DROP FUNCTION IF EXISTS public.set_website_content_updated_at();
DROP FUNCTION IF EXISTS public.set_website_content_draft_metadata();

DROP TABLE IF EXISTS public.website_content_drafts;
DROP TABLE IF EXISTS public.website_content;

COMMIT;

NOTIFY pgrst, 'reload schema';
