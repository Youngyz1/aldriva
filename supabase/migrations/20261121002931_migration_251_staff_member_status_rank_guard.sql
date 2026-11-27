-- ============================================================
-- Migration 251: Staff member status rank guard
-- ============================================================
-- Protect status changes from lower-ranked staff actors.
-- Reuses staff_actor_platform_rank(uuid).
-- Preserves all existing staff_members triggers.
-- ============================================================

-- Statement 0: preflight
DO $$
BEGIN
  IF to_regclass('public.staff_members') IS NULL THEN
    RAISE EXCEPTION '251 preflight failed: staff_members missing';
  END IF;

  IF to_regclass('public.staff_member_roles') IS NULL THEN
    RAISE EXCEPTION '251 preflight failed: staff_member_roles missing';
  END IF;

  IF to_regclass('public.staff_roles') IS NULL THEN
    RAISE EXCEPTION '251 preflight failed: staff_roles missing';
  END IF;

  IF to_regprocedure('public.staff_actor_platform_rank(uuid)') IS NULL THEN
    RAISE EXCEPTION '251 preflight failed: rank helper missing';
  END IF;
END;
$$;

-- Statement 1: status rank guard function
CREATE OR REPLACE FUNCTION public.staff_guard_status_change_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_target_rank integer := 0;
  v_actor_rank integer := 0;
BEGIN
  -- No authenticated session: service operation.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- No actual status change.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Staff may change their own status.
  IF OLD.auth_user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Active platform administrator exemption.
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  -- Effective target rank (same three authority sources as
  -- staff_actor_platform_rank): businesses.owner_id, entity_members,
  -- and active staff-layer platform roles for the target identity, counted
  -- on a record of ANY status (a suspended or deactivated owner stays protected).
  -- Unlinked targets (auth_user_id IS NULL) get 0 from person-level
  -- sources; retain record-scoped active platform-role calculation
  -- for defensive symmetry without inferring identity.
  IF OLD.auth_user_id IS NULL THEN
    SELECT COALESCE(
      MAX(
        CASE sr.platform_role
          WHEN 'owner' THEN 4
          WHEN 'admin' THEN 3
          WHEN 'manager' THEN 2
          WHEN 'viewer' THEN 1
          ELSE 0
        END
      ),
      0
    )
    INTO v_target_rank
    FROM public.staff_member_roles smr
    JOIN public.staff_roles sr
      ON sr.id = smr.role_id
    WHERE smr.staff_member_id = OLD.id
      AND smr.business_id = OLD.business_id
      AND smr.is_active IS TRUE
      AND sr.is_active IS TRUE
      AND sr.role_scope = 'platform';
  ELSE
    SELECT GREATEST(
      CASE WHEN EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id = OLD.business_id
          AND b.owner_id = OLD.auth_user_id
      ) THEN 4 ELSE 0 END,
      COALESCE((
        SELECT CASE em.role
          WHEN 'owner' THEN 4
          WHEN 'admin' THEN 3
          WHEN 'manager' THEN 2
          WHEN 'viewer' THEN 1
          ELSE 0
        END
        FROM public.entity_members em
        WHERE em.organizer_id = public.staff_resolve_business_organizer(OLD.business_id)
          AND em.user_id = OLD.auth_user_id
      ), 0),
      COALESCE((
        SELECT MAX(
          CASE sr.platform_role
            WHEN 'owner' THEN 4
            WHEN 'admin' THEN 3
            WHEN 'manager' THEN 2
            WHEN 'viewer' THEN 1
            ELSE 0
          END
        )
        FROM public.staff_members sm
        JOIN public.staff_member_roles smr
          ON smr.staff_member_id = sm.id
         AND smr.is_active IS TRUE
        JOIN public.staff_roles sr
          ON sr.id = smr.role_id
         AND sr.is_active IS TRUE
         AND sr.role_scope = 'platform'
        WHERE sm.business_id = OLD.business_id
          AND sm.auth_user_id = OLD.auth_user_id
      ), 0)
    )
    INTO v_target_rank;
  END IF;
  -- Reuse the established actor rank calculation.
  v_actor_rank :=
    public.staff_actor_platform_rank(OLD.business_id);

  IF v_actor_rank < v_target_rank THEN
    RAISE EXCEPTION
      'Only a sufficiently senior role can change this staff member''s status'
      USING
        ERRCODE = '42501',
        HINT = 'privileged_role_denied';
  END IF;

  RETURN NEW;
END;
$function$;

-- Statement 1b: the guard function is not callable by API roles.
REVOKE ALL ON FUNCTION public.staff_guard_status_change_rank() FROM PUBLIC, anon, authenticated;

-- Statement 2: create trigger if absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'staff_members'
      AND t.tgname = 'trg_staff_members_guard_status_rank'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_staff_members_guard_status_rank
    BEFORE UPDATE OF status
    ON public.staff_members
    FOR EACH ROW
    EXECUTE FUNCTION public.staff_guard_status_change_rank();
  END IF;
END;
$$;

-- Final HARD CHECK
DO $$
BEGIN
  IF to_regprocedure(
    'public.staff_guard_status_change_rank()'
  ) IS NULL THEN
    RAISE EXCEPTION '251 HARD CHECK FAILED: function missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'staff_members'
      AND t.tgname = 'trg_staff_members_guard_status_rank'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION '251 HARD CHECK FAILED: trigger missing or disabled';
  END IF;

  IF has_function_privilege('authenticated', 'public.staff_guard_status_change_rank()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.staff_guard_status_change_rank()', 'EXECUTE') THEN
    RAISE EXCEPTION '251 HARD CHECK FAILED: guard function must not be executable by authenticated/anon';
  END IF;
END;
$$;