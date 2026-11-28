-- Migration 248: rank guard on DELETE of staff_member_roles (closes gap 4).
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT. Idempotent.
-- Last-owner guard deliberately omitted: businesses.owner_id is NOT NULL, so a business
-- always has an owner.

-- 0. PREFLIGHT
DO $$
BEGIN
  IF to_regprocedure('public.staff_actor_platform_rank(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_actor_platform_rank(uuid) missing -- aborting 248';
  END IF;
  IF to_regclass('public.staff_member_roles') IS NULL OR to_regclass('public.staff_roles') IS NULL
     OR to_regclass('public.businesses') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'a required table is missing -- aborting 248';
  END IF;
END;
$$;

-- 1. Function
CREATE OR REPLACE FUNCTION public.staff_guard_role_delete_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_platform text;
  v_target_rank int;
  v_actor_rank int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN OLD; END IF;                     -- service role / no session
  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = OLD.business_id) THEN
    RETURN OLD;                                                      -- business cascade
  END IF;

  SELECT sr.platform_role INTO v_platform FROM public.staff_roles sr
   WHERE sr.id = OLD.role_id AND sr.role_scope = 'platform';
  IF v_platform IS NULL THEN RETURN OLD; END IF;                     -- custom role: not rank-gated

  IF EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active') THEN
    RETURN OLD;                                                      -- platform admin exempt
  END IF;

  v_target_rank := CASE v_platform WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'manager' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
  v_actor_rank := public.staff_actor_platform_rank(OLD.business_id);

  IF v_actor_rank < v_target_rank THEN
    RAISE EXCEPTION 'Only a sufficiently senior role can remove the % role', v_platform
      USING ERRCODE = '42501', HINT = 'privileged_role_denied';
  END IF;
  RETURN OLD;
END;
$$;

-- 2. Privileges
REVOKE ALL ON FUNCTION public.staff_guard_role_delete_rank() FROM PUBLIC, anon, authenticated;

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_staff_member_roles_guard_delete_rank ON public.staff_member_roles;
CREATE TRIGGER trg_staff_member_roles_guard_delete_rank
  BEFORE DELETE ON public.staff_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_role_delete_rank();

-- 4. HARD CHECK
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.staff_member_roles'::regclass AND tgenabled = 'O'
        AND tgname = 'trg_staff_member_roles_guard_delete_rank') <> 1 THEN
    RAISE EXCEPTION 'delete rank trigger missing or disabled';
  END IF;
  IF has_function_privilege('authenticated','public.staff_guard_role_delete_rank()','EXECUTE')
     OR has_function_privilege('anon','public.staff_guard_role_delete_rank()','EXECUTE') THEN
    RAISE EXCEPTION 'guard function must not be callable by authenticated/anon';
  END IF;
END;
$$;