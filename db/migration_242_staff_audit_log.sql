-- ============================================================
-- Migration 242: staff audit log
--   - staff_audit_logs (append-only; clients can only SELECT, via RLS)
--   - 5 auth.uid()-based writers (SECURITY DEFINER triggers):
--       staff_members lifecycle, staff_member_roles, staff_role_permissions,
--       staff_invitations (status), staff_member_branch_scopes
--   - log_branch_write(): service_role-only writer with an explicit actor,
--     for server code that uses the admin client (auth.uid() is NULL there)
--
-- subject_id means "the person/thing affected":
--   staff_members -> the staff member     staff_member_roles -> the staff member
--   staff_member_branch_scopes -> the staff member
--   staff_role_permissions -> the role    staff_invitations -> the invitation
--   business_branches -> the branch
-- No emails or other personal data are stored; only ids, action names and
-- the names of changed columns.
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent and safe to re-run.
-- ============================================================

-- 0. PREFLIGHT.
DO $$
BEGIN
  IF to_regclass('public.staff_members') IS NULL
     OR to_regclass('public.staff_member_roles') IS NULL
     OR to_regclass('public.staff_role_permissions') IS NULL
     OR to_regclass('public.staff_invitations') IS NULL
     OR to_regclass('public.staff_member_branch_scopes') IS NULL
     OR to_regclass('public.businesses') IS NULL THEN
    RAISE EXCEPTION 'required tables missing -- aborting 242';
  END IF;
  IF to_regclass('public.staff_audit_logs') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='staff_audit_logs'
                       AND column_name='related_branch_id') THEN
    RAISE EXCEPTION 'staff_audit_logs already exists with an unexpected shape -- aborting 242';
  END IF;
END;
$$;

-- 1. Table.
CREATE TABLE IF NOT EXISTS public.staff_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_]*$'),
  subject_type text NOT NULL CHECK (subject_type IN (
    'staff_members','staff_member_roles','staff_role_permissions',
    'staff_invitations','staff_member_branch_scopes','business_branches'
  )),
  subject_id uuid NOT NULL,
  related_role_id uuid NULL,
  related_permission_id uuid NULL,
  related_branch_id uuid NULL,
  changed_fields text[] NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes for the two ways the log is read.
CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_business_created
  ON public.staff_audit_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_subject
  ON public.staff_audit_logs (subject_type, subject_id);

-- 3. RLS on; clients get SELECT only (writes happen only in the SECURITY
--    DEFINER functions below).
ALTER TABLE public.staff_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.staff_audit_logs TO authenticated;

-- 4. SELECT policy: organizer owner/admin/manager of the business, or platform admin.
DROP POLICY IF EXISTS "Organizer tier can view staff audit logs" ON public.staff_audit_logs;
CREATE POLICY "Organizer tier can view staff audit logs"
  ON public.staff_audit_logs FOR SELECT
  USING (
    (business_id IS NOT NULL
      AND is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager']))
    OR EXISTS (SELECT 1 FROM public.profiles
               WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- 5. Append-only guard function. The only allowed UPDATE is the FK
--    ON DELETE SET NULL (business or user deleted) nulling exactly one column.
CREATE OR REPLACE FUNCTION public.prevent_staff_audit_log_modification()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       (NEW.business_id IS NULL AND OLD.business_id IS NOT NULL AND NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id)
       OR
       (NEW.actor_user_id IS NULL AND OLD.actor_user_id IS NOT NULL AND NEW.business_id IS NOT DISTINCT FROM OLD.business_id)
     )
     AND NEW.action = OLD.action
     AND NEW.subject_type = OLD.subject_type
     AND NEW.subject_id = OLD.subject_id
     AND NEW.related_role_id IS NOT DISTINCT FROM OLD.related_role_id
     AND NEW.related_permission_id IS NOT DISTINCT FROM OLD.related_permission_id
     AND NEW.related_branch_id IS NOT DISTINCT FROM OLD.related_branch_id
     AND NEW.changed_fields IS NOT DISTINCT FROM OLD.changed_fields
     AND NEW.created_at = OLD.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'staff_audit_logs is append-only' USING ERRCODE = '42501';
END;
$$;

-- 6. Append-only trigger.
DROP TRIGGER IF EXISTS trg_prevent_staff_audit_log_mod ON public.staff_audit_logs;
CREATE TRIGGER trg_prevent_staff_audit_log_mod
  BEFORE UPDATE OR DELETE ON public.staff_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_audit_log_modification();

-- 7. Writer: staff_members lifecycle. Each changed aspect is its own row,
--    so one UPDATE flipping status AND all_branches logs both.
CREATE OR REPLACE FUNCTION public.staff_audit_log_staff_member_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_subject_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_business_id := OLD.business_id; v_subject_id := OLD.id;
  ELSE
    v_business_id := NEW.business_id; v_subject_id := NEW.id;
  END IF;

  -- Business being deleted: its children cascade after the parent row is gone.
  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id)
    VALUES (v_business_id, auth.uid(), 'staff_member_created', 'staff_members', v_subject_id);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id)
    VALUES (v_business_id, auth.uid(), 'staff_member_deleted', 'staff_members', v_subject_id);
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, changed_fields)
      VALUES (v_business_id, auth.uid(), 'staff_member_status_changed', 'staff_members', v_subject_id, ARRAY['status']);
    END IF;
    IF NEW.all_branches IS DISTINCT FROM OLD.all_branches THEN
      INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, changed_fields)
      VALUES (v_business_id, auth.uid(), 'staff_member_scope_changed', 'staff_members', v_subject_id, ARRAY['all_branches']);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_audit_log_staff_member_lifecycle() FROM PUBLIC, anon, authenticated;

