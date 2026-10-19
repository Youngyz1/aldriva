-- STAGING ONLY. Creates clearly named menu rows for normalized option-group QA.
-- This file has not been run. It reuses one existing staging organizer and is
-- safe to rerun without overwriting edited seed rows. Run cleanup separately.

DO $$
DECLARE
  v_organizer_id uuid;
  v_section_id constant uuid := '18200000-0000-4000-8000-000000000001';
  v_legacy_item_id constant uuid := '18200000-0000-4000-8000-000000000002';
  v_backfill_item_id constant uuid := '18200000-0000-4000-8000-000000000003';
  v_addon_item_id constant uuid := '18200000-0000-4000-8000-000000000004';
  v_size_item_id constant uuid := '18200000-0000-4000-8000-000000000005';
  v_hidden_item_id constant uuid := '18200000-0000-4000-8000-000000000006';
  v_unavailable_item_id constant uuid := '18200000-0000-4000-8000-000000000007';
  v_promo_variant_item_id constant uuid := '18200000-0000-4000-8000-000000000008';
  v_addon_group_id constant uuid := '18210000-0000-4000-8000-000000000001';
  v_size_group_id constant uuid := '18210000-0000-4000-8000-000000000002';
  v_unavailable_group_id constant uuid := '18210000-0000-4000-8000-000000000003';
  v_addon_option_1 constant uuid := '18220000-0000-4000-8000-000000000001';
  v_addon_option_2 constant uuid := '18220000-0000-4000-8000-000000000002';
  v_size_option_1 constant uuid := '18220000-0000-4000-8000-000000000003';
  v_size_option_2 constant uuid := '18220000-0000-4000-8000-000000000004';
  v_size_option_3 constant uuid := '18220000-0000-4000-8000-000000000005';
  v_unavailable_option_1 constant uuid := '18220000-0000-4000-8000-000000000006';
  v_unavailable_option_2 constant uuid := '18220000-0000-4000-8000-000000000007';
