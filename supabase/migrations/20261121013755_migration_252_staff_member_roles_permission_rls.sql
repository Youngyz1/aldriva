-- ============================================================
-- Migration 252: staff_member_roles permission-key RLS (additive)
-- Reads: workforce.view. Insert/update/delete: workforce.update.
-- The row's staff member must belong to the row's business; branch reach
-- comes from that staff member's branch_id. Old policies are untouched;
-- guards 240, 241 and 248 still fire after RLS.
-- Apply statement by statement (each numbered group together).
-- ============================================================

-- Statement 0: PREFLIGHT
DO $$
BEGIN
  IF to_regclass('public.staff_member_roles') IS NULL THEN
    RAISE EXCEPTION '252 PREFLIGHT FAILED: public.staff_member_roles missing';
  END IF;
  IF to_regclass('public.staff_members') IS NULL THEN
    RAISE EXCEPTION '252 PREFLIGHT FAILED: public.staff_members missing';
  END IF;
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION '252 PREFLIGHT FAILED: staff_has_permission(uuid,text,uuid) missing';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_member_roles'::regclass) THEN
    RAISE EXCEPTION '252 PREFLIGHT FAILED: RLS not enabled on staff_member_roles';
  END IF;
END
$$;

-- Statement 1: SELECT policy
DROP POLICY IF EXISTS "Staff permission can read staff member roles" ON public.staff_member_roles;
CREATE POLICY "Staff permission can read staff member roles"
  ON public.staff_member_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_roles.staff_member_id
        AND sm.business_id = staff_member_roles.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.view', sm.branch_id)
    )
  );

-- Statement 2: INSERT policy
DROP POLICY IF EXISTS "Staff permission can assign staff member roles" ON public.staff_member_roles;
CREATE POLICY "Staff permission can assign staff member roles"
  ON public.staff_member_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_roles.staff_member_id
        AND sm.business_id = staff_member_roles.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.update', sm.branch_id)
    )
  );

-- Statement 3: UPDATE policy
DROP POLICY IF EXISTS "Staff permission can update staff member roles" ON public.staff_member_roles;
CREATE POLICY "Staff permission can update staff member roles"
  ON public.staff_member_roles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_roles.staff_member_id
        AND sm.business_id = staff_member_roles.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.update', sm.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_roles.staff_member_id
        AND sm.business_id = staff_member_roles.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.update', sm.branch_id)
    )
  );

-- Statement 4: DELETE policy
DROP POLICY IF EXISTS "Staff permission can remove staff member roles" ON public.staff_member_roles;
CREATE POLICY "Staff permission can remove staff member roles"
  ON public.staff_member_roles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_roles.staff_member_id
        AND sm.business_id = staff_member_roles.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.update', sm.branch_id)
    )
  );

-- Statement 5: HARD CHECK
DO $$
DECLARE
  v_new int;
  v_bad int;
BEGIN
  SELECT count(*) INTO v_new
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_member_roles'
    AND policyname IN (
      'Staff permission can read staff member roles',
      'Staff permission can assign staff member roles',
      'Staff permission can update staff member roles',
      'Staff permission can remove staff member roles');
  IF v_new <> 4 THEN
    RAISE EXCEPTION '252 HARD CHECK FAILED: expected 4 new policies, found %', v_new;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_roles'
    AND p.policyname IN (
      'Staff permission can read staff member roles',
      'Staff permission can assign staff member roles',
      'Staff permission can update staff member roles',
      'Staff permission can remove staff member roles')
    AND NOT (
      p.roles = ARRAY['authenticated']::name[]
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%sm.business_id = staff_member_roles.business_id%'
      AND (   (p.cmd = 'SELECT' AND (coalesce(p.qual, '') LIKE '%workforce.view%'))
           OR (p.cmd <> 'SELECT' AND ((coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%workforce.update%')))
    );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '252 HARD CHECK FAILED: % new policies have the wrong role, key or business match', v_bad;
  END IF;
END
$$;