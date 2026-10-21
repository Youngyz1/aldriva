-- Read-only pre-check for migration 186. Expected result for every row: passed = true.
-- The database has no schema_migrations ledger; these checks confirm the
-- required Phase 1/order schema and ensure migration 186 is not already present.

WITH required_objects(object_name) AS (
  VALUES
    ('public.orders'),
    ('public.businesses'),
    ('public.business_workers'),
    ('public.business_worker_invitations'),
    ('public.business_worker_sessions')
)
SELECT
  'phase_1_and_order_relations_exist' AS check_name,
  bool_and(to_regclass(object_name) IS NOT NULL) AS passed
FROM required_objects;
-- Expected: one row, passed = true.

SELECT
  'courier_role_is_allowed' AS check_name,
  EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.business_workers'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%courier%'
       AND pg_get_constraintdef(c.oid) ILIKE '%cook%'
  ) AS passed,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'business_workers'
       AND column_name IN ('role', 'business_id', 'is_active', 'deactivated_at', 'phone', 'full_name')
     GROUP BY table_schema, table_name
    HAVING count(*) = 6
  ) AS worker_columns_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'business_worker_invitations'
       AND column_name IN ('worker_id', 'token_hash', 'expires_at', 'token_consumed_at', 'accepted_at', 'revoked_at')
     GROUP BY table_schema, table_name
    HAVING count(*) = 6
  ) AS invitation_columns_present;
-- Expected: one row; all three booleans = true.

SELECT
  'migration_186_names_are_free' AS check_name,
  to_regclass('public.business_courier_offers') IS NULL AS offers_table_absent,
  to_regclass('public.business_courier_offer_feed') IS NULL AS feed_view_absent,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'business_workers'
       AND column_name = 'is_available'
  ) AS availability_column_absent,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name = 'courier_worker_id'
  ) AS assignment_column_absent,
  to_regprocedure('public.claim_business_courier_offer(uuid,uuid,jsonb)') IS NULL AS claim_function_absent,
  to_regprocedure('public.decline_business_courier_offer(uuid,uuid,text)') IS NULL AS decline_function_absent,
  to_regclass('public.idx_orders_one_active_order_per_courier') IS NULL AS active_courier_index_absent,
  to_regprocedure('public.consume_business_worker_invitation(text,text,text)') IS NOT NULL AS worker_consumer_present;
-- Expected: one row; first seven booleans = true, worker_consumer_present = true.

SELECT
  'required_order_columns_present' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name IN (
         'id', 'business_id', 'status', 'fulfilment_type', 'items',
         'delivery_address', 'customer_name', 'customer_phone',
         'payment_method', 'payment_status', 'total_amount', 'rider_name',
         'rider_phone', 'status_history', 'estimated_ready_at', 'updated_at'
       )
     GROUP BY table_schema, table_name
    HAVING count(*) = 16
  ) AS passed;
-- Expected: one row, passed = true.

SELECT
  'pickup_address_and_delivery_status_schema_present' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'businesses'
       AND column_name = 'address'
  ) AS pickup_address_present,
  EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.orders'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%out_for_delivery%'
       AND pg_get_constraintdef(c.oid) ILIKE '%delivered%'
  ) AS migration_175_status_check_present;
-- Expected: one row; both booleans = true.
