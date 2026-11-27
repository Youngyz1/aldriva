-- Migration 262: staff assignments for rental bookings (chauffeur / delivery link)
-- Link, do not move: rental_bookings is not changed.
-- Apply statement by statement. Every statement is idempotent. No BEGIN/COMMIT.

-- ===== STATEMENT 0: PREFLIGHT =====
DO $$
DECLARE missing text := '';
BEGIN
  IF to_regclass('public.staff_assignments') IS NULL THEN missing := missing || ' staff_assignments'; END IF;
  IF to_regclass('public.rental_bookings') IS NULL THEN missing := missing || ' rental_bookings'; END IF;
  IF to_regclass('public.staff_members') IS NULL THEN missing := missing || ' staff_members'; END IF;
  IF to_regclass('public.staff_roles') IS NULL THEN missing := missing || ' staff_roles'; END IF;
  IF to_regclass('public.staff_member_roles') IS NULL THEN missing := missing || ' staff_member_roles'; END IF;
  IF to_regclass('public.business_branches') IS NULL THEN missing := missing || ' business_branches'; END IF;
  IF to_regprocedure('public.staff_has_permission(uuid,text,uuid)') IS NULL THEN missing := missing || ' staff_has_permission'; END IF;
  IF to_regprocedure('public.is_staff_branch_manager(uuid,uuid)') IS NULL THEN missing := missing || ' is_staff_branch_manager'; END IF;
  IF to_regprocedure('public.staff_resolve_business_organizer(uuid)') IS NULL THEN missing := missing || ' staff_resolve_business_organizer'; END IF;
  IF to_regprocedure('public.is_entity_member(uuid,text[])') IS NULL THEN missing := missing || ' is_entity_member(uuid,text[])'; END IF;
  IF to_regprocedure('public.staff_assignments_guard_assignee_edit()') IS NULL THEN missing := missing || ' staff_assignments_guard_assignee_edit'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_permissions WHERE key = 'workforce.assignments.manage') THEN
    missing := missing || ' permission:workforce.assignments.manage';
  END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION 'PREFLIGHT failed, missing:%', missing;
  END IF;
END $$;

-- ===== STATEMENT 1: validation trigger function and trigger =====
CREATE OR REPLACE FUNCTION public.staff_assignments_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_booking_business uuid;
  v_booking_status text;
  v_staff_status text;
BEGIN
  IF NEW.subject_type = 'rental_booking'
     AND (TG_OP = 'INSERT'
          OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
          OR NEW.subject_type IS DISTINCT FROM OLD.subject_type)
  THEN
    SELECT rb.business_id, rb.status
      INTO v_booking_business, v_booking_status
      FROM public.rental_bookings rb
      WHERE rb.id = NEW.subject_id;
    IF NOT FOUND OR v_booking_business IS DISTINCT FROM NEW.business_id THEN
      RAISE EXCEPTION 'Booking not found for this business'
        USING ERRCODE = '23514', HINT = 'assignment_subject_invalid';
    END IF;
    IF v_booking_status IN ('cancelled', 'expired', 'completed', 'no_show') THEN
      RAISE EXCEPTION 'Booking is closed'
        USING ERRCODE = '23514', HINT = 'assignment_subject_closed';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.staff_member_id IS DISTINCT FROM OLD.staff_member_id THEN
    SELECT sm.status INTO v_staff_status
      FROM public.staff_members sm
      WHERE sm.id = NEW.staff_member_id AND sm.business_id = NEW.business_id;
    IF NOT FOUND OR v_staff_status <> 'active' THEN
      RAISE EXCEPTION 'Staff member is not active'
        USING ERRCODE = '23514', HINT = 'assignment_staff_inactive';
    END IF;
  END IF;

  IF NEW.role_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.role_id IS DISTINCT FROM OLD.role_id
          OR NEW.staff_member_id IS DISTINCT FROM OLD.staff_member_id)
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_roles r
      WHERE r.id = NEW.role_id
        AND r.role_scope = 'business'
        AND r.business_id = NEW.business_id
        AND r.is_active
    ) THEN
      RAISE EXCEPTION 'Role is not an active role of this business'
        USING ERRCODE = '23514', HINT = 'assignment_role_invalid';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_member_roles smr
      WHERE smr.staff_member_id = NEW.staff_member_id
        AND smr.role_id = NEW.role_id
        AND smr.is_active
    ) THEN
      RAISE EXCEPTION 'Staff member does not hold this role'
        USING ERRCODE = '23514', HINT = 'assignment_role_not_held';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.staff_assignments_validate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_assignments_validate ON public.staff_assignments;
CREATE TRIGGER trg_staff_assignments_validate
  BEFORE INSERT OR UPDATE OF staff_member_id, role_id, subject_type, subject_id
  ON public.staff_assignments
  FOR EACH ROW EXECUTE FUNCTION public.staff_assignments_validate();

