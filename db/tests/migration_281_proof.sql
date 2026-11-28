-- migration_281_proof.sql
-- Repo copy: every real ID is a placeholder. Replace ALL <...> values before running.
-- Placeholders: <BUSINESS_UUID> <ORG_UUID> <OWNER_UUID> <BRANCH_MANAGER_UUID> <VIEWER_UUID>
--   <MANAGER_ROLE_UUID> (role that grants branch-manager inventory access)
--   <OUTSIDER_UUID> <CASHIER_NO_MANAGE_UUID> (stand-in, may be the same user)
--   <BRANCH_A_UUID> <BRANCH_B_UUID>
-- The SETUP block clones one existing inventory item and creates 4 test locations,
-- wires the branch manager role and a viewer entity_member. All of it is rolled back.
-- Role-based behavior proof for migration_281_pos_prerequisites.sql.
-- Prerequisites: migration 281 applied. Run as postgres/superuser in the SQL editor.
-- Expected: ends with an intentional exception "PROOF 281: N of N passed (everything rolled back)".
-- Everything (fixtures, helper functions, test rows) is rolled back by that exception.

DO $proof$
DECLARE
  v_biz uuid := '<BUSINESS_UUID>'::uuid;
  v_org uuid := '<ORG_UUID>'::uuid;
  v_owner uuid := '<OWNER_UUID>'::uuid;
  v_bm uuid := '<BRANCH_MANAGER_UUID>'::uuid;
  v_viewer uuid := '<VIEWER_UUID>'::uuid;
  v_mgr_role uuid := '<MANAGER_ROLE_UUID>'::uuid;
  v_out uuid := '<OUTSIDER_UUID>'::uuid;
  v_cashier uuid := '<CASHIER_NO_MANAGE_UUID>'::uuid;
  v_d uuid := '<BRANCH_A_UUID>'::uuid;
  v_m uuid := '<BRANCH_B_UUID>'::uuid;
  v_it uuid := 'b0000000-0000-4000-8000-000000000001'::uuid;
  v_la uuid := 'a0000000-0000-4000-8000-00000000000a'::uuid;
  v_la2 uuid := 'a0000000-0000-4000-8000-0000000000a2'::uuid;
  v_lb uuid := 'a0000000-0000-4000-8000-00000000000b'::uuid;
  v_le uuid := 'a0000000-0000-4000-8000-0000000000e0'::uuid;
  v_ldef uuid := 'a0000000-0000-4000-8000-0000000000d0'::uuid;
  v_other_item uuid := gen_random_uuid();
  v_can text := 'SELECT 1/(CASE WHEN public.inventory_can_manage(%L,%L) THEN 1 ELSE 0 END)';
  v_cannot text := 'SELECT 1/(CASE WHEN public.inventory_can_manage(%L,%L) THEN 0 ELSE 1 END)';
  v_tr text := 'SELECT public.inventory_transfer_stock(%L,%L,%L,%L,%s)';
  v_ad text := 'SELECT public.inventory_apply_movement(%L,%L,%L,%L,%s,%L,NULL,%L,NULL)';
  v_n int; v_pass int; v_total int; v_txt text;
