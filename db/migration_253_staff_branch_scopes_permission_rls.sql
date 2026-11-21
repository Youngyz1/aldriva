-- ============================================================
-- Migration 253: staff_member_branch_scopes permission-key RLS (additive)
-- Read: workforce.view. Grant (INSERT) and revoke (DELETE): workforce.update.
-- Reach is checked on the SCOPE ROW's branch_id; the staff member must belong
-- to the row's business. No UPDATE policy (the audit trigger does not log
-- UPDATE; change a scope by revoke + grant). Old policies untouched; the 238
-- primary-branch delete guard still fires.
-- Apply statement by statement (each numbered group together).
-- ============================================================

-- Statement 0: PREFLIGHT
DO $$
BEGIN
  IF to_regclass('public.staff_member_branch_scopes') IS NULL THEN
    RAISE EXCEPTION '253 PREFLIGHT FAILED: public.staff_member_branch_scopes missing';
  END IF;
  IF to_regclass('public.staff_members') IS NULL THEN
    RAISE EXCEPTION '253 PREFLIGHT FAILED: public.staff_members missing';
  END IF;
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION '253 PREFLIGHT FAILED: staff_has_permission(uuid,text,uuid) missing';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_member_branch_scopes'::regclass) THEN
    RAISE EXCEPTION '253 PREFLIGHT FAILED: RLS not enabled on staff_member_branch_scopes';
  END IF;
END
$$;

-- Statement 1: SELECT policy
DROP POLICY IF EXISTS "Staff permission can read staff branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Staff permission can read staff branch scopes"
  ON public.staff_member_branch_scopes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_branch_scopes.staff_member_id
        AND sm.business_id = staff_member_branch_scopes.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.view', staff_member_branch_scopes.branch_id)
    )
  );

-- Statement 2: INSERT (grant) policy
DROP POLICY IF EXISTS "Staff permission can grant staff branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Staff permission can grant staff branch scopes"
  ON public.staff_member_branch_scopes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_branch_scopes.staff_member_id
        AND sm.business_id = staff_member_branch_scopes.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.update', staff_member_branch_scopes.branch_id)
    )
  );

-- Statement 3: DELETE (revoke) policy
DROP POLICY IF EXISTS "Staff permission can revoke staff branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Staff permission can revoke staff branch scopes"
  ON public.staff_member_branch_scopes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_member_branch_scopes.staff_member_id
        AND sm.business_id = staff_member_branch_scopes.business_id
        AND public.staff_has_permission(sm.business_id, 'workforce.update', staff_member_branch_scopes.branch_id)
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
  WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
    AND policyname IN (
      'Staff permission can read staff branch scopes',
      'Staff permission can grant staff branch scopes',
      'Staff permission can revoke staff branch scopes');
  IF v_new <> 3 THEN
    RAISE EXCEPTION '253 HARD CHECK FAILED: expected 3 new policies, found %', v_new;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'staff_member_branch_scopes'
    AND p.policyname IN (
      'Staff permission can read staff branch scopes',
      'Staff permission can grant staff branch scopes',
      'Staff permission can revoke staff branch scopes')
    AND NOT (
      p.roles = ARRAY['authenticated']::name[]
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_has_permission%'
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%sm.business_id = staff_member_branch_scopes.business_id%'
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%staff_member_branch_scopes.branch_id%'
      AND (   (p.cmd = 'SELECT' AND coalesce(p.qual, '') LIKE '%workforce.view%')
           OR (p.cmd IN ('INSERT', 'DELETE')
               AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) LIKE '%workforce.update%'))
    );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '253 HARD CHECK FAILED: % new policies have the wrong role, key, branch or business match', v_bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'staff_member_branch_scopes'
               AND cmd = 'UPDATE' AND policyname LIKE 'Staff permission%') THEN
    RAISE EXCEPTION '253 HARD CHECK FAILED: a Staff permission UPDATE policy exists (not allowed)';
  END IF;
END
$$;