-- ===== STATEMENT 2: assignee guard also lets assignment managers through =====
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
     OR public.staff_has_permission(OLD.business_id, 'workforce.assignments.manage',
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

-- ===== STATEMENT 3: policies (drop old and new names, recreate; one run, atomic) =====
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

CREATE POLICY staff_assignments_select ON public.staff_assignments FOR SELECT
USING (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager','editor','finance','viewer'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR public.staff_has_permission(business_id, 'workforce.assignments.manage',
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR EXISTS (SELECT 1 FROM public.staff_members sm
    WHERE sm.id = staff_assignments.staff_member_id AND sm.auth_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

CREATE POLICY staff_assignments_insert ON public.staff_assignments FOR INSERT
WITH CHECK (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR public.staff_has_permission(business_id, 'workforce.assignments.manage',
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

CREATE POLICY staff_assignments_update ON public.staff_assignments FOR UPDATE
USING (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR public.staff_has_permission(business_id, 'workforce.assignments.manage',
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
  OR public.staff_has_permission(business_id, 'workforce.assignments.manage',
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR (EXISTS (SELECT 1 FROM public.staff_members sm
        WHERE sm.id = staff_assignments.staff_member_id AND sm.auth_user_id = auth.uid())
      AND status = ANY (ARRAY['accepted','declined','completed']))
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

CREATE POLICY staff_assignments_delete ON public.staff_assignments FOR DELETE
USING (
  public.is_entity_member(public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR public.staff_has_permission(business_id, 'workforce.assignments.manage',
    (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_assignments.staff_member_id))
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

-- ===== STATEMENT 4: table privileges on staff_assignments =====
REVOKE ALL ON public.staff_assignments FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.staff_assignments FROM authenticated;

-- ===== STATEMENT 5: read function for the assigned person =====
CREATE OR REPLACE FUNCTION public.get_my_rental_assignments()
RETURNS TABLE (
  assignment_id uuid,
  assignment_status text,
  assignment_notes text,
  business_id uuid,
  role_id uuid,
  role_name text,
  booking_id uuid,
  booking_number text,
  booking_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  pickup_branch_id uuid,
  pickup_branch_label text,
  return_branch_id uuid,
  return_branch_label text,
  vehicle_id uuid,
  customer_name text,
  customer_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
  SELECT sa.id, sa.status, sa.notes, sa.business_id, sa.role_id, r.name,
         rb.id, rb.booking_number, rb.status, rb.starts_at, rb.ends_at,
         rb.pickup_branch_id, pb.label, rb.return_branch_id, rtb.label,
         rb.vehicle_id, rb.customer_name, rb.customer_phone
  FROM public.staff_assignments sa
  JOIN public.staff_members sm
    ON sm.id = sa.staff_member_id AND sm.business_id = sa.business_id
  JOIN public.rental_bookings rb
    ON rb.id = sa.subject_id AND rb.business_id = sa.business_id
  LEFT JOIN public.staff_roles r ON r.id = sa.role_id
  LEFT JOIN public.business_branches pb ON pb.id = rb.pickup_branch_id
  LEFT JOIN public.business_branches rtb ON rtb.id = rb.return_branch_id
  WHERE auth.uid() IS NOT NULL
    AND sa.subject_type = 'rental_booking'
    AND sm.auth_user_id = auth.uid()
    AND sm.status = 'active'
    AND sa.status IN ('assigned', 'accepted')
  ORDER BY rb.starts_at, sa.id;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_rental_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_rental_assignments() TO authenticated;

-- ===== STATEMENT 6: HARD CHECK =====
DO $$
DECLARE bad text := '';
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'staff_assignments'
        AND policyname IN ('staff_assignments_select','staff_assignments_insert',
                           'staff_assignments_update','staff_assignments_delete')) <> 4 THEN
    bad := bad || ' policies_new';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'staff_assignments') <> 4 THEN
    bad := bad || ' policies_total';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.staff_assignments'::regclass
        AND tgname = 'trg_staff_assignments_validate' AND NOT tgisinternal) THEN
    bad := bad || ' trigger_validate';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc
      WHERE oid = 'public.staff_assignments_validate()'::regprocedure) THEN
    bad := bad || ' validate_not_definer';
  END IF;
  IF position('workforce.assignments.manage' IN
      (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.staff_assignments_guard_assignee_edit()'::regprocedure)) = 0 THEN
    bad := bad || ' guard_not_updated';
  END IF;
  IF has_table_privilege('anon', 'public.staff_assignments',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    bad := bad || ' anon_has_privileges';
  END IF;
  IF has_table_privilege('authenticated', 'public.staff_assignments',
      'TRUNCATE,REFERENCES,TRIGGER') THEN
    bad := bad || ' authenticated_has_truncate_trigger_refs';
  END IF;
  IF has_function_privilege('anon', 'public.get_my_rental_assignments()', 'EXECUTE') THEN
    bad := bad || ' anon_can_execute_read_fn';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_my_rental_assignments()', 'EXECUTE') THEN
    bad := bad || ' authenticated_cannot_execute_read_fn';
  END IF;
  IF bad <> '' THEN
    RAISE EXCEPTION 'HARD CHECK failed:%', bad;
  END IF;
END $$;