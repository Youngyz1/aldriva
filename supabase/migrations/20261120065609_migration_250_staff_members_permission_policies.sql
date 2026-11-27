-- Migration 250: permission-key RLS on staff_members (additive) + identity-column guard.
-- Branch rule: staff_has_permission gets the row's branch_id; a NULL-branch row is reachable
-- only by all_branches staff. DELETE is unchanged (head office only).
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT. Idempotent.

-- 0. PREFLIGHT
DO $$
BEGIN
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.staff_is_accepting_own_invitation(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.staff_resolve_business_organizer(uuid)') IS NULL
     OR to_regprocedure('public.is_entity_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'helper functions missing -- aborting 250';
  END IF;
  IF to_regclass('public.staff_members') IS NULL OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.businesses') IS NULL THEN
    RAISE EXCEPTION 'a required table is missing -- aborting 250';
  END IF;
  IF position('-- 249 hardening' IN pg_get_functiondef('public.staff_has_permission(uuid,text,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '249 is not applied -- aborting 250';
  END IF;
END;
$$;

-- 1. Identity-column guard function
CREATE OR REPLACE FUNCTION public.staff_members_guard_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;                     -- service role / no session

  IF TG_OP = 'UPDATE' AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'A staff member cannot be moved to another business'
      USING ERRCODE = '42501', HINT = 'staff_identity_change_denied';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.auth_user_id IS NULL THEN RETURN NEW; END IF;
    v_business := NEW.business_id;
  ELSE
    IF NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id THEN RETURN NEW; END IF;
    v_business := OLD.business_id;
    IF public.staff_is_accepting_own_invitation(OLD.business_id, OLD.id) THEN
      RETURN NEW;                                                    -- accept_staff_invitation
    END IF;
  END IF;

  IF public.is_entity_member(public.staff_resolve_business_organizer(v_business), ARRAY['owner','admin'])
     OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business AND b.owner_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only a business owner, administrator or platform admin can link or unlink a login'
    USING ERRCODE = '42501', HINT = 'staff_identity_change_denied';
END;
$$;

-- 2. Privileges
REVOKE ALL ON FUNCTION public.staff_members_guard_identity() FROM PUBLIC, anon, authenticated;

-- 3. Trigger (drop)
DROP TRIGGER IF EXISTS trg_staff_members_guard_identity ON public.staff_members;

-- 4. Trigger (create)
CREATE TRIGGER trg_staff_members_guard_identity
  BEFORE INSERT OR UPDATE OF business_id, auth_user_id ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_members_guard_identity();

-- 5. SELECT policy
DROP POLICY IF EXISTS "Staff permission can read staff members" ON public.staff_members;
CREATE POLICY "Staff permission can read staff members" ON public.staff_members
  FOR SELECT TO authenticated
  USING ((SELECT public.staff_has_permission(staff_members.business_id, 'workforce.view', staff_members.branch_id)));

-- 6. INSERT policy
DROP POLICY IF EXISTS "Staff permission can create staff members" ON public.staff_members;
CREATE POLICY "Staff permission can create staff members" ON public.staff_members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.staff_has_permission(staff_members.business_id, 'workforce.update', staff_members.branch_id)));

-- 7. UPDATE policy (old row and new row must both be within reach)
DROP POLICY IF EXISTS "Staff permission can update staff members" ON public.staff_members;
CREATE POLICY "Staff permission can update staff members" ON public.staff_members
  FOR UPDATE TO authenticated
  USING ((SELECT public.staff_has_permission(staff_members.business_id, 'workforce.update', staff_members.branch_id)))
  WITH CHECK ((SELECT public.staff_has_permission(staff_members.business_id, 'workforce.update', staff_members.branch_id)));

-- 8. HARD CHECK
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='staff_members'
      AND policyname LIKE 'Staff permission can %') <> 3 THEN
    RAISE EXCEPTION 'expected 3 permission policies on staff_members';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'Staff permission can %'
             AND octet_length(policyname) > 62) THEN
    RAISE EXCEPTION 'a policy name is too long';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.staff_members'::regclass
      AND tgname='trg_staff_members_guard_identity' AND tgenabled='O') <> 1 THEN
    RAISE EXCEPTION 'identity guard trigger missing or disabled';
  END IF;
  IF has_function_privilege('authenticated','public.staff_members_guard_identity()','EXECUTE')
     OR has_function_privilege('anon','public.staff_members_guard_identity()','EXECUTE') THEN
    RAISE EXCEPTION 'guard function must not be callable by authenticated/anon';
  END IF;
END;
$$;