-- ============================================================
-- Migration 241: permission-escalation guard + self-edit guard rewrite
--   - staff_guard_permission_escalation (NEW -- nothing like it exists on
--     staging): you cannot grant a permission you do not hold yourself,
--     at the scope you are granting it
--   - 3 triggers: staff_role_permissions, staff_member_roles, staff_invitations
--   - staff_members_guard_self_edit REPLACED (adds all_branches to the
--     protected columns, a workforce.update bypass that never applies to
--     your own row, and the accept-invitation bypass)
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent and safe to re-run.
-- ============================================================

-- 0. PREFLIGHT.
DO $$
BEGIN
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.staff_is_accepting_own_invitation(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.staff_actor_platform_rank(uuid)') IS NULL THEN
    RAISE EXCEPTION 'migration 239/240 functions missing -- aborting 241';
  END IF;
  IF to_regclass('public.staff_member_branch_scopes') IS NULL
     OR to_regclass('public.staff_role_permissions') IS NULL
     OR to_regclass('public.staff_member_roles') IS NULL
     OR to_regclass('public.staff_invitations') IS NULL THEN
    RAISE EXCEPTION 'required staff tables missing -- aborting 241';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.staff_members'::regclass
                   AND tgname = 'trg_staff_members_guard_self_edit') THEN
    RAISE EXCEPTION 'trg_staff_members_guard_self_edit missing -- aborting 241';
  END IF;
END;
$$;

-- 1. Escalation guard function.
CREATE OR REPLACE FUNCTION public.staff_guard_permission_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_target_branch_id uuid;          -- staff_invitations: the invitation's own intended branch
  v_target_all_branches boolean := false;
  v_target_branch_ids uuid[];       -- staff_member_roles: every scope row the target holds
  v_target_keys text[];
  v_key text;
  v_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role / no session

  IF TG_TABLE_NAME = 'staff_role_permissions' THEN
    SELECT business_id INTO v_business_id FROM public.staff_roles WHERE id = NEW.role_id;
    SELECT array_agg(key) INTO v_target_keys FROM public.staff_permissions WHERE id = NEW.permission_id;
    v_target_all_branches := true; -- editing a role affects every branch its holders reach

  ELSIF TG_TABLE_NAME = 'staff_invitations' THEN
    IF NEW.role_id IS NULL THEN RETURN NEW; END IF;
    v_business_id := NEW.business_id;
    v_target_branch_id := NEW.branch_id; -- NULL = business-wide intent
    SELECT array_agg(sp.key) INTO v_target_keys
    FROM public.staff_role_permissions srp JOIN public.staff_permissions sp ON sp.id = srp.permission_id
    WHERE srp.role_id = NEW.role_id;

  ELSE -- staff_member_roles
    IF TG_OP = 'UPDATE' THEN
      IF NEW.is_active = false THEN RETURN NEW; END IF; -- deactivating only shrinks access
    END IF;

    SELECT sm.business_id, sm.all_branches INTO v_business_id, v_target_all_branches
    FROM public.staff_members sm WHERE sm.id = NEW.staff_member_id;

    IF public.staff_is_accepting_own_invitation(v_business_id, NEW.staff_member_id, NEW.role_id) THEN
      RETURN NEW; -- invitation authority was checked when the invitation was created
    END IF;

    SELECT array_agg(sp.key) INTO v_target_keys
    FROM public.staff_role_permissions srp JOIN public.staff_permissions sp ON sp.id = srp.permission_id
    WHERE srp.role_id = NEW.role_id;

    IF NOT v_target_all_branches THEN
      SELECT array_agg(branch_id) INTO v_target_branch_ids
      FROM public.staff_member_branch_scopes WHERE staff_member_id = NEW.staff_member_id;
    END IF;
  END IF;

  IF v_business_id IS NULL THEN RETURN NEW; END IF; -- platform-scope role row, exempt

  -- Organizer owner/admin, the business's owner_id, or platform admin: exempt.
  -- Managers are NOT exempt -- they go through the per-key check below.
  IF public.is_entity_member(public.staff_resolve_business_organizer(v_business_id), ARRAY['owner','admin'])
     OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id AND b.owner_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN RETURN NEW; END IF;

  IF v_target_keys IS NULL THEN RETURN NEW; END IF;

  FOREACH v_key IN ARRAY v_target_keys LOOP
    IF TG_TABLE_NAME = 'staff_invitations' THEN
      IF NOT (SELECT public.staff_has_permission(v_business_id, v_key, v_target_branch_id)) THEN
        RAISE EXCEPTION 'Cannot grant a permission you do not hold yourself: %', v_key
          USING ERRCODE = '42501', HINT = 'permission_escalation_denied';
      END IF;

    ELSIF v_target_all_branches OR v_target_branch_ids IS NULL OR array_length(v_target_branch_ids, 1) IS NULL THEN
      -- role edit, all_branches target, or target with no scope rows: require business-wide holding
      IF NOT (SELECT public.staff_has_permission(v_business_id, v_key, NULL)) THEN
        RAISE EXCEPTION 'Cannot grant a permission you do not hold yourself business-wide: %', v_key
          USING ERRCODE = '42501', HINT = 'permission_escalation_denied';
      END IF;

    ELSE
      FOREACH v_branch_id IN ARRAY v_target_branch_ids LOOP
        IF NOT (SELECT public.staff_has_permission(v_business_id, v_key, v_branch_id)) THEN
          RAISE EXCEPTION 'Cannot grant a permission you do not hold yourself at every branch the target can reach: %', v_key
            USING ERRCODE = '42501', HINT = 'permission_escalation_denied';
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2. Guard function privileges.
REVOKE ALL ON FUNCTION public.staff_guard_permission_escalation() FROM PUBLIC, anon, authenticated;

