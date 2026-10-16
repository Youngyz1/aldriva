-- Rollback for migration_178_universal_page_blocks.sql
-- Drops the derived page-layout projections; any custom blocks_layout JSONB
-- stored since migration 178 is discarded by this rollback.

BEGIN;

DROP TRIGGER IF EXISTS trg_sync_website_page_drafts_blocks_layout ON public.website_page_drafts;
DROP TRIGGER IF EXISTS trg_sync_website_pages_blocks_layout ON public.website_pages;
DROP FUNCTION IF EXISTS public.sync_website_blocks_layout();
DROP FUNCTION IF EXISTS public.make_page_blocks_layout(JSONB, JSONB);

ALTER TABLE public.website_page_drafts DROP COLUMN IF EXISTS blocks_layout;
ALTER TABLE public.website_pages DROP COLUMN IF EXISTS blocks_layout;
ALTER TABLE public.event_invitation_pages DROP COLUMN IF EXISTS blocks_layout;

COMMIT;

NOTIFY pgrst, 'reload schema';
