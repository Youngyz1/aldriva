-- Migration 262 ROLLBACK: staff assignments for rental bookings
-- Restores the pre-262 policies, guard function and grants. Idempotent. No BEGIN/COMMIT.

-- ===== STATEMENT 0: PREFLIGHT =====
DO $$
BEGIN
  IF to_regclass('public.staff_assignments') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT failed: staff_assignments missing';
  END IF;
END $$;

-- ===== STATEMENT 1: drop the new read function, trigger and validation function =====
DROP FUNCTION IF EXISTS public.get_my_rental_assignments();
DROP TRIGGER IF EXISTS trg_staff_assignments_validate ON public.staff_assignments;
DROP FUNCTION IF EXISTS public.staff_assignments_validate();

-- ===== STATEMENT 2: restore the original assignee guard =====
CREATE OR REPLACE FUNCTION public.staff_assignments_guard_assignee_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
BEGIN
  IF auth.uid() IS NULL
     OR public.is_entity_member(
          public.staff_resolve_business_organizer(OLD.business_id),
          ARRAY['owner','admin','manager'])
     OR public.is_staff_branch_manager(OLD.business_id,
          (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = OLD.staff_member_id))
     OR EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN
    RETURN NEW;
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.staff_member_id IS DISTINCT FROM OLD.staff_member_id
     OR NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
  THEN
    RAISE EXCEPTION 'Assignees can only update status, notes and response times'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('cancelled','completed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Assignment is closed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

-- ===== STATEMENT 3: drop the new policies and any old-named ones, recreate the originals =====
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_assignments'
      AND (policyname LIKE 'Business managers can delete staff assignments%'
        OR policyname LIKE 'Business or branch managers can create staff assignments%'
        OR policyname LIKE 'Business, branch manager, or assignee can update staff assignme%'
        OR policyname LIKE 'Staff assignments are readable by business, branch manager, or%'
        OR policyname IN ('staff_assignments_select','staff_assignments_insert',
                          'staff_assignments_update','staff_assignments_delete'))
  LOOP
    EXECUTE format('DROP POLICY %I ON public.staff_assignments', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Business managers can delete staff assignments" ON public.staff_assignments FOR DELETE
USING (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

CREATE POLICY "Business or branch managers can create staff assignments" ON public.staff_assignments FOR INSERT
WITH CHECK (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

CREATE POLICY "Business, branch manager, or assignee can update staff assignments" ON public.staff_assignments FOR UPDATE
USING (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR EXISTS (SELECT 1 FROM public.staff_members sm
    WHERE sm.id = staff_assignments.staff_member_id AND sm.auth_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
)
WITH CHECK (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR (EXISTS (SELECT 1 FROM public.staff_members sm
        WHERE sm.id = staff_assignments.staff_member_id AND sm.auth_user_id = auth.uid())
      AND status = ANY (ARRAY['accepted','declined','completed']))
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

CREATE POLICY "Staff assignments are readable by business, branch manager, or assignee" ON public.staff_assignments FOR SELECT
USING (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager','editor','finance','viewer'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR EXISTS (SELECT 1 FROM public.staff_members sm
    WHERE sm.id = staff_assignments.staff_member_id AND sm.auth_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

-- ===== STATEMENT 4: restore the pre-262 table privileges =====
GRANT ALL ON public.staff_assignments TO anon;
GRANT TRUNCATE, TRIGGER, REFERENCES ON public.staff_assignments TO authenticated;

-- ===== STATEMENT 5: HARD CHECK =====
DO $$
DECLARE bad text := '';
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'staff_assignments') <> 4 THEN
    bad := bad || ' policies_total';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'staff_assignments'
        AND policyname LIKE 'staff_assignments_%') THEN
    bad := bad || ' new_policies_remain';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.staff_assignments'::regclass
        AND tgname = 'trg_staff_assignments_validate' AND NOT tgisinternal) THEN
    bad := bad || ' validate_trigger_remains';
  END IF;
  IF to_regprocedure('public.staff_assignments_validate()') IS NOT NULL THEN
    bad := bad || ' validate_fn_remains';
  END IF;
  IF to_regprocedure('public.get_my_rental_assignments()') IS NOT NULL THEN
    bad := bad || ' read_fn_remains';
  END IF;
  IF position('workforce.assignments.manage' IN
      (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.staff_assignments_guard_assignee_edit()'::regprocedure)) > 0 THEN
    bad := bad || ' guard_not_restored';
  END IF;
  IF bad <> '' THEN
    RAISE EXCEPTION 'ROLLBACK HARD CHECK failed:%', bad;
  END IF;
END $$;