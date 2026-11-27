-- ============================================================
-- Rollback for migration_243_builtin_role_permissions.sql.
-- Restores the exact pre-243 grants captured from staging:
--   owner/admin 12 keys, manager 9 keys, viewer 2 keys.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
-- Each removed grant writes an audit row (migration 242).
-- ============================================================

-- 1. owner and admin back to their original 12 keys.
DELETE FROM public.staff_role_permissions srp
USING public.staff_roles sr, public.staff_permissions sp
WHERE srp.role_id = sr.id AND srp.permission_id = sp.id
  AND sr.role_scope = 'platform' AND sr.platform_role IN ('owner','admin')
  AND sp.key <> ALL (ARRAY[
    'reports.view','workforce.assignments.manage','workforce.attendance.manage','workforce.attendance.view',
    'workforce.deactivate','workforce.invite','workforce.permissions.assign','workforce.roles.manage',
    'workforce.roles.view','workforce.schedules.manage','workforce.update','workforce.view'
  ]);

-- 2. manager back to its original 9 keys.
DELETE FROM public.staff_role_permissions srp
USING public.staff_roles sr, public.staff_permissions sp
WHERE srp.role_id = sr.id AND srp.permission_id = sp.id
  AND sr.role_scope = 'platform' AND sr.platform_role = 'manager'
  AND sp.key <> ALL (ARRAY[
    'reports.view','workforce.assignments.manage','workforce.attendance.manage','workforce.attendance.view',
    'workforce.deactivate','workforce.invite','workforce.schedules.manage','workforce.update','workforce.view'
  ]);

-- 3. viewer back to its original 2 keys.
DELETE FROM public.staff_role_permissions srp
USING public.staff_roles sr, public.staff_permissions sp
WHERE srp.role_id = sr.id AND srp.permission_id = sp.id
  AND sr.role_scope = 'platform' AND sr.platform_role = 'viewer'
  AND sp.key <> ALL (ARRAY['reports.view','workforce.view']);