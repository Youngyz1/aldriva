-- db/tests/migration_183_checks.sql
-- Transactional checks for migration 183. Run only after migrations 182/183,
-- as the database owner or service_role. This file always ends with ROLLBACK.
-- It uses two existing organizers and leaves no persistent fixture rows.
--
-- Trigger order checked from the FK definitions and PostgreSQL RI triggers:
-- deleting a group removes the parent row, then its ON DELETE CASCADE actions
-- delete child options. Their BEFORE DELETE cleanup trigger therefore sees no
-- parent group and returns. The assignment cascade removes the assignment rows
-- without running their INSERT/UPDATE validation trigger. A direct option
-- delete is different: the parent group still exists, so the cleanup updates
-- assignments before the option row is deleted; their BEFORE UPDATE validator
-- sees the option and the already-cleaned references.

BEGIN;

DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid;
  v_section_a uuid;
  v_section_b uuid;
  v_item_a uuid;
  v_item_b uuid;
  v_group_id uuid;
  v_option_id uuid;
  v_assignment_id uuid;
  v_library_group_id uuid;
  v_library_option_id uuid;
  v_planned_group_id uuid := gen_random_uuid();
  v_planned_option_id uuid := gen_random_uuid();
  v_planned_assignment_id uuid := gen_random_uuid();
  v_actual_group_id uuid;
  v_caught boolean;
  v_group_count integer;
  v_actual_count integer;
