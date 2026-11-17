-- ============================================================
-- Rollback for migration_241_escalation_guard.sql.
-- Restores the exact migration-231 self-edit body captured from staging.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
-- ============================================================

-- 1. Drop the three escalation triggers.
DROP TRIGGER IF EXISTS trg_staff_role_permissions_guard_escalation ON public.staff_role_permissions;
DROP TRIGGER IF EXISTS trg_staff_member_roles_guard_escalation ON public.staff_member_roles;
DROP TRIGGER IF EXISTS trg_staff_invitations_guard_escalation ON public.staff_invitations;

-- 2. Drop the escalation function (nothing references it after step 1).
DROP FUNCTION IF EXISTS public.staff_guard_permission_escalation();

-- 3. Restore the original staff_members_guard_self_edit body.
CREATE OR REPLACE FUNCTION public.staff_members_guard_self_edit()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.is_entity_member(
          public.staff_resolve_business_organizer(OLD.business_id),
          ARRAY['owner','admin','manager'])
     OR (public.is_staff_branch_manager(OLD.business_id, OLD.branch_id)
          AND OLD.auth_user_id IS DISTINCT FROM auth.uid())
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
  THEN
    RAISE EXCEPTION 'Staff can only update their own phone, email and photo'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;