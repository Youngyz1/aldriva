-- ============================================================
-- Migration 238: branch scopes
--   - staff_members.all_branches
--   - staff_member_branch_scopes (+ RLS: SELECT incl. self-read, narrowed writes)
--   - sync trigger (home branch -> scope row, add-only)
--   - primary-delete guard (cannot delete the home-branch scope row)
--   - all_branches change guard
--   - backfill: one scope row per member that has a branch_id
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent and safe to re-run after a partial run.
-- Members with branch_id IS NULL are deliberately left at
-- all_branches = false (fail closed); the owner decides per member.
-- ============================================================

-- 0a. PREFLIGHT: required tables and helper functions exist.
DO $$
BEGIN
  IF to_regclass('public.staff_members') IS NULL
     OR to_regclass('public.business_branches') IS NULL THEN
    RAISE EXCEPTION 'staff_members / business_branches missing -- aborting 238';
  END IF;
  IF (SELECT count(DISTINCT proname) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('is_entity_member','staff_resolve_business_organizer','is_staff_branch_manager')) <> 3 THEN
    RAISE EXCEPTION 'required helper functions missing -- aborting 238';
  END IF;
END;
$$;

-- 0b. PREFLIGHT: is_staff_branch_manager is still the untouched 231 body
--     (normalized md5 captured read-only on staging).
DO $$
DECLARE
  v_actual_md5 text;
  v_expected_md5 text := '4fb89d6fea1a68ffe9ae1bf7a3be16d4';
BEGIN
  v_actual_md5 := md5(regexp_replace(lower(
    pg_get_functiondef('public.is_staff_branch_manager(uuid, uuid)'::regprocedure)), '\s+', ' ', 'g'));
  IF v_actual_md5 <> v_expected_md5 THEN
    RAISE EXCEPTION 'is_staff_branch_manager differs from the expected body (md5 %, expected %) -- review by hand before applying 238', v_actual_md5, v_expected_md5;
  END IF;
END;
$$;

-- 1. all_branches column.
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS all_branches boolean NOT NULL DEFAULT false;

-- 2. Scopes table. Composite FKs make cross-business rows impossible.
CREATE TABLE IF NOT EXISTS public.staff_member_branch_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id uuid NOT NULL,
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_member_branch_scopes_member_branch_key UNIQUE (staff_member_id, branch_id),
  CONSTRAINT staff_member_branch_scopes_member_fk FOREIGN KEY (staff_member_id, business_id)
    REFERENCES public.staff_members(id, business_id) ON DELETE CASCADE,
  CONSTRAINT staff_member_branch_scopes_branch_fk FOREIGN KEY (branch_id, business_id)
    REFERENCES public.business_branches(id, business_id) ON DELETE CASCADE
);

-- 3. Index for lookups by branch (lookups by member use the unique constraint).
CREATE INDEX IF NOT EXISTS idx_staff_member_branch_scopes_branch
  ON public.staff_member_branch_scopes (branch_id);

-- 4. RLS on (idempotent).
ALTER TABLE public.staff_member_branch_scopes ENABLE ROW LEVEL SECURITY;

-- 5. SELECT policy: organizer owner/admin/manager, branch manager, platform
--    admin, or the member reading their own rows.
DROP POLICY IF EXISTS "Authorized users can view staff member branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Authorized users can view staff member branch scopes"
  ON public.staff_member_branch_scopes FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM public.staff_members sm
               WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  );

-- 6. INSERT policy (narrowed: no blanket 'manager'; no self-grant clause).
DROP POLICY IF EXISTS "Owner/admin or branch manager can grant branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Owner/admin or branch manager can grant branch scopes"
  ON public.staff_member_branch_scopes FOR INSERT
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  );

-- 7. UPDATE policy.
DROP POLICY IF EXISTS "Owner/admin or branch manager can move branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Owner/admin or branch manager can move branch scopes"
  ON public.staff_member_branch_scopes FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  );

