-- Rollback for migration_231_staff_management.sql
-- Drops only objects created by that migration, in dependency order.
-- Does NOT touch public.business_workers, its is_active column, or the
-- migration_185 trigger -- migration_231 never touched them either.
--
-- DO NOT apply manually -- the owner applies migrations.

BEGIN;

-- Hardening guard triggers first -- explicit, even though DROP TABLE below
-- would remove them anyway, so the function drops further down never race
-- a still-attached trigger.
DROP TRIGGER IF EXISTS trg_staff_members_guard_self_edit ON public.staff_members;
DROP TRIGGER IF EXISTS trg_staff_member_roles_guard_privileged ON public.staff_member_roles;
DROP TRIGGER IF EXISTS trg_staff_invitations_guard_privileged ON public.staff_invitations;
DROP TRIGGER IF EXISTS trg_staff_invitations_validate ON public.staff_invitations;
DROP TRIGGER IF EXISTS trg_staff_assignments_guard_assignee_edit ON public.staff_assignments;

-- Children first (FK dependents), then parents.
DROP TABLE IF EXISTS public.staff_assignments;
DROP TABLE IF EXISTS public.staff_invitations;
DROP TABLE IF EXISTS public.staff_skills;
DROP TABLE IF EXISTS public.staff_time_off;
DROP TABLE IF EXISTS public.staff_availability;
DROP TABLE IF EXISTS public.staff_role_permissions;
DROP TABLE IF EXISTS public.staff_permissions;
DROP TABLE IF EXISTS public.staff_member_roles;
DROP TABLE IF EXISTS public.staff_members;
DROP TABLE IF EXISTS public.staff_roles;

DROP FUNCTION IF EXISTS public.staff_guard_privileged_role();
DROP FUNCTION IF EXISTS public.staff_assignments_guard_assignee_edit();
DROP FUNCTION IF EXISTS public.staff_invitations_validate();
DROP FUNCTION IF EXISTS public.staff_members_guard_self_edit();
DROP FUNCTION IF EXISTS public.staff_invitee_email_matches(text);
DROP FUNCTION IF EXISTS public.validate_staff_member_role_assignment();
DROP FUNCTION IF EXISTS public.staff_touch_updated_at();
DROP FUNCTION IF EXISTS public.staff_is_active_member(uuid);
DROP FUNCTION IF EXISTS public.is_staff_branch_manager(uuid, uuid);
DROP FUNCTION IF EXISTS public.staff_resolve_business_organizer(uuid);

-- Additive constraint from migration_231, section 0. Safe to drop: no
-- staff table references it once the tables above are gone, and dropping
-- it never rejects any pre-existing business_branches row.
ALTER TABLE public.business_branches
  DROP CONSTRAINT IF EXISTS business_branches_id_business_id_key;

COMMIT;

NOTIFY pgrst, 'reload schema';
