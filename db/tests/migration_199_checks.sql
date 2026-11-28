-- db/tests/migration_199_checks.sql
-- READ-ONLY migration structure and privileges verification (no financial rows changed).

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_source_check text;
  v_settle_oid oid;
  v_payment_oid oid;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_source_check
    FROM pg_constraint
   WHERE conrelid = 'public.recipient_ledger_entries'::regclass
     AND conname = 'recipient_ledger_entries_source_type_check';
  IF v_source_check IS NULL OR v_source_check NOT LIKE '%''order''%' THEN
    RAISE EXCEPTION 'CHECK FAILED: ledger source constraint does not include order: %', v_source_check;
  END IF;

  SELECT p.oid INTO v_settle_oid FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
   WHERE n.nspname='public' AND p.proname='mark_table_paid_and_close_session'
     AND pg_get_function_identity_arguments(p.oid)='p_table_session_id uuid, p_business_id uuid, p_payment_method text, p_actor_user_id uuid';
  IF v_settle_oid IS NULL OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_settle_oid) THEN
    RAISE EXCEPTION 'CHECK FAILED: settlement RPC missing or not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', v_settle_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_settle_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CHECK FAILED: settlement RPC must not be executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', v_settle_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CHECK FAILED: service_role cannot execute settlement RPC';
  END IF;

  SELECT p.oid INTO v_payment_oid FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
   WHERE n.nspname='public' AND p.proname='record_storefront_order_paid_and_credit'
     AND pg_get_function_identity_arguments(p.oid)='p_order_id uuid, p_stripe_payment_intent_id text';
  IF v_payment_oid IS NULL OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_payment_oid) THEN
    RAISE EXCEPTION 'CHECK FAILED: payment/ledger RPC missing or not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', v_payment_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_payment_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CHECK FAILED: payment/ledger RPC must not be executable by anon/authenticated';
  END IF;

  RAISE NOTICE 'Migration 199 read-only catalog and privilege checks passed.';
END;
$$;