-- 8. DELETE policy.
DROP POLICY IF EXISTS "Owner/admin or branch manager can revoke branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Owner/admin or branch manager can revoke branch scopes"
  ON public.staff_member_branch_scopes FOR DELETE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  );

-- 9. Sync trigger function: home branch -> scope row. ADD ONLY, never removes.
CREATE OR REPLACE FUNCTION public.staff_sync_primary_branch_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    INSERT INTO public.staff_member_branch_scopes (staff_member_id, business_id, branch_id, created_by)
    VALUES (NEW.id, NEW.business_id, NEW.branch_id, auth.uid())
    ON CONFLICT (staff_member_id, branch_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_sync_primary_branch_scope() FROM PUBLIC, anon, authenticated;

-- 10. Sync trigger.
DROP TRIGGER IF EXISTS trg_staff_sync_primary_branch_scope ON public.staff_members;
CREATE TRIGGER trg_staff_sync_primary_branch_scope
  AFTER INSERT OR UPDATE OF branch_id ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_sync_primary_branch_scope();

-- 11. Primary-delete guard function. SECURITY DEFINER so the lookup on
--     staff_members is not hidden by the caller's RLS. During a cascade from
--     a deleted staff member the parent row is already gone, so the lookup
--     finds nothing and the delete proceeds (to be proven in Docker).
CREATE OR REPLACE FUNCTION public.staff_member_branch_scopes_guard_primary_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.id = OLD.staff_member_id AND sm.branch_id = OLD.branch_id
  ) THEN
    RAISE EXCEPTION 'Cannot remove the scope for a staff member''s primary branch -- change their primary branch first'
      USING ERRCODE = '42501', HINT = 'primary_branch_scope_delete_denied';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_member_branch_scopes_guard_primary_delete() FROM PUBLIC, anon, authenticated;

-- 12. Primary-delete guard trigger.
DROP TRIGGER IF EXISTS trg_staff_member_branch_scopes_guard_primary_delete ON public.staff_member_branch_scopes;
CREATE TRIGGER trg_staff_member_branch_scopes_guard_primary_delete
  BEFORE DELETE ON public.staff_member_branch_scopes
  FOR EACH ROW EXECUTE FUNCTION public.staff_member_branch_scopes_guard_primary_delete();

-- 13. all_branches guard function. Owner/admin, businesses.owner_id or platform
--     admin only. auth.uid() IS NULL (service role) bypasses. Also fires on
--     INSERT when all_branches = true, so a row cannot be created pre-widened.
CREATE OR REPLACE FUNCTION public.staff_members_guard_all_branches_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.all_branches IS NOT TRUE THEN RETURN NEW; END IF;
    v_business_id := NEW.business_id;
  ELSE
    IF NEW.all_branches IS NOT DISTINCT FROM OLD.all_branches THEN RETURN NEW; END IF;
    v_business_id := OLD.business_id;
  END IF;

  IF NOT (
    public.is_entity_member(public.staff_resolve_business_organizer(v_business_id), ARRAY['owner','admin'])
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = v_business_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  ) THEN
    RAISE EXCEPTION 'Only a business owner, administrator, or platform admin can change a staff member''s all-branches access'
      USING ERRCODE = '42501', HINT = 'all_branches_change_denied';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_members_guard_all_branches_change() FROM PUBLIC, anon, authenticated;

-- 14. all_branches guard trigger.
DROP TRIGGER IF EXISTS trg_staff_members_guard_all_branches_change ON public.staff_members;
CREATE TRIGGER trg_staff_members_guard_all_branches_change
  BEFORE INSERT OR UPDATE OF all_branches ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_members_guard_all_branches_change();

-- 15. Backfill: one scope row per existing member that has a branch_id.
--     Members with branch_id IS NULL are intentionally NOT touched.
INSERT INTO public.staff_member_branch_scopes (staff_member_id, business_id, branch_id)
SELECT sm.id, sm.business_id, sm.branch_id
FROM public.staff_members sm
WHERE sm.branch_id IS NOT NULL
ON CONFLICT (staff_member_id, branch_id) DO NOTHING;