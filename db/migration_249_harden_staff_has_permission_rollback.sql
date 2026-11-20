-- Rollback for 249: restores the pre-249 staff_has_permission body. Idempotent.
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
$function$;