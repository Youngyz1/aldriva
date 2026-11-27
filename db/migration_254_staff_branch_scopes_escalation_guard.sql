-- ============================================================
-- Migration 254: scope-escalation guard on staff_member_branch_scopes
-- A grant (INSERT) or move (UPDATE of staff_member_id/branch_id) must not activate,
-- on the row's branch, a key the actor does not hold there. Mirrors 241.
-- Exempt: no session, unchanged UPDATE, target all_branches, entity owner/admin,
-- businesses.owner_id, platform admin.
-- Apply statement by statement (each numbered group together).
-- ============================================================

-- Statement 0: PREFLIGHT
DO $$
BEGIN
  IF to_regclass('public.staff_member_branch_scopes') IS NULL THEN
    RAISE EXCEPTION '254 PREFLIGHT FAILED: staff_member_branch_scopes missing';
  END IF;
  IF to_regclass('public.staff_member_roles') IS NULL
     OR to_regclass('public.staff_roles') IS NULL
     OR to_regclass('public.staff_role_permissions') IS NULL
     OR to_regclass('public.staff_permissions') IS NULL THEN
    RAISE EXCEPTION '254 PREFLIGHT FAILED: a staff role/permission table is missing';
  END IF;
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION '254 PREFLIGHT FAILED: staff_has_permission(uuid,text,uuid) missing';
  END IF;
  IF to_regprocedure('public.staff_resolve_business_organizer(uuid)') IS NULL
     OR to_regprocedure('public.is_entity_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION '254 PREFLIGHT FAILED: is_entity_member or staff_resolve_business_organizer missing';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
        AND policyname LIKE 'Staff permission can % staff branch scopes') <> 3 THEN
    RAISE EXCEPTION '254 PREFLIGHT FAILED: the three 253 policies are not all present';
  END IF;
END
$$;

-- Statement 1: guard function (apply as one statement)
CREATE OR REPLACE FUNCTION public.staff_member_branch_scopes_guard_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_business_id uuid;
  v_all boolean;
  v_keys text[];
  v_key text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role / no session

  IF TG_OP = 'UPDATE'
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.staff_member_id IS NOT DISTINCT FROM OLD.staff_member_id THEN
    RETURN NEW; -- nothing that affects reach changed
  END IF;

  v_business_id := NEW.business_id;

  SELECT sm.all_branches INTO v_all
  FROM public.staff_members sm
  WHERE sm.id = NEW.staff_member_id AND sm.business_id = v_business_id;

  -- unknown member: the foreign key refuses it; all_branches: a scope row changes no reach
  IF v_all IS NULL OR v_all THEN RETURN NEW; END IF;

  IF public.is_entity_member(public.staff_resolve_business_organizer(v_business_id), ARRAY['owner','admin'])
     OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id AND b.owner_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN RETURN NEW; END IF;

  SELECT array_agg(DISTINCT sp.key) INTO v_keys
  FROM public.staff_member_roles smr
  JOIN public.staff_roles r ON r.id = smr.role_id
  JOIN public.staff_role_permissions srp ON srp.role_id = r.id
  JOIN public.staff_permissions sp ON sp.id = srp.permission_id
  WHERE smr.staff_member_id = NEW.staff_member_id
    AND smr.is_active
    AND r.is_active
    AND (r.role_scope = 'platform' OR r.business_id = v_business_id);

  IF v_keys IS NULL THEN RETURN NEW; END IF;

  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT (SELECT public.staff_has_permission(v_business_id, v_key, NEW.branch_id)) THEN
      RAISE EXCEPTION 'Cannot grant a branch scope that activates a permission you do not hold on that branch: %', v_key
        USING ERRCODE = '42501', HINT = 'permission_escalation_denied';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Statement 2: lock down EXECUTE
REVOKE ALL ON FUNCTION public.staff_member_branch_scopes_guard_escalation() FROM PUBLIC, anon, authenticated;

-- Statement 3: trigger
DROP TRIGGER IF EXISTS trg_staff_member_branch_scopes_guard_escalation ON public.staff_member_branch_scopes;
CREATE TRIGGER trg_staff_member_branch_scopes_guard_escalation
  BEFORE INSERT OR UPDATE OF staff_member_id, branch_id ON public.staff_member_branch_scopes
  FOR EACH ROW EXECUTE FUNCTION public.staff_member_branch_scopes_guard_escalation();

-- Statement 4: HARD CHECK
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'staff_member_branch_scopes_guard_escalation'
                   AND p.prosecdef) THEN
    RAISE EXCEPTION '254 HARD CHECK FAILED: guard function missing or not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('authenticated', 'public.staff_member_branch_scopes_guard_escalation()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.staff_member_branch_scopes_guard_escalation()', 'EXECUTE') THEN
    RAISE EXCEPTION '254 HARD CHECK FAILED: EXECUTE not revoked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.staff_member_branch_scopes'::regclass
                   AND t.tgname = 'trg_staff_member_branch_scopes_guard_escalation'
                   AND t.tgenabled = 'O'
                   AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT OR UPDATE OF%') THEN
    RAISE EXCEPTION '254 HARD CHECK FAILED: trigger missing, disabled or wrong timing';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.staff_member_branch_scopes'::regclass AND NOT tgisinternal) <> 3 THEN
    RAISE EXCEPTION '254 HARD CHECK FAILED: expected 3 user triggers on the table';
  END IF;
END
$$;