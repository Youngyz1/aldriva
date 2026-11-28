-- ============================================================
-- Rollback for migration_240_role_rank_guard.sql.
-- Restores the exact migration-231 bodies captured from staging.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
-- ============================================================

-- 1. Restore the original invitation INSERT policy (no status/accepted checks).
DROP POLICY IF EXISTS "Business or branch managers can create staff invitations" ON public.staff_invitations;
CREATE POLICY "Business or branch managers can create staff invitations"
  ON public.staff_invitations FOR INSERT
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM public.profiles
               WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- 2. Restore the original trigger column list.
DROP TRIGGER IF EXISTS trg_staff_member_roles_guard_privileged ON public.staff_member_roles;
CREATE TRIGGER trg_staff_member_roles_guard_privileged
  BEFORE INSERT OR UPDATE OF role_id ON public.staff_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_privileged_role();

-- 3. Restore the original staff_guard_privileged_role body.
CREATE OR REPLACE FUNCTION public.staff_guard_privileged_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_platform text;
BEGIN
  IF NEW.role_id IS NULL OR auth.uid() IS NULL
     OR public.is_entity_member(
          public.staff_resolve_business_organizer(NEW.business_id),
          ARRAY['owner','admin','manager'])
     OR EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN
    RETURN NEW;
  END IF;
  SELECT platform_role INTO v_platform FROM public.staff_roles WHERE id = NEW.role_id;
  IF v_platform IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Only head office can assign the % role', v_platform
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_guard_privileged_role() FROM PUBLIC, anon, authenticated;

-- 4. Drop the rank helper (nothing references it after step 3).
DROP FUNCTION IF EXISTS public.staff_actor_platform_rank(uuid);