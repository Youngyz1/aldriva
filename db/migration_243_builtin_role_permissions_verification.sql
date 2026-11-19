-- ============================================================
-- Companion verification for migration_243_builtin_role_permissions.sql.
-- Read-only. Run AFTER the forward migration.
-- ============================================================

-- 1. Key counts per seeded role.
SELECT sr.platform_role, count(srp.permission_id) AS keys
FROM public.staff_roles sr
LEFT JOIN public.staff_role_permissions srp ON srp.role_id = sr.id
WHERE sr.role_scope = 'platform'
GROUP BY 1 ORDER BY 1;
-- Expect: admin 62, manager 50, owner 62, viewer 12.

-- 2. Viewer keys that manager lacks.
SELECT sp.key
FROM public.staff_role_permissions srp
JOIN public.staff_roles sr ON sr.id = srp.role_id AND sr.role_scope='platform' AND sr.platform_role='viewer'
JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE srp.permission_id NOT IN (
  SELECT m.permission_id FROM public.staff_role_permissions m
  JOIN public.staff_roles mr ON mr.id = m.role_id AND mr.role_scope='platform' AND mr.platform_role='manager');
-- Expect ZERO rows.

-- 3. Active catalogue keys that owner or admin lack.
SELECT sr.platform_role, sp.key
FROM public.staff_roles sr
CROSS JOIN public.staff_permissions sp
WHERE sr.role_scope='platform' AND sr.platform_role IN ('owner','admin') AND sp.is_active
  AND NOT EXISTS (SELECT 1 FROM public.staff_role_permissions srp
                  WHERE srp.role_id = sr.id AND srp.permission_id = sp.id);
-- Expect ZERO rows.

-- 4. The 12 keys manager must NOT hold.
SELECT sp.key
FROM public.staff_role_permissions srp
JOIN public.staff_roles sr ON sr.id = srp.role_id AND sr.role_scope='platform' AND sr.platform_role='manager'
JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE sp.key LIKE 'finance.%'
   OR sp.key IN ('reports.export','business.update','business.settings.manage','business.branches.manage',
                 'workforce.roles.manage','workforce.permissions.assign');
-- Expect ZERO rows.

-- 5. Viewer holds no write-style key.
SELECT sp.key
FROM public.staff_role_permissions srp
JOIN public.staff_roles sr ON sr.id = srp.role_id AND sr.role_scope='platform' AND sr.platform_role='viewer'
JOIN public.staff_permissions sp ON sp.id = srp.permission_id
WHERE sp.key ~ '(manage|update|create|cancel|send|assign|invite|deactivate|fulfill|check_in|scan|guest_checkin|export)';
-- Expect ZERO rows.

-- 6. No custom roles were touched.
SELECT count(*) AS custom_roles FROM public.staff_roles WHERE role_scope = 'business';
-- Expect 0.

-- 7. Audit rows written by this migration (grants with no actor, no business).
SELECT count(*) AS grant_audit_rows
FROM public.staff_audit_logs
WHERE action = 'permission_granted_to_role' AND business_id IS NULL AND actor_user_id IS NULL;
-- Expect 151 if this is the first time 243 is applied.