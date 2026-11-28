-- ============================================================
-- Migration 256: staff_roles permission-key RLS + guard (additive)
-- INSERT / UPDATE / DELETE of BUSINESS roles: workforce.roles.manage, business-wide
-- (branch NULL, so all_branches is required). SELECT needs no new policy (old read
-- policy already admits active staff). Platform roles untouched.
-- Guard trigger: business_id / role_scope / platform_role immutable and reactivation
-- needs every key held, for actors that are not entity owner/admin, owner_id,
-- platform admin or no-session.
-- Apply statement by statement (each numbered group together).
-- ============================================================

-- Statement 0: PREFLIGHT
DO $$
BEGIN
  IF to_regclass('public.staff_roles') IS NULL
     OR to_regclass('public.staff_role_permissions') IS NULL
     OR to_regclass('public.staff_permissions') IS NULL THEN
    RAISE EXCEPTION '256 PREFLIGHT FAILED: a staff role/permission table is missing';
  END IF;
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION '256 PREFLIGHT FAILED: staff_has_permission(uuid,text,uuid) missing';
  END IF;
  IF to_regprocedure('public.staff_resolve_business_organizer(uuid)') IS NULL
     OR to_regprocedure('public.is_entity_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION '256 PREFLIGHT FAILED: is_entity_member or staff_resolve_business_organizer missing';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_roles'::regclass) THEN
    RAISE EXCEPTION '256 PREFLIGHT FAILED: RLS not enabled on staff_roles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_permissions WHERE key = 'workforce.roles.manage') THEN
    RAISE EXCEPTION '256 PREFLIGHT FAILED: permission key workforce.roles.manage missing';
  END IF;
END
$$;

-- Statement 1: INSERT policy
DROP POLICY IF EXISTS "Staff permission can create staff roles" ON public.staff_roles;
CREATE POLICY "Staff permission can create staff roles"
  ON public.staff_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    staff_roles.role_scope = 'business'
    AND staff_roles.platform_role IS NULL
    AND staff_roles.business_id IS NOT NULL
    AND public.staff_has_permission(staff_roles.business_id, 'workforce.roles.manage', NULL)
  );

-- Statement 2: UPDATE policy
DROP POLICY IF EXISTS "Staff permission can update staff roles" ON public.staff_roles;
CREATE POLICY "Staff permission can update staff roles"
  ON public.staff_roles
  FOR UPDATE
  TO authenticated
  USING (
    staff_roles.role_scope = 'business'
    AND public.staff_has_permission(staff_roles.business_id, 'workforce.roles.manage', NULL)
  )
  WITH CHECK (
    staff_roles.role_scope = 'business'
    AND staff_roles.platform_role IS NULL
    AND public.staff_has_permission(staff_roles.business_id, 'workforce.roles.manage', NULL)
  );

-- Statement 3: DELETE policy
DROP POLICY IF EXISTS "Staff permission can delete staff roles" ON public.staff_roles;
CREATE POLICY "Staff permission can delete staff roles"
  ON public.staff_roles
  FOR DELETE
  TO authenticated
  USING (
    staff_roles.role_scope = 'business'
    AND public.staff_has_permission(staff_roles.business_id, 'workforce.roles.manage', NULL)
  );

-- Statement 4: guard function (apply as one statement)
CREATE OR REPLACE FUNCTION public.staff_roles_guard_staff_layer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_keys text[];
  v_key text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;      -- service role / no session
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.business_id IS NULL THEN RETURN NEW; END IF; -- platform row: other policies govern

  IF public.is_entity_member(public.staff_resolve_business_organizer(OLD.business_id), ARRAY['owner','admin'])
     OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = OLD.business_id AND b.owner_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN RETURN NEW; END IF;

  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.role_scope IS DISTINCT FROM OLD.role_scope
     OR NEW.platform_role IS DISTINCT FROM OLD.platform_role THEN
    RAISE EXCEPTION 'A role cannot be moved to another business or changed to another scope'
      USING ERRCODE = '42501', HINT = 'role_identity_change_denied';
  END IF;

  -- reactivation re-activates every key the role carries for every holder
  IF OLD.is_active = false AND NEW.is_active = true THEN
    SELECT array_agg(DISTINCT sp.key) INTO v_keys
    FROM public.staff_role_permissions srp
    JOIN public.staff_permissions sp ON sp.id = srp.permission_id
    WHERE srp.role_id = OLD.id;

    IF v_keys IS NOT NULL THEN
      FOREACH v_key IN ARRAY v_keys LOOP
        IF NOT (SELECT public.staff_has_permission(OLD.business_id, v_key, NULL)) THEN
          RAISE EXCEPTION 'Cannot reactivate a role that carries a permission you do not hold business-wide: %', v_key
            USING ERRCODE = '42501', HINT = 'permission_escalation_denied';
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Statement 5: lock down EXECUTE
REVOKE ALL ON FUNCTION public.staff_roles_guard_staff_layer() FROM PUBLIC, anon, authenticated;

-- Statement 6: trigger
DROP TRIGGER IF EXISTS trg_staff_roles_guard_staff_layer ON public.staff_roles;
CREATE TRIGGER trg_staff_roles_guard_staff_layer
  BEFORE UPDATE OF business_id, role_scope, platform_role, is_active ON public.staff_roles
  FOR EACH ROW EXECUTE FUNCTION public.staff_roles_guard_staff_layer();

-- Statement 7: HARD CHECK
DO $$
DECLARE
  v_new int;
  v_bad int;
BEGIN
  SELECT count(*) INTO v_new
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_roles'
    AND policyname IN ('Staff permission can create staff roles',
                       'Staff permission can update staff roles',
                       'Staff permission can delete staff roles');
  IF v_new <> 3 THEN
    RAISE EXCEPTION '256 HARD CHECK FAILED: expected 3 new policies, found %', v_new;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'staff_roles'
    AND p.policyname IN ('Staff permission can create staff roles',
                         'Staff permission can update staff roles',
                         'Staff permission can delete staff roles')
    AND NOT (
      p.roles = ARRAY['authenticated']::name[]
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%workforce.roles.manage%'
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%role_scope = ''business''%'
    );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '256 HARD CHECK FAILED: % new policies have the wrong role, key or scope pin', v_bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'staff_roles'
               AND cmd = 'SELECT' AND policyname LIKE 'Staff permission%') THEN
    RAISE EXCEPTION '256 HARD CHECK FAILED: a Staff permission SELECT policy exists (not wanted)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'staff_roles_guard_staff_layer' AND p.prosecdef) THEN
    RAISE EXCEPTION '256 HARD CHECK FAILED: guard function missing or not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('authenticated', 'public.staff_roles_guard_staff_layer()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.staff_roles_guard_staff_layer()', 'EXECUTE') THEN
    RAISE EXCEPTION '256 HARD CHECK FAILED: EXECUTE not revoked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.staff_roles'::regclass
                   AND t.tgname = 'trg_staff_roles_guard_staff_layer' AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION '256 HARD CHECK FAILED: guard trigger missing or disabled';
  END IF;
END
$$;