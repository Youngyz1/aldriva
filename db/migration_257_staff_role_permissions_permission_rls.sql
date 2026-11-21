-- ============================================================
-- Migration 257: staff_role_permissions permission-key RLS (additive)
-- SELECT: workforce.roles.view OR workforce.roles.manage. INSERT / DELETE: workforce.roles.manage.
-- Business roles only (role_scope = 'business'), business-wide (branch NULL = all_branches).
-- No UPDATE policy (change a mapping by delete + insert). No new guard: the existing
-- staff_guard_permission_escalation trigger already checks every key on INSERT / UPDATE.
-- Old policies untouched.
-- Apply statement by statement (each numbered group together).
-- ============================================================

-- Statement 0: PREFLIGHT
DO $$
BEGIN
  IF to_regclass('public.staff_role_permissions') IS NULL
     OR to_regclass('public.staff_roles') IS NULL THEN
    RAISE EXCEPTION '257 PREFLIGHT FAILED: staff_role_permissions or staff_roles missing';
  END IF;
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION '257 PREFLIGHT FAILED: staff_has_permission(uuid,text,uuid) missing';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_role_permissions'::regclass) THEN
    RAISE EXCEPTION '257 PREFLIGHT FAILED: RLS not enabled on staff_role_permissions';
  END IF;
  IF (SELECT count(*) FROM public.staff_permissions
      WHERE key IN ('workforce.roles.view', 'workforce.roles.manage')) <> 2 THEN
    RAISE EXCEPTION '257 PREFLIGHT FAILED: workforce.roles.view / workforce.roles.manage keys missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.staff_role_permissions'::regclass
                   AND t.tgname = 'trg_staff_role_permissions_guard_escalation'
                   AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION '257 PREFLIGHT FAILED: the escalation guard trigger is missing or disabled (257 relies on it)';
  END IF;
END
$$;

-- Statement 1: SELECT policy
DROP POLICY IF EXISTS "Staff permission can read staff role permissions" ON public.staff_role_permissions;
CREATE POLICY "Staff permission can read staff role permissions"
  ON public.staff_role_permissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_roles sr
      WHERE sr.id = staff_role_permissions.role_id
        AND sr.role_scope = 'business'
        AND (public.staff_has_permission(sr.business_id, 'workforce.roles.view', NULL)
             OR public.staff_has_permission(sr.business_id, 'workforce.roles.manage', NULL))
    )
  );

-- Statement 2: INSERT policy
DROP POLICY IF EXISTS "Staff permission can create staff role permissions" ON public.staff_role_permissions;
CREATE POLICY "Staff permission can create staff role permissions"
  ON public.staff_role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_roles sr
      WHERE sr.id = staff_role_permissions.role_id
        AND sr.role_scope = 'business'
        AND public.staff_has_permission(sr.business_id, 'workforce.roles.manage', NULL)
    )
  );

-- Statement 3: DELETE policy
DROP POLICY IF EXISTS "Staff permission can delete staff role permissions" ON public.staff_role_permissions;
CREATE POLICY "Staff permission can delete staff role permissions"
  ON public.staff_role_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_roles sr
      WHERE sr.id = staff_role_permissions.role_id
        AND sr.role_scope = 'business'
        AND public.staff_has_permission(sr.business_id, 'workforce.roles.manage', NULL)
    )
  );

-- Statement 4: HARD CHECK
DO $$
DECLARE
  v_new int;
  v_bad int;
BEGIN
  SELECT count(*) INTO v_new
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_role_permissions'
    AND policyname IN ('Staff permission can read staff role permissions',
                       'Staff permission can create staff role permissions',
                       'Staff permission can delete staff role permissions');
  IF v_new <> 3 THEN
    RAISE EXCEPTION '257 HARD CHECK FAILED: expected 3 new policies, found %', v_new;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'staff_role_permissions'
    AND p.policyname IN ('Staff permission can read staff role permissions',
                         'Staff permission can create staff role permissions',
                         'Staff permission can delete staff role permissions')
    AND NOT (
      p.roles = ARRAY['authenticated']::name[]
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%role_scope = ''business''%'
      AND (   (p.cmd = 'SELECT'
               AND coalesce(p.qual, '') LIKE '%workforce.roles.view%'
               AND coalesce(p.qual, '') LIKE '%workforce.roles.manage%')
           OR (p.cmd = 'INSERT'
               AND coalesce(p.with_check, '') LIKE '%workforce.roles.manage%'
               AND coalesce(p.with_check, '') NOT LIKE '%workforce.roles.view%')
           OR (p.cmd = 'DELETE'
               AND coalesce(p.qual, '') LIKE '%workforce.roles.manage%'
               AND coalesce(p.qual, '') NOT LIKE '%workforce.roles.view%'))
    );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '257 HARD CHECK FAILED: % new policies have the wrong role, key or scope pin', v_bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'staff_role_permissions'
               AND cmd IN ('UPDATE', 'ALL') AND policyname LIKE 'Staff permission%') THEN
    RAISE EXCEPTION '257 HARD CHECK FAILED: a Staff permission UPDATE/ALL policy exists (not allowed)';
  END IF;
END
$$;