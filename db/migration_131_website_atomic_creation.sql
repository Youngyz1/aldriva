-- migration_131_website_atomic_creation.sql
-- Atomic template instantiation RPC
--
-- Ensures website + pages + navigation + initial drafts are created atomically.
-- Idempotency is enforced via existing tenant_id UNIQUE + metadata.creationRequestId check
-- (no new table required). If same tenant + same requestId retries, returns existing website
-- without creating duplicates. If tenant already has website with different requestId, raises unique violation.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_website_from_template(
  p_website_id UUID,
  p_tenant_id UUID,
  p_slug TEXT,
  p_site_title TEXT,
  p_site_tagline TEXT,
  p_theme_config JSONB,
  p_header_config JSONB,
  p_footer_config JSONB,
  p_status TEXT,
  p_metadata JSONB,
  p_pages JSONB,
  p_navigation JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.tenant_websites%ROWTYPE;
  v_request_id TEXT;
  v_page JSONB;
  v_inserted_website_id UUID;
  v_page_id UUID;
  v_title TEXT;
  v_slug TEXT;
  v_is_home BOOLEAN;
  v_status TEXT;
  v_blocks JSONB;
  v_sort_order INT;
BEGIN
  v_request_id := p_metadata->>'creationRequestId';

  -- Validate required fields (fail fast before attempting insert)
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID is required' USING ERRCODE = '23502';
  END IF;
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'Slug is required' USING ERRCODE = '23502';
  END IF;
  IF p_site_title IS NULL OR btrim(p_site_title) = '' THEN
    RAISE EXCEPTION 'Site title is required' USING ERRCODE = '23502';
  END IF;
  IF p_pages IS NULL OR jsonb_typeof(p_pages) != 'array' OR jsonb_array_length(p_pages) = 0 THEN
    RAISE EXCEPTION 'At least one page is required' USING ERRCODE = '23502';
  END IF;

  -- Atomic insert with ON CONFLICT as the race boundary for concurrent idempotency.
  -- If two identical requests race, the UNIQUE(tenant_id) constraint guarantees only one succeeds.
  INSERT INTO public.tenant_websites (
    id,
    tenant_id,
    slug,
    site_title,
    site_tagline,
    theme_config,
    header_config,
    footer_config,
    status,
    metadata
  ) VALUES (
    COALESCE(p_website_id, gen_random_uuid()),
    p_tenant_id,
    p_slug,
    p_site_title,
    p_site_tagline,
    COALESCE(p_theme_config, '{"theme":"default","primaryColor":"#ea580c","fontFamily":"sans","borderRadius":"xl","darkMode":false}'::jsonb),
    COALESCE(p_header_config, '{"showLogo":true,"showNav":true,"showCta":true,"ctaLabel":"Get in Touch","ctaHref":"/contact","sticky":true}'::jsonb),
    COALESCE(p_footer_config, '{"showSocials":true,"copyrightText":"","showPoweredBy":true,"customLinks":[]}'::jsonb),
    COALESCE(p_status, 'draft'),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (tenant_id) DO NOTHING
  RETURNING id INTO v_inserted_website_id;

  IF v_inserted_website_id IS NULL THEN
    -- Insert lost the race — fetch the winner and decide idempotency
    SELECT * INTO v_existing FROM public.tenant_websites WHERE tenant_id = p_tenant_id;
    IF FOUND THEN
      IF v_request_id IS NOT NULL AND v_existing.metadata->>'creationRequestId' = v_request_id THEN
        RETURN jsonb_build_object(
          'website_id', v_existing.id,
          'slug', v_existing.slug,
          'idempotent', true
        );
      ELSE
        RAISE EXCEPTION 'Website already exists for tenant %', p_tenant_id USING ERRCODE = '23505';
      END IF;
    ELSE
      -- Should not happen — conflict but no row found
      RAISE EXCEPTION 'Website already exists for tenant %', p_tenant_id USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Insert pages atomically
  FOR v_page IN SELECT * FROM jsonb_array_elements(p_pages)
  LOOP
    v_page_id := COALESCE((v_page->>'id')::UUID, gen_random_uuid());
    v_title := v_page->>'title';
    v_slug := v_page->>'slug';
    v_is_home := COALESCE((v_page->>'is_home')::BOOLEAN, false);
    v_status := COALESCE(v_page->>'status', 'draft');
    v_blocks := COALESCE(v_page->'blocks', '[]'::jsonb);
    v_sort_order := COALESCE((v_page->>'sort_order')::INT, 0);

    IF v_title IS NULL OR btrim(v_title) = '' THEN
      RAISE EXCEPTION 'Page title is required for page %', v_slug USING ERRCODE = '23502';
    END IF;
    IF v_slug IS NULL OR btrim(v_slug) = '' THEN
      RAISE EXCEPTION 'Page slug is required for page %', v_title USING ERRCODE = '23502';
    END IF;

    INSERT INTO public.website_pages (
      id,
      website_id,
      title,
      slug,
      is_home,
      status,
      blocks,
      sort_order
    ) VALUES (
      v_page_id,
      v_inserted_website_id,
      v_title,
      v_slug,
      v_is_home,
      v_status,
      v_blocks,
      v_sort_order
    );

    -- Create initial draft state for this page (existing architecture)
    INSERT INTO public.website_page_drafts (page_id, blocks, version)
    VALUES (v_page_id, v_blocks, 1)
    ON CONFLICT (page_id) DO NOTHING;
  END LOOP;

  -- Insert navigation
  INSERT INTO public.website_navigation (website_id, items)
  VALUES (v_inserted_website_id, COALESCE(p_navigation, '[]'::jsonb));

  RETURN jsonb_build_object(
    'website_id', v_inserted_website_id,
    'slug', p_slug,
    'idempotent', false
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Lock down execution: only service_role can execute directly
REVOKE ALL ON FUNCTION public.create_website_from_template(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_website_from_template(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB, JSONB, JSONB) TO service_role;

COMMENT ON FUNCTION public.create_website_from_template IS 'Atomic creation of tenant website + pages + navigation + drafts. Idempotent via tenant_id UNIQUE + metadata.creationRequestId.';

COMMIT;

NOTIFY pgrst, 'reload schema';
