-- migration_179_romantic_envelope_presets.sql
-- Seed the romantic-envelope composition into invitation page JSONB and
-- restore countdown blocks to existing legacy invitation layouts.
-- Migration 178 already introduced event_invitation_pages.blocks_layout;
-- this migration only populates that JSONB projection and snapshot payload.

BEGIN;

ALTER TABLE public.event_invitation_pages
  ADD COLUMN IF NOT EXISTS blocks_layout JSONB;

-- Preserve the pre-migration layout/snapshot values so rollback restores the
-- exact authored JSON instead of trying to infer which pieces were defaults.
CREATE TABLE IF NOT EXISTS public._migration_179_invitation_layout_backup (
  event_id UUID PRIMARY KEY,
  blocks_layout JSONB,
  published_snapshot JSONB
);
REVOKE ALL ON TABLE public._migration_179_invitation_layout_backup FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public._migration_179_invitation_layout_backup ENABLE ROW LEVEL SECURITY;

INSERT INTO public._migration_179_invitation_layout_backup (event_id, blocks_layout, published_snapshot)
SELECT event_id, blocks_layout, published_snapshot
FROM public.event_invitation_pages
WHERE template_id = 'romantic-envelope'
   OR published_snapshot ->> 'template_id' = 'romantic-envelope'
   OR (
     template_id IN ('wedding-romantic', 'gala-editorial', 'black-tie', 'birthday-bold')
     AND (
       jsonb_typeof(blocks_layout -> 'layout_blocks') = 'array'
       OR jsonb_typeof(published_snapshot -> 'blocks_layout' -> 'layout_blocks') = 'array'
     )
   )
ON CONFLICT (event_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_romantic_envelope_layout(p_layout JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
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
  v_core_types TEXT[] := ARRAY['interactive_envelope', 'romantic_hero', 'countdown', 'story', 'schedule', 'location_map'];
  v_optional_types TEXT[] := ARRAY['details', 'gallery', 'music', 'action_portal'];
BEGIN
  v_defaults := jsonb_build_array(
    jsonb_build_object('id', 'migration-179-envelope', 'type', 'interactive_envelope', 'content', '{}'::jsonb),
    jsonb_build_object('id', 'migration-179-hero', 'type', 'romantic_hero', 'content', jsonb_build_object(
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
      CASE
        WHEN item.value ->> 'type' = 'romantic_envelope_gate'
          THEN jsonb_set(item.value, '{type}', to_jsonb('interactive_envelope'::TEXT), true)
        WHEN item.value ->> 'type' = 'hero'
          THEN jsonb_set(item.value, '{type}', to_jsonb('romantic_hero'::TEXT), true)
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
$$;

CREATE OR REPLACE FUNCTION public.append_migration_179_countdown(p_layout JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_layout IS NULL OR jsonb_typeof(p_layout) IS DISTINCT FROM 'object' THEN
    RETURN p_layout;
  END IF;

  IF jsonb_typeof(p_layout -> 'layout_blocks') IS DISTINCT FROM 'array' THEN
    RETURN p_layout;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_layout -> 'layout_blocks') AS item(value)
    WHERE item.value ->> 'type' = 'countdown'
  ) THEN
    RETURN p_layout;
  END IF;

  RETURN jsonb_set(
    p_layout,
    '{layout_blocks}',
    (p_layout -> 'layout_blocks') || jsonb_build_array(jsonb_build_object(
      'id', 'migration-179-countdown',
      'type', 'countdown',
      'content', jsonb_build_object('targetDate', jsonb_build_object('$bind', 'eventDate'))
    )),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_romantic_envelope_layout(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_migration_179_countdown(JSONB) FROM PUBLIC;

UPDATE public.event_invitation_pages
SET blocks_layout = public.ensure_romantic_envelope_layout(blocks_layout)
WHERE template_id = 'romantic-envelope';

UPDATE public.event_invitation_pages
SET published_snapshot = jsonb_set(
  published_snapshot,
  '{blocks_layout}',
  public.ensure_romantic_envelope_layout(published_snapshot -> 'blocks_layout'),
  true
)
WHERE published_snapshot IS NOT NULL
  AND published_snapshot ->> 'template_id' = 'romantic-envelope';

UPDATE public.event_invitation_pages
SET blocks_layout = public.append_migration_179_countdown(blocks_layout)
WHERE template_id IN ('wedding-romantic', 'gala-editorial', 'black-tie', 'birthday-bold')
  AND jsonb_typeof(blocks_layout -> 'layout_blocks') = 'array';

UPDATE public.event_invitation_pages
SET published_snapshot = jsonb_set(
  published_snapshot,
  '{blocks_layout}',
  public.append_migration_179_countdown(published_snapshot -> 'blocks_layout'),
  true
)
WHERE published_snapshot IS NOT NULL
  AND published_snapshot ->> 'template_id' IN ('wedding-romantic', 'gala-editorial', 'black-tie', 'birthday-bold')
  AND jsonb_typeof(published_snapshot -> 'blocks_layout' -> 'layout_blocks') = 'array';

COMMENT ON COLUMN public.event_invitation_pages.blocks_layout IS
  'Optional canonical page composition: {version, global_theme, layout_blocks:[{id,type,content}]}; romantic-envelope is seeded by migration 179.';

COMMIT;

NOTIFY pgrst, 'reload schema';
