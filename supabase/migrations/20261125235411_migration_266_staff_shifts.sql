-- Migration 266: planned staff shifts (staff_shifts)
-- One row = one planned shift for one staff member on one date (date + start/end time of day; overnight shifts are split at midnight).
-- Overlapping scheduled shifts for the same person are refused by an exclusion constraint (needs btree_gist).
-- Write access: head office, a branch manager of the shift's branch, or workforce.schedules.manage at that branch. Staff can read their own shifts but not edit them.
-- Apply statement by statement. No BEGIN/COMMIT. Every statement is idempotent.
-- Known behaviour: policies check the SHIFT's branch, not the staff member's branch, so cross-branch cover is allowed.

-- STATEMENT 0: PREFLIGHT (read-only). Expect ok = true on the first four rows.
SELECT 'staff_members unique (id, business_id)' AS check_name, EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='staff_members' AND indexdef LIKE '%UNIQUE%(id, business_id)') AS ok
UNION ALL SELECT 'business_branches unique (id, business_id)', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='business_branches' AND indexdef LIKE '%UNIQUE%(id, business_id)')
UNION ALL SELECT 'btree_gist installed', EXISTS (SELECT 1 FROM pg_extension WHERE extname='btree_gist')
UNION ALL SELECT 'staff_touch_updated_at exists', EXISTS (SELECT 1 FROM pg_proc WHERE proname='staff_touch_updated_at' AND pronamespace='public'::regnamespace)
UNION ALL SELECT 'info: staff_shifts already exists (false on first run)', to_regclass('public.staff_shifts') IS NOT NULL;

-- STATEMENT 1: table
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  staff_member_id uuid NOT NULL,
  branch_id uuid,
  shift_date date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_shifts_time_check CHECK (ends_at > starts_at),
  CONSTRAINT staff_shifts_status_check CHECK (status IN ('scheduled', 'cancelled')),
  CONSTRAINT staff_shifts_notes_check CHECK (notes IS NULL OR char_length(notes) <= 500),
  CONSTRAINT staff_shifts_member_business_fk FOREIGN KEY (staff_member_id, business_id) REFERENCES public.staff_members (id, business_id) ON DELETE CASCADE,
  CONSTRAINT staff_shifts_branch_business_fk FOREIGN KEY (branch_id, business_id) REFERENCES public.business_branches (id, business_id),
  CONSTRAINT staff_shifts_no_overlap EXCLUDE USING gist (
    staff_member_id WITH =,
    tsrange(shift_date + starts_at, shift_date + ends_at) WITH &&
  ) WHERE (status = 'scheduled')
);

-- STATEMENT 2: indexes
CREATE INDEX IF NOT EXISTS staff_shifts_business_date_idx ON public.staff_shifts (business_id, shift_date);
CREATE INDEX IF NOT EXISTS staff_shifts_staff_date_idx ON public.staff_shifts (staff_member_id, shift_date);

-- STATEMENT 3: validation trigger function
CREATE OR REPLACE FUNCTION public.staff_shifts_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_staff_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.business_id IS DISTINCT FROM OLD.business_id
                           OR NEW.staff_member_id IS DISTINCT FROM OLD.staff_member_id) THEN
    RAISE EXCEPTION 'A shift cannot be moved to another person or business'
      USING ERRCODE = '23514', HINT = 'shift_immutable_owner';
  END IF;

  IF NEW.status = 'scheduled' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'scheduled') THEN
    SELECT sm.status INTO v_staff_status
      FROM public.staff_members sm
     WHERE sm.id = NEW.staff_member_id AND sm.business_id = NEW.business_id;
    IF NOT FOUND OR v_staff_status <> 'active' THEN
      RAISE EXCEPTION 'Staff member is not active'
        USING ERRCODE = '23514', HINT = 'shift_staff_inactive';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

