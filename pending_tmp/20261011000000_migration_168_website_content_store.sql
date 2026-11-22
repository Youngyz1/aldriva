-- migration_168_website_content_store.sql
--
-- Stage S2: Template-first shared content store.
--
-- 1. website_content: one live JSONB document per website (template-independent
--    shared content; template slots point at content field keys, never block paths).
-- 2. website_content_drafts: parallel working draft with version trigger,
--    copying migration_129 (website_page_drafts / set_website_page_draft_metadata).
-- 3. RLS copied from migration_125/129 shape: SELECT for the 6 entity roles +
--    organizer-owner fallback + active platform admin; INSERT/UPDATE for
--    owner/admin/manager/editor; DELETE for owner/admin/manager only.
--    REVOKE ALL FROM PUBLIC, anon. No anon read: the public site reads through
--    server code, as it does today.
-- 4. publish_content_draft(p_website_id, p_expected_version, p_page_blocks):
--    same auth + DELETE ... WHERE version RETURNING + 40001/P0002 shape as
--    publish_page_draft (migration_129), writes website_content, optionally
--    writes resolver-generated page blocks in the same transaction.
--    REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role.

BEGIN;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_content (
  website_id UUID PRIMARY KEY REFERENCES public.tenant_websites(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE public.website_content IS 'Template-independent shared website content (one JSONB document per website). Template slots resolve field keys from this document; catalogs (menu/services/fleet/products) stay in their own tables and are referenced by featured ids only.';

CREATE TABLE IF NOT EXISTS public.website_content_drafts (
  website_id UUID PRIMARY KEY REFERENCES public.tenant_websites(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  version INTEGER NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.website_content_drafts IS 'Working drafts for website_content. Autosave target; published only via publish_content_draft. Never exposed to anonymous visitors.';

CREATE INDEX IF NOT EXISTS idx_website_content_website_id ON public.website_content(website_id);
CREATE INDEX IF NOT EXISTS idx_website_content_drafts_website_id ON public.website_content_drafts(website_id);
CREATE INDEX IF NOT EXISTS idx_website_content_gin ON public.website_content USING GIN (content);

-- ── 2. updated_at / version trigger (copies set_website_page_draft_metadata) ──

CREATE OR REPLACE FUNCTION public.set_website_content_draft_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
  ELSE
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_website_content_draft_metadata ON public.website_content_drafts;
CREATE TRIGGER trg_set_website_content_draft_metadata
  BEFORE INSERT OR UPDATE ON public.website_content_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_website_content_draft_metadata();

CREATE OR REPLACE FUNCTION public.set_website_content_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_website_content_updated_at ON public.website_content;
CREATE TRIGGER trg_set_website_content_updated_at
  BEFORE UPDATE ON public.website_content
  FOR EACH ROW
  EXECUTE FUNCTION public.set_website_content_updated_at();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- website_content (LIVE): SELECT only for the 6 entity roles +
-- organizer-owner fallback + active platform admin. NO INSERT/UPDATE/DELETE
-- policies for authenticated users: the ONLY writer of the live document is
-- publish_content_draft (service_role). This closes the "editor publishes by
-- writing the live row directly" path.
-- website_content_drafts: SELECT for the 6 entity roles (+ fallbacks);
-- INSERT/UPDATE for owner/admin/manager/editor; DELETE for
-- owner/admin/manager only.

ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_content_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.website_content FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.website_content TO authenticated;
GRANT ALL ON TABLE public.website_content TO service_role;

REVOKE ALL ON TABLE public.website_content_drafts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.website_content_drafts TO authenticated;
GRANT ALL ON TABLE public.website_content_drafts TO service_role;

-- website_content SELECT
DROP POLICY IF EXISTS "Tenant team members can view website content" ON public.website_content;
CREATE POLICY "Tenant team members can view website content"
  ON public.website_content FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_websites tw
      WHERE tw.id = website_content.website_id
        AND (
          public.is_entity_member(tw.tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = tw.tenant_id
              AND organizers.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- website_content: no INSERT/UPDATE/DELETE policies by design (RPC-only writes).
-- Drop them if they exist (e.g. partial apply of an earlier draft).
DROP POLICY IF EXISTS "Tenant editors can insert website content" ON public.website_content;
DROP POLICY IF EXISTS "Tenant editors can update website content" ON public.website_content;
DROP POLICY IF EXISTS "Tenant managers can delete website content" ON public.website_content;

-- website_content_drafts SELECT
DROP POLICY IF EXISTS "Tenant team members can view website content drafts" ON public.website_content_drafts;
CREATE POLICY "Tenant team members can view website content drafts"
  ON public.website_content_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_websites tw
      WHERE tw.id = website_content_drafts.website_id
        AND (
          public.is_entity_member(tw.tenant_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = tw.tenant_id
              AND organizers.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- website_content_drafts INSERT
DROP POLICY IF EXISTS "Tenant editors can insert website content drafts" ON public.website_content_drafts;
CREATE POLICY "Tenant editors can insert website content drafts"
  ON public.website_content_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_websites tw
      WHERE tw.id = website_content_drafts.website_id
        AND (
          public.is_entity_member(tw.tenant_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = tw.tenant_id
              AND organizers.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- website_content_drafts UPDATE
DROP POLICY IF EXISTS "Tenant editors can update website content drafts" ON public.website_content_drafts;
CREATE POLICY "Tenant editors can update website content drafts"
  ON public.website_content_drafts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_websites tw
      WHERE tw.id = website_content_drafts.website_id
        AND (
          public.is_entity_member(tw.tenant_id, ARRAY['owner','admin','manager','editor'])
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = tw.tenant_id
              AND organizers.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- website_content_drafts DELETE (managers only — editors discard via server action)
DROP POLICY IF EXISTS "Tenant managers can delete website content drafts" ON public.website_content_drafts;
CREATE POLICY "Tenant managers can delete website content drafts"
  ON public.website_content_drafts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_websites tw
      WHERE tw.id = website_content_drafts.website_id
        AND (
          public.is_entity_member(tw.tenant_id, ARRAY['owner','admin','manager'])
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = tw.tenant_id
              AND organizers.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- ── 4. publish_content_draft RPC (copies publish_page_draft shape) ──────────
-- p_page_blocks: OPTIONAL JSONB array of {page_id, blocks} letting a later stage
-- pass resolver-generated page blocks to be written in the same transaction.
-- Unused in this stage (NULL = content-only publish).

CREATE OR REPLACE FUNCTION public.publish_content_draft(
  p_website_id UUID,
  p_expected_version INTEGER DEFAULT NULL,
  p_page_blocks JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_tenant_id UUID;
  v_is_authorized BOOLEAN := false;
  v_draft_content JSONB;
  v_draft_version INTEGER;
  v_draft_updated_by UUID;
  v_site_title TEXT;
  v_entry JSONB;
  v_page_id UUID;
  v_page_count INTEGER := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: must be authenticated';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_caller_id AND role = 'admin' AND status = 'active'
    ) INTO v_is_authorized;
  END IF;

  SELECT tw.tenant_id, tw.site_title
  INTO v_tenant_id, v_site_title
  FROM public.tenant_websites tw
  WHERE tw.id = p_website_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Website not found: %', p_website_id;
  END IF;

  IF NOT v_is_authorized THEN
    v_is_authorized := public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])
      OR EXISTS (
        SELECT 1 FROM public.organizers
        WHERE organizers.id = v_tenant_id
          AND organizers.user_id = v_caller_id
      );
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Forbidden: only owners, admins, and managers can publish website content';
  END IF;

  -- Atomically fetch and clear the draft matching website_id + expected_version.
  DELETE FROM public.website_content_drafts
  WHERE website_id = p_website_id
    AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING content, version, updated_by
  INTO v_draft_content, v_draft_version, v_draft_updated_by;

  IF v_draft_content IS NULL THEN
    IF p_expected_version IS NOT NULL AND EXISTS (SELECT 1 FROM public.website_content_drafts WHERE website_id = p_website_id) THEN
      RAISE EXCEPTION 'Content draft version mismatch for website %: draft was modified concurrently (expected version %)', p_website_id, p_expected_version
        USING ERRCODE = '40001';
    ELSE
      RAISE EXCEPTION 'No content draft found for website: %', p_website_id
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Write the live content document (upsert: first publish has no live row yet).
  INSERT INTO public.website_content (website_id, content, updated_by, updated_at)
  VALUES (p_website_id, v_draft_content, v_draft_updated_by, pg_catalog.now())
  ON CONFLICT (website_id) DO UPDATE SET
    content = EXCLUDED.content,
    updated_by = EXCLUDED.updated_by,
    updated_at = pg_catalog.now();

  -- Optionally write resolver-generated page blocks in the same transaction.
  -- Each entry must be {page_id: uuid, blocks: array}; pages are verified to
  -- belong to this website so one call cannot write another tenant's pages.
  IF p_page_blocks IS NOT NULL THEN
    IF jsonb_typeof(p_page_blocks) <> 'array' THEN
      RAISE EXCEPTION 'p_page_blocks must be a JSON array of {page_id, blocks} entries';
    END IF;
    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_page_blocks) LOOP
      BEGIN
        v_page_id := (v_entry ->> 'page_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_page_blocks entry has an invalid page_id: %', v_entry;
      END;
      IF jsonb_typeof(v_entry -> 'blocks') <> 'array' THEN
        RAISE EXCEPTION 'p_page_blocks entry for page % must contain a blocks array', v_page_id;
      END IF;
      UPDATE public.website_pages
      SET blocks = v_entry -> 'blocks',
          updated_at = pg_catalog.now()
      WHERE id = v_page_id
        AND website_id = p_website_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Page % does not belong to website %', v_page_id, p_website_id
          USING ERRCODE = 'P0002';
      END IF;
      v_page_count := v_page_count + 1;
    END LOOP;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'website_id', p_website_id,
    'site_title', v_site_title,
    'version', v_draft_version,
    'pages_written', v_page_count,
    'published_at', pg_catalog.now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_content_draft(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_content_draft(UUID, INTEGER, JSONB) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
