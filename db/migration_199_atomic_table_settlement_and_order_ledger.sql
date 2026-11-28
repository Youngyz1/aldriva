-- migration_199_atomic_table_settlement_and_order_ledger.sql
-- Atomic table settlement and verified storefront payment ledger integration.

BEGIN;

-- Business orders become a first-class ledger source. Keep existing source types.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.recipient_ledger_entries'::regclass
       AND conname = 'recipient_ledger_entries_source_type_check'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_199_BLOCKED: expected recipient ledger source constraint is missing';
  END IF;

  ALTER TABLE public.recipient_ledger_entries
    DROP CONSTRAINT recipient_ledger_entries_source_type_check;
  ALTER TABLE public.recipient_ledger_entries
    ADD CONSTRAINT recipient_ledger_entries_source_type_check
    CHECK (source_type IN ('donation', 'ticket_order', 'product_order', 'order', 'payout', 'manual'))
    NOT VALID;
  ALTER TABLE public.recipient_ledger_entries
    VALIDATE CONSTRAINT recipient_ledger_entries_source_type_check;
END;
$$;

-- Staff-authorized table settlement is one transaction: row locks serialize
-- concurrent calls; any failure rolls back the order updates and session close.
DROP FUNCTION IF EXISTS public.mark_table_paid_and_close_session(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mark_table_paid_and_close_session(uuid, uuid, text, uuid);
CREATE FUNCTION public.mark_table_paid_and_close_session(
  p_table_session_id uuid,
  p_business_id uuid,
  p_payment_method text DEFAULT 'at_table',
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_success boolean,
  out_orders_settled integer,
  out_waiter_confirmed integer,
  out_closed_at timestamptz,
  out_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_closed_at timestamptz;
  v_settled_count integer := 0;
  v_authorized boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.businesses b
     WHERE b.id = p_business_id
       AND (
         EXISTS (
           SELECT 1 FROM public.entity_members em
            WHERE em.organizer_id = b.organizer_id
              AND em.user_id = p_actor_user_id
              AND em.role IN ('owner','admin','manager')
         )
         OR EXISTS (
           SELECT 1 FROM public.organizers o
            WHERE o.id = b.organizer_id AND o.user_id = p_actor_user_id
         )
         OR EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.id = p_actor_user_id AND p.role = 'admin' AND p.status = 'active'
         )
       )
  ) INTO v_authorized;

  IF p_actor_user_id IS NULL OR NOT v_authorized THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz, 'UNAUTHORIZED: You cannot settle this business table';
    RETURN;
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('at_table','cash','card_terminal') THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz, 'INVALID_PAYMENT_METHOD: Choose a valid collected payment method';
    RETURN;
  END IF;

  SELECT s.* INTO v_session
    FROM public.table_sessions s
   WHERE s.id = p_table_session_id AND s.business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz, 'SESSION_NOT_FOUND: Session or business mismatch';
    RETURN;
  END IF;
  IF v_session.status NOT IN ('active','bill_requested') THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz, 'INVALID_SESSION_STATUS: Session is already ' || v_session.status;
    RETURN;
  END IF;

  -- Settlement also locks the order set before evaluating payment eligibility.
  PERFORM o.id
    FROM public.orders o
   WHERE o.table_session_id = p_table_session_id
   ORDER BY o.id
   FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.table_session_id = p_table_session_id
       AND o.status <> 'cancelled'
       AND o.dine_in_confirmation = 'pending'
  ) THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz, 'PENDING_WAITER_ORDERS: Confirm or decline pending orders first';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.table_session_id = p_table_session_id
       AND o.status <> 'cancelled'
       AND o.dine_in_confirmation IS DISTINCT FROM 'declined'
       AND o.payment_method = 'online'
       AND o.payment_status <> 'paid'
  ) THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz, 'UNVERIFIED_ONLINE_ORDERS: Verify or cancel unpaid online orders first';
    RETURN;
  END IF;

  -- Only unpaid, accepted at-table/pay-on-fulfilment orders are eligible.
  -- Cancelled, declined, already-paid, unknown-method and online orders stay untouched.
  UPDATE public.orders o
     SET payment_status = 'paid',
         updated_at = now()
   WHERE o.table_session_id = p_table_session_id
     AND o.payment_status = 'unpaid'
     AND o.status <> 'cancelled'
     AND o.dine_in_confirmation IS DISTINCT FROM 'declined'
     AND o.dine_in_confirmation IS DISTINCT FROM 'pending'
     AND o.payment_method = 'on_fulfilment';
  GET DIAGNOSTICS v_settled_count = ROW_COUNT;

  UPDATE public.table_sessions s
     SET status = 'closed', closed_at = now(), updated_at = now()
   WHERE s.id = p_table_session_id
   RETURNING s.closed_at INTO v_closed_at;

  RETURN QUERY SELECT true, v_settled_count, 0, v_closed_at, NULL::text;
END;
$$;

