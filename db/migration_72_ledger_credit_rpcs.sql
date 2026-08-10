-- migration_72_ledger_credit_rpcs.sql
-- Phase B.2 of the Recipient/Ledger/Payout architecture. Creates three
-- SECURITY DEFINER RPCs -- record_donation_and_credit, record_ticket_and_credit,
-- record_product_paid_and_credit -- each porting one existing Stripe webhook
-- write path (donations upsert, ticket_orders check-then-insert, product_orders
-- conditional status flip) into a single atomic transaction that also resolves
-- the recipient and inserts the corresponding ledger credit.
--
-- Deliberately inert on creation: nothing calls these yet. The webhook refactor
-- (app/api/webhooks/stripe/route.ts, 4 call sites) is a separate, later,
-- separately-approved change. No source table's DDL, no RLS policy, and no
-- other function (resolve_recipient, prevent_ledger_entry_mutation) is touched
-- by this migration.
--
-- Each function's entire body is one Postgres transaction by virtue of being a
-- single function call: if the ledger insert fails for any reason (a CHECK
-- violation, the dedup unique index, an unresolvable recipient), the source-
-- table write in the same function rolls back with it. This is intentional --
-- no partial state where money is recorded as received but never credited to
-- anyone, and no partial state where a ledger entry exists without a backing
-- source row.
--
-- Recipient resolution rule (per architecture review): if the source row's
-- parent (fundraiser / event) has an organizer_id, the organizer is the
-- recipient; else if it has a user_id, that user is the recipient; if neither
-- is set, the function RAISES rather than silently choosing a fallback or
-- skipping the credit -- an unresolvable recipient is a data-integrity problem
-- that must surface immediately (via the webhook's existing
-- alertReconciliationFailure path, since the RPC call itself will then fail),
-- not one that lets a payment get recorded with nobody credited.
--
-- Currency: each function normalizes with lower() before inserting into
-- recipient_ledger_entries, independent of how the source table stores it
-- (donations.currency is stored uppercase, ticket_orders/product_orders
-- lowercase) -- matches the ledger's CHECK constraint from migration 71. The
-- source table write itself stores currency exactly as passed in, unchanged
-- from current webhook behavior.
--
-- record_donation_and_credit mirrors the current PostgREST
-- upsert(..., onConflict: "payment_intent_id", ignoreDuplicates: false)
-- behavior exactly: ON CONFLICT DO UPDATE overwrites the same column set on a
-- retried delivery, and new-vs-retry is detected via the same xmax = 0 signal
-- already used in the webhook. On retry (xmax != 0) the function returns
-- immediately -- no recipient resolution, no credit insert, matching the
-- existing idempotency guarantee.
--
-- record_ticket_and_credit is keyed strictly on qr_code (INSERT ... ON
-- CONFLICT (qr_code) DO NOTHING), not on stripe_payment_intent_id, even though
-- ticket_orders now also has a real unique index on that column (verified live
-- during this phase's review -- not present in an earlier assessment of this
-- schema). qr_code is the only value guaranteed non-null across both call
-- sites that will invoke this function (the checkout-session fallthrough path
-- can have a null payment_intent). Both call sites generate qr_code with the
-- identical crypto.randomUUID().replace(/-/g,"").toUpperCase() function,
-- confirmed live in app/api/create-payment-intent/route.ts and
-- app/api/checkout/route.ts. This also closes a pre-existing TOCTOU race in
-- the current Node check-then-insert code (two concurrent deliveries for the
-- same qr_code could previously both pass the SELECT check before either
-- INSERT) -- a behavior improvement, not a scope change, since the intended
-- semantics (one ticket_orders row per qr_code) were already the goal.
--
-- record_product_paid_and_credit deliberately does NOT call
-- decrementProductStock -- that stays in Node, called by the webhook after
-- this RPC returns, gated on was_newly_paid, exactly mirroring today's
-- markProductOrderPaid -> decrementProductStock sequencing. Stock management
-- is inventory logic, not part of the source-write/recipient-resolve/ledger-
-- credit atomicity this phase is scoped to, and it isn't atomic with the
-- status flip in the current code either -- this migration doesn't change
-- that existing risk profile.
--
-- The donation webhook's existing retry-path backfill (patching
-- donations.user_id when NULL on a conflict-resolved row) is NOT ported here
-- either -- it stays in Node, unrelated to recipient crediting.
--
-- Execute privilege: identical pattern to resolve_recipient() (migration 70)
-- -- EXECUTE revoked from PUBLIC, anon, authenticated; granted only to
-- service_role. These must only ever be called from the trusted server-side
-- webhook context, never directly by an authenticated client.

