-- Migration 264: link kitchen/courier workers (business_workers) to staff members
-- Adds public.business_worker_staff_links (one row per worker; a staff member may have several worker rows, e.g. a cook row and a courier row).
-- Adds a trigger so that suspending, deactivating or deleting a staff member switches off the linked worker rows (is_active false, is_available false, invitation and sessions revoked), mirroring deactivateCourier.
-- business_workers, orders and every courier/kitchen route are NOT changed.
-- Apply statement by statement. No BEGIN/COMMIT. Every statement is idempotent.

-- STATEMENT 0: PREFLIGHT (read-only). Expect ok = true on the first six rows.
SELECT 'staff_members exists' AS check_name, to_regclass('public.staff_members') IS NOT NULL AS ok
UNION ALL SELECT 'staff_members unique (id, business_id)', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='staff_members' AND indexdef LIKE '%UNIQUE%(id, business_id)')
UNION ALL SELECT 'business_workers exists', to_regclass('public.business_workers') IS NOT NULL
UNION ALL SELECT 'business_workers unique (id, business_id)', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='business_workers' AND indexdef LIKE '%UNIQUE%(id, business_id)')
UNION ALL SELECT 'business_worker_invitations exists', to_regclass('public.business_worker_invitations') IS NOT NULL
UNION ALL SELECT 'business_worker_sessions exists', to_regclass('public.business_worker_sessions') IS NOT NULL
UNION ALL SELECT 'info: link table already exists (false on first run)', to_regclass('public.business_worker_staff_links') IS NOT NULL
UNION ALL SELECT 'info: trigger function already exists (false on first run)', EXISTS (SELECT 1 FROM pg_proc WHERE proname='staff_deactivate_linked_workers' AND pronamespace='public'::regnamespace);

-- STATEMENT 1: table
CREATE TABLE IF NOT EXISTS public.business_worker_staff_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  staff_member_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT business_worker_staff_links_worker_key UNIQUE (worker_id),
  CONSTRAINT business_worker_staff_links_worker_fk FOREIGN KEY (worker_id, business_id) REFERENCES public.business_workers (id, business_id) ON DELETE CASCADE,
  CONSTRAINT business_worker_staff_links_staff_fk FOREIGN KEY (staff_member_id, business_id) REFERENCES public.staff_members (id, business_id) ON DELETE CASCADE
);

-- STATEMENT 2: index for the staff-side lookup
CREATE INDEX IF NOT EXISTS business_worker_staff_links_staff_idx ON public.business_worker_staff_links (staff_member_id);

-- STATEMENT 3: trigger function
CREATE OR REPLACE FUNCTION public.staff_deactivate_linked_workers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_staff_id uuid;
  v_now timestamptz := now();
BEGIN
  v_staff_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  UPDATE public.business_workers w
     SET is_active = false,
         deactivated_at = COALESCE(w.deactivated_at, v_now),
         is_available = false,
         updated_at = v_now
   WHERE w.id IN (SELECT l.worker_id FROM public.business_worker_staff_links l WHERE l.staff_member_id = v_staff_id);

  UPDATE public.business_worker_invitations i
     SET revoked_at = v_now, updated_at = v_now
   WHERE i.revoked_at IS NULL
     AND i.worker_id IN (SELECT l.worker_id FROM public.business_worker_staff_links l WHERE l.staff_member_id = v_staff_id);

  UPDATE public.business_worker_sessions s
     SET revoked_at = v_now, updated_at = v_now
   WHERE s.revoked_at IS NULL
     AND s.worker_id IN (SELECT l.worker_id FROM public.business_worker_staff_links l WHERE l.staff_member_id = v_staff_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$fn$;

-- STATEMENT 4: row level security and privileges (server-only writes; reads only through the policy)
DO $priv$
BEGIN
  ALTER TABLE public.business_worker_staff_links ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.business_worker_staff_links FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.business_worker_staff_links TO authenticated;
  GRANT ALL ON public.business_worker_staff_links TO service_role;
  REVOKE ALL ON FUNCTION public.staff_deactivate_linked_workers() FROM PUBLIC, anon, authenticated;
END
$priv$;

-- STATEMENT 5: read policy (a link is visible only if the caller can already see that staff member)
DO $pol$
BEGIN
  DROP POLICY IF EXISTS business_worker_staff_links_select ON public.business_worker_staff_links;
  CREATE POLICY business_worker_staff_links_select ON public.business_worker_staff_links
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.staff_members s
      WHERE s.id = business_worker_staff_links.staff_member_id
        AND s.business_id = business_worker_staff_links.business_id
    ));
END
$pol$;

-- STATEMENT 6: triggers on staff_members
DO $trg$
BEGIN
  DROP TRIGGER IF EXISTS trg_staff_members_worker_links_deactivate_upd ON public.staff_members;
  CREATE TRIGGER trg_staff_members_worker_links_deactivate_upd
    AFTER UPDATE OF status ON public.staff_members
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('suspended', 'deactivated'))
    EXECUTE FUNCTION public.staff_deactivate_linked_workers();

  DROP TRIGGER IF EXISTS trg_staff_members_worker_links_deactivate_del ON public.staff_members;
  CREATE TRIGGER trg_staff_members_worker_links_deactivate_del
    BEFORE DELETE ON public.staff_members
    FOR EACH ROW
    EXECUTE FUNCTION public.staff_deactivate_linked_workers();
END
$trg$;

-- STATEMENT 7: HARD CHECK (raises an exception if anything is missing)
DO $check$
DECLARE
  v_rel regclass := to_regclass('public.business_worker_staff_links');
BEGIN
  IF v_rel IS NULL THEN RAISE EXCEPTION 'HARD CHECK 264: link table missing'; END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = v_rel) THEN RAISE EXCEPTION 'HARD CHECK 264: RLS is off'; END IF;
  IF has_table_privilege('anon', v_rel, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'HARD CHECK 264: anon has a privilege'; END IF;
  IF has_table_privilege('authenticated', v_rel, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'HARD CHECK 264: authenticated has a write privilege'; END IF;
  IF NOT has_table_privilege('authenticated', v_rel, 'SELECT') THEN RAISE EXCEPTION 'HARD CHECK 264: authenticated cannot SELECT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = v_rel AND p.polname = 'business_worker_staff_links_select') THEN RAISE EXCEPTION 'HARD CHECK 264: select policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'staff_deactivate_linked_workers' AND p.pronamespace = 'public'::regnamespace AND p.prosecdef) THEN RAISE EXCEPTION 'HARD CHECK 264: trigger function missing or not SECURITY DEFINER'; END IF;
  IF (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.staff_members'::regclass AND t.tgname IN ('trg_staff_members_worker_links_deactivate_upd', 'trg_staff_members_worker_links_deactivate_del')) <> 2 THEN RAISE EXCEPTION 'HARD CHECK 264: staff_members triggers missing'; END IF;
  RAISE NOTICE 'HARD CHECK 264 passed';
END
$check$;