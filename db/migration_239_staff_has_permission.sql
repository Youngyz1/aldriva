-- ============================================================
-- Migration 239: staff_has_permission
--   - staff_is_accepting_own_invitation (bypass helper, used by 240/246)
--   - staff_has_permission(business, key, branch)
--   - staff_invitations_guard_accept_fields (sole defense against forged
--     invitation acceptance -- verified enabled, see statement 5)
--
-- Additions only: no existing function or trigger is replaced.
-- (The staff_members_guard_self_edit rewrite moves to 240.)
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent and safe to re-run.
-- ============================================================

-- 0a. PREFLIGHT: everything this migration reads already exists.
DO $$
BEGIN
  IF to_regclass('public.staff_member_branch_scopes') IS NULL THEN
    RAISE EXCEPTION 'staff_member_branch_scopes missing (migration 238) -- aborting 239';
  END IF;
  IF to_regclass('public.entity_role_permission_defaults') IS NULL THEN
    RAISE EXCEPTION 'entity_role_permission_defaults missing (migration 237) -- aborting 239';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_members' AND column_name='all_branches') THEN
    RAISE EXCEPTION 'staff_members.all_branches missing (migration 238) -- aborting 239';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_permissions WHERE key LIKE '%.%') THEN
    RAISE EXCEPTION 'dotted permission keys missing (migration 235) -- aborting 239';
  END IF;
  IF (SELECT count(DISTINCT proname) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('is_entity_member','staff_resolve_business_organizer')) <> 2 THEN
    RAISE EXCEPTION 'required helper functions missing -- aborting 239';
  END IF;
END;
$$;

-- 0b. PREFLIGHT: if staff_invitations.status has a CHECK, it must allow 'accepted'.
DO $$
DECLARE v_def text;
BEGIN
  SELECT string_agg(pg_get_constraintdef(oid), ' ') INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.staff_invitations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ~ 'status';
  IF v_def IS NOT NULL AND v_def NOT LIKE '%accepted%' THEN
    RAISE EXCEPTION 'staff_invitations.status CHECK does not allow accepted: % -- aborting 239', v_def;
  END IF;
END;
$$;

-- 1. Accept-bypass helper. transaction-scoped now(): accept_staff_invitation
--    (migration 246) must set accepted_at with now(), not clock_timestamp().
CREATE OR REPLACE FUNCTION public.staff_is_accepting_own_invitation(
  p_business_id uuid, p_staff_member_id uuid, p_role_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_invitations si
    WHERE si.business_id = p_business_id
      AND si.staff_member_id = p_staff_member_id
      AND (p_role_id IS NULL OR si.role_id = p_role_id)
      AND si.accepted_by = auth.uid()
      AND si.status = 'accepted'
      AND si.accepted_at = now()
  );
$$;

-- 2. Helper privileges.
REVOKE ALL ON FUNCTION public.staff_is_accepting_own_invitation(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_is_accepting_own_invitation(uuid, uuid, uuid) TO authenticated;

-- 3. staff_has_permission. Any one passing clause is enough. Branch reach
--    (all_branches or a scope row) applies only to clause 3.
--    NOT enforced here: staff_permission_offering_gates (application layer only).
CREATE OR REPLACE FUNCTION public.staff_has_permission(
  p_business_id uuid,
  p_permission_key text,
  p_branch_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    -- 1. Organizer-tier owner/admin, or active platform admin.
    public.is_entity_member(public.staff_resolve_business_organizer(p_business_id), ARRAY['owner','admin'])
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')

    -- 1b. Active staff member holding an active seeded 'owner' platform role.
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      JOIN public.staff_member_roles smr ON smr.staff_member_id = sm.id AND smr.is_active
      JOIN public.staff_roles sr ON sr.id = smr.role_id AND sr.platform_role = 'owner' AND sr.is_active
      WHERE sm.business_id = p_business_id AND sm.auth_user_id = auth.uid() AND sm.status = 'active'
    )

    -- 1c. The business's own owner_id.
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id AND b.owner_id = auth.uid())

    -- 2a. Entity roles with a seeded platform staff_roles row ('manager','viewer').
    OR EXISTS (
      SELECT 1 FROM public.entity_members em
      JOIN public.staff_roles sr ON sr.role_scope = 'platform' AND sr.platform_role = em.role AND sr.is_active
      JOIN public.staff_role_permissions srp ON srp.role_id = sr.id
      JOIN public.staff_permissions sp ON sp.id = srp.permission_id AND sp.key = p_permission_key AND sp.is_active
      WHERE em.organizer_id = public.staff_resolve_business_organizer(p_business_id)
        AND em.user_id = auth.uid()
        AND public.is_entity_member(em.organizer_id, ARRAY[em.role])
    )

    -- 2b. Entity roles with no staff_roles row ('editor','finance').
    OR EXISTS (
      SELECT 1 FROM public.entity_members em
      JOIN public.entity_role_permission_defaults erpd ON erpd.entity_role = em.role
      WHERE em.organizer_id = public.staff_resolve_business_organizer(p_business_id)
        AND em.user_id = auth.uid()
        AND p_permission_key = ANY(erpd.permission_keys)
        AND public.is_entity_member(em.organizer_id, ARRAY[em.role])
    )

    -- 3. Active staff member holding the key through an active role grant,
    --    with branch reach.
    OR EXISTS (
      SELECT 1
      FROM public.staff_members sm
      JOIN public.staff_member_roles smr ON smr.staff_member_id = sm.id AND smr.is_active
      JOIN public.staff_roles sr ON sr.id = smr.role_id AND sr.is_active
      JOIN public.staff_role_permissions srp ON srp.role_id = sr.id
      JOIN public.staff_permissions sp ON sp.id = srp.permission_id AND sp.is_active
      WHERE sm.business_id = p_business_id
        AND sm.auth_user_id = auth.uid()
        AND sm.status = 'active'
        AND sp.key = p_permission_key
        AND (
          (p_branch_id IS NULL AND sm.all_branches)
          OR (p_branch_id IS NOT NULL AND (
            sm.all_branches
            OR EXISTS (
              SELECT 1 FROM public.staff_member_branch_scopes sbs
              WHERE sbs.staff_member_id = sm.id AND sbs.branch_id = p_branch_id
            )
          ))
        )
    );
$$;

-- 4. staff_has_permission privileges.
REVOKE ALL ON FUNCTION public.staff_has_permission(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_has_permission(uuid, text, uuid) TO authenticated;

-- 5. Accept-fields guard function. SECURITY INVOKER on purpose: current_user
--    must reflect the role actually executing the UPDATE.
CREATE OR REPLACE FUNCTION public.staff_invitations_guard_accept_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
    THEN
      RAISE EXCEPTION 'accepted_by, accepted_at and status=accepted can only be set by accept_staff_invitation'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Guard function privileges.
REVOKE ALL ON FUNCTION public.staff_invitations_guard_accept_fields() FROM PUBLIC, anon, authenticated;

-- 7. Guard trigger.
DROP TRIGGER IF EXISTS trg_staff_invitations_guard_accept_fields ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_guard_accept_fields
  BEFORE UPDATE ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.staff_invitations_guard_accept_fields();

-- 8. HARD CHECK: the guard trigger exists and is enabled (single point of defense).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.staff_invitations'::regclass
      AND t.tgname = 'trg_staff_invitations_guard_accept_fields'
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'trg_staff_invitations_guard_accept_fields is missing or disabled -- sole defense against forged invitation acceptance';
  END IF;
END;
$$;