BEGIN;

-- 1. record_donation_and_credit
CREATE OR REPLACE FUNCTION record_donation_and_credit(
  p_fundraiser_id UUID,
  p_donor_name TEXT,
  p_donor_email TEXT,
  p_user_id UUID,
  p_message TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payment_intent_id TEXT
) RETURNS TABLE (
  donation_id UUID,
  donor_user_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_donation_id UUID;
  v_donor_user_id UUID;
  v_xmax XID;
  v_is_new BOOLEAN;
  v_fundraiser_organizer_id UUID;
  v_fundraiser_user_id UUID;
  v_recipient_id UUID;
BEGIN
  INSERT INTO donations (
    fundraiser_id,
    donor_name,
    donor_email,
    user_id,
    message,
    amount,
    currency,
    status,
    payment_intent_id
  ) VALUES (
    p_fundraiser_id,
    COALESCE(p_donor_name, 'Anonymous'),
    p_donor_email,
    p_user_id,
    p_message,
    p_amount,
    p_currency,
    'completed',
    p_payment_intent_id
  )
  ON CONFLICT (payment_intent_id) DO UPDATE SET
    fundraiser_id = EXCLUDED.fundraiser_id,
    donor_name    = EXCLUDED.donor_name,
    donor_email   = EXCLUDED.donor_email,
    user_id       = EXCLUDED.user_id,
    message       = EXCLUDED.message,
    amount        = EXCLUDED.amount,
    currency      = EXCLUDED.currency,
    status        = EXCLUDED.status
  RETURNING id, donations.user_id, xmax
  INTO v_donation_id, v_donor_user_id, v_xmax;

  v_is_new := (v_xmax::text = '0');

  IF NOT v_is_new THEN
    RETURN QUERY SELECT v_donation_id, v_donor_user_id, v_is_new;
    RETURN;
  END IF;

  SELECT organizer_id, user_id
  INTO v_fundraiser_organizer_id, v_fundraiser_user_id
  FROM fundraisers
  WHERE id = p_fundraiser_id;

  IF v_fundraiser_organizer_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('organizer', NULL, v_fundraiser_organizer_id, NULL);
  ELSIF v_fundraiser_user_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('user', v_fundraiser_user_id, NULL, NULL);
  ELSE
    RAISE EXCEPTION
      'record_donation_and_credit: fundraiser % has no organizer_id or user_id -- cannot resolve recipient',
      p_fundraiser_id;
  END IF;

  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description
  ) VALUES (
    v_recipient_id,
    'credit',
    p_amount,
    lower(p_currency),
    'donation',
    v_donation_id,
    'Donation received'
  );

  RETURN QUERY SELECT v_donation_id, v_donor_user_id, v_is_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_donation_and_credit(
  UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_donation_and_credit(
  UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT
) TO service_role;

-- 2. record_ticket_and_credit
CREATE OR REPLACE FUNCTION record_ticket_and_credit(
  p_event_id UUID,
  p_ticket_id UUID,
  p_seat_id UUID,
  p_seat_label TEXT,
  p_buyer_email TEXT,
  p_buyer_name TEXT,
  p_quantity INTEGER,
  p_total_amount NUMERIC,
  p_currency TEXT,
  p_qr_code TEXT,
  p_stripe_payment_intent_id TEXT,
  p_stripe_session_id TEXT
) RETURNS TABLE (
  ticket_order_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_order_id UUID;
  v_event_organizer_id UUID;
  v_event_user_id UUID;
  v_recipient_id UUID;
BEGIN
  INSERT INTO ticket_orders (
    event_id,
    ticket_id,
    seat_id,
    seat_label,
    buyer_email,
    buyer_name,
    quantity,
    total_amount,
    currency,
    qr_code,
    status,
    stripe_payment_intent_id,
    stripe_session_id
  ) VALUES (
    p_event_id,
    p_ticket_id,
    p_seat_id,
    p_seat_label,
    p_buyer_email,
    p_buyer_name,
    p_quantity,
    p_total_amount,
    p_currency,
    p_qr_code,
    'valid',
    p_stripe_payment_intent_id,
    p_stripe_session_id
  )
  ON CONFLICT (qr_code) DO NOTHING
  RETURNING id INTO v_ticket_order_id;

  IF v_ticket_order_id IS NULL THEN
    SELECT id INTO v_ticket_order_id
    FROM ticket_orders
    WHERE qr_code = p_qr_code;

    RETURN QUERY SELECT v_ticket_order_id, false;
    RETURN;
  END IF;

  SELECT organizer_id, user_id
  INTO v_event_organizer_id, v_event_user_id
  FROM events
  WHERE id = p_event_id;

  IF v_event_organizer_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('organizer', NULL, v_event_organizer_id, NULL);
  ELSIF v_event_user_id IS NOT NULL THEN
    v_recipient_id := resolve_recipient('user', v_event_user_id, NULL, NULL);
  ELSE
    RAISE EXCEPTION
      'record_ticket_and_credit: event % has no organizer_id or user_id -- cannot resolve recipient',
      p_event_id;
  END IF;

  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description
  ) VALUES (
    v_recipient_id,
    'credit',
    p_total_amount,
    lower(p_currency),
    'ticket_order',
    v_ticket_order_id,
    'Ticket order received'
  );

  RETURN QUERY SELECT v_ticket_order_id, true;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_ticket_and_credit(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- 3. record_product_paid_and_credit
CREATE OR REPLACE FUNCTION record_product_paid_and_credit(
  p_order_id UUID,
  p_stripe_payment_intent_id TEXT,
  p_crypto_payment_id TEXT
) RETURNS TABLE (
  order_id UUID,
  product_id UUID,
  quantity INTEGER,
  was_newly_paid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_product_id UUID;
  v_quantity INTEGER;
  v_currency TEXT;
  v_total_amount NUMERIC;
  v_owner_id UUID;
  v_recipient_id UUID;
BEGIN
  UPDATE product_orders
  SET
    status = 'paid',
    stripe_payment_intent_id = COALESCE(p_stripe_payment_intent_id, stripe_payment_intent_id),
    crypto_payment_id        = COALESCE(p_crypto_payment_id, crypto_payment_id)
  WHERE id = p_order_id
    AND status = 'pending'
  RETURNING
    id, product_orders.product_id, product_orders.quantity,
    product_orders.currency, product_orders.total_amount
  INTO v_updated_id, v_product_id, v_quantity, v_currency, v_total_amount;

  IF v_updated_id IS NULL THEN
    SELECT product_orders.product_id, product_orders.quantity
    INTO v_product_id, v_quantity
    FROM product_orders
    WHERE id = p_order_id;

    RETURN QUERY SELECT p_order_id, v_product_id, v_quantity, false;
    RETURN;
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM products
  WHERE id = v_product_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION
      'record_product_paid_and_credit: product % not found or has no owner -- cannot resolve recipient',
      v_product_id;
  END IF;

  v_recipient_id := resolve_recipient('user', v_owner_id, NULL, NULL);

  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description
  ) VALUES (
    v_recipient_id,
    'credit',
    v_total_amount,
    lower(v_currency),
    'product_order',
    v_updated_id,
    'Product order received'
  );

  RETURN QUERY SELECT v_updated_id, v_product_id, v_quantity, true;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_product_paid_and_credit(
  UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_product_paid_and_credit(
  UUID, TEXT, TEXT
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
