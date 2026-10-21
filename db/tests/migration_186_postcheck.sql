-- Read-only post-check for migration 186. Expected result for every row: all
-- booleans true, the five named migration-186 triggers enabled, and the six
-- named functions available only to service_role (apart from each owner).

SELECT
  'migration_186_columns_constraints_and_rls' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'business_workers'
       AND column_name = 'is_available' AND is_nullable = 'NO'
  ) AS availability_column_ok,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name = 'courier_worker_id'
  ) AS assignment_column_ok,
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_workers'::regclass
       AND conname = 'business_workers_inactive_offline_check'
       AND contype = 'c'
  ) AS inactive_offline_check_ok,
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.business_workers'::regclass
       AND conname = 'business_workers_courier_availability_check'
       AND contype = 'c'
  ) AS courier_availability_check_ok,
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'business_courier_offers'
       AND c.relrowsecurity = true
  ) AS offers_rls_enabled,
  EXISTS (
    SELECT 1 FROM pg_views
     WHERE schemaname = 'public'
       AND viewname = 'business_courier_offer_feed'
       AND definition ILIKE '%ready%'
       AND definition ILIKE '%delivery_address%'
       AND definition ILIKE '%amount_to_collect%'
       AND definition NOT ILIKE '%customer_name%'
       AND definition NOT ILIKE '%customer_phone%'
  ) AS safe_ready_only_feed_view,
  has_table_privilege('service_role', 'public.business_courier_offer_feed', 'SELECT') AS service_role_can_read_feed,
  NOT has_table_privilege('anon', 'public.business_courier_offer_feed', 'SELECT') AS anon_cannot_read_feed,
  NOT has_table_privilege('authenticated', 'public.business_courier_offer_feed', 'SELECT') AS authenticated_cannot_read_feed;
-- Expected: one row; all nine booleans = true.

SELECT
  'unique_order_courier_offer_index' AS check_name,
  EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = tbl.relnamespace
     WHERE n.nspname = 'public'
       AND tbl.relname = 'business_courier_offers'
       AND idx.relname = 'uq_business_courier_offers_order_worker'
       AND i.indisunique
       AND pg_get_indexdef(i.indexrelid) ILIKE '%(order_id, courier_worker_id)%'
  ) AS passed;
-- Expected: one row, passed = true.

SELECT
  'one_active_order_per_courier_index' AS check_name,
  EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = tbl.relnamespace
     WHERE n.nspname = 'public'
       AND tbl.relname = 'orders'
       AND idx.relname = 'idx_orders_one_active_order_per_courier'
       AND i.indisunique
       AND pg_get_indexdef(i.indexrelid) ILIKE '%(courier_worker_id)%'
       AND replace(
             regexp_replace(
               lower(pg_get_expr(i.indpred, i.indrelid)),
               '[()[:space:]]', '', 'g'
             ),
             '::text', ''
           ) = 'courier_worker_idisnotnullandstatus=''out_for_delivery'''
  ) AS passed;
-- Expected: one row, passed = true; index is unique and partial to active deliveries.

WITH expected(trigger_name, table_name) AS (
  VALUES
    ('trg_offer_ready_delivery_insert', 'orders'),
    ('trg_offer_ready_delivery_update', 'orders'),
    ('trg_force_inactive_worker_offline', 'business_workers'),
    ('trg_sync_courier_offers_on_availability', 'business_workers'),
    ('trg_resolve_courier_offers_on_order_status', 'orders')
)
SELECT
  e.trigger_name,
  (t.oid IS NOT NULL) AS exists,
  (t.tgenabled = 'O') AS enabled
FROM expected AS e
LEFT JOIN pg_trigger AS t
  ON t.tgname = e.trigger_name
 AND t.tgrelid = to_regclass('public.' || e.table_name)
 AND NOT t.tgisinternal
ORDER BY e.trigger_name;
-- Expected: exactly five rows; exists = true and enabled = true on each.
-- These are the five migration-186 triggers; migration 185's deactivation
-- revocation trigger remains in addition to this set.

SELECT
  count(*) AS migration_186_trigger_count,
  (count(*) = 5) AS exactly_five
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN (
    'trg_offer_ready_delivery_insert',
    'trg_offer_ready_delivery_update',
    'trg_force_inactive_worker_offline',
    'trg_sync_courier_offers_on_availability',
    'trg_resolve_courier_offers_on_order_status'
  );
-- Expected: one row; migration_186_trigger_count = 5, exactly_five = true.

WITH expected(function_name, signature) AS (
  VALUES
    ('offer_ready_delivery_couriers', 'public.offer_ready_delivery_couriers()'),
    ('sync_courier_availability_and_offer_ready_deliveries', 'public.sync_courier_availability_and_offer_ready_deliveries()'),
    ('resolve_courier_offers_on_order_status', 'public.resolve_courier_offers_on_order_status()'),
    ('consume_business_worker_invitation', 'public.consume_business_worker_invitation(text,text,text)'),
    ('claim_business_courier_offer', 'public.claim_business_courier_offer(uuid,uuid,jsonb)'),
    ('decline_business_courier_offer', 'public.decline_business_courier_offer(uuid,uuid,text)')
), resolved AS (
  SELECT e.function_name, to_regprocedure(e.signature)::oid AS function_oid
    FROM expected AS e
)
SELECT
  r.function_name,
  (p.oid IS NOT NULL) AS exists,
  COALESCE(p.prosecdef, false) AS security_definer,
  COALESCE(p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'], false) AS fixed_search_path,
  COALESCE(p.proargnames @> ARRAY['out_role'], false)
    OR r.function_name <> 'consume_business_worker_invitation' AS consumer_returns_role,
  COALESCE(has_function_privilege('service_role', p.oid, 'EXECUTE'), false) AS service_role_can_execute,
  COALESCE(NOT has_function_privilege('anon', p.oid, 'EXECUTE'), false) AS anon_cannot_execute,
  COALESCE(NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) AS authenticated_cannot_execute,
  COALESCE(NOT EXISTS (
    SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
     WHERE acl.privilege_type = 'EXECUTE'
       AND acl.grantee <> p.proowner
       AND acl.grantee <> (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
  ), false) AS no_other_execute_grantees
FROM resolved AS r
LEFT JOIN pg_proc AS p ON p.oid = r.function_oid
ORDER BY r.function_name;
-- Expected: exactly six rows; every boolean is true. The function owner is
-- inherently executable by PostgreSQL; service_role is the only runtime grant.
