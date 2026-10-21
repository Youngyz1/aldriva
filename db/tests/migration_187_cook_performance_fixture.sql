-- needs owner-run SQL
-- STAGING ONLY. NEVER run this script on production.
-- Creates a throwaway business, kitchen, two cooks, and six synthetic orders
-- inside one transaction. The final ROLLBACK removes every fixture row.
-- Replace the UUID below with an existing disposable staging auth.users.id.
-- No real customer data is used or returned by the report function.

BEGIN;

DO $cook_performance_fixture$
DECLARE
  -- Replace this placeholder with an auth.users.id that exists in staging.
  v_owner_user_id uuid := '00000000-0000-0000-0000-000000000187'::uuid;
  v_fixture_business_id uuid := gen_random_uuid();
  v_business_id uuid;
  v_organizer_id uuid;
  v_kitchen_id uuid;
  v_cook_a_id uuid;
  v_cook_b_id uuid;
  v_slug_suffix text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_fixture_order_suffix text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_result_count bigint;
  v_cook_a record;
  v_cook_b record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_user_id) THEN
    RAISE EXCEPTION 'Replace the owner UUID with an existing disposable staging auth.users.id';
  END IF;

  INSERT INTO public.businesses (
    id, owner_id, name, slug, description, industry, category
  ) VALUES (
    v_fixture_business_id,
    v_owner_user_id,
    'Phase 3A Cook Fixture ' || v_slug_suffix,
    'phase-3a-cook-fixture-' || v_slug_suffix,
    'Temporary business used only to verify cook performance reporting.',
    'Food service',
    'Restaurant'
  )
  RETURNING id, organizer_id INTO v_business_id, v_organizer_id;

  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Business insert did not create its organizer relationship';
  END IF;

  INSERT INTO public.business_kitchens (business_id)
  VALUES (v_business_id)
  RETURNING id INTO v_kitchen_id;

  INSERT INTO public.business_workers (
    business_id, kitchen_id, role, full_name, phone, whatsapp_number
  ) VALUES (
    v_business_id, v_kitchen_id, 'cook', 'Fixture Cook A', '+10000000001', '+10000000001'
  ) RETURNING id INTO v_cook_a_id;

  INSERT INTO public.business_workers (
    business_id, kitchen_id, role, full_name, phone, whatsapp_number
  ) VALUES (
    v_business_id, v_kitchen_id, 'cook', 'Fixture Cook B', '+10000000002', '+10000000002'
  ) RETURNING id INTO v_cook_b_id;

  -- Fixtures:
  -- cook_only: one cook performs both intervals (5 and 10 minutes).
  -- manager_skip: manager goes accepted -> ready; no cook interval.
  -- cancelled: cook prepares, then manager cancels; handled, no median sample.
  -- two_cooks: cook A prepares and cook B marks ready; credit each ending event.
  -- range_start: cook event exactly at range_start is included.
  -- range_end: cook event exactly at range_end is excluded.
  INSERT INTO public.orders (
    organizer_id, business_id, order_number, customer_name, customer_phone,
    fulfilment_type, subtotal, total_amount, status, status_history
  )
  SELECT v_organizer_id,
         v_business_id,
         'cookperf-' || v_fixture_order_suffix || '-' || fixture.fixture_key,
         'Synthetic Fixture Customer',
         '+10000000000',
         'pickup',
         10.00,
         10.00,
         fixture.final_status,
         fixture.history
    FROM (VALUES
      (
        'cook_only',
        'ready',
        jsonb_build_array(
          jsonb_build_object('status', 'accepted', 'at', '2026-10-20T12:00:00Z', 'by_user_id', v_owner_user_id::text),
          jsonb_build_object('status', 'preparing', 'at', '2026-10-20T12:05:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_a_id::text, 'worker_name', 'Fixture Cook A'),
          jsonb_build_object('status', 'ready', 'at', '2026-10-20T12:15:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_a_id::text, 'worker_name', 'Fixture Cook A')
        )
      ),
      (
        'manager_skip',
        'ready',
        jsonb_build_array(
          jsonb_build_object('status', 'accepted', 'at', '2026-10-20T12:01:00Z', 'by_user_id', v_owner_user_id::text),
          jsonb_build_object('status', 'ready', 'at', '2026-10-20T12:04:00Z', 'by_user_id', v_owner_user_id::text)
        )
      ),
      (
        'cancelled',
        'cancelled',
        jsonb_build_array(
          jsonb_build_object('status', 'accepted', 'at', '2026-10-20T12:02:00Z', 'by_user_id', v_owner_user_id::text),
          jsonb_build_object('status', 'preparing', 'at', '2026-10-20T12:07:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_a_id::text, 'worker_name', 'Fixture Cook A'),
          jsonb_build_object('status', 'cancelled', 'at', '2026-10-20T12:10:00Z', 'by_user_id', v_owner_user_id::text)
        )
      ),
      (
        'two_cooks',
        'ready',
        jsonb_build_array(
          jsonb_build_object('status', 'accepted', 'at', '2026-10-20T12:03:00Z', 'by_user_id', v_owner_user_id::text),
          jsonb_build_object('status', 'preparing', 'at', '2026-10-20T12:08:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_a_id::text, 'worker_name', 'Fixture Cook A'),
          jsonb_build_object('status', 'ready', 'at', '2026-10-20T12:18:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_b_id::text, 'worker_name', 'Fixture Cook B')
        )
      ),
      (
        'range_start',
        'ready',
        jsonb_build_array(
          jsonb_build_object('status', 'accepted', 'at', '2026-10-20T11:55:00Z', 'by_user_id', v_owner_user_id::text),
          jsonb_build_object('status', 'preparing', 'at', '2026-10-20T12:00:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_a_id::text, 'worker_name', 'Fixture Cook A'),
          jsonb_build_object('status', 'ready', 'at', '2026-10-20T12:20:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_a_id::text, 'worker_name', 'Fixture Cook A')
        )
      ),
      (
        'range_end',
        'ready',
        jsonb_build_array(
          jsonb_build_object('status', 'accepted', 'at', '2026-10-20T12:20:00Z', 'by_user_id', v_owner_user_id::text),
          jsonb_build_object('status', 'preparing', 'at', '2026-10-20T12:25:00Z', 'by_user_id', v_owner_user_id::text),
          jsonb_build_object('status', 'ready', 'at', '2026-10-20T12:30:00Z', 'by_user_id', NULL::text, 'worker_id', v_cook_b_id::text, 'worker_name', 'Fixture Cook B')
        )
      )
    ) AS fixture(fixture_key, final_status, history);

  SELECT count(*)
    INTO v_result_count
    FROM public.get_business_cook_performance(
      v_business_id,
      v_organizer_id,
      '2026-10-20T12:00:00Z'::timestamptz,
      '2026-10-20T12:30:00Z'::timestamptz
    );

  IF v_result_count <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two cook rows; got %', v_result_count;
  END IF;

  SELECT * INTO v_cook_a
    FROM public.get_business_cook_performance(
      v_business_id,
      v_organizer_id,
      '2026-10-20T12:00:00Z'::timestamptz,
      '2026-10-20T12:30:00Z'::timestamptz
    ) AS report_row
   WHERE report_row.cook_worker_id = v_cook_a_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cook A row was not returned';
  END IF;
  IF v_cook_a.cook_name IS DISTINCT FROM 'Fixture Cook A'
     OR v_cook_a.cook_is_active IS DISTINCT FROM true
     OR v_cook_a.orders_handled IS DISTINCT FROM 4::bigint
     OR v_cook_a.accepted_to_preparing_n IS DISTINCT FROM 3::bigint
     OR v_cook_a.accepted_to_preparing_median_minutes IS DISTINCT FROM 5.0::double precision
     OR v_cook_a.preparing_to_ready_n IS DISTINCT FROM 2::bigint
     OR v_cook_a.preparing_to_ready_median_minutes IS DISTINCT FROM 15.0::double precision THEN
    RAISE EXCEPTION 'Cook A metrics mismatch: %', row_to_json(v_cook_a);
  END IF;

  SELECT * INTO v_cook_b
    FROM public.get_business_cook_performance(
      v_business_id,
      v_organizer_id,
      '2026-10-20T12:00:00Z'::timestamptz,
      '2026-10-20T12:30:00Z'::timestamptz
    ) AS report_row
   WHERE report_row.cook_worker_id = v_cook_b_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cook B row was not returned';
  END IF;
  IF v_cook_b.cook_name IS DISTINCT FROM 'Fixture Cook B'
     OR v_cook_b.cook_is_active IS DISTINCT FROM true
     OR v_cook_b.orders_handled IS DISTINCT FROM 1::bigint
     OR v_cook_b.accepted_to_preparing_n IS DISTINCT FROM 0::bigint
     OR v_cook_b.accepted_to_preparing_median_minutes IS NOT NULL
     OR v_cook_b.preparing_to_ready_n IS DISTINCT FROM 1::bigint
     OR v_cook_b.preparing_to_ready_median_minutes IS DISTINCT FROM 10.0::double precision THEN
    RAISE EXCEPTION 'Cook B metrics mismatch: %', row_to_json(v_cook_b);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.get_business_cook_performance(
        v_business_id,
        gen_random_uuid(),
        '2026-10-20T12:00:00Z'::timestamptz,
        '2026-10-20T12:30:00Z'::timestamptz
      )
  ) THEN
    RAISE EXCEPTION 'Mismatched organizer_id must return no rows';
  END IF;

  RAISE NOTICE 'PASS: cook-only, manager-skip, cancelled, two-cook attribution, UTC boundaries, n with NULL median, and business/organizer scope';
END;
$cook_performance_fixture$;

ROLLBACK;