-- STATEMENT 4: triggers
DO $trg$
BEGIN
  DROP TRIGGER IF EXISTS trg_staff_shifts_validate ON public.staff_shifts;
  CREATE TRIGGER trg_staff_shifts_validate BEFORE INSERT OR UPDATE ON public.staff_shifts
    FOR EACH ROW EXECUTE FUNCTION public.staff_shifts_validate();
  DROP TRIGGER IF EXISTS trg_staff_shifts_updated_at ON public.staff_shifts;
  CREATE TRIGGER trg_staff_shifts_updated_at BEFORE UPDATE ON public.staff_shifts
    FOR EACH ROW EXECUTE FUNCTION public.staff_touch_updated_at();
END
$trg$;

-- STATEMENT 5: RLS and privileges (anon nothing; no TRUNCATE for anyone but service_role)
DO $priv$
BEGIN
  ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.staff_shifts FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;
  GRANT ALL ON public.staff_shifts TO service_role;
  REVOKE ALL ON FUNCTION public.staff_shifts_validate() FROM PUBLIC, anon, authenticated;
END
$priv$;

-- STATEMENT 6: policies
DO $pol$
BEGIN
  DROP POLICY IF EXISTS staff_shifts_select ON public.staff_shifts;
  CREATE POLICY staff_shifts_select ON public.staff_shifts FOR SELECT TO authenticated
    USING (
      public.is_entity_member(public.staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
      OR public.is_staff_branch_manager(business_id, branch_id)
      OR public.staff_has_permission(business_id, 'workforce.view', branch_id)
      OR public.staff_has_permission(business_id, 'workforce.schedules.manage', branch_id)
      OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_shifts.staff_member_id AND sm.auth_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
    );

  DROP POLICY IF EXISTS staff_shifts_insert ON public.staff_shifts;
  CREATE POLICY staff_shifts_insert ON public.staff_shifts FOR INSERT TO authenticated
    WITH CHECK (
      public.is_entity_member(public.staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
      OR public.is_staff_branch_manager(business_id, branch_id)
      OR public.staff_has_permission(business_id, 'workforce.schedules.manage', branch_id)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
    );

  DROP POLICY IF EXISTS staff_shifts_update ON public.staff_shifts;
  CREATE POLICY staff_shifts_update ON public.staff_shifts FOR UPDATE TO authenticated
    USING (
      public.is_entity_member(public.staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
      OR public.is_staff_branch_manager(business_id, branch_id)
      OR public.staff_has_permission(business_id, 'workforce.schedules.manage', branch_id)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
    )
    WITH CHECK (
      public.is_entity_member(public.staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
      OR public.is_staff_branch_manager(business_id, branch_id)
      OR public.staff_has_permission(business_id, 'workforce.schedules.manage', branch_id)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
    );

  DROP POLICY IF EXISTS staff_shifts_delete ON public.staff_shifts;
  CREATE POLICY staff_shifts_delete ON public.staff_shifts FOR DELETE TO authenticated
    USING (
      public.is_entity_member(public.staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
      OR public.is_staff_branch_manager(business_id, branch_id)
      OR public.staff_has_permission(business_id, 'workforce.schedules.manage', branch_id)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
    );
END
$pol$;

-- STATEMENT 7: HARD CHECK (raises if anything is missing or too wide)
DO $check$
DECLARE v_rel regclass := to_regclass('public.staff_shifts');
BEGIN
  IF v_rel IS NULL THEN RAISE EXCEPTION 'HARD CHECK 266: table missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_rel) THEN RAISE EXCEPTION 'HARD CHECK 266: RLS off'; END IF;
  IF has_table_privilege('anon', v_rel, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'HARD CHECK 266: anon has a privilege'; END IF;
  IF has_table_privilege('authenticated', v_rel, 'TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'HARD CHECK 266: authenticated too wide'; END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = v_rel) <> 4 THEN RAISE EXCEPTION 'HARD CHECK 266: expected 4 policies'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = v_rel AND conname = 'staff_shifts_no_overlap') THEN RAISE EXCEPTION 'HARD CHECK 266: overlap constraint missing'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = v_rel AND NOT tgisinternal) <> 2 THEN RAISE EXCEPTION 'HARD CHECK 266: expected 2 triggers'; END IF;
  RAISE NOTICE 'HARD CHECK 266 passed';
END
$check$;
