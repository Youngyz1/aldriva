-- migration_129_website_page_drafts_and_publishing_guard.sql
--
-- 1. Dedicated Draft Storage:
--    - Creates website_page_drafts table to isolate working block drafts from website_pages.
--    - Enforces updated_by and auto-incrementing version via trg_set_website_page_draft_metadata.
--    - Enables RLS with tenant-scoped policies (owner, admin, manager, editor).
--    - Explicitly revoked from anon — strictly NO public read policy exists.
--    - Drops website_pages.draft_blocks column (verified 0 non-null rows).
--
-- 2. Live Content Publishing Guard Trigger:
--    - Adds enforce_website_page_publishing_guard() trigger on website_pages.
--    - Enforces that website_id is strictly IMMUTABLE for all tenant members.
--    - Rejects any direct mutation of blocks or status by editor roles.
--    - Rejects direct INSERT with status='published' by editor roles.
--    - Service_role and platform admins are exempted for administrative maintenance.
--
-- 3. publish_page_draft RPC (SECURITY DEFINER):
--    - SET search_path = public, pg_temp to safely resolve unqualified helper calls (is_entity_member).
--    - Verifies caller has owner/admin/manager role on the tenant or is platform admin.
--    - Uses DELETE ... RETURNING to atomically fetch and clear the draft in one transaction.
--    - Strictly raises an exception if no draft row is present (no fallback to existing blocks).
--    - REVOKE ALL from PUBLIC, anon; GRANT EXECUTE to authenticated and service_role.

BEGIN;

-- ── 1. Create website_page_drafts Table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_page_drafts (
  page_id UUID PRIMARY KEY REFERENCES public.website_pages(id) ON DELETE CASCADE,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  version INTEGER NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.website_page_drafts IS 'Isolated working drafts for website pages. Accessible only by tenant team members (owner, admin, manager, editor). Never exposed to anonymous visitors.';

CREATE INDEX IF NOT EXISTS idx_website_page_drafts_page_id ON public.website_page_drafts(page_id);

-- Version & updated_by management trigger
CREATE OR REPLACE FUNCTION public.set_website_page_draft_metadata()
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

DROP TRIGGER IF EXISTS trg_set_website_page_draft_metadata ON public.website_page_drafts;
CREATE TRIGGER trg_set_website_page_draft_metadata
  BEFORE INSERT OR UPDATE ON public.website_page_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_website_page_draft_metadata();

-- Drop draft_blocks column from website_pages (verified 0 non-null rows in production)
ALTER TABLE public.website_pages DROP COLUMN IF EXISTS draft_blocks;

-- ── 2. Tenant RLS for website_page_drafts ──────────────────────────────────

ALTER TABLE public.website_page_drafts ENABLE ROW LEVEL SECURITY;

-- Revoke all direct permissions from anon and public on the drafts table
REVOKE ALL ON TABLE public.website_page_drafts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.website_page_drafts TO authenticated;
GRANT ALL ON TABLE public.website_page_drafts TO service_role;

DROP POLICY IF EXISTS "Tenant team members can view website page drafts" ON public.website_page_drafts;
CREATE POLICY "Tenant team members can view website page drafts"
  ON public.website_page_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_pages wp
      JOIN public.tenant_websites tw ON tw.id = wp.website_id
      WHERE wp.id = website_page_drafts.page_id
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

DROP POLICY IF EXISTS "Tenant team members can insert website page drafts" ON public.website_page_drafts;
CREATE POLICY "Tenant team members can insert website page drafts"
  ON public.website_page_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.website_pages wp
      JOIN public.tenant_websites tw ON tw.id = wp.website_id
      WHERE wp.id = website_page_drafts.page_id
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

DROP POLICY IF EXISTS "Tenant team members can update website page drafts" ON public.website_page_drafts;
CREATE POLICY "Tenant team members can update website page drafts"
  ON public.website_page_drafts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_pages wp
      JOIN public.tenant_websites tw ON tw.id = wp.website_id
      WHERE wp.id = website_page_drafts.page_id
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

DROP POLICY IF EXISTS "Tenant team members can delete website page drafts" ON public.website_page_drafts;
CREATE POLICY "Tenant team members can delete website page drafts"
  ON public.website_page_drafts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_pages wp
      JOIN public.tenant_websites tw ON tw.id = wp.website_id
      WHERE wp.id = website_page_drafts.page_id
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

-- ── 3. Live-Content Guard Trigger on website_pages ─────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_website_page_publishing_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  is_manager_or_admin BOOLEAN := false;
BEGIN
  -- Service role / database superuser bypass
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Platform admin bypass
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_manager_or_admin;

  IF is_manager_or_admin THEN
    RETURN NEW;
  END IF;

  -- Resolve tenant_id from tenant_websites
  SELECT tw.tenant_id INTO v_tenant_id
  FROM public.tenant_websites tw
  WHERE tw.id = NEW.website_id;

  IF v_tenant_id IS NOT NULL THEN
    is_manager_or_admin := public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])
      OR EXISTS (
        SELECT 1 FROM public.organizers
        WHERE organizers.id = v_tenant_id
          AND organizers.user_id = auth.uid()
      );
  END IF;

  -- On INSERT: only managers/owners can create directly with status='published'
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NOT is_manager_or_admin THEN
      RAISE EXCEPTION 'Only owners, admins, and managers can publish website pages directly';
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE: website_id is strictly immutable across websites/tenants
  IF TG_OP = 'UPDATE' THEN
    IF NEW.website_id IS DISTINCT FROM OLD.website_id THEN
      RAISE EXCEPTION 'Page website_id is immutable and cannot be moved across websites';
    END IF;

    IF NOT is_manager_or_admin THEN
      IF (NEW.blocks IS DISTINCT FROM OLD.blocks) THEN
        RAISE EXCEPTION 'Only owners, admins, and managers can publish live page blocks directly';
      END IF;
      IF (NEW.status IS DISTINCT FROM OLD.status) THEN
        RAISE EXCEPTION 'Only owners, admins, and managers can change page publication status';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_website_page_publishing_guard ON public.website_pages;
