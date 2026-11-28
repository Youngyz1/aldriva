-- ============================================================
-- Companion verification SQL for migration_235_permission_catalogue.sql.
-- Read-only queries to run AFTER the forward migration is applied.
-- Do NOT execute inside a transaction that modifies the schema.
-- ============================================================

-- 1. Exactly 62 keys (6 renamed + 56 inserted).
SELECT COUNT(*) AS key_count FROM public.staff_permissions;
-- Expect 62.

-- 2. No key without a dot (every row is now in the dotted format).
SELECT key FROM public.staff_permissions WHERE key !~ '\.';
-- Expect ZERO rows.

-- 3. domain is not null for every row.
SELECT key FROM public.staff_permissions WHERE domain IS NULL;
-- Expect ZERO rows.

-- 4. Every domain value in use is one of the 17 values in
--    staff_permissions_domain_check, and (as a cross-check on the
--    generated column itself, not just the CHECK) the full set of 17
--    is actually represented across the 62 keys.
SELECT domain FROM public.staff_permissions
WHERE domain NOT IN (
  'business','workforce','customers','reservations','products','inventory',
  'orders','finance','reports','analytics','communications',
  'rental','delivery','services','events','hospitality','restaurant'
);
-- Expect ZERO rows.

SELECT COUNT(DISTINCT domain) AS distinct_domain_count FROM public.staff_permissions;
-- Expect 17.

-- 4b. The live CHECK definition, for manual cross-reference against the
--     17-value list above.
SELECT pg_get_constraintdef(oid) AS domain_check_definition
FROM pg_constraint
WHERE conrelid = 'public.staff_permissions'::regclass AND conname = 'staff_permissions_domain_check';

-- 5. No orphaned grants: every staff_role_permissions row resolves to a
--    live staff_permissions row. (The FK's ON DELETE CASCADE should
--    make this structurally impossible, but confirm directly rather
--    than assume.)
SELECT srp.role_id, srp.permission_id
FROM public.staff_role_permissions srp
LEFT JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE sp.id IS NULL;
-- Expect ZERO rows.

-- 6. The 19 pre-existing grants are still present, under their new
--    dotted keys, unchanged by this migration (no DELETE anywhere in
--    the forward file touches staff_role_permissions).
SELECT sr.platform_role, sp.key, COUNT(*) AS grant_count
FROM public.staff_role_permissions srp
JOIN public.staff_roles sr ON sr.id = srp.role_id AND sr.role_scope = 'platform'
JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE sp.key IN (
  'workforce.view', 'workforce.update', 'workforce.roles.manage',
  'workforce.schedules.manage', 'workforce.assignments.manage', 'reports.view'
)
GROUP BY sr.platform_role, sp.key
ORDER BY sp.key, sr.platform_role;
-- Expect 19 rows, grant_count = 1 each:
--   workforce.view               -> owner, admin, manager, viewer (4)
--   workforce.update             -> owner, admin, manager (3)
--   workforce.roles.manage       -> owner, admin (2)
--   workforce.schedules.manage   -> owner, admin, manager (3)
--   workforce.assignments.manage -> owner, admin, manager (3)
--   reports.view                 -> owner, admin, manager, viewer (4)

SELECT COUNT(*) AS pre_existing_grant_total
FROM public.staff_role_permissions srp
JOIN public.staff_roles sr ON sr.id = srp.role_id AND sr.role_scope = 'platform'
JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE sp.key IN (
  'workforce.view', 'workforce.update', 'workforce.roles.manage',
  'workforce.schedules.manage', 'workforce.assignments.manage', 'reports.view'
);
-- Expect 19.

-- 7. The three backfills are present: every role holding
--    workforce.update also holds workforce.invite/deactivate; every
--    role holding workforce.schedules.manage also holds
--    workforce.attendance.view/manage; every role holding
--    workforce.roles.manage also holds
--    workforce.permissions.assign/workforce.roles.view.
SELECT sr.platform_role, sp.key, COUNT(*) AS grant_count
FROM public.staff_role_permissions srp
JOIN public.staff_roles sr ON sr.id = srp.role_id AND sr.role_scope = 'platform'
JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE sp.key IN (
  'workforce.invite', 'workforce.deactivate',
  'workforce.attendance.view', 'workforce.attendance.manage',
  'workforce.permissions.assign', 'workforce.roles.view'
)
GROUP BY sr.platform_role, sp.key
ORDER BY sp.key, sr.platform_role;
-- Expect 16 rows, grant_count = 1 each:
--   workforce.invite             -> owner, admin, manager (3)
--   workforce.deactivate         -> owner, admin, manager (3)
--   workforce.attendance.view    -> owner, admin, manager (3)
--   workforce.attendance.manage  -> owner, admin, manager (3)
--   workforce.permissions.assign -> owner, admin (2)
--   workforce.roles.view         -> owner, admin (2)

SELECT COUNT(*) AS backfill_grant_total
FROM public.staff_role_permissions srp
JOIN public.staff_roles sr ON sr.id = srp.role_id AND sr.role_scope = 'platform'
JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE sp.key IN (
  'workforce.invite', 'workforce.deactivate',
  'workforce.attendance.view', 'workforce.attendance.manage',
  'workforce.permissions.assign', 'workforce.roles.view'
);
-- Expect 16.

-- 7b. Total grants after migration: 19 pre-existing + 16 backfilled,
--     nothing else (235 grants none of the 50 newly-described keys).
SELECT COUNT(*) AS total_grant_count FROM public.staff_role_permissions;
-- Expect 35.

-- 8. None of the 50 newly-described keys (groups A-H) has any grant at
--    all -- 235 only inserts catalogue rows for these, never a grant.
SELECT sp.key, COUNT(srp.role_id) AS grant_count
FROM public.staff_permissions sp
LEFT JOIN public.staff_role_permissions srp ON srp.permission_id = sp.id
WHERE sp.key IN (
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
)
GROUP BY sp.key
HAVING COUNT(srp.role_id) > 0;
-- Expect ZERO rows.

-- 9. domain is actually the GENERATED column this migration creates,
--    not a plain column that happens to hold the right-looking values.
SELECT is_generated
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = 'domain';
-- Expect a single row, is_generated = 'ALWAYS'.

-- 10. staff_permissions_key_check is actually the NEW (dotted) body,
--     not a false positive from a guard that matched on name alone.
SELECT pg_get_constraintdef(oid) AS key_check_definition
FROM pg_constraint
WHERE conrelid = 'public.staff_permissions'::regclass AND conname = 'staff_permissions_key_check';
-- Expect one row whose definition contains a backslash-dot group,
-- e.g. '...(\.[a-z][a-z0-9_]*)+...'.
