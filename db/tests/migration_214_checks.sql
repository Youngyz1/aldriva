-- db/tests/migration_214_checks.sql
-- Read-only checks: SELECT assertions only.
-- Must not modify any data.
-- Part of migration 214 audit: verify tables, columns, functions, RLS, indexes.

-- 1. Verify scan_events RLS is enabled
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'scan_events';

-- 2. Verify no grants to anon/authenticated on scan_events
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'scan_events'
  AND grantee IN ('PUBLIC','anon','authenticated');

-- 3. Verify scan_events unique index columns: (tenant_id, client_scan_id) WHERE client_scan_id IS NOT NULL
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'scan_events'
  AND indexname = 'ux_scan_events_tenant_client';

-- 4. Verify every business has exactly one main branch
SELECT b.id, b.name,
  COUNT(bb.id) AS branch_count,
  SUM(CASE WHEN bb.is_main THEN 1 ELSE 0 END) AS main_count
FROM public.businesses b
LEFT JOIN public.business_branches bb ON bb.business_id = b.id
GROUP BY b.id, b.name
ORDER BY b.id;

-- 5. Verify no orders with business_id and null branch_id
SELECT count(*) AS orders_without_branch
FROM public.orders
WHERE business_id IS NOT NULL AND branch_id IS NULL;

-- 6. Verify no reservations with business_id and null branch_id
SELECT count(*) AS reservations_without_branch
FROM public.reservations
WHERE business_id IS NOT NULL AND branch_id IS NULL;

-- 7. Verify existing grants on orders unchanged (service_role only)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'orders'
ORDER BY grantee, privilege_type;
