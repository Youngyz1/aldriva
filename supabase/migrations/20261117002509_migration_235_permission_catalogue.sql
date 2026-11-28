-- Migration 235: permission catalogue mechanics.
-- Dotted-key rename of the 6 existing staff_permissions rows, conversion
-- of staff_permissions.domain from a plain column to a generated column
-- (split_part(key, '.', 1)), insertion of the 56 new catalogue keys, and
-- three mechanical grant backfills tied to the renames.
--
-- Applied by hand, one statement at a time. No BEGIN/COMMIT -- every
-- statement below is independently idempotent, so re-running this file
-- from the top after a partial failure is safe regardless of where the
-- previous run stopped.
--
-- Scope: this migration grants NONE of the 50 newly-described keys
-- (groups A-H) to any role. It only (a) renames the 6 pre-existing keys,
-- (b) inserts all 56 new catalogue rows, and (c) backfills grants for 6
-- of those 56 (workforce.invite, workforce.deactivate,
-- workforce.attendance.view, workforce.attendance.manage,
-- workforce.permissions.assign, workforce.roles.view) onto whichever
-- roles already held the renamed key those 6 are mechanically derived
-- from. No existing grant is removed; there is no DELETE against
-- staff_role_permissions anywhere in this file.
--
-- Source of truth: permissions-backend-plan.md, Section A (v4).

-- ============================================================
-- STATEMENT 0 -- PREFLIGHT (read-only).
-- Accepts either the pre-migration state (6 snake_case keys, no dots)
-- or the fully-applied post-migration state (dotted keys) -- the regex
-- below uses `*` (zero or more dotted segments), not `+`, so both a
-- zero-dot key and a one-or-more-dot key match. Raises otherwise.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.staff_permissions
    WHERE key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
  ) THEN
    RAISE EXCEPTION 'Unexpected staff_permissions.key value outside both the pre- and post-migration formats';
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 1 -- KEY FORMAT: drop the old (dot-less) key CHECK.
-- Guarded by DEFINITION, not just name: staff_permissions_key_check is
-- reused for two different bodies at different points in time (the old
-- dot-less regex, then the new dotted one). On a resumed run where the
-- constraint already has the NEW body, this guard must not drop it --
-- the old check's definition has no backslash-dot group; the new one
-- does; that's the distinguishing signal, not the name.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_permissions'::regclass
      AND conname = 'staff_permissions_key_check'
      AND pg_get_constraintdef(oid) !~ '\\.'
  ) THEN
    ALTER TABLE public.staff_permissions DROP CONSTRAINT staff_permissions_key_check;
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 2 -- rename the 6 existing keys to their dotted names.
-- Each UPDATE is naturally idempotent: on a resumed run the WHERE key =
-- '<old snake_case name>' clause matches zero rows once already renamed.
-- ============================================================
UPDATE public.staff_permissions SET key = 'workforce.view'               WHERE key = 'view_staff';
UPDATE public.staff_permissions SET key = 'workforce.update'             WHERE key = 'manage_staff';
UPDATE public.staff_permissions SET key = 'workforce.roles.manage'       WHERE key = 'manage_roles';
UPDATE public.staff_permissions SET key = 'workforce.schedules.manage'   WHERE key = 'manage_schedule';
UPDATE public.staff_permissions SET key = 'workforce.assignments.manage' WHERE key = 'manage_assignments';
UPDATE public.staff_permissions SET key = 'reports.view'                 WHERE key = 'view_reports';

-- ============================================================
-- STATEMENT 3 -- KEY FORMAT: add the new (dotted-required) key CHECK.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_permissions'::regclass
      AND conname = 'staff_permissions_key_check'
      AND pg_get_constraintdef(oid) ~ '\\.'
  ) THEN
    ALTER TABLE public.staff_permissions
      ADD CONSTRAINT staff_permissions_key_check
      CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 4 -- DOMAIN: drop the old plain-column CHECK.
-- Plain name, confirmed on staging. No definition guard needed here the
-- way key needs one -- domain's CHECK only ever has one shape at
-- forward-migration time (the fixed 17-value list), and the column
-- itself changes from plain to generated in the same pass, so there's
-- no "which of two live bodies is this" ambiguity to resolve.
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
-- STATEMENT 5 -- DOMAIN: drop the plain column. Guarded so a resumed
-- run (where domain is already the generated column) does not drop it.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = 'domain' AND is_generated = 'NEVER'
  ) THEN
    ALTER TABLE public.staff_permissions DROP COLUMN domain;
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 6 -- DOMAIN: add it back as a generated column, derived
-- from key. The six existing domain values from the plain column are
-- lost here (dropped with the column in statement 5) and recomputed
-- fresh from each row's (already-renamed, dotted) key.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = 'domain'
  ) THEN
    ALTER TABLE public.staff_permissions
      ADD COLUMN domain text GENERATED ALWAYS AS (split_part(key, '.', 1)) STORED;
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 7 -- DOMAIN: add the new CHECK. The 17 allowed values equal
-- the distinct key prefixes across all 62 keys this migration results
-- in (6 renamed + 56 inserted in statement 8).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff_permissions'::regclass AND conname = 'staff_permissions_domain_check'
  ) THEN
    ALTER TABLE public.staff_permissions
      ADD CONSTRAINT staff_permissions_domain_check
      CHECK (domain IN (
        'business','workforce','customers','reservations','products','inventory',
        'orders','finance','reports','analytics','communications',
        'rental','delivery','services','events','hospitality','restaurant'
      ));
  END IF;
END;
$$;

