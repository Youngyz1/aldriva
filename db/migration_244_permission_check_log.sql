-- ============================================================
-- Migration 244: permission-check log (denials only)
--
-- staff_permission_check_logs: append-only record of DENIED permission checks.
-- staff_log_permission_check(business, key, branch, source): SECURITY DEFINER,
--   actor is ALWAYS auth.uid() (no actor parameter, deliberately). It runs
--   staff_has_permission itself, returns the real result, and logs only denials.
--   No session (service role) => returns false, writes nothing.
-- Flood guards: only callers connected to the business are logged; an identical
--   denial within 60 s is skipped; max 120 rows per actor per 10 minutes.
-- Read access: entity owner/admin/manager of the business, and platform admin.
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent.
-- ============================================================

-- 0. PREFLIGHT: everything this migration depends on exists.
DO $$
BEGIN
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_has_permission(uuid,text,uuid) not found -- aborting 244';
  END IF;
  IF to_regprocedure('public.staff_is_active_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_is_active_member(uuid) not found -- aborting 244';
  END IF;
  IF to_regprocedure('public.staff_resolve_business_organizer(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_resolve_business_organizer(uuid) not found -- aborting 244';
  END IF;
  IF to_regprocedure('public.is_entity_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'is_entity_member(uuid,text[]) not found -- aborting 244';
  END IF;
  IF to_regclass('public.staff_permissions') IS NULL
     OR to_regclass('public.businesses') IS NULL
     OR to_regclass('public.business_branches') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'a required table is missing -- aborting 244';
  END IF;
END;
$$;

-- 1. The table.
CREATE TABLE IF NOT EXISTS public.staff_permission_check_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  actor_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission_key text NOT NULL,
  branch_id      uuid REFERENCES public.business_branches(id) ON DELETE SET NULL,
  source         text NOT NULL CHECK (source ~ '^[a-z0-9_.:/-]{1,64}$'),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes (read by business, and the flood guards by actor).
CREATE INDEX IF NOT EXISTS idx_staff_perm_check_logs_business
  ON public.staff_permission_check_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_perm_check_logs_actor
  ON public.staff_permission_check_logs (actor_user_id, created_at DESC);

-- 3. RLS and privileges: read-only for authenticated, nothing for anon.
ALTER TABLE public.staff_permission_check_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_permission_check_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_permission_check_logs TO authenticated;

DROP POLICY IF EXISTS "Organizer tier can view staff permission check logs"
  ON public.staff_permission_check_logs;
CREATE POLICY "Organizer tier can view staff permission check logs"
  ON public.staff_permission_check_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin' AND p.status = 'active')
    OR (business_id IS NOT NULL
        AND (SELECT public.is_entity_member(
               public.staff_resolve_business_organizer(business_id),
               ARRAY['owner','admin','manager'])))
  );

-- 4. Append-only guard. Allows only the FK "ON DELETE SET NULL" updates.
CREATE OR REPLACE FUNCTION public.prevent_staff_permission_check_log_modification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.id, NEW.permission_key, NEW.source, NEW.created_at)
         IS NOT DISTINCT FROM (OLD.id, OLD.permission_key, OLD.source, OLD.created_at)
     AND (NEW.business_id   IS NULL OR NEW.business_id   IS NOT DISTINCT FROM OLD.business_id)
     AND (NEW.actor_user_id IS NULL OR NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id)
     AND (NEW.branch_id     IS NULL OR NEW.branch_id     IS NOT DISTINCT FROM OLD.branch_id)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'staff_permission_check_logs is append-only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_staff_permission_check_log_modification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_staff_perm_check_log_mod ON public.staff_permission_check_logs;
CREATE TRIGGER trg_prevent_staff_perm_check_log_mod
  BEFORE UPDATE OR DELETE ON public.staff_permission_check_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_permission_check_log_modification();

-- 5. The writer. Actor is auth.uid(); there is no actor parameter.
CREATE OR REPLACE FUNCTION public.staff_log_permission_check(
  p_business_id    uuid,
  p_permission_key text,
  p_branch_id      uuid,
  p_source         text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_organizer uuid;
  v_related   boolean;
  v_branch    uuid;
  v_source    text;
BEGIN
  IF v_actor IS NULL OR p_business_id IS NULL OR p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- The real answer. Allowed checks are returned and never logged.
  IF COALESCE(public.staff_has_permission(p_business_id, p_permission_key, p_branch_id), false) THEN
    RETURN true;
  END IF;

  -- Denied from here on. Log only real keys.
  IF NOT EXISTS (SELECT 1 FROM public.staff_permissions WHERE key = p_permission_key) THEN
    RETURN false;
  END IF;

  -- Log only callers connected to this business (outsiders cannot fill the log).
  v_organizer := public.staff_resolve_business_organizer(p_business_id);
  v_related :=
       public.staff_is_active_member(p_business_id)
    OR (v_organizer IS NOT NULL AND public.is_entity_member(
          v_organizer, ARRAY['owner','admin','manager','viewer','editor','finance']))
    OR EXISTS (SELECT 1 FROM public.businesses b
               WHERE b.id = p_business_id AND b.owner_id = v_actor);
  IF NOT v_related THEN
    RETURN false;
  END IF;

  SELECT bb.id INTO v_branch FROM public.business_branches bb
   WHERE bb.id = p_branch_id AND bb.business_id = p_business_id;

  v_source := CASE WHEN p_source IS NOT NULL AND p_source ~ '^[a-z0-9_.:/-]{1,64}$'
                   THEN p_source ELSE 'invalid_source' END;

  -- Flood guards.
  IF EXISTS (SELECT 1 FROM public.staff_permission_check_logs l
             WHERE l.actor_user_id = v_actor AND l.business_id = p_business_id
               AND l.permission_key = p_permission_key
               AND l.branch_id IS NOT DISTINCT FROM v_branch
               AND l.created_at > now() - interval '60 seconds') THEN
    RETURN false;
  END IF;
  IF (SELECT count(*) FROM public.staff_permission_check_logs l
      WHERE l.actor_user_id = v_actor
        AND l.created_at > now() - interval '10 minutes') >= 120 THEN
    RETURN false;
  END IF;

  INSERT INTO public.staff_permission_check_logs
    (business_id, actor_user_id, permission_key, branch_id, source)
  VALUES (p_business_id, v_actor, p_permission_key, v_branch, v_source);

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_log_permission_check(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_log_permission_check(uuid,text,uuid,text) TO authenticated;

-- 6. HARD CHECK
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff_permission_check_logs'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on staff_permission_check_logs';
  END IF;
  IF has_table_privilege('authenticated','public.staff_permission_check_logs','INSERT')
     OR has_table_privilege('authenticated','public.staff_permission_check_logs','UPDATE')
     OR has_table_privilege('authenticated','public.staff_permission_check_logs','DELETE')
     OR has_table_privilege('anon','public.staff_permission_check_logs','SELECT') THEN
    RAISE EXCEPTION 'unexpected table privileges on staff_permission_check_logs';
  END IF;
  IF NOT has_function_privilege('authenticated','public.staff_log_permission_check(uuid,text,uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.staff_log_permission_check(uuid,text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'unexpected EXECUTE privileges on staff_log_permission_check';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.staff_permission_check_logs'::regclass
        AND tgname = 'trg_prevent_staff_perm_check_log_mod' AND tgenabled = 'O') <> 1 THEN
    RAISE EXCEPTION 'append-only trigger missing or disabled';
  END IF;
END;
$$;