BEGIN
  SELECT id INTO v_org_a FROM public.organizers ORDER BY id LIMIT 1;
  SELECT id INTO v_org_b FROM public.organizers WHERE id <> v_org_a ORDER BY id LIMIT 1;
  IF v_org_a IS NULL OR v_org_b IS NULL THEN
    RAISE EXCEPTION 'migration_183_checks needs two existing organizers';
  END IF;

  INSERT INTO public.menu_sections (organizer_id, name, position)
  VALUES (v_org_a, 'Migration 183 test section A', 998)
  RETURNING id INTO v_section_a;
  INSERT INTO public.menu_sections (organizer_id, name, position)
  VALUES (v_org_b, 'Migration 183 test section B', 998)
  RETURNING id INTO v_section_b;

  INSERT INTO public.menu_items (section_id, organizer_id, name, price, options_source, option_groups)
  VALUES (v_section_a, v_org_a, 'Migration 183 test item A', 10, 'json', '[]'::jsonb)
  RETURNING id INTO v_item_a;
  INSERT INTO public.menu_items (section_id, organizer_id, name, price, options_source, option_groups)
  VALUES (v_section_b, v_org_b, 'Migration 183 test item B', 10, 'json', '[]'::jsonb)
  RETURNING id INTO v_item_b;

  -- A direct option deletion must clear both assignment references.
  INSERT INTO public.menu_option_groups (organizer_id, name, kind, min_select, max_select, is_required)
  VALUES (v_org_a, 'Migration 183 direct delete', 'addon', 0, 1, false)
  RETURNING id INTO v_group_id;
  INSERT INTO public.menu_options (group_id, organizer_id, name, price, position)
  VALUES (v_group_id, v_org_a, 'Delete me directly', 1, 0)
  RETURNING id INTO v_option_id;
  INSERT INTO public.menu_item_option_groups (
    organizer_id, item_id, group_id, hidden_option_ids, price_overrides
  ) VALUES (
    v_org_a, v_item_a, v_group_id, ARRAY[v_option_id], jsonb_build_object(v_option_id::text, 2.5)
  ) RETURNING id INTO v_assignment_id;

  DELETE FROM public.menu_options WHERE id = v_option_id;
  IF EXISTS (
    SELECT 1 FROM public.menu_item_option_groups
     WHERE id = v_assignment_id
       AND (v_option_id = ANY(hidden_option_ids) OR price_overrides ? v_option_id::text)
  ) THEN
    RAISE EXCEPTION 'direct option deletion left a hidden ID or price override';
  END IF;

  -- A group cascade must not invoke assignment validation with a deleted parent.
  INSERT INTO public.menu_option_groups (organizer_id, name, kind, min_select, max_select, is_required)
  VALUES (v_org_a, 'Migration 183 cascade delete', 'addon', 0, 1, false)
  RETURNING id INTO v_group_id;
  INSERT INTO public.menu_options (group_id, organizer_id, name, price, position)
  VALUES (v_group_id, v_org_a, 'Cascade option', 1, 0)
  RETURNING id INTO v_option_id;
  INSERT INTO public.menu_item_option_groups (
    organizer_id, item_id, group_id, hidden_option_ids, price_overrides
  ) VALUES (
    v_org_a, v_item_a, v_group_id, ARRAY[v_option_id], jsonb_build_object(v_option_id::text, 2.5)
  );
  DELETE FROM public.menu_option_groups WHERE id = v_group_id;
  IF EXISTS (SELECT 1 FROM public.menu_options WHERE group_id = v_group_id)
     OR EXISTS (SELECT 1 FROM public.menu_item_option_groups WHERE group_id = v_group_id) THEN
    RAISE EXCEPTION 'group deletion did not cascade to its option and assignments';
  END IF;

  -- Set up an identical active library group so the JSON upgrade must reuse it.
  INSERT INTO public.menu_option_groups (organizer_id, name, kind, min_select, max_select, is_required)
  VALUES (v_org_a, 'Migration 183 Shared Extras', 'addon', 0, 1, false)
  RETURNING id INTO v_library_group_id;
  INSERT INTO public.menu_options (
    group_id, organizer_id, name, description, price, image_url, is_default,
    max_qty, is_available, allergens, position
  ) VALUES (
    v_library_group_id, v_org_a, 'Avocado', NULL, 2.5, NULL, false,
    1, true, '{}'::text[], 0
  ) RETURNING id INTO v_library_option_id;

  -- A mismatched group organizer must be rejected before any insert.
  v_caught := false;
  BEGIN
    PERFORM public.upgrade_menu_item_option_groups(
      v_item_a, v_org_a,
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'organizer_id', v_org_b, 'name', 'Wrong tenant',
        'kind', 'addon', 'min_select', 0, 'max_select', 1, 'is_required', false,
        'position', 0, 'is_active', true
      )), '[]'::jsonb, '[]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'upgrade accepted a group with a mismatched organizer'; END IF;

  -- A mismatched assignment organizer must be rejected.
  v_caught := false;
  BEGIN
    PERFORM public.upgrade_menu_item_option_groups(
      v_item_a, v_org_a,
      jsonb_build_array(jsonb_build_object(
        'id', v_planned_group_id, 'organizer_id', v_org_a, 'name', 'Assignment guard',
        'kind', 'addon', 'min_select', 0, 'max_select', 1, 'is_required', false,
        'position', 0, 'is_active', true
      )), '[]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'organizer_id', v_org_b, 'item_id', v_item_a,
        'group_id', v_planned_group_id, 'position', 0,
        'hidden_option_ids', ARRAY[]::uuid[], 'price_overrides', '{}'::jsonb
      ))
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'upgrade accepted an assignment with a mismatched organizer'; END IF;

  -- An assignment for another menu item must be rejected.
  v_caught := false;
  BEGIN
    PERFORM public.upgrade_menu_item_option_groups(
      v_item_a, v_org_a,
      jsonb_build_array(jsonb_build_object(
        'id', v_planned_group_id, 'organizer_id', v_org_a, 'name', 'Assignment guard',
        'kind', 'addon', 'min_select', 0, 'max_select', 1, 'is_required', false,
        'position', 0, 'is_active', true
      )), '[]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'organizer_id', v_org_a, 'item_id', v_item_b,
        'group_id', v_planned_group_id, 'position', 0,
        'hidden_option_ids', ARRAY[]::uuid[], 'price_overrides', '{}'::jsonb
      ))
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'upgrade accepted an assignment for a different item'; END IF;

  SELECT count(*)::integer INTO v_group_count FROM public.menu_option_groups WHERE organizer_id = v_org_a;
  PERFORM public.upgrade_menu_item_option_groups(
    v_item_a,
    v_org_a,
    jsonb_build_array(jsonb_build_object(
      'id', v_planned_group_id, 'organizer_id', v_org_a,
      'name', '  MIGRATION 183   shared extras ', 'kind', 'addon',
      'min_select', 0, 'max_select', 1, 'is_required', false,
      'position', 0, 'is_active', true, 'legacy_source_item_id', v_item_a,
      'legacy_group_id', 'legacy-extras'
    )),
    jsonb_build_array(jsonb_build_object(
      'id', v_planned_option_id, 'group_id', v_planned_group_id,
      'organizer_id', v_org_a, 'name', ' avocado ', 'description', NULL,
      'price', 2.5, 'image_url', NULL, 'is_default', false, 'max_qty', 1,
      'is_available', true, 'allergens', ARRAY[]::text[], 'position', 0,
      'legacy_option_id', 'legacy-avocado'
    )),
    jsonb_build_array(jsonb_build_object(
      'id', v_planned_assignment_id, 'organizer_id', v_org_a,
      'item_id', v_item_a, 'group_id', v_planned_group_id,
      'position', 0, 'hidden_option_ids', ARRAY[]::uuid[], 'price_overrides', '{}'::jsonb
    ))
  );

  SELECT group_id INTO v_actual_group_id
    FROM public.menu_item_option_groups
   WHERE item_id = v_item_a AND id = v_planned_assignment_id;
  IF v_actual_group_id IS DISTINCT FROM v_library_group_id THEN
    RAISE EXCEPTION 'JSON upgrade did not reuse the identical organizer library group';
  END IF;
  IF EXISTS (SELECT 1 FROM public.menu_option_groups WHERE id = v_planned_group_id)
     OR EXISTS (SELECT 1 FROM public.menu_options WHERE id = v_planned_option_id) THEN
    RAISE EXCEPTION 'JSON upgrade created duplicate group or option rows instead of reusing them';
  END IF;
  SELECT count(*)::integer INTO v_actual_count FROM public.menu_option_groups WHERE organizer_id = v_org_a;
  IF v_actual_count <> v_group_count THEN
    RAISE EXCEPTION 'JSON upgrade changed organizer group count despite finding an identical group';
  END IF;

  RAISE NOTICE 'Migration 183 checks passed: option cleanup, group cascade, reuse, and upgrade tenant/item guards.';
END;
$$;

ROLLBACK;
