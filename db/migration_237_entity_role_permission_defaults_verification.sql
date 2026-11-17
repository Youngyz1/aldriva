-- ============================================================
-- Companion verification SQL for
-- migration_237_entity_role_permission_defaults.sql.
-- Read-only queries to run AFTER the forward migration is applied.
-- Do NOT execute inside a transaction that modifies the schema.
-- ============================================================

-- 1. Both rows exist.
SELECT entity_role FROM public.entity_role_permission_defaults ORDER BY entity_role;
-- Expect exactly two rows: editor, finance.

-- 2. Row level security is on.
SELECT relrowsecurity
FROM pg_class
WHERE oid = 'public.entity_role_permission_defaults'::regclass;
-- Expect true.

-- 3. Exactly one SELECT policy.
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.entity_role_permission_defaults'::regclass;
-- Expect exactly one row: polname = 'Authenticated can view entity role
-- permission defaults', polcmd = 'r' (SELECT).

-- 4. Every key in both arrays exists and is active in staff_permissions.
SELECT erpd.entity_role, k AS missing_key
FROM public.entity_role_permission_defaults erpd
CROSS JOIN LATERAL unnest(erpd.permission_keys) AS k
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_permissions sp
  WHERE sp.key = k AND sp.is_active
);
-- Expect ZERO rows.

-- 5. No other roles present.
SELECT entity_role
FROM public.entity_role_permission_defaults
WHERE entity_role NOT IN ('editor', 'finance');
-- Expect ZERO rows.

SELECT COUNT(*) AS row_count FROM public.entity_role_permission_defaults;
-- Expect 2.
