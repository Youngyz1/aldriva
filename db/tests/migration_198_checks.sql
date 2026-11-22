-- db/tests/migration_198_checks.sql
-- Post-Deployment Structural Verification Checks for Migration 198 (Table & Menu QR Codes)
-- STRICTLY READ-ONLY: Safe to run against staging or production after deploying Migration 198.
-- Note: Behavioral simulations (concurrency limits, menu_only mode guard, idempotency replay)
-- are executed in an isolated test environment via lib/orders/__tests__/table-qr-concurrency.test.cjs
-- to avoid un-isolated data mutations on shared databases.

DO $$
BEGIN
  -- ── 1. Check tables exist ───────────────────────────────────────────────────
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'business_tables'
  )), 'Assertion Failed: business_tables table missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'qr_redirect_codes'
  )), 'Assertion Failed: qr_redirect_codes table missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'table_sessions'
  )), 'Assertion Failed: table_sessions table missing';

  -- ── 1b. Check session_token_hash on table_sessions ─────────────────────────
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'table_sessions'
       AND column_name = 'session_token_hash'
       AND is_nullable = 'NO'
  )), 'Assertion Failed: table_sessions.session_token_hash missing or nullable';

  -- Assert plaintext session_token is dropped (tokens hashed at rest security contract)
  ASSERT (SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'table_sessions'
       AND column_name = 'session_token'
  )), 'Assertion Failed: plaintext session_token column must not exist; tokens must be stored as SHA-256 hashes at rest';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.table_sessions'::regclass
       AND conname = 'table_sessions_session_token_hash_check'
       AND pg_get_constraintdef(oid) LIKE '%^[0-9a-f]{64}$%'
  )), 'Assertion Failed: table_sessions_session_token_hash_check missing or invalid format';

  -- ── 2. Check columns on orders ──────────────────────────────────────────────
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'table_id'
  )), 'Assertion Failed: orders.table_id missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'table_session_id'
  )), 'Assertion Failed: orders.table_session_id missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'table_label'
  )), 'Assertion Failed: orders.table_label missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'guest_token_hash'
  )), 'Assertion Failed: orders.guest_token_hash missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'dine_in_confirmation'
  )), 'Assertion Failed: orders.dine_in_confirmation missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'dine_in_declined_reason'
  )), 'Assertion Failed: orders.dine_in_declined_reason missing';

  -- ── 3. Check customer_phone is nullable ─────────────────────────────────────
  ASSERT (SELECT is_nullable = 'YES'
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'orders'
             AND column_name = 'customer_phone'),
    'Assertion Failed: orders.customer_phone must be nullable for dine-in';

  -- ── 4. Check businesses.table_ordering_mode exists and allows all 5 modes ─
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'businesses'
       AND column_name = 'table_ordering_mode'
  )), 'Assertion Failed: businesses.table_ordering_mode missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.businesses'::regclass
       AND conname = 'businesses_table_ordering_mode_check'
       AND pg_get_constraintdef(oid) LIKE '%disabled%'
       AND pg_get_constraintdef(oid) LIKE '%menu_only%'
       AND pg_get_constraintdef(oid) LIKE '%order_pay_later%'
       AND pg_get_constraintdef(oid) LIKE '%order_pay_now%'
       AND pg_get_constraintdef(oid) LIKE '%pay_online_first%'
  )), 'Assertion Failed: businesses_table_ordering_mode_check does not support all 5 ordering modes';

  -- ── 5. Check RLS is enabled on all 3 new tables ─────────────────────────────
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'business_tables'),
    'Assertion Failed: RLS not enabled on business_tables';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'qr_redirect_codes'),
    'Assertion Failed: RLS not enabled on qr_redirect_codes';
  ASSERT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'table_sessions'),
    'Assertion Failed: RLS not enabled on table_sessions';

  -- ── 6. Check RLS policies exist ─────────────────────────────────────────────
  ASSERT (SELECT count(*) >= 2 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_tables'),
    'Assertion Failed: policies missing on business_tables';
  ASSERT (SELECT count(*) >= 2 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'qr_redirect_codes'),
    'Assertion Failed: policies missing on qr_redirect_codes';
  ASSERT (SELECT count(*) >= 2 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'table_sessions'),
    'Assertion Failed: policies missing on table_sessions';

  -- ── 7. Check helper function produces >= 8 char random hex ──────────────────
  ASSERT (SELECT char_length(public.generate_qr_short_code()) >= 8),
    'Assertion Failed: generate_qr_short_code() returned string shorter than 8 chars';

  -- ── 8. Check partial unique index on table_sessions ─────────────────────────
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'table_sessions'
       AND indexname = 'idx_table_sessions_table_active_unique'
  )), 'Assertion Failed: idx_table_sessions_table_active_unique partial index missing';

  -- ── 9. Check functions exist and have secure privileges ─────────────────────
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'get_or_create_active_table_session'
       AND prosecdef = true
       AND array_to_string(proconfig, ',') LIKE '%search_path=pg_catalog, public, extensions%'
  )), 'Assertion Failed: function get_or_create_active_table_session missing, not SECURITY DEFINER, or search_path unhardened';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'submit_dine_in_order'
       AND prosecdef = true
       AND array_to_string(proconfig, ',') LIKE '%search_path=pg_catalog, public, extensions%'
  )), 'Assertion Failed: function submit_dine_in_order missing, not SECURITY DEFINER, or search_path unhardened';

  -- Privilege checks: service_role granted, anon/authenticated revoked
  ASSERT (SELECT has_function_privilege('service_role', 'public.get_or_create_active_table_session(uuid,uuid,text)', 'EXECUTE')),
    'Assertion Failed: service_role missing EXECUTE on get_or_create_active_table_session';
  ASSERT (SELECT has_function_privilege('service_role', 'public.submit_dine_in_order(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text)', 'EXECUTE')),
    'Assertion Failed: service_role missing EXECUTE on submit_dine_in_order';

  ASSERT (SELECT NOT has_function_privilege('anon', 'public.get_or_create_active_table_session(uuid,uuid,text)', 'EXECUTE')),
    'Assertion Failed: anon must NOT have EXECUTE on get_or_create_active_table_session';
  ASSERT (SELECT NOT has_function_privilege('anon', 'public.submit_dine_in_order(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text)', 'EXECUTE')),
    'Assertion Failed: anon must NOT have EXECUTE on submit_dine_in_order';

  -- ── 10. Check constraints exist on orders ───────────────────────────────────
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_fulfilment_type_check'
       AND pg_get_constraintdef(oid) LIKE '%dine_in%'
  )), 'Assertion Failed: orders_fulfilment_type_check missing or does not include dine_in';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_delivery_address_required'
       AND pg_get_constraintdef(oid) LIKE '%dine_in%'
  )), 'Assertion Failed: orders_delivery_address_required missing or does not allow dine_in';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_dine_in_confirmation_check'
  )), 'Assertion Failed: orders_dine_in_confirmation_check missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_guest_token_hash_check'
       AND pg_get_constraintdef(oid) LIKE '%^[0-9a-f]{64}$%'
  )), 'Assertion Failed: orders_guest_token_hash_check missing or invalid format check';

  RAISE NOTICE 'Migration 198 structural verification checks passed successfully (100%% read-only).';
END;
$$;
