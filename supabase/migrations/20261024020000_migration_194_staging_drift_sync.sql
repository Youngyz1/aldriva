-- migration_194_staging_drift_sync.sql
-- Reconcile the rehearsal schema with STAGING's actual catalog for the five
-- objects that differed in the Phase B drift report (B5/B6).
--
-- Source of truth: STAGING, read-only. Every definition below was captured
-- with pg_get_functiondef / pg_get_constraintdef / pg_get_triggerdef and is
-- reproduced verbatim with CR stripped, so all line endings are LF.
--
-- Deliberately NOT included: the ai_conversations.ai_provider column default.

BEGIN;

-- ── A. public.create_website_from_template (staging definition) ─────────────
CREATE OR REPLACE FUNCTION public.create_website_from_template(p_website_id uuid, p_tenant_id uuid, p_slug text, p_site_title text, p_site_tagline text, p_theme_config jsonb, p_header_config jsonb, p_footer_config jsonb, p_status text, p_metadata jsonb, p_pages jsonb, p_navigation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- ── B. public.ensure_romantic_envelope_layout (staging definition) ──────────
CREATE OR REPLACE FUNCTION public.ensure_romantic_envelope_layout(p_layout jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_layout JSONB := CASE WHEN jsonb_typeof(p_layout) = 'object' THEN p_layout ELSE '{}'::jsonb END;
  v_theme JSONB;
  v_classes JSONB;
  v_default_classes JSONB := jsonb_build_object(
    'page', 'min-h-screen bg-[#E6DEC9] text-stone-900 font-serif',
    'section', 'bg-transparent',
    'body', 'font-serif text-stone-700',
    'card', 'bg-white/80 border border-stone-200/50 shadow-md p-5 rounded-xl',
    'heading', 'font-serif text-amber-900 italic text-center font-normal tracking-wide',
    'button', 'bg-amber-800 text-white rounded-full font-serif px-8 py-3 tracking-wider hover:bg-amber-900 transition-all'
  );
  v_defaults JSONB;
  v_existing_blocks JSONB := '[]'::jsonb;
  v_output_blocks JSONB := '[]'::jsonb;
  v_block JSONB;
  v_type TEXT;
  v_core_types TEXT[] := ARRAY['interactive_envelope', 'hero', 'countdown', 'story', 'schedule', 'location_map'];
  v_optional_types TEXT[] := ARRAY['details', 'gallery', 'music', 'action_portal'];
BEGIN
  v_defaults := jsonb_build_array(
    jsonb_build_object('id', 'migration-179-envelope', 'type', 'interactive_envelope', 'content', '{}'::jsonb),
    jsonb_build_object('id', 'migration-179-hero', 'type', 'hero', 'content', jsonb_build_object(
      'eyebrow', jsonb_build_object('$bind', 'eyebrow'),
      'title', jsonb_build_object('$bind', 'title'),
      'subtitle', jsonb_build_object('$bind', 'hostNames'),
      'image', jsonb_build_object('$bind', 'heroImage'),
      'imageAlt', jsonb_build_object('$bind', 'heroImageAlt'),
      'imageFocus', jsonb_build_object('$bind', 'heroImageFocus'),
      'scrollPrompt', jsonb_build_object('$bind', 'scrollPrompt')
    )),
    jsonb_build_object('id', 'migration-179-countdown', 'type', 'countdown', 'content',
      jsonb_build_object('targetDate', jsonb_build_object('$bind', 'eventDate'))),
    jsonb_build_object('id', 'migration-179-story', 'type', 'story', 'content', jsonb_build_object(
      'heading', jsonb_build_object('$bind', 'storyHeadline'),
      'text', jsonb_build_object('$bind', 'storyText'),
      'image', jsonb_build_object('$bind', 'storyImage'),
      'moments', jsonb_build_object('$bind', 'weddingStory')
    )),
    jsonb_build_object('id', 'migration-179-schedule', 'type', 'schedule', 'content',
      jsonb_build_object('timeline', jsonb_build_object('$bind', 'schedule'))),
    jsonb_build_object('id', 'migration-179-location-map', 'type', 'location_map', 'content', jsonb_build_object(
      'latitude', jsonb_build_object('$bind', 'latitude'),
      'longitude', jsonb_build_object('$bind', 'longitude'),
      'venue', jsonb_build_object('$bind', 'venue'),
      'address', jsonb_build_object('$bind', 'address'),
      'city', jsonb_build_object('$bind', 'city')
    )),
    jsonb_build_object('id', 'migration-179-details', 'type', 'details', 'content', jsonb_build_object(
      'title', jsonb_build_object('$bind', 'title'),
      'eventDate', jsonb_build_object('$bind', 'eventDate'),
      'timezone', jsonb_build_object('$bind', 'timezone'),
      'venue', jsonb_build_object('$bind', 'venue'),
      'address', jsonb_build_object('$bind', 'address'),
      'city', jsonb_build_object('$bind', 'city'),
      'parkingNotes', jsonb_build_object('$bind', 'parkingNotes'),
      'dressCode', jsonb_build_object('$bind', 'dressCode'),
      'dressCodeNotes', jsonb_build_object('$bind', 'dressCodeNotes'),
      'additionalNotes', jsonb_build_object('$bind', 'additionalNotes'),
      'venues', jsonb_build_object('$bind', 'venues'),
      'accommodations', jsonb_build_object('$bind', 'accommodations'),
      'partner1Name', jsonb_build_object('$bind', 'partner1Name'),
      'partner2Name', jsonb_build_object('$bind', 'partner2Name'),
      'familyNote', jsonb_build_object('$bind', 'familyNote'),
      'weddingSubtype', jsonb_build_object('$bind', 'weddingSubtype'),
      'colorsOfTheDay', jsonb_build_object('$bind', 'colorsOfTheDay'),
      'registryNote', jsonb_build_object('$bind', 'registryNote'),
      'celebrantName', jsonb_build_object('$bind', 'celebrantName'),
      'ageMilestone', jsonb_build_object('$bind', 'ageMilestone'),
      'theme', jsonb_build_object('$bind', 'theme'),
      'giftNote', jsonb_build_object('$bind', 'giftNote'),
      'hashtag', jsonb_build_object('$bind', 'hashtag')
    )),
    jsonb_build_object('id', 'migration-179-gallery', 'type', 'gallery', 'content',
      jsonb_build_object('images', jsonb_build_object('$bind', 'gallery'))),
    jsonb_build_object('id', 'migration-179-music', 'type', 'music', 'content', jsonb_build_object(
      'audioUrl', jsonb_build_object('$bind', 'musicAudioUrl'),
      'title', jsonb_build_object('$bind', 'musicTitle'),
      'links', jsonb_build_object('$bind', 'musicLinks')
    )),
    jsonb_build_object('id', 'migration-179-action-portal', 'type', 'action_portal', 'content', jsonb_build_object(
      'actionType', 'RSVP_SUBMISSION',
      'guestName', jsonb_build_object('$bind', 'guest.name'),
      'rsvpStatus', jsonb_build_object('$bind', 'guest.rsvpStatus'),
      'seatLabel', jsonb_build_object('$bind', 'seat.label'),
      'qrCode', jsonb_build_object('$bind', 'ticketInstance.qrCode')
    ))
  );

  IF jsonb_typeof(v_layout -> 'layout_blocks') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
      CASE WHEN item.value ->> 'type' = 'romantic_envelope_gate'
        THEN jsonb_set(item.value, '{type}', to_jsonb('interactive_envelope'::TEXT), true)
        ELSE item.value
      END ORDER BY item.ordinality
    ), '[]'::jsonb)
    INTO v_existing_blocks
    FROM jsonb_array_elements(v_layout -> 'layout_blocks') WITH ORDINALITY AS item(value, ordinality);
  END IF;

  FOREACH v_type IN ARRAY v_core_types LOOP
    SELECT item.value INTO v_block
    FROM jsonb_array_elements(v_existing_blocks) AS item(value)
    WHERE item.value ->> 'type' = v_type
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT item.value INTO v_block
      FROM jsonb_array_elements(v_defaults) AS item(value)
      WHERE item.value ->> 'type' = v_type
      LIMIT 1;
    END IF;

    v_output_blocks := v_output_blocks || jsonb_build_array(v_block);
    v_block := NULL;
  END LOOP;

  FOREACH v_type IN ARRAY v_optional_types LOOP
    SELECT item.value INTO v_block
    FROM jsonb_array_elements(v_existing_blocks) AS item(value)
    WHERE item.value ->> 'type' = v_type
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT item.value INTO v_block
      FROM jsonb_array_elements(v_defaults) AS item(value)
      WHERE item.value ->> 'type' = v_type
      LIMIT 1;
    END IF;

    v_output_blocks := v_output_blocks || jsonb_build_array(v_block);
    v_block := NULL;
  END LOOP;

  FOR v_block IN
    SELECT item.value
    FROM jsonb_array_elements(v_existing_blocks) AS item(value)
    WHERE COALESCE(item.value ->> 'type', '') <> ALL(v_core_types || v_optional_types)
  LOOP
    v_output_blocks := v_output_blocks || jsonb_build_array(v_block);
  END LOOP;

  v_theme := CASE WHEN jsonb_typeof(v_layout -> 'global_theme') = 'object'
    THEN v_layout -> 'global_theme' ELSE '{}'::jsonb END;
  v_classes := CASE WHEN jsonb_typeof(v_theme -> 'classes') = 'object'
    THEN v_theme -> 'classes' ELSE '{}'::jsonb END;
  v_theme := v_theme || jsonb_build_object(
    'classes', v_default_classes || v_classes,
    'text_scale', CASE WHEN jsonb_typeof(v_theme -> 'text_scale') = 'number'
      THEN v_theme -> 'text_scale' ELSE '1.0'::jsonb END
  );

  RETURN v_layout || jsonb_build_object(
    'version', COALESCE(v_layout -> 'version', '1'::jsonb),
    'global_theme', v_theme,
    'layout_blocks', v_output_blocks
  );
END;
$function$;

-- ── C. public.orders rider checks (add only when the constraint is absent) ─
DO $migration194$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_rider_name_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_rider_name_check CHECK (((rider_name IS NULL) OR (length(TRIM(BOTH FROM rider_name)) <= 80)));
  END IF;
END
$migration194$;

DO $migration194$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_rider_phone_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_rider_phone_check CHECK (((rider_phone IS NULL) OR (length(TRIM(BOTH FROM rider_phone)) <= 32)));
  END IF;
END
$migration194$;

-- ── D. public.update_organizers_updated_at() + trg_organizers_updated_at ───
CREATE OR REPLACE FUNCTION public.update_organizers_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_organizers_updated_at ON public.organizers;

CREATE TRIGGER trg_organizers_updated_at BEFORE UPDATE ON public.organizers FOR EACH ROW EXECUTE FUNCTION update_organizers_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
