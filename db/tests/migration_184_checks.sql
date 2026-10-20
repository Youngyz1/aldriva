-- Rollback-only validation harness for migration 184. Run as a database owner.
BEGIN;

DO $$
DECLARE
  v_user_id uuid;
  v_org_a uuid;
  v_org_b uuid;
  v_section_a uuid;
  v_section_b uuid;
  v_item_a uuid;
  v_item_b uuid;
  v_auto_promo uuid;
  v_code_promo uuid;
  v_draft_promo uuid;
  v_limit_promo uuid;
  v_target_item uuid;
  v_rejected boolean;
  i integer;
BEGIN
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'migration_184_checks requires one auth.users row to create rollback-only organizers';
  END IF;

  INSERT INTO public.organizers(user_id, name) VALUES (v_user_id, 'migration-184-check-a') RETURNING id INTO v_org_a;
  INSERT INTO public.organizers(user_id, name) VALUES (v_user_id, 'migration-184-check-b') RETURNING id INTO v_org_b;
  INSERT INTO public.menu_sections(organizer_id, name) VALUES (v_org_a, 'migration-184-section-a') RETURNING id INTO v_section_a;
  INSERT INTO public.menu_sections(organizer_id, name) VALUES (v_org_b, 'migration-184-section-b') RETURNING id INTO v_section_b;
  INSERT INTO public.menu_items(organizer_id, section_id, name, price) VALUES (v_org_a, v_section_a, 'migration-184-item-a', 10) RETURNING id INTO v_item_a;
  INSERT INTO public.menu_items(organizer_id, section_id, name, price) VALUES (v_org_b, v_section_b, 'migration-184-item-b', 10) RETURNING id INTO v_item_b;

  INSERT INTO public.promotions(organizer_id, name, offer_type, percent_off, status, layout)
    VALUES (v_org_a, 'automatic visible', 'percent_off', 20, 'active', 'banner') RETURNING id INTO v_auto_promo;
  INSERT INTO public.promotions(organizer_id, name, offer_type, percent_off, code, status, layout)
    VALUES (v_org_a, 'code hidden', 'percent_off', 10, 'CHECK10', 'active', 'banner') RETURNING id INTO v_code_promo;
  INSERT INTO public.promotions(organizer_id, name, offer_type, percent_off, status, layout)
    VALUES (v_org_a, 'draft hidden', 'percent_off', 10, 'draft', 'draft', 'banner') RETURNING id INTO v_draft_promo;
  INSERT INTO public.promotions(organizer_id, name, offer_type, percent_off, status, layout)
    VALUES (v_org_a, 'target cap', 'percent_off', 10, 'draft', 'dish_card') RETURNING id INTO v_limit_promo;

  PERFORM set_config('phase4_184.auto_id', v_auto_promo::text, true);
  PERFORM set_config('phase4_184.code_id', v_code_promo::text, true);
  PERFORM set_config('phase4_184.draft_id', v_draft_promo::text, true);

  v_rejected := false;
  BEGIN
    INSERT INTO public.promotions(organizer_id, name, offer_type, status, layout)
      VALUES (v_org_a, 'missing value', 'percent_off', 'draft', 'banner');
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'exactly-one offer value constraint did not reject a missing percent'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.promotions(organizer_id, name, offer_type, percent_off, status, starts_at, ends_at, layout)
      VALUES (v_org_a, 'bad window', 'percent_off', 10, 'draft', now() + interval '2 days', now() + interval '1 day', 'banner');
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'promotion window constraint did not reject starts_at after ends_at'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.promotions(organizer_id, name, offer_type, percent_off, code, status, layout)
      VALUES (v_org_a, 'duplicate code', 'percent_off', 5, 'check10', 'draft', 'banner');
  EXCEPTION WHEN unique_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'case-insensitive per-organizer code uniqueness did not reject duplicate'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.promotion_targets(organizer_id, promotion_id, item_id)
      VALUES (v_org_a, v_auto_promo, v_item_b);
  EXCEPTION WHEN foreign_key_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'cross-organizer promotion target was not rejected'; END IF;

  INSERT INTO public.promotion_targets(organizer_id, promotion_id, item_id) VALUES (v_org_a, v_auto_promo, v_item_a);
  FOR i IN 1..51 LOOP
    INSERT INTO public.menu_items(organizer_id, section_id, name, price)
      VALUES (v_org_a, v_section_a, 'migration-184-limit-' || i, 10) RETURNING id INTO v_target_item;
    IF i <= 50 THEN
      INSERT INTO public.promotion_targets(organizer_id, promotion_id, item_id)
        VALUES (v_org_a, v_limit_promo, v_target_item);
    ELSE
      v_rejected := false;
      BEGIN
        INSERT INTO public.promotion_targets(organizer_id, promotion_id, item_id)
          VALUES (v_org_a, v_limit_promo, v_target_item);
      EXCEPTION WHEN check_violation THEN v_rejected := true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION 'promotion target trigger allowed more than 50 targets'; END IF;
    END IF;
  END LOOP;

  PERFORM set_config('phase4_184.org_a', v_org_a::text, true);
END;
$$;

SET LOCAL ROLE anon;
DO $$
DECLARE
  v_auto_id uuid := current_setting('phase4_184.auto_id')::uuid;
  v_code_id uuid := current_setting('phase4_184.code_id')::uuid;
  v_draft_id uuid := current_setting('phase4_184.draft_id')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.promotions WHERE id = v_auto_id) THEN
    RAISE EXCEPTION 'public role could not see an active automatic promotion inside its window';
  END IF;
  IF EXISTS (SELECT 1 FROM public.promotions WHERE id IN (v_code_id, v_draft_id)) THEN
    RAISE EXCEPTION 'public role can see a code-based or draft promotion';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
