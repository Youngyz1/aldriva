-- Rollback for migration_235_permission_catalogue.sql.
--
-- Roll back 235 only after any later migration that grants these keys
-- (e.g. migration 242's owner/admin diff over the 50 new keys) is
-- rolled back first. Rolling back 235 while a later migration still
-- holds grants against the 56 keys deleted in statement 1 below would
-- have already lost those grants to the FK's ON DELETE CASCADE with no
-- way to recover them from this file alone.
--
-- Applied by hand, one statement at a time. No BEGIN/COMMIT -- every
-- statement below is independently idempotent, so re-running this file
-- from the top after a partial failure is safe regardless of where the
-- previous run stopped.
--
-- Statement order (CORRECTED -- Docker-tested; the prior ordering had a
-- real bug): domain's generated column and its CHECK are torn down,
-- and domain is rebuilt as a plain NULLABLE column, BEFORE the 6 keys
-- are renamed back to snake_case. The earlier ordering renamed the
-- keys first while domain was still GENERATED ALWAYS AS
-- (split_part(key, '.', 1)) STORED and the new 17-value domain CHECK
-- was still active: renaming e.g. workforce.view -> view_staff made
-- the generated column recompute to the single dotless string
-- 'view_staff' (split_part with no separator returns the whole
-- string), which is not one of the 17 allowed domain values --
-- `staff_permissions_domain_check` rejected every one of the 6 renames.
-- Domain must be a plain, unconstrained column by the time the renames
-- run; its real values and NOT NULL/CHECK are only restored afterward.
--
-- Source of truth: permissions-backend-plan.md, Section A (v4).

-- ============================================================
-- STATEMENT 1 -- delete the 56 keys inserted by the forward migration's
-- statement 8. Idempotent: a second run matches 0 rows.
--
-- This DELETE, by key, resolves to a set of ids. staff_role_permissions
-- .permission_id REFERENCES staff_permissions(id) ON DELETE CASCADE, so
-- this delete silently removes EVERY staff_role_permissions row
-- referencing any of these 56 ids, for EVERY role that had been granted
-- any of them -- not just the 3 backfills this migration's own
-- statements 9-11 added, but also any later migration's grants over the
-- same 56 keys. That cascade is the intended, correct behavior for this
-- rollback (a deleted permission must not leave a dangling grant); it
-- is why this statement must run first, before anything else below.
-- ============================================================
DELETE FROM public.staff_permissions
WHERE key IN (
  'workforce.invite','workforce.deactivate','workforce.roles.view','workforce.permissions.assign',
  'workforce.attendance.view','workforce.attendance.manage',
  'business.view','business.update','business.settings.manage','business.branches.view','business.branches.manage',
  'customers.view','customers.update','reservations.view','reservations.create','reservations.update',
  'reservations.cancel','reservations.check_in','reservations.manage',
  'products.view','products.manage','inventory.view','inventory.manage',
  'orders.view','orders.create','orders.update','orders.cancel','orders.fulfill',
  'finance.view','finance.transactions.view','finance.refunds.manage','finance.expenses.manage',
  'finance.reports.view','finance.reports.export','reports.export','analytics.view',
  'communications.view','communications.send','communications.manage',
  'rental.bookings.manage','rental.vehicles.manage','rental.inspections.manage','rental.equipment.manage','rental.maintenance.manage',
  'delivery.view','delivery.assign','delivery.update_status',
  'services.manage','services.appointments.manage',
  'events.manage','events.tickets.scan','events.check_in.manage',
  'hospitality.rooms.manage','hospitality.guest_check_in',
  'restaurant.menu.manage','restaurant.kitchen.manage'
);

-- ============================================================
-- STATEMENT 2 -- drop the NEW (dotted-required) key CHECK. Guarded by
-- definition: this drop targets the NEW (dotted) body specifically, so
-- the guard requires the backslash-dot group to be present, the mirror
-- image of the forward migration's statement 1 guard. No key-format
-- CHECK is active from here through statement 9 -- nothing in between
-- inserts or renames to a non-conforming key, so this is safe.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_permissions'::regclass
      AND conname = 'staff_permissions_key_check'
      AND pg_get_constraintdef(oid) ~ '\\.'
  ) THEN
    ALTER TABLE public.staff_permissions DROP CONSTRAINT staff_permissions_key_check;
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 3 -- domain: drop its CHECK (the new 17-value list). Plain
-- name, confirmed on staging -- no definition guard needed here, unlike
-- key: domain's CHECK only ever has one shape at a time and the column
-- itself is being torn down in the next statement regardless.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_permissions'::regclass AND conname = 'staff_permissions_domain_check'
  ) THEN
    ALTER TABLE public.staff_permissions DROP CONSTRAINT staff_permissions_domain_check;
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 4 -- domain: drop the GENERATED column specifically.
-- Guarded on is_generated = 'ALWAYS' so a resumed run (where domain has
-- already been rebuilt as the plain column below) does not re-drop it
-- and lose the values statement 7 will have written.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = 'domain' AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.staff_permissions DROP COLUMN domain;
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 5 -- domain: add it back as a plain, NULLABLE column (no
-- CHECK, no NOT NULL yet) -- deliberately unconstrained at this point
-- so statement 6's renames below cannot conflict with it in any way.
-- Guarded: a resumed run where this column already exists (plain or
-- already populated) skips.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = 'domain'
  ) THEN
    ALTER TABLE public.staff_permissions ADD COLUMN domain text;
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 6 -- rename the surviving 6 keys back to their
-- pre-migration snake_case names. No key-format CHECK is active (it
-- won't be re-added until statement 9) and domain is now a plain,
-- unconstrained column (statements 3-5) -- so this cannot fail. Each
-- UPDATE is naturally idempotent.
-- ============================================================
UPDATE public.staff_permissions SET key = 'view_staff'         WHERE key = 'workforce.view';
UPDATE public.staff_permissions SET key = 'manage_staff'       WHERE key = 'workforce.update';
UPDATE public.staff_permissions SET key = 'manage_roles'       WHERE key = 'workforce.roles.manage';
UPDATE public.staff_permissions SET key = 'manage_schedule'    WHERE key = 'workforce.schedules.manage';
UPDATE public.staff_permissions SET key = 'manage_assignments' WHERE key = 'workforce.assignments.manage';
UPDATE public.staff_permissions SET key = 'view_reports'       WHERE key = 'reports.view';

-- ============================================================
-- STATEMENT 7 -- domain: backfill the original five-domain values
-- explicitly, per the exact pre-migration mapping (not derivable from
-- the key string alone) -- confirmed on staging: view_staff /
-- staff_management, manage_staff / staff_management, manage_roles /
-- role_management, manage_schedule / scheduling, manage_assignments /
-- assignment_management, view_reports / reporting. This is the only
-- path back to these values: the forward migration's statement 5
-- dropped the original plain column (and every value it held)
-- outright, so nothing but this explicit CASE restores them. Guarded
-- by `WHERE domain IS NULL` so a resumed run doesn't re-touch rows
-- that already have their value set.
-- ============================================================
UPDATE public.staff_permissions SET domain = CASE key
  WHEN 'view_staff'         THEN 'staff_management'
  WHEN 'manage_staff'       THEN 'staff_management'
  WHEN 'manage_roles'       THEN 'role_management'
  WHEN 'manage_schedule'    THEN 'scheduling'
  WHEN 'manage_assignments' THEN 'assignment_management'
  WHEN 'view_reports'       THEN 'reporting'
END
WHERE domain IS NULL;

-- ============================================================
-- STATEMENT 8 -- domain: SET NOT NULL, matching the original schema
-- (which had no DEFAULT either). Safe now: every row was backfilled by
-- statement 7. Idempotent: Postgres allows re-asserting NOT NULL on a
-- column that already has it.
-- ============================================================
ALTER TABLE public.staff_permissions ALTER COLUMN domain SET NOT NULL;

-- ============================================================
-- STATEMENT 9 -- add the OLD (dot-less) key CHECK back. Valid now,
-- since every row is already snake_case after statement 6. Guarded by
-- definition: skip if a dot-less staff_permissions_key_check already
-- exists (resumed run).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_permissions'::regclass
      AND conname = 'staff_permissions_key_check'
      AND pg_get_constraintdef(oid) !~ '\\.'
  ) THEN
    ALTER TABLE public.staff_permissions ADD CONSTRAINT staff_permissions_key_check CHECK (key ~ '^[a-z][a-z0-9_]*$');
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 10 -- add the OLD (5-value) domain CHECK back. Valid now,
-- since every row was backfilled by statement 7 and set NOT NULL by
-- statement 8. Plain name; no definition guard needed, same reasoning
-- as statement 3.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_permissions'::regclass AND conname = 'staff_permissions_domain_check'
  ) THEN
    ALTER TABLE public.staff_permissions ADD CONSTRAINT staff_permissions_domain_check
      CHECK (domain IN ('staff_management','role_management','scheduling','assignment_management','reporting'));
  END IF;
END;
$$;