-- 8. Trigger: staff_members lifecycle.
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_member_lifecycle ON public.staff_members;
CREATE TRIGGER trg_staff_audit_log_staff_member_lifecycle
  AFTER INSERT OR DELETE OR UPDATE OF status, all_branches ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_audit_log_staff_member_lifecycle();

-- 9. Writer: staff_member_roles (assigned / deactivated / reactivated / changed / removed).
CREATE OR REPLACE FUNCTION public.staff_audit_log_staff_member_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_business_id := OLD.business_id; ELSE v_business_id := NEW.business_id; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id)
    VALUES (v_business_id, auth.uid(), 'staff_role_assigned', 'staff_member_roles', NEW.staff_member_id, NEW.role_id);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id)
    VALUES (v_business_id, auth.uid(), 'staff_role_removed', 'staff_member_roles', OLD.staff_member_id, OLD.role_id);
  ELSE
    IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
      INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id, changed_fields)
      VALUES (v_business_id, auth.uid(), 'staff_role_changed', 'staff_member_roles', NEW.staff_member_id, NEW.role_id, ARRAY['role_id']);
    END IF;
    IF OLD.is_active AND NOT NEW.is_active THEN
      INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id, changed_fields)
      VALUES (v_business_id, auth.uid(), 'staff_role_deactivated', 'staff_member_roles', NEW.staff_member_id, NEW.role_id, ARRAY['is_active']);
    ELSIF NOT OLD.is_active AND NEW.is_active THEN
      INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id, changed_fields)
      VALUES (v_business_id, auth.uid(), 'staff_role_reactivated', 'staff_member_roles', NEW.staff_member_id, NEW.role_id, ARRAY['is_active']);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_audit_log_staff_member_roles() FROM PUBLIC, anon, authenticated;

-- 10. Trigger: staff_member_roles.
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_member_roles ON public.staff_member_roles;
CREATE TRIGGER trg_staff_audit_log_staff_member_roles
  AFTER INSERT OR DELETE OR UPDATE OF role_id, is_active ON public.staff_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.staff_audit_log_staff_member_roles();