-- Only the trusted server service role can invoke the definer routine.
REVOKE ALL ON FUNCTION public.mark_table_paid_and_close_session(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_table_paid_and_close_session(uuid, uuid, text, uuid) TO service_role;
ALTER FUNCTION public.mark_table_paid_and_close_session(uuid, uuid, text, uuid) OWNER TO postgres;

-- Atomically transition a Stripe-verified order and append one unique ledger credit.
CREATE OR REPLACE FUNCTION public.record_storefront_order_paid_and_credit(
  p_order_id uuid,
  p_stripe_payment_intent_id text DEFAULT NULL
)
RETURNS TABLE (out_order_id uuid, out_was_newly_paid boolean, out_credited boolean, out_error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_recipient_id uuid;
  v_expected_currency text;
  v_ledger public.recipient_ledger_entries%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_order_id, false, false, 'ORDER_NOT_FOUND';
    RETURN;
  END IF;

  v_expected_currency := lower(trim(coalesce(v_order.currency, '')));

  IF v_order.payment_status = 'paid' THEN
    IF v_order.provider IS DISTINCT FROM 'stripe'
       OR v_order.provider_reference IS DISTINCT FROM p_stripe_payment_intent_id THEN
      RETURN QUERY SELECT p_order_id, false, false, 'PAYMENT_ASSOCIATION_MISMATCH';
      RETURN;
    END IF;
    SELECT e.* INTO v_ledger
      FROM public.recipient_ledger_entries e
     WHERE e.source_type = 'order' AND e.source_id = p_order_id AND e.entry_type = 'credit';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Storefront order % is paid but has no ledger credit; manual reconciliation required', p_order_id;
    END IF;
    IF v_order.organizer_id IS NOT NULL THEN
      IF v_ledger.recipient_id IS DISTINCT FROM public.resolve_recipient('organizer', NULL, v_order.organizer_id, NULL) THEN
        RAISE EXCEPTION 'Storefront order % ledger recipient mismatch; manual reconciliation required', p_order_id;
      END IF;
    ELSIF v_order.business_id IS NOT NULL THEN
      IF v_ledger.recipient_id IS DISTINCT FROM public.resolve_recipient('business', NULL, NULL, v_order.business_id) THEN
        RAISE EXCEPTION 'Storefront order % ledger recipient mismatch; manual reconciliation required', p_order_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'Storefront order % has no tenant recipient', p_order_id;
    END IF;
    IF v_ledger.amount IS DISTINCT FROM v_order.total_amount OR v_ledger.currency IS DISTINCT FROM v_expected_currency THEN
      RAISE EXCEPTION 'Storefront order % ledger amount/currency mismatch; manual reconciliation required', p_order_id;
    END IF;
    RETURN QUERY SELECT p_order_id, false, true, NULL::text;
    RETURN;
  END IF;

  IF v_order.payment_status <> 'unpaid' THEN
    RETURN QUERY SELECT p_order_id, false, false, 'INVALID_PAYMENT_STATE';
    RETURN;
  END IF;
  IF v_order.status = 'cancelled' THEN
    RETURN QUERY SELECT p_order_id, false, false, 'INVALID_ORDER_STATE';
    RETURN;
  END IF;
  IF p_stripe_payment_intent_id IS NULL
     OR v_order.payment_method <> 'online'
     OR v_order.provider IS DISTINCT FROM 'stripe'
     OR v_order.provider_reference IS DISTINCT FROM p_stripe_payment_intent_id THEN
    RETURN QUERY SELECT p_order_id, false, false, 'PAYMENT_ASSOCIATION_MISMATCH';
    RETURN;
  END IF;
  IF v_order.total_amount <= 0 THEN
    RETURN QUERY SELECT p_order_id, false, false, 'INVALID_ORDER_AMOUNT';
    RETURN;
  END IF;
  IF v_order.organizer_id IS NOT NULL THEN
    v_recipient_id := public.resolve_recipient('organizer', NULL, v_order.organizer_id, NULL);
  ELSIF v_order.business_id IS NOT NULL THEN
    v_recipient_id := public.resolve_recipient('business', NULL, NULL, v_order.business_id);
  ELSE
    RAISE EXCEPTION 'Storefront order % has no tenant recipient', p_order_id;
  END IF;
  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'Storefront order % recipient could not be resolved', p_order_id;
  END IF;

  UPDATE public.orders o
     SET payment_status = 'paid', updated_at = now()
   WHERE o.id = p_order_id;

  INSERT INTO public.recipient_ledger_entries (
    recipient_id, entry_type, amount, currency, source_type, source_id, description
  ) VALUES (
    v_recipient_id, 'credit', v_order.total_amount, v_expected_currency, 'order', v_order.id,
    'Storefront order #' || v_order.order_number || ' payment'
  )
  ON CONFLICT (source_type, source_id, entry_type)
    WHERE source_id IS NOT NULL AND entry_type <> 'refund'
  DO NOTHING;

  SELECT e.* INTO v_ledger
    FROM public.recipient_ledger_entries e
   WHERE e.source_type = 'order' AND e.source_id = p_order_id AND e.entry_type = 'credit';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storefront order % ledger credit missing after settlement; manual reconciliation required', p_order_id;
  END IF;
  IF v_ledger.recipient_id IS DISTINCT FROM v_recipient_id
     OR v_ledger.amount IS DISTINCT FROM v_order.total_amount
     OR v_ledger.currency IS DISTINCT FROM v_expected_currency THEN
    RAISE EXCEPTION 'Storefront order % ledger credit mismatch; manual reconciliation required', p_order_id;
  END IF;

  RETURN QUERY SELECT p_order_id, true, true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.record_storefront_order_paid_and_credit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_storefront_order_paid_and_credit(uuid, text) TO service_role;
ALTER FUNCTION public.record_storefront_order_paid_and_credit(uuid, text) OWNER TO postgres;

COMMIT;

NOTIFY pgrst, 'reload schema';