BEGIN
  CREATE TEMP TABLE _proof (n numeric, name text, ok boolean, detail text);

  EXECUTE $f$
  CREATE FUNCTION public.zz_try(p_uid uuid, p_role text, p_sql text) RETURNS text
  LANGUAGE plpgsql AS $b$
  DECLARE v_hint text; v_out text := 'OK';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
    PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
    PERFORM set_config('request.jwt.claim.role', p_role, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    BEGIN
      EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
      v_out := SQLSTATE || ':' || COALESCE(NULLIF(v_hint, ''), SQLERRM);
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
    RETURN v_out;
  END $b$
  $f$;

  EXECUTE $f$
  CREATE FUNCTION public.zz_expect(p_n numeric, p_name text, p_uid uuid, p_role text, p_sql text, p_expect text) RETURNS void
  LANGUAGE plpgsql AS $b$
  DECLARE r text;
  BEGIN
    r := public.zz_try(p_uid, p_role, p_sql);
    INSERT INTO _proof VALUES (p_n, p_name, r LIKE p_expect || '%', r);
  END $b$
  $f$;

  EXECUTE $f$
  CREATE FUNCTION public.zz_bal(p_item uuid, p_loc uuid) RETURNS numeric LANGUAGE sql STABLE AS $b$
    SELECT COALESCE((SELECT on_hand FROM public.inventory_balances
      WHERE item_id = p_item AND location_id = p_loc), -1)
  $b$
  $f$;

  -- ===== SETUP (as postgres; rolled back at the end) =====
  INSERT INTO public.inventory_locations (id, business_id, branch_id, name, is_default, status)
  SELECT v_ldef, v_biz, NULL, 'ZZ Proof default', true, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE business_id = v_biz AND is_default);

  INSERT INTO public.inventory_locations (id, business_id, branch_id, name, is_default, status) VALUES
    (v_la,  v_biz, v_d, 'ZZ Proof A',     false, 'active'),
    (v_la2, v_biz, v_d, 'ZZ Proof A2',    false, 'active'),
    (v_lb,  v_biz, v_m, 'ZZ Proof B',     false, 'active'),
    (v_le,  v_biz, v_d, 'ZZ Proof empty', false, 'active');

  INSERT INTO public.inventory_items
  SELECT (jsonb_populate_record(NULL::public.inventory_items,
           to_jsonb(i) || jsonb_build_object('id', v_it, 'name', 'ZZ Proof item', 'sku', NULL, 'is_active', true))).*
  FROM public.inventory_items i WHERE i.business_id = v_biz LIMIT 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'setup: no existing item to clone; create one in the UI first'; END IF;

  UPDATE public.staff_members SET branch_id = v_d, all_branches = false
   WHERE business_id = v_biz AND auth_user_id = v_bm;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'setup: expected 1 staff row for the manager user, got %', v_n; END IF;

  INSERT INTO public.staff_member_roles (staff_member_id, business_id, role_id, is_active)
  SELECT sm.id, v_biz, v_mgr_role, true FROM public.staff_members sm
   WHERE sm.business_id = v_biz AND sm.auth_user_id = v_bm
  ON CONFLICT DO NOTHING;
  UPDATE public.staff_member_roles smr SET is_active = true
    FROM public.staff_members sm
   WHERE smr.staff_member_id = sm.id AND sm.business_id = v_biz
     AND sm.auth_user_id = v_bm AND smr.role_id = v_mgr_role;

  INSERT INTO public.entity_members (organizer_id, user_id, role) VALUES (v_org, v_viewer, 'viewer');

  -- ===== SANITY: roles resolve as intended =====
  PERFORM public.zz_expect(1, 'setup: branch manager manages own branch', v_bm, 'authenticated', format(v_can, v_biz, v_d), 'OK');
  PERFORM public.zz_expect(2, 'setup: branch manager does not manage other branch', v_bm, 'authenticated', format(v_cannot, v_biz, v_m), 'OK');
  PERFORM public.zz_expect(3, 'setup: viewer cannot manage', v_viewer, 'authenticated', format(v_cannot, v_biz, v_d), 'OK');
  PERFORM public.zz_expect(4, 'setup: outsider cannot manage', v_out, 'authenticated', format(v_cannot, v_biz, v_d), 'OK');
  PERFORM public.zz_expect(5, 'setup: owner manages business-wide', v_owner, 'authenticated', format(v_can, v_biz, NULL::uuid), 'OK');

  -- ===== TRANSFERS =====
  PERFORM public.zz_expect(10, 'owner receives 100 at A', v_owner, 'authenticated', format(v_ad, v_biz, v_it, v_la, 'received', 100, 'proof', 'manual'), 'OK');
  PERFORM public.zz_expect(11, 'owner transfers 30 A to B', v_owner, 'authenticated', format(v_tr, v_biz, v_it, v_la, v_lb, 30), 'OK');
  INSERT INTO _proof SELECT 12, 'balances A=70, B=30 after transfer', public.zz_bal(v_it,v_la) = 70 AND public.zz_bal(v_it,v_lb) = 30,
    'A=' || public.zz_bal(v_it,v_la) || ' B=' || public.zz_bal(v_it,v_lb);

  PERFORM public.zz_expect(13, 'branch manager adjusts own branch', v_bm, 'authenticated', format(v_ad, v_biz, v_it, v_la2, 'received', 5, 'bm adjust', 'manual'), 'OK');
  PERFORM public.zz_expect(14, 'branch manager transfers within own branch', v_bm, 'authenticated', format(v_tr, v_biz, v_it, v_la, v_la2, 10), 'OK');
  PERFORM public.zz_expect(15, 'branch manager cannot adjust other branch (actual 42501)', v_bm, 'authenticated', format(v_ad, v_biz, v_it, v_lb, 'received', 1, 'x', 'manual'), '42501:inventory_forbidden');
  PERFORM public.zz_expect(16, 'branch X cannot touch branch Y (actual 42501 outcome)', v_bm, 'authenticated', format(v_tr, v_biz, v_it, v_la, v_lb, 1), '42501:inventory_forbidden');

  -- ===== DENIALS =====
  PERFORM public.zz_expect(20, 'viewer cannot call wrapper', v_viewer, 'authenticated', format(v_ad, v_biz, v_it, v_la, 'received', 1, 'x', 'manual'), '42501:inventory_forbidden');
  PERFORM public.zz_expect(21, 'outsider cannot call wrapper', v_out, 'authenticated', format(v_ad, v_biz, v_it, v_la, 'received', 1, 'x', 'manual'), '42501:inventory_forbidden');
  PERFORM public.zz_expect(22, 'anon cannot call wrapper', NULL, 'anon', format(v_ad, v_biz, v_it, v_la, 'received', 1, 'x', 'manual'), '42501');

  -- STAND-IN: cashier without inventory manage (same user as outsider). Real cashier proof deferred to the POS sale function.
  PERFORM public.zz_expect(23, 'STAND-IN: cashier/no-manage cannot call wrapper (deferred to POS sale function)', v_cashier, 'authenticated', format(v_ad, v_biz, v_it, v_la, 'sold', -1, 'cashier', 'manual'), '42501:inventory_forbidden');

  -- ===== WRAPPER REFERENCE TYPE / LEDGER / ACTOR =====
  PERFORM public.zz_expect(30, 'wrapper refuses reference_type pos_sale', v_owner, 'authenticated', format(v_ad, v_biz, v_it, v_la, 'received', 1, 'bad ref', 'pos_sale'), '42501:inventory_reference_forbidden');

  -- wrapper accepts manual (guarded call), then check the ledger row by its reason text
  PERFORM public.zz_expect(31, 'wrapper accepts reference_type manual', v_owner, 'authenticated', format(v_ad, v_biz, v_it, v_la, 'received', 2, 'manual ref test', 'manual'), 'OK');
  INSERT INTO _proof SELECT 32, 'ledger row stores reference_type=manual',
    EXISTS (SELECT 1 FROM public.inventory_movements WHERE business_id = v_biz AND reason = 'manual ref test' AND reference_type = 'manual'), '';
  INSERT INTO _proof SELECT 33, 'created_by equals caller (owner)',
    EXISTS (SELECT 1 FROM public.inventory_movements WHERE business_id = v_biz AND reason = 'manual ref test' AND created_by = v_owner), '';

  -- service_role path works
  PERFORM public.zz_expect(34, 'service_role path works', NULL, 'service_role', format(v_ad, v_biz, v_it, v_la, 'received', 1, 'svc', 'manual'), 'OK');

  -- item from another business refused as item_not_found
  PERFORM public.zz_expect(35, 'item from another business refused (inventory_item_not_found)', v_owner, 'authenticated',
    format('SELECT public.inventory_apply_movement(%L::uuid,%L::uuid,%L::uuid,%L::text,%s::numeric,%L::text,NULL::numeric,%L::text,NULL::uuid)', v_biz, v_other_item, v_la, 'received', 1, 'other biz', 'manual'),
    '23514:inventory_item_not_found');

  -- old 7-arg named call still works through wrapper defaults
  PERFORM public.zz_expect(36, 'old 7-arg named call works via wrapper defaults', v_owner, 'authenticated',
    format('SELECT public.inventory_apply_movement(p_business_id:=%L::uuid,p_item_id:=%L::uuid,p_location_id:=%L::uuid,p_type:=%L::text,p_quantity:=%s::numeric,p_reason:=%L::text,p_unit_cost:=NULL::numeric)', v_biz, v_it, v_la2, 'received', 1, '7arg'),
    'OK');

  -- ===== CORE PRIVILEGES =====
  INSERT INTO _proof SELECT 40, 'core not executable by anon',
    NOT has_function_privilege('anon','public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE'), '';
  INSERT INTO _proof SELECT 41, 'core not executable by authenticated',
    NOT has_function_privilege('authenticated','public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE'), '';
  INSERT INTO _proof SELECT 42, 'core not executable by service_role',
    NOT has_function_privilege('service_role','public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE'), '';
  INSERT INTO _proof SELECT 43, 'core not executable by PUBLIC (aclexplode grantee 0)',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid='public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
        AND a.grantee=0 AND a.privilege_type='EXECUTE'
    ), '';

  -- ===== STRUCTURAL =====
  INSERT INTO _proof SELECT 50, 'core FOR SHARE on location row', (SELECT prosrc LIKE '%FOR SHARE%' FROM pg_proc WHERE oid='public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure), '';
  INSERT INTO _proof SELECT 51, 'wrapper delegates to core', (SELECT prosrc ILIKE '%inventory_apply_movement_core%' FROM pg_proc WHERE oid='public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure), '';
  INSERT INTO _proof SELECT 52, 'old 7-arg signature absent', to_regprocedure('public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)') IS NULL, '';

  SELECT count(*) FILTER (WHERE ok), count(*) INTO v_pass, v_total FROM _proof;
  SELECT string_agg(format('%s %s | %s | %s', CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, lpad(n::text, 4), name, COALESCE(detail, '')), E'\n' ORDER BY n)
    INTO v_txt FROM _proof;
  RAISE EXCEPTION 'PROOF 281: % of % passed (everything rolled back)%', v_pass, v_total, chr(10) || v_txt;
END
$proof$;