-- ============================================================
-- STATEMENT 8 -- INSERT the 56 new catalogue keys (idempotent:
-- ON CONFLICT). Grants no permission to any role -- catalogue rows
-- only. 50 of the 56 (groups A-H) carry descriptions marked "drafted,
-- unreviewed" per instruction: 33 (groups A-G) copied verbatim from the
-- owner's product document; 17 (group H, domain-specific) are new text
-- drafted fresh this turn, since that document only ever listed their
-- bare key names, not descriptions. The remaining 6 (group B, the
-- already-named workforce.* keys) are the backfill targets for
-- statement 9-11 below.
-- ============================================================
INSERT INTO public.staff_permissions (key, description) VALUES
  -- B. Workforce management (backfill targets for statements 9-11)
  ('workforce.invite',             'Invite new workers'),
  ('workforce.deactivate',         'Deactivate workers'),
  ('workforce.roles.view',         'View roles'),
  ('workforce.permissions.assign', 'Assign approved permissions'),
  ('workforce.attendance.view',    'View attendance'),
  ('workforce.attendance.manage',  'Manage attendance records'),
  -- A. Business management
  ('business.view',             'View business information'),
  ('business.update',           'Edit business information'),
  ('business.settings.manage',  'Change business settings'),
  ('business.branches.view',    'View branches'),
  ('business.branches.manage',  'Create and manage branches'),
  -- C. Customers and reservations
  ('customers.view',          'View customer information'),
  ('customers.update',        'Edit customer information'),
  ('reservations.view',       'View reservations'),
  ('reservations.create',     'Create reservations'),
  ('reservations.update',     'Modify reservations'),
  ('reservations.cancel',     'Cancel reservations'),
  ('reservations.check_in',   'Check customers in'),
  ('reservations.manage',     'Manage reservation operations'),
  -- D. Products, inventory and orders
  ('products.view',      'View products'),
  ('products.manage',    'Create and edit products'),
  ('inventory.view',     'View stock'),
  ('inventory.manage',   'Update stock'),
  ('orders.view',         'View orders'),
  ('orders.create',       'Create orders'),
  ('orders.update',       'Update orders'),
  ('orders.cancel',       'Cancel orders'),
  ('orders.fulfill',      'Process and fulfill orders'),
  -- E. Financial management
  ('finance.view',                 'View financial information'),
  ('finance.transactions.view',    'View transactions'),
  ('finance.refunds.manage',       'Process authorized refunds'),
  ('finance.expenses.manage',      'Record expenses'),
  ('finance.reports.view',         'View financial reports'),
  ('finance.reports.export',       'Export financial reports'),
  -- F. Reports and analytics (reports.view already renamed from view_reports)
  ('reports.export',   'Export reports'),
  ('analytics.view',   'View business analytics'),
  -- G. Communication
  ('communications.view',    'View business communications'),
  ('communications.send',    'Send customer communications'),
  ('communications.manage',  'Manage communication settings'),
  -- H. Domain-specific operations
  ('rental.bookings.manage',      'Manage vehicle or equipment rental bookings'),
  ('rental.vehicles.manage',      'Manage the rental vehicle fleet'),
  ('rental.inspections.manage',   'Manage rental vehicle inspections'),
  ('rental.equipment.manage',     'Manage rental equipment'),
  ('rental.maintenance.manage',   'Manage rental equipment maintenance'),
  ('delivery.view',               'View deliveries'),
  ('delivery.assign',             'Assign deliveries to couriers'),
  ('delivery.update_status',      'Update delivery status'),
  ('services.manage',             'Manage service offerings'),
  ('services.appointments.manage','Manage service appointments'),
  ('events.manage',               'Manage events'),
  ('events.tickets.scan',         'Scan event tickets'),
  ('events.check_in.manage',      'Manage event check-in'),
  ('hospitality.rooms.manage',    'Manage hospitality rooms'),
  ('hospitality.guest_check_in',  'Check in hospitality guests'),
  ('restaurant.menu.manage',      'Manage restaurant menu'),
  ('restaurant.kitchen.manage',   'Manage restaurant kitchen operations')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- STATEMENT 9 -- BACKFILL: every role already holding workforce.update
-- (the rename of manage_staff) also receives workforce.invite and
-- workforce.deactivate -- the two actions that bundle used to cover.
-- Idempotent: ON CONFLICT DO NOTHING.
-- ============================================================
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT srp.role_id, sp.id
FROM public.staff_role_permissions srp
JOIN public.staff_permissions old ON old.id = srp.permission_id AND old.key = 'workforce.update'
JOIN public.staff_permissions sp ON sp.key IN ('workforce.invite', 'workforce.deactivate')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- STATEMENT 10 -- BACKFILL: every role already holding
-- workforce.schedules.manage (the rename of manage_schedule) also
-- receives workforce.attendance.view and workforce.attendance.manage.
-- Idempotent: ON CONFLICT DO NOTHING.
-- ============================================================
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT srp.role_id, sp.id
FROM public.staff_role_permissions srp
JOIN public.staff_permissions old ON old.id = srp.permission_id AND old.key = 'workforce.schedules.manage'
JOIN public.staff_permissions sp ON sp.key IN ('workforce.attendance.view', 'workforce.attendance.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- STATEMENT 11 -- BACKFILL: every role already holding
-- workforce.roles.manage (the rename of manage_roles) also receives
-- workforce.permissions.assign and workforce.roles.view.
-- Idempotent: ON CONFLICT DO NOTHING.
-- ============================================================
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT srp.role_id, sp.id
FROM public.staff_role_permissions srp
JOIN public.staff_permissions old ON old.id = srp.permission_id AND old.key = 'workforce.roles.manage'
JOIN public.staff_permissions sp ON sp.key IN ('workforce.permissions.assign', 'workforce.roles.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;
