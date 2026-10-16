-- migration_178_universal_page_blocks.sql
-- Shared JSON block envelope for invitation pages and business mini-websites.
-- Existing website_pages.blocks and website_page_drafts.blocks remain the
-- write-compatible source for the current editor; blocks_layout is a canonical
-- {version, global_theme, layout_blocks:[{id,type,content}]} projection.
-- Invitation pages store a draft blocks_layout and freeze it into
-- published_snapshot.blocks_layout at publish time.

BEGIN;

ALTER TABLE public.event_invitation_pages
  ADD COLUMN IF NOT EXISTS blocks_layout JSONB;

COMMENT ON COLUMN public.event_invitation_pages.blocks_layout IS
  'Optional canonical draft page composition: {version, global_theme, layout_blocks:[{id,type,content}]}. Null uses the legacy template-id adapter.';

ALTER TABLE public.website_pages
  ADD COLUMN IF NOT EXISTS blocks_layout JSONB;

ALTER TABLE public.website_page_drafts
  ADD COLUMN IF NOT EXISTS blocks_layout JSONB;

COMMENT ON COLUMN public.website_pages.blocks_layout IS
  'Canonical page composition projection of blocks for the universal page renderer.';

COMMENT ON COLUMN public.website_page_drafts.blocks_layout IS
  'Canonical working page composition projection of blocks for the universal page renderer.';

CREATE OR REPLACE FUNCTION public.make_page_blocks_layout(
  p_blocks JSONB,
  p_global_theme JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_layout_blocks JSONB := '[]'::jsonb;
  v_theme JSONB := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(p_blocks) = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', COALESCE(
            NULLIF(BTRIM(item.value ->> 'id'), ''),
            'website-' || item.ordinality::text || '-' || (item.value ->> 'type')
          ),
          'type', item.value ->> 'type',
          'content', item.value - 'id' - 'type'
        )
        ORDER BY item.ordinality
      ),
      '[]'::jsonb
    )
    INTO v_layout_blocks
    FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS item(value, ordinality)
    WHERE jsonb_typeof(item.value) = 'object'
      AND jsonb_typeof(item.value -> 'type') = 'string'
      AND NULLIF(BTRIM(item.value ->> 'type'), '') IS NOT NULL;
  END IF;

  IF jsonb_typeof(p_global_theme) = 'object' THEN
    v_theme := p_global_theme;
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'global_theme', jsonb_build_object(
      'classes', COALESCE(v_theme -> 'classes', '{}'::jsonb)
    ),
    'layout_blocks', v_layout_blocks
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_website_blocks_layout()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_theme JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND jsonb_typeof(OLD.blocks_layout -> 'global_theme') = 'object' THEN
    v_theme := OLD.blocks_layout -> 'global_theme';
  END IF;

  IF NEW.blocks_layout IS NULL
     OR (TG_OP = 'UPDATE'
         AND NEW.blocks IS DISTINCT FROM OLD.blocks
         AND NEW.blocks_layout IS NOT DISTINCT FROM OLD.blocks_layout) THEN
    NEW.blocks_layout := public.make_page_blocks_layout(NEW.blocks, v_theme);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_website_pages_blocks_layout ON public.website_pages;
CREATE TRIGGER trg_sync_website_pages_blocks_layout
  BEFORE INSERT OR UPDATE ON public.website_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_website_blocks_layout();

DROP TRIGGER IF EXISTS trg_sync_website_page_drafts_blocks_layout ON public.website_page_drafts;
CREATE TRIGGER trg_sync_website_page_drafts_blocks_layout
  BEFORE INSERT OR UPDATE ON public.website_page_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_website_blocks_layout();

UPDATE public.website_pages
SET blocks_layout = public.make_page_blocks_layout(blocks, '{}'::jsonb)
WHERE blocks_layout IS NULL;

UPDATE public.website_page_drafts
SET blocks_layout = public.make_page_blocks_layout(blocks, '{}'::jsonb)
WHERE blocks_layout IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
