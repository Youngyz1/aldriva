-- ============================================================
-- Migration 255: staff_invitations permission-key RLS (additive)
-- Read, create (INSERT) and revoke (DELETE): workforce.invite, checked at the
-- invitation's own branch_id (NULL branch = business-wide, needs all_branches).
-- INSERT must be status 'pending' with accepted_by / accepted_at NULL.
-- No UPDATE policy. Old policies untouched. The 240/241 guards, the validate
-- trigger and the accept-fields guard still fire.
-- Apply statement by statement (each numbered group together).
-- ============================================================

-- Statement 0: PREFLIGHT
DO $$
BEGIN
  IF to_regclass('public.staff_invitations') IS NULL THEN
    RAISE EXCEPTION '255 PREFLIGHT FAILED: public.staff_invitations missing';
  END IF;
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION '255 PREFLIGHT FAILED: staff_has_permission(uuid,text,uuid) missing';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.staff_invitations'::regclass) THEN
    RAISE EXCEPTION '255 PREFLIGHT FAILED: RLS not enabled on staff_invitations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_permissions WHERE key = 'workforce.invite') THEN
    RAISE EXCEPTION '255 PREFLIGHT FAILED: permission key workforce.invite missing';
  END IF;
END
$$;

-- Statement 1: SELECT policy
DROP POLICY IF EXISTS "Staff permission can read staff invitations" ON public.staff_invitations;
CREATE POLICY "Staff permission can read staff invitations"
  ON public.staff_invitations
  FOR SELECT
  TO authenticated
  USING (
    public.staff_has_permission(staff_invitations.business_id, 'workforce.invite', staff_invitations.branch_id)
  );

-- Statement 2: INSERT (create) policy
DROP POLICY IF EXISTS "Staff permission can create staff invitations" ON public.staff_invitations;
CREATE POLICY "Staff permission can create staff invitations"
  ON public.staff_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    staff_invitations.status = 'pending'
    AND staff_invitations.accepted_by IS NULL
    AND staff_invitations.accepted_at IS NULL
    AND public.staff_has_permission(staff_invitations.business_id, 'workforce.invite', staff_invitations.branch_id)
  );

-- Statement 3: DELETE (revoke) policy
DROP POLICY IF EXISTS "Staff permission can revoke staff invitations" ON public.staff_invitations;
CREATE POLICY "Staff permission can revoke staff invitations"
  ON public.staff_invitations
  FOR DELETE
  TO authenticated
  USING (
    public.staff_has_permission(staff_invitations.business_id, 'workforce.invite', staff_invitations.branch_id)
  );

-- Statement 4: HARD CHECK
DO $$
DECLARE
  v_new int;
  v_bad int;
BEGIN
  SELECT count(*) INTO v_new
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'staff_invitations'
    AND policyname IN (
      'Staff permission can read staff invitations',
      'Staff permission can create staff invitations',
      'Staff permission can revoke staff invitations');
  IF v_new <> 3 THEN
    RAISE EXCEPTION '255 HARD CHECK FAILED: expected 3 new policies, found %', v_new;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'staff_invitations'
    AND p.policyname IN (
      'Staff permission can read staff invitations',
      'Staff permission can create staff invitations',
      'Staff permission can revoke staff invitations')
    AND NOT (
      p.roles = ARRAY['authenticated']::name[]
      AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
          LIKE '%staff_has_permission(business_id, ''workforce.invite''::text, branch_id)%'
      AND (   (p.cmd IN ('SELECT', 'DELETE'))
           OR (p.cmd = 'INSERT'
               AND coalesce(p.with_check, '') LIKE '%pending%'
               AND coalesce(p.with_check, '') LIKE '%accepted_by IS NULL%'
               AND coalesce(p.with_check, '') LIKE '%accepted_at IS NULL%'))
    );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '255 HARD CHECK FAILED: % new policies have the wrong role, key, branch or pending clause', v_bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'staff_invitations'
               AND cmd = 'UPDATE' AND policyname LIKE 'Staff permission%') THEN
    RAISE EXCEPTION '255 HARD CHECK FAILED: a Staff permission UPDATE policy exists (not allowed)';
  END IF;
END
$$;