BEGIN
  SELECT organizer_id INTO v_organizer_id
    FROM public.menu_sections WHERE id = v_section_id;
  IF v_organizer_id IS NULL THEN
    SELECT id INTO v_organizer_id FROM public.organizers ORDER BY id LIMIT 1;
  END IF;
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'STAGING seed requires an existing organizer';
  END IF;

  INSERT INTO public.menu_sections (id, organizer_id, name, description, position, is_active)
  VALUES (v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Phase 1', 'Temporary QA rows for normalized menu options.', 990, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.menu_items (id, section_id, organizer_id, name, description, price, image_url, dietary_tags, allergens, modifiers, option_groups, promo_price, is_sold_out, position, is_active, is_featured)
  VALUES
    (v_legacy_item_id, v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Legacy JSON fallback', 'Negative legacy add-on remains readable through the JSON path.', 12.00, NULL, '{}', '{}', '[]',
      '[{"id":"legacy-sauce","name":"Legacy sauce","required":false,"min":0,"max":1,"options":[{"id":"legacy-extra","name":"Legacy extra","price_delta":-1.00}]}]'::jsonb,
      NULL, false, 0, true, false),
    (v_backfill_item_id, v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Backfill verification', 'Legacy JSON plus its deterministic normalized backfill copy.', 10.00, NULL, '{}', '{}', '[]',
      '[{"id":"backfill-toppings","name":"Backfill extras","required":false,"min":0,"max":1,"options":[{"id":"backfill-cheese","name":"Backfill cheese","price_delta":2.50}]}]'::jsonb,
      NULL, false, 1, true, false),
    (v_addon_item_id, v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Add-on group', 'Reusable add-ons; Extra cheese can be selected more than once.', 10.00, NULL, '{}', '{}', '[]', '[]'::jsonb, NULL, false, 2, true, false),
    (v_size_item_id, v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Size variant', 'A Size variant replaces the base unit price.', 10.00, NULL, '{}', '{}', '[]', '[]'::jsonb, NULL, false, 3, true, false),
    (v_hidden_item_id, v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Hidden and overridden', 'Legacy decoy must not merge with its normalized assignment.', 11.00, NULL, '{}', '{}', '[]',
      '[{"id":"legacy-decoy","name":"Legacy decoy","required":false,"min":0,"max":1,"options":[{"id":"legacy-decoy-option","name":"Do not show","price_delta":99.00}]}]'::jsonb,
      NULL, false, 4, true, false),
    (v_unavailable_item_id, v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Unavailable option', 'The unavailable choice must not be returned publicly or accepted at checkout.', 9.00, NULL, '{}', '{}', '[]', '[]'::jsonb, NULL, false, 5, true, false),
    (v_promo_variant_item_id, v_section_id, v_organizer_id, '[STAGING OPTION GROUP TEST] Variant ignores promo', 'Select a Size price; the lower promo_price is intentionally ignored.', 15.00, NULL, '{}', '{}', '[]', '[]'::jsonb, 9.00, false, 6, true, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.menu_option_groups (id, organizer_id, name, kind, min_select, max_select, is_required, position, legacy_source_item_id, legacy_group_id)
  VALUES
    (v_addon_group_id, v_organizer_id, 'STAGING — Bowl add-ons', 'addon', 0, 2, false, 0, NULL, NULL),
    (v_size_group_id, v_organizer_id, 'STAGING — Size', 'variant', 1, 1, true, 0, NULL, NULL),
    (v_unavailable_group_id, v_organizer_id, 'STAGING — Availability', 'addon', 0, 1, false, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.menu_options (id, group_id, organizer_id, name, description, price, image_url, is_default, max_qty, is_available, allergens, position)
  VALUES
    (v_addon_option_1, v_addon_group_id, v_organizer_id, 'Extra cheese', NULL, 1.50, NULL, false, 3, true, '{}', 0),
    (v_addon_option_2, v_addon_group_id, v_organizer_id, 'Avocado', NULL, 2.00, NULL, false, 1, true, '{nuts}', 1),
    (v_size_option_1, v_size_group_id, v_organizer_id, 'Small', NULL, 8.00, NULL, true, 1, true, '{}', 0),
    (v_size_option_2, v_size_group_id, v_organizer_id, 'Regular', NULL, 12.00, NULL, false, 1, true, '{}', 1),
    (v_size_option_3, v_size_group_id, v_organizer_id, 'Large', NULL, 16.00, NULL, false, 1, true, '{}', 2),
    (v_unavailable_option_1, v_unavailable_group_id, v_organizer_id, 'Available topping', NULL, 0.75, NULL, false, 1, true, '{}', 0),
    (v_unavailable_option_2, v_unavailable_group_id, v_organizer_id, 'Sold out topping', NULL, 1.25, NULL, false, 1, false, '{}', 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.menu_item_option_groups (organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides)
  VALUES
    (v_organizer_id, v_addon_item_id, v_addon_group_id, 0, '{}', '{}'::jsonb),
    (v_organizer_id, v_size_item_id, v_size_group_id, 0, '{}', '{}'::jsonb),
    (v_organizer_id, v_hidden_item_id, v_addon_group_id, 0, ARRAY[v_addon_option_1]::uuid[], jsonb_build_object(v_addon_option_2::text, 1.25)),
    (v_organizer_id, v_unavailable_item_id, v_unavailable_group_id, 0, '{}', '{}'::jsonb),
    (v_organizer_id, v_promo_variant_item_id, v_size_group_id, 0, '{}', jsonb_build_object(v_size_option_3::text, 17.00))
  ON CONFLICT (item_id, group_id) DO NOTHING;

  -- Deterministic IDs from scripts/backfill-menu-option-groups.cjs for this
  -- legacy source row let --verify compare the copied normalized values.
  INSERT INTO public.menu_option_groups (id, organizer_id, name, kind, min_select, max_select, is_required, position, legacy_source_item_id, legacy_group_id)
  VALUES ('936e6f7c-4c3d-5adc-ad28-cfcb42a610f6', v_organizer_id, 'Backfill extras', 'addon', 0, 1, false, 0, v_backfill_item_id, 'backfill-toppings')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.menu_options (id, group_id, organizer_id, name, description, price, image_url, is_default, max_qty, is_available, allergens, position, legacy_option_id)
  VALUES ('8219c007-cda0-59c2-9bfe-3c1b7ab34a00', '936e6f7c-4c3d-5adc-ad28-cfcb42a610f6', v_organizer_id, 'Backfill cheese', NULL, 2.50, NULL, false, 1, true, '{}', 0, 'backfill-cheese')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.menu_item_option_groups (id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides)
  VALUES ('f2d9da82-e935-5fd8-a2db-8bcf484e0b23', v_organizer_id, v_backfill_item_id, '936e6f7c-4c3d-5adc-ad28-cfcb42a610f6', 0, '{}', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
END;
$$;