-- 11. Helper for the role-permission writer: resolves the role's business and
--     inserts one row. If the role row is already gone (a cascade from deleting
--     the role or its business) nothing is logged.
CREATE OR REPLACE FUNCTION public.staff_audit_log_role_permission(
  p_action text, p_role_id uuid, p_permission_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT sr.business_id INTO v_business_id FROM public.staff_roles sr WHERE sr.id = p_role_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_business_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id, related_permission_id)
  VALUES (v_business_id, auth.uid(), p_action, 'staff_role_permissions', p_role_id, p_role_id, p_permission_id);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_audit_log_role_permission(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 12. Writer: staff_role_permissions (granted / revoked; an UPDATE logs both halves).
CREATE OR REPLACE FUNCTION public.staff_audit_log_staff_role_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role_id IS NOT DISTINCT FROM OLD.role_id
       AND NEW.permission_id IS NOT DISTINCT FROM OLD.permission_id THEN
      RETURN NULL;
    END IF;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.staff_audit_log_role_permission('permission_revoked_from_role', OLD.role_id, OLD.permission_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.staff_audit_log_role_permission('permission_granted_to_role', NEW.role_id, NEW.permission_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_audit_log_staff_role_permissions() FROM PUBLIC, anon, authenticated;

-- 13. Trigger: staff_role_permissions.
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_role_permissions ON public.staff_role_permissions;
CREATE TRIGGER trg_staff_audit_log_staff_role_permissions
  AFTER INSERT OR DELETE OR UPDATE OF role_id, permission_id ON public.staff_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.staff_audit_log_staff_role_permissions();

-- 14. Writer: staff_invitations (created / accepted / revoked / expired / deleted).
CREATE OR REPLACE FUNCTION public.staff_audit_log_staff_invitations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_business_id := OLD.business_id; ELSE v_business_id := NEW.business_id; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id)
    VALUES (v_business_id, auth.uid(), 'staff_invitation_created', 'staff_invitations', NEW.id, NEW.role_id);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id)
    VALUES (v_business_id, auth.uid(), 'staff_invitation_deleted', 'staff_invitations', OLD.id, OLD.role_id);
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_role_id, changed_fields)
      VALUES (
        v_business_id, auth.uid(),
        CASE NEW.status
          WHEN 'accepted' THEN 'staff_invitation_accepted'
          WHEN 'revoked'  THEN 'staff_invitation_revoked'
          WHEN 'expired'  THEN 'staff_invitation_expired'
          ELSE 'staff_invitation_status_changed'
        END,
        'staff_invitations', NEW.id, NEW.role_id, ARRAY['status']);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_audit_log_staff_invitations() FROM PUBLIC, anon, authenticated;

-- 15. Trigger: staff_invitations.
DROP TRIGGER IF EXISTS trg_staff_audit_log_staff_invitations ON public.staff_invitations;
CREATE TRIGGER trg_staff_audit_log_staff_invitations
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.staff_audit_log_staff_invitations();

-- 16. Writer: staff_member_branch_scopes (added / removed).
CREATE OR REPLACE FUNCTION public.staff_audit_log_branch_scopes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_business_id := OLD.business_id; ELSE v_business_id := NEW.business_id; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_branch_id)
    VALUES (v_business_id, auth.uid(), 'staff_branch_scope_added', 'staff_member_branch_scopes', NEW.staff_member_id, NEW.branch_id);
  ELSE
    INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, related_branch_id)
    VALUES (v_business_id, auth.uid(), 'staff_branch_scope_removed', 'staff_member_branch_scopes', OLD.staff_member_id, OLD.branch_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_audit_log_branch_scopes() FROM PUBLIC, anon, authenticated;

-- 17. Trigger: staff_member_branch_scopes.
DROP TRIGGER IF EXISTS trg_staff_audit_log_branch_scopes ON public.staff_member_branch_scopes;
CREATE TRIGGER trg_staff_audit_log_branch_scopes
  AFTER INSERT OR DELETE ON public.staff_member_branch_scopes
  FOR EACH ROW EXECUTE FUNCTION public.staff_audit_log_branch_scopes();

-- 18. log_branch_write: service_role-only, explicit actor. The database cannot
--     verify p_actor; it must be the user id the server-side gate already
--     validated, never a value taken from client input.
CREATE OR REPLACE FUNCTION public.log_branch_write(
  p_business_id uuid,
  p_actor uuid,
  p_action text,
  p_branch_id uuid,
  p_changed_fields text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.staff_audit_logs (business_id, actor_user_id, action, subject_type, subject_id, changed_fields)
  VALUES (p_business_id, p_actor, p_action, 'business_branches', p_branch_id, p_changed_fields);
END;
$$;
REVOKE ALL ON FUNCTION public.log_branch_write(uuid, uuid, text, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_branch_write(uuid, uuid, text, uuid, text[]) TO service_role;