-- 3. Trigger on staff_role_permissions.
DROP TRIGGER IF EXISTS trg_staff_role_permissions_guard_escalation ON public.staff_role_permissions;
CREATE TRIGGER trg_staff_role_permissions_guard_escalation
  BEFORE INSERT OR UPDATE OF permission_id, role_id ON public.staff_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_permission_escalation();

-- 4. Trigger on staff_member_roles.
DROP TRIGGER IF EXISTS trg_staff_member_roles_guard_escalation ON public.staff_member_roles;
CREATE TRIGGER trg_staff_member_roles_guard_escalation
  BEFORE INSERT OR UPDATE OF role_id, is_active ON public.staff_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_permission_escalation();

-- 5. Trigger on staff_invitations.
DROP TRIGGER IF EXISTS trg_staff_invitations_guard_escalation ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_guard_escalation
  BEFORE INSERT OR UPDATE OF role_id ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_permission_escalation();

-- 6. Replace staff_members_guard_self_edit (same name, same trigger, still SECURITY INVOKER).
--    Changes vs the 231 body: all_branches added to the protected columns;
--    workforce.update bypass that applies only to OTHER people's rows; and the
--    accept-own-invitation bypass (2-argument form: no role to compare).
CREATE OR REPLACE FUNCTION public.staff_members_guard_self_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.is_entity_member(
          public.staff_resolve_business_organizer(OLD.business_id),
          ARRAY['owner','admin','manager'])
     OR (public.is_staff_branch_manager(OLD.business_id, OLD.branch_id)
          AND OLD.auth_user_id IS DISTINCT FROM auth.uid())
     OR (OLD.auth_user_id IS DISTINCT FROM auth.uid()
          AND (SELECT public.staff_has_permission(OLD.business_id, 'workforce.update', OLD.branch_id)))
     OR public.staff_is_accepting_own_invitation(OLD.business_id, OLD.id)
     OR EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin'
            AND p.status = 'active')
  THEN
    RETURN NEW;
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.extra IS DISTINCT FROM OLD.extra
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.all_branches IS DISTINCT FROM OLD.all_branches
  THEN
    RAISE EXCEPTION 'Staff can only update their own phone, email and photo'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;