-- ============================================================
-- Migration 240: role rank guard
--   - staff_actor_platform_rank(business) helper
--   - REPLACES staff_guard_privileged_role with a rank comparison
--     (owner grants anything; admin grants admin/manager/viewer;
--      manager grants manager/viewer; viewer grants nothing)
--   - widens trg_staff_member_roles_guard_privileged to also fire on
--     UPDATE OF is_active (reactivation re-grants a role)
--   - invitation INSERT restriction: only status='pending' with
--     accepted_by / accepted_at NULL (closes forged-accepted INSERT)
--
-- ASSUMPTION (plan ground rule 9, owner-unconfirmed): an actor's rank is
-- the highest of businesses.owner_id (=4), entity_members.role, and an
-- active staff-layer platform role. Platform admin bypasses the guard.
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent and safe to re-run.
-- ============================================================

-- 0. PREFLIGHT.
DO $$
BEGIN
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.staff_is_accepting_own_invitation(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 239 functions missing -- aborting 240';
  END IF;
  IF (SELECT count(*) FROM public.staff_roles
      WHERE role_scope = 'platform' AND is_active
        AND platform_role IN ('owner','admin','manager','viewer')) <> 4 THEN
    RAISE EXCEPTION 'the 4 seeded platform roles are not all present and active -- aborting 240';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.staff_member_roles'::regclass
                   AND tgname = 'trg_staff_member_roles_guard_privileged')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = 'public.staff_invitations'::regclass
                      AND tgname = 'trg_staff_invitations_guard_privileged') THEN
    RAISE EXCEPTION 'expected migration-231 privileged-role triggers missing -- aborting 240';
  END IF;
END;
$$;

-- 1. Rank helper. GREATEST: the highest applicable signal wins.
CREATE OR REPLACE FUNCTION public.staff_actor_platform_rank(p_business_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT GREATEST(
    CASE WHEN EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id AND b.owner_id = auth.uid()) THEN 4 ELSE 0 END,
    COALESCE((
      SELECT CASE em.role WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'manager' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END
      FROM public.entity_members em
      WHERE em.organizer_id = public.staff_resolve_business_organizer(p_business_id)
        AND em.user_id = auth.uid()
    ), 0),
    COALESCE((
      SELECT MAX(CASE sr.platform_role WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'manager' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END)
      FROM public.staff_members sm
      JOIN public.staff_member_roles smr ON smr.staff_member_id = sm.id AND smr.is_active
      JOIN public.staff_roles sr ON sr.id = smr.role_id AND sr.is_active AND sr.role_scope = 'platform'
      WHERE sm.business_id = p_business_id AND sm.auth_user_id = auth.uid() AND sm.status = 'active'
    ), 0)
  );
$$;

-- 2. Rank helper privileges.
REVOKE ALL ON FUNCTION public.staff_actor_platform_rank(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_actor_platform_rank(uuid) TO authenticated;

-- 3. Replace staff_guard_privileged_role (same name, same two triggers).
CREATE OR REPLACE FUNCTION public.staff_guard_privileged_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_platform text;
  v_target_rank int;
  v_actor_rank int;
BEGIN
  IF NEW.role_id IS NULL OR auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT platform_role INTO v_platform FROM public.staff_roles WHERE id = NEW.role_id;
  IF v_platform IS NULL THEN RETURN NEW; END IF; -- custom role: governed by the escalation guard (241)

  IF EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active') THEN
    RETURN NEW; -- platform admin is exempt
  END IF;

  -- Accepting your own, already-authorized invitation.
  IF TG_TABLE_NAME = 'staff_member_roles'
     AND public.staff_is_accepting_own_invitation(NEW.business_id, NEW.staff_member_id, NEW.role_id)
  THEN
    RETURN NEW;
  END IF;

  v_target_rank := CASE v_platform WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'manager' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
  v_actor_rank := public.staff_actor_platform_rank(NEW.business_id);

  IF v_actor_rank < v_target_rank THEN
    RAISE EXCEPTION 'Only a sufficiently senior role can assign the % role', v_platform
      USING ERRCODE = '42501', HINT = 'privileged_role_denied';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Guard function privileges.
REVOKE ALL ON FUNCTION public.staff_guard_privileged_role() FROM PUBLIC, anon, authenticated;

-- 5. Widen the staff_member_roles trigger to fire on is_active too.
--    (trg_staff_invitations_guard_privileged is unchanged: no is_active column.)
DROP TRIGGER IF EXISTS trg_staff_member_roles_guard_privileged ON public.staff_member_roles;
CREATE TRIGGER trg_staff_member_roles_guard_privileged
  BEFORE INSERT OR UPDATE OF role_id, is_active ON public.staff_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_privileged_role();

-- 6. Invitation INSERT restriction: new rows must be pending and unaccepted.
DROP POLICY IF EXISTS "Business or branch managers can create staff invitations" ON public.staff_invitations;
CREATE POLICY "Business or branch managers can create staff invitations"
  ON public.staff_invitations FOR INSERT
  WITH CHECK (
    status = 'pending' AND accepted_by IS NULL AND accepted_at IS NULL
    AND (
      is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
      OR is_staff_branch_manager(business_id, branch_id)
      OR EXISTS (SELECT 1 FROM public.profiles
                 WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    )
  );