CREATE TRIGGER trg_enforce_website_page_publishing_guard
  BEFORE INSERT OR UPDATE ON public.website_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_website_page_publishing_guard();

-- ── 4. publish_page_draft RPC (SECURITY DEFINER) ──────────────────────────

CREATE OR REPLACE FUNCTION public.publish_page_draft(
  p_page_id UUID,
  p_expected_version INTEGER DEFAULT NULL
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
  v_draft_blocks JSONB;
  v_draft_version INTEGER;
  v_draft_updated_by UUID;
  v_page_title TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: must be authenticated';
  END IF;

  -- Check if caller is platform admin or service role
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_caller_id AND role = 'admin' AND status = 'active'
    ) INTO v_is_authorized;
  END IF;

  -- Resolve page and tenant
  SELECT tw.tenant_id, wp.title
  INTO v_tenant_id, v_page_title
  FROM public.website_pages wp
  JOIN public.tenant_websites tw ON tw.id = wp.website_id
  WHERE wp.id = p_page_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Page not found: %', p_page_id;
  END IF;

  -- If not platform admin/service role, check tenant ownership (owner/admin/manager)
  IF NOT v_is_authorized THEN
    v_is_authorized := public.is_entity_member(v_tenant_id, ARRAY['owner', 'admin', 'manager'])
      OR EXISTS (
        SELECT 1 FROM public.organizers
        WHERE organizers.id = v_tenant_id
          AND organizers.user_id = v_caller_id
      );
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Forbidden: only owners, admins, and managers can publish page drafts';
  END IF;

  -- Atomically fetch and clear draft matching page_id and expected_version (if provided)
  DELETE FROM public.website_page_drafts
  WHERE page_id = p_page_id
    AND (p_expected_version IS NULL OR version = p_expected_version)
  RETURNING blocks, version, updated_by
  INTO v_draft_blocks, v_draft_version, v_draft_updated_by;

  IF v_draft_blocks IS NULL THEN
    IF p_expected_version IS NOT NULL AND EXISTS (SELECT 1 FROM public.website_page_drafts WHERE page_id = p_page_id) THEN
      RAISE EXCEPTION 'Draft version mismatch for page %: draft was modified concurrently (expected version %)', p_page_id, p_expected_version
        USING ERRCODE = '40001';
    ELSE
      RAISE EXCEPTION 'No draft found for page: %', p_page_id
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Copy draft blocks to live page and set status to published
  UPDATE public.website_pages
  SET blocks = v_draft_blocks,
      status = 'published',
      updated_at = pg_catalog.now()
  WHERE id = p_page_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'page_id', p_page_id,
    'title', v_page_title,
    'version', v_draft_version,
    'published_at', pg_catalog.now()
  );
END;
$$;

-- Revoke all execute privileges from PUBLIC, anon, and authenticated.
-- Service_role ONLY: legitimate publish flows must go through validated server actions.
REVOKE ALL ON FUNCTION public.publish_page_draft(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_page_draft(UUID, INTEGER) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
