-- Migration 249: defense in depth for staff_has_permission. A role only counts if it is a
-- platform role or belongs to p_business_id, independent of trg_validate_staff_member_role_assignment.
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT. Idempotent.

-- 0. PREFLIGHT
DO $$
BEGIN
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_has_permission(uuid,text,uuid) missing -- aborting 249';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.staff_has_permission(uuid,text,uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'staff_has_permission is not SECURITY DEFINER -- aborting 249';
  END IF;
END;
$$;

-- 1. The function
CREATE OR REPLACE FUNCTION public.staff_has_permission(p_business_id uuid, p_permission_key text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT
    -- 1. Organizer-tier owner/admin, or active platform admin.
    public.is_entity_member(public.staff_resolve_business_organizer(p_business_id), ARRAY['owner','admin'])
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')

    -- 1b. Active staff member holding an active seeded 'owner' platform role.
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      JOIN public.staff_member_roles smr ON smr.staff_member_id = sm.id AND smr.is_active
      JOIN public.staff_roles sr ON sr.id = smr.role_id AND sr.platform_role = 'owner' AND sr.is_active
        AND sr.role_scope = 'platform' -- 249 hardening
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
        AND (sr.role_scope = 'platform' OR sr.business_id = p_business_id) -- 249 hardening
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
$function$;

-- 2. HARD CHECK: both hardening markers present, still SECURITY DEFINER, same signature.
DO $$
DECLARE v_def text := pg_get_functiondef('public.staff_has_permission(uuid,text,uuid)'::regprocedure);
BEGIN
  IF (length(v_def) - length(replace(v_def, '-- 249 hardening', ''))) / length('-- 249 hardening') <> 2 THEN
    RAISE EXCEPTION 'expected exactly 2 hardening markers in staff_has_permission';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.staff_has_permission(uuid,text,uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'staff_has_permission lost SECURITY DEFINER';
  END IF;
END;
$$;