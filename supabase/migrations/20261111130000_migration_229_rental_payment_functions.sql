-- Migration 229: rental payment functions (A + C policy)
-- Staging first. Safe to run twice. One transaction: all or nothing.

BEGIN;

-- 0. PREFLIGHT ---------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
  v_def     text;
BEGIN
  SELECT string_agg(need.t || '.' || need.c, ', ' ORDER BY need.t, need.c)
    INTO v_missing
    FROM (VALUES
      ('businesses','rental_confirmation_mode'),
      ('businesses','rental_payment_policy'),
      ('businesses','rental_advance_pct'),
      ('businesses','rental_payment_link_hours'),
      ('rental_bookings','payment_due_at'),
      ('rental_bookings','customer_locale'),
      ('rental_bookings','snapshot_confirmation_mode'),
      ('rental_bookings','snapshot_payment_policy'),
      ('rental_bookings','snapshot_advance_pct'),
      ('rental_bookings','snapshot_currency'),
      ('rental_bookings','amount_due_online'),
      ('rental_bookings','expired_at'),
      ('rental_bookings','expires_at'),
      ('rental_bookings','picked_up_at'),
      ('rental_bookings','booking_period'),
      ('rental_bookings','payment_status'),
      ('rental_bookings','customer_email'),
      ('rental_bookings','notes'),
      ('rental_payments','booking_id'),('rental_payments','organizer_id'),
      ('rental_payments','kind'),('rental_payments','method'),
      ('rental_payments','amount'),('rental_payments','currency'),
      ('rental_payments','direction'),('rental_payments','applied'),
      ('rental_payments','stripe_session_id'),
      ('rental_payments','stripe_payment_intent_id'),
      ('rental_payments','stripe_refund_id'),
      ('rental_payments','recorded_by'),('rental_payments','notes'),
      ('rental_checkout_sessions','booking_id'),
      ('rental_checkout_sessions','stripe_session_id'),
      ('rental_checkout_sessions','kind'),('rental_checkout_sessions','amount'),
      ('rental_checkout_sessions','expires_at'),('rental_checkout_sessions','status'),
      ('rental_booking_events','booking_id'),('rental_booking_events','organizer_id'),
      ('rental_booking_events','event_type'),('rental_booking_events','actor_id'),
      ('rental_booking_events','payload'),
      ('payment_reconciliation_failures','kind'),
      ('payment_reconciliation_failures','stripe_payment_intent_id'),
      ('payment_reconciliation_failures','amount'),
      ('payment_reconciliation_failures','currency'),
      ('payment_reconciliation_failures','buyer_email'),
      ('payment_reconciliation_failures','raw_metadata'),
      ('payment_reconciliation_failures','error_message'),
      ('recipient_ledger_entries','recipient_id'),
      ('recipient_ledger_entries','entry_type'),
      ('recipient_ledger_entries','amount'),
      ('recipient_ledger_entries','currency'),
      ('recipient_ledger_entries','source_type'),
      ('recipient_ledger_entries','source_id'),
      ('recipient_ledger_entries','external_reference'),
      ('recipient_ledger_entries','description')
    ) AS need(t, c)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name = need.t AND ic.column_name = need.c);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: missing columns: %. Apply 227/228 first or tell me which are missing.', v_missing;
  END IF;

  IF to_regclass('public.rental_booking_number_seq') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: sequence public.rental_booking_number_seq not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.pronamespace = 'public'::regnamespace
                    AND p.proname = 'resolve_recipient' AND p.pronargs = 4) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: resolve_recipient with 4 arguments not found';
  END IF;

  SELECT string_agg(pg_get_constraintdef(c.oid), ' ; ') INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.payment_reconciliation_failures'::regclass
     AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%kind%';
  IF v_def IS NOT NULL AND v_def NOT ILIKE '%rental_booking%' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: payment_reconciliation_failures.kind does not allow rental_booking: %', v_def;
  END IF;

  SELECT string_agg(pg_get_constraintdef(c.oid), ' ; ') INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.rental_booking_events'::regclass
     AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%event_type%';
  IF v_def IS NOT NULL
     AND (v_def NOT ILIKE '%status_change%' OR v_def NOT ILIKE '%payment_override%') THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: rental_booking_events.event_type must allow status_change and payment_override: %', v_def;
  END IF;
END;
$$;

-- 1. DROP EVERY OLD OVERLOAD of the functions this migration owns -------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('create_rental_booking','confirm_rental_booking',
                         'record_rental_payment','record_rental_balance_and_pickup',
                         'prepare_rental_checkout_session','commit_rental_checkout_session',
                         'expire_rental_checkout_session','expire_rental_bookings')
  LOOP
    RAISE NOTICE 'Dropping %', r.sig;
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END;
$$;

-- 2. expire_rental_bookings: the ONE place bookings expire -------------------
-- Used by create_rental_booking (one category) and by the cron (all categories).
-- Skips bookings with an open, unexpired Stripe checkout session.
CREATE FUNCTION public.expire_rental_bookings(p_category_id uuid DEFAULT NULL)
RETURNS TABLE (out_booking_id uuid, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH expired AS (
    UPDATE public.rental_bookings rb
       SET status = 'expired', expired_at = now(), updated_at = now()
     WHERE (p_category_id IS NULL OR rb.category_id = p_category_id)
       AND rb.payment_status = 'unpaid'
       AND (
            (rb.status = 'pending' AND rb.expires_at IS NOT NULL AND rb.expires_at < now())
         OR (rb.status = 'awaiting_payment' AND rb.payment_due_at IS NOT NULL AND rb.payment_due_at < now())
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.rental_checkout_sessions cs
          WHERE cs.booking_id = rb.id AND cs.status = 'open' AND cs.expires_at > now())
    RETURNING rb.id AS bid,
              CASE
                WHEN rb.payment_due_at IS NOT NULL THEN 'payment_timeout'
                WHEN rb.snapshot_confirmation_mode = 'approval' THEN 'approval_timeout'
                ELSE 'abandoned_checkout'
              END AS why
  )
  SELECT e.bid, e.why FROM expired e;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_rental_bookings FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_rental_bookings TO service_role;

-- 3. create_rental_booking ----------------------------------------------------
CREATE FUNCTION public.create_rental_booking(
  p_organizer_id            uuid,
  p_business_id             uuid,
  p_category_id             uuid,
  p_starts_at               timestamptz,
  p_ends_at                 timestamptz,
  p_customer_name           text,
  p_customer_email          text,
  p_snapshot_daily_rate     numeric,
  p_rental_amount           numeric,
  p_vehicle_id              uuid DEFAULT NULL,
  p_source                  text DEFAULT 'office',
  p_pickup_branch_id        uuid DEFAULT NULL,
  p_return_branch_id        uuid DEFAULT NULL,
  p_customer_phone          text DEFAULT NULL,
  p_driver_license_number   text DEFAULT NULL,
  p_driver_license_country  text DEFAULT NULL,
  p_driver_dob              date DEFAULT NULL,
  p_snapshot_weekly_rate    numeric DEFAULT NULL,
  p_snapshot_currency       text DEFAULT 'USD',
  p_deposit_required_amount numeric DEFAULT 0.00,
  p_notes                   text DEFAULT NULL,
  p_expires_at              timestamptz DEFAULT NULL,
  p_booking_number          text DEFAULT NULL,
  p_customer_locale         text DEFAULT 'en'
)
RETURNS public.rental_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_open_cap           constant integer := 5;   -- max open unpaid online bookings per business + email
  v_open_count         integer;
  v_email_norm         text;
  v_requested_period   tstzrange;
  v_available_capacity integer;
  v_booking_number     text;
  v_new_booking        public.rental_bookings;
  v_conf_mode          text;
  v_pay_policy         text;
  v_adv_pct            numeric;
  v_initial_status     text := 'pending';
  v_amount_due_online  numeric(12,2) := 0.00;
  v_expires_at         timestamptz := p_expires_at;
BEGIN
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'ends_at must be strictly after starts_at' USING ERRCODE = '22000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses bz
     WHERE bz.id = p_business_id AND bz.organizer_id = p_organizer_id
  ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: business % does not belong to organizer %', p_business_id, p_organizer_id
      USING ERRCODE = 'RB004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_categories vc
     WHERE vc.id = p_category_id AND vc.business_id = p_business_id AND vc.organizer_id = p_organizer_id
  ) THEN
    RAISE EXCEPTION 'CATEGORY_MISMATCH: category % does not belong to business/organizer', p_category_id
      USING ERRCODE = 'RB005';
  END IF;

  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vehicles v
       WHERE v.id = p_vehicle_id
         AND v.category_id = p_category_id
         AND v.business_id = p_business_id
         AND v.organizer_id = p_organizer_id
         AND v.is_active = true
         AND v.status NOT IN ('out_of_service', 'maintenance')
    ) THEN
      RAISE EXCEPTION 'VEHICLE_INVALID: vehicle % does not belong to category/business or is inactive/out_of_service/maintenance', p_vehicle_id
        USING ERRCODE = 'RB006';
    END IF;
  END IF;

  v_requested_period := tstzrange(p_starts_at, p_ends_at, '[)');

  -- Lock order: category -> vehicle -> (abuse key) -> rows
  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || p_category_id::text));
  IF p_vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || p_vehicle_id::text));
  END IF;

  -- Write-time expiry for this category (single implementation)
  PERFORM 1 FROM public.expire_rental_bookings(p_category_id);

  -- Abuse cap: open pending / awaiting_payment, and confirmed-but-unpaid future bookings
  IF p_source IS DISTINCT FROM 'office' THEN
    v_email_norm := lower(trim(p_customer_email));
    PERFORM pg_advisory_xact_lock(hashtext('rental_abuse_' || p_business_id::text || '_' || v_email_norm));

    SELECT count(*) INTO v_open_count
      FROM public.rental_bookings rb
     WHERE rb.business_id = p_business_id
       AND lower(rb.customer_email) = v_email_norm
       AND COALESCE(rb.source, '') <> 'office'
       AND (
            rb.status IN ('pending', 'awaiting_payment')
         OR (rb.status = 'confirmed' AND rb.payment_status = 'unpaid' AND rb.ends_at > now())
       );

    IF v_open_count >= v_open_cap THEN
      RAISE EXCEPTION 'TOO_MANY_OPEN_BOOKINGS: % open unpaid bookings for this customer (limit %)', v_open_count, v_open_cap
        USING ERRCODE = 'RB020';
    END IF;
  END IF;

  IF p_vehicle_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.rental_blocks b
       WHERE b.vehicle_id = p_vehicle_id AND b.block_period && v_requested_period
    ) THEN
      RAISE EXCEPTION 'VEHICLE_MAINTENANCE_BLOCKED: vehicle % has a maintenance block during requested period', p_vehicle_id
        USING ERRCODE = 'RB002';
    END IF;
  END IF;

  WITH eligible_vehicles AS (
    SELECT v.id
      FROM public.vehicles v
     WHERE v.category_id = p_category_id
       AND v.business_id = p_business_id
       AND v.is_active = true
       AND v.status NOT IN ('out_of_service', 'maintenance')
       AND NOT EXISTS (
         SELECT 1 FROM public.rental_blocks b
          WHERE b.vehicle_id = v.id AND b.block_period && v_requested_period
       )
  ),
  conflicting_assigned AS (
    SELECT count(DISTINCT rb.vehicle_id) AS cnt
      FROM public.rental_bookings rb
     WHERE rb.vehicle_id IN (SELECT id FROM eligible_vehicles)
       AND rb.booking_period && v_requested_period
       AND rb.status IN ('pending', 'awaiting_payment', 'confirmed', 'active')
  ),
  conflicting_unassigned AS (
    SELECT count(*) AS cnt
      FROM public.rental_bookings rb
     WHERE rb.category_id = p_category_id
       AND rb.business_id = p_business_id
       AND rb.vehicle_id IS NULL
       AND rb.booking_period && v_requested_period
       AND rb.status IN ('pending', 'awaiting_payment', 'confirmed', 'active')
  )
  SELECT
    (SELECT count(*) FROM eligible_vehicles) -
    (SELECT cnt FROM conflicting_assigned) -
    (SELECT cnt FROM conflicting_unassigned)
  INTO v_available_capacity;

  IF v_available_capacity <= 0 THEN
    RAISE EXCEPTION 'CATEGORY_CAPACITY_EXCEEDED: No available capacity in this category for requested period'
      USING ERRCODE = 'RB001';
  END IF;

  -- Snapshot settings at creation (what the customer saw) and decide initial status
  SELECT bz.rental_confirmation_mode, bz.rental_payment_policy, bz.rental_advance_pct
    INTO v_conf_mode, v_pay_policy, v_adv_pct
    FROM public.businesses bz
   WHERE bz.id = p_business_id;

  v_conf_mode  := COALESCE(v_conf_mode, 'instant');
  v_pay_policy := COALESCE(v_pay_policy, 'offline');

  IF p_source = 'office' THEN
    -- Office bookings are never forced into pending or online payment
    v_initial_status    := 'confirmed';
    v_conf_mode         := 'instant';
    v_pay_policy        := 'offline';
    v_adv_pct           := NULL;
    v_amount_due_online := 0.00;
    v_expires_at        := NULL;
  ELSIF v_conf_mode = 'instant' AND v_pay_policy = 'offline' THEN
    v_initial_status    := 'confirmed';
    v_amount_due_online := 0.00;
    v_expires_at        := NULL;
  ELSE
    v_initial_status := 'pending';
    IF v_pay_policy = 'full_online' THEN
      v_amount_due_online := p_rental_amount;
    ELSIF v_pay_policy = 'advance_online' AND v_adv_pct IS NOT NULL THEN
      v_amount_due_online := ROUND(p_rental_amount * v_adv_pct / 100.0, 2);
    ELSE
      v_amount_due_online := 0.00;
    END IF;

    IF v_expires_at IS NULL THEN
      IF v_conf_mode = 'instant' THEN
        v_expires_at := now() + interval '35 minutes';
      ELSE
        v_expires_at := now() + interval '24 hours';
      END IF;
    END IF;
  END IF;

  IF p_booking_number IS NOT NULL AND p_booking_number <> '' THEN
    v_booking_number := p_booking_number;
  ELSE
    v_booking_number := 'RBK-' || to_char(now() AT TIME ZONE 'UTC', 'YYMMDD') || '-'
                        || lpad(nextval('public.rental_booking_number_seq')::text, 4, '0');
  END IF;

  INSERT INTO public.rental_bookings (
    organizer_id, business_id, category_id, vehicle_id, source, booking_number,
    starts_at, ends_at, expires_at, pickup_branch_id, return_branch_id,
    customer_name, customer_email, customer_phone, customer_locale,
    driver_license_number, driver_license_country, driver_dob,
    status, payment_status, rental_amount, snapshot_daily_rate, snapshot_weekly_rate,
    snapshot_currency, snapshot_confirmation_mode, snapshot_payment_policy,
    snapshot_advance_pct, amount_due_online,
    deposit_required_amount, notes, created_at, updated_at
  ) VALUES (
    p_organizer_id, p_business_id, p_category_id, p_vehicle_id, p_source, v_booking_number,
    p_starts_at, p_ends_at, v_expires_at, p_pickup_branch_id, p_return_branch_id,
    p_customer_name, p_customer_email, p_customer_phone, COALESCE(p_customer_locale, 'en'),
    p_driver_license_number, p_driver_license_country, p_driver_dob,
    v_initial_status, 'unpaid', p_rental_amount, p_snapshot_daily_rate, p_snapshot_weekly_rate,
    p_snapshot_currency, v_conf_mode, v_pay_policy,
    v_adv_pct, v_amount_due_online,
    p_deposit_required_amount, p_notes, now(), now()
  )
  RETURNING * INTO v_new_booking;

  RETURN v_new_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_rental_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rental_booking TO service_role;

-- 4. confirm_rental_booking (approval mode -> awaiting_payment / confirmed) ----
CREATE FUNCTION public.confirm_rental_booking(
  p_booking_id   uuid,
  p_organizer_id uuid,
  p_actor_id     uuid
)
RETURNS TABLE (
  out_booking_id     uuid,
  out_status         text,
  out_payment_due_at timestamptz,
  out_payment_policy text,
  out_amount_due     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_booking    public.rental_bookings;
  v_link_hours integer;
  v_deadline   timestamptz;
  v_new_status text;
BEGIN
  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not belong to organizer %', p_booking_id, p_organizer_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_booking.category_id::text));
  IF v_booking.vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_booking.vehicle_id::text));
  END IF;

  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id
     FOR UPDATE;

  IF v_booking.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: only pending bookings can be confirmed (current status: %)', v_booking.status;
  END IF;

  IF v_booking.snapshot_confirmation_mode <> 'approval' THEN
    RAISE EXCEPTION 'NOT_AN_APPROVAL_REQUEST: booking % was created in instant mode and confirms through payment', p_booking_id;
  END IF;

  IF v_booking.expires_at IS NOT NULL AND v_booking.expires_at < now() THEN
    RAISE EXCEPTION 'BOOKING_REQUEST_EXPIRED: request expired at %', v_booking.expires_at
      USING ERRCODE = 'RB031';
  END IF;

  SELECT bz.rental_payment_link_hours INTO v_link_hours
    FROM public.businesses bz
   WHERE bz.id = v_booking.business_id;
  v_link_hours := COALESCE(v_link_hours, 48);

  IF v_booking.snapshot_payment_policy = 'offline' THEN
    v_new_status := 'confirmed';
    v_deadline   := NULL;
  ELSE
    v_deadline := LEAST(now() + make_interval(hours => v_link_hours), v_booking.starts_at);
    IF v_deadline - now() < interval '30 minutes' THEN
      RAISE EXCEPTION 'PAYMENT_WINDOW_TOO_SHORT: pickup is within 30 minutes, a payment link cannot be created. Confirm offline or decline.'
        USING ERRCODE = 'RB030';
    END IF;
    v_new_status := 'awaiting_payment';
  END IF;

  UPDATE public.rental_bookings
     SET status = v_new_status,
         payment_due_at = v_deadline,
         expires_at = NULL,
         updated_at = now()
   WHERE id = p_booking_id;

  INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
  VALUES (
    p_booking_id, p_organizer_id, 'status_change', p_actor_id,
    jsonb_build_object(
      'from_status', 'pending',
      'to_status', v_new_status,
      'payment_due_at', v_deadline,
      'snapshot_payment_policy', v_booking.snapshot_payment_policy,
      'amount_due_online', v_booking.amount_due_online
    )
  );

  RETURN QUERY SELECT v_booking.id, v_new_status, v_deadline,
                      v_booking.snapshot_payment_policy, v_booking.amount_due_online;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_rental_booking FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_rental_booking TO service_role;

-- 5. Overlap trigger functions (awaiting_payment holds the vehicle) -----------
CREATE OR REPLACE FUNCTION public.check_rental_booking_block_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL AND NEW.status IN ('pending', 'awaiting_payment', 'confirmed', 'active') THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || NEW.category_id::text));
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

    IF EXISTS (
      SELECT 1 FROM public.rental_blocks b
       WHERE b.vehicle_id = NEW.vehicle_id
         AND b.block_period && NEW.booking_period
    ) THEN
      RAISE EXCEPTION 'VEHICLE_MAINTENANCE_BLOCKED: vehicle % has a maintenance block during requested period', NEW.vehicle_id
        USING ERRCODE = 'RB002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.check_rental_block_booking_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_category_id uuid;
BEGIN
  SELECT v.category_id INTO v_category_id FROM public.vehicles v WHERE v.id = NEW.vehicle_id;
  IF v_category_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || NEW.vehicle_id::text));

  IF EXISTS (
    SELECT 1 FROM public.rental_bookings rb
     WHERE rb.vehicle_id = NEW.vehicle_id
       AND rb.status IN ('pending', 'awaiting_payment', 'confirmed', 'active')
       AND rb.booking_period && NEW.block_period
  ) THEN
    RAISE EXCEPTION 'VEHICLE_BOOKING_EXISTS: vehicle % already has an active booking during requested block period', NEW.vehicle_id
      USING ERRCODE = 'RB003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.check_rental_booking_block_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rental_block_booking_overlap() FROM PUBLIC, anon, authenticated;

-- 6. record_rental_payment ----------------------------------------------------
-- Stripe payments never raise for business reasons: refused ones are stored with
-- applied = false (never counted in net paid) and logged in
-- payment_reconciliation_failures. Offline (cash etc.) problems raise an error.
CREATE FUNCTION public.record_rental_payment(
  p_booking_id               uuid,
  p_organizer_id             uuid,
  p_kind                     text,
  p_method                   text,
  p_amount                   numeric,
  p_currency                 text,
  p_direction                text DEFAULT 'credit',
  p_stripe_session_id        text DEFAULT NULL,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_refund_id         text DEFAULT NULL,
  p_recorded_by              uuid DEFAULT NULL,
  p_notes                    text DEFAULT NULL
) RETURNS TABLE (
  out_payment_id     uuid,
  out_payment_status text,
  out_booking_status text,
  out_was_new        boolean,
  out_applied        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_category_id       uuid;
  v_vehicle_id        uuid;
  v_payment_id        uuid;
  v_recipient_id      uuid;
  v_rental_amount     numeric;
  v_curr_status       text;
  v_curr_pay_status   text;
  v_buyer_email       text;
  v_amount_due_online numeric;
  v_snapshot_currency text;
  v_conf_mode         text;
  v_net_before        numeric;
  v_net_paid          numeric;
  v_cur               text := lower(trim(p_currency));
  v_is_refund         boolean;
  v_is_stripe         boolean;
  v_refuse            text := NULL;
  v_new_pay_status    text;
  v_new_status        text;
  v_ref               text := COALESCE(p_stripe_payment_intent_id, p_stripe_refund_id, p_stripe_session_id);
  v_sess              text;
  v_existing_applied  boolean;
  v_credit_exists     boolean;
  v_rows              integer;
BEGIN
  -- 0. Input sanity
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be greater than zero';
  END IF;
  IF p_direction NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'INVALID_DIRECTION: %', p_direction;
  END IF;
  IF p_kind NOT IN ('rental_charge', 'advance', 'balance', 'refund', 'late_fee', 'other') THEN
    RAISE EXCEPTION 'INVALID_KIND: %', p_kind;
  END IF;
  IF p_method IS NULL OR trim(p_method) = '' THEN
    RAISE EXCEPTION 'INVALID_METHOD: method is required';
  END IF;

  v_is_refund := (p_kind = 'refund' OR p_direction = 'debit');
  v_is_stripe := (p_method = 'stripe');

  IF v_is_refund AND NOT (p_kind = 'refund' AND p_direction = 'debit') THEN
    RAISE EXCEPTION 'INVALID_REFUND: a refund must have kind refund and direction debit';
  END IF;
  IF v_is_refund AND v_is_stripe AND p_stripe_refund_id IS NULL THEN
    RAISE EXCEPTION 'REFUND_ID_REQUIRED: Stripe refunds must carry a stripe_refund_id';
  END IF;

  -- Refund rows never carry the original payment's session id
  v_sess := CASE WHEN v_is_refund THEN NULL ELSE p_stripe_session_id END;

  -- 1. Find the booking
  SELECT rb.category_id, rb.vehicle_id INTO v_category_id, v_vehicle_id
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id;

  IF NOT FOUND THEN
    IF v_is_stripe THEN
      INSERT INTO public.payment_reconciliation_failures (
        kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
      ) VALUES (
        'rental_booking', v_ref, p_amount, v_cur, NULL,
        jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id,
                           'stripe_session_id', p_stripe_session_id, 'reason', 'booking_not_found'),
        'Stripe payment received for a rental booking that does not exist'
      ) ON CONFLICT DO NOTHING;
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false, false;
      RETURN;
    END IF;
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not belong to organizer %', p_booking_id, p_organizer_id;
  END IF;

  -- 2. Locks: category -> vehicle -> booking row (BEFORE any idempotency check)
  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
  IF v_vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_vehicle_id::text));
  END IF;

  SELECT rb.rental_amount, rb.payment_status, rb.customer_email, rb.status,
         rb.amount_due_online, rb.snapshot_currency, rb.snapshot_confirmation_mode
    INTO v_rental_amount, v_curr_pay_status, v_buyer_email, v_curr_status,
         v_amount_due_online, v_snapshot_currency, v_conf_mode
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id
     FOR UPDATE;

  -- 3. Idempotency (under the lock)
  IF p_stripe_refund_id IS NOT NULL THEN
    SELECT rp.id, rp.applied INTO v_payment_id, v_existing_applied
      FROM public.rental_payments rp
     WHERE rp.stripe_refund_id = p_stripe_refund_id;
    IF FOUND THEN
      RETURN QUERY SELECT v_payment_id, v_curr_pay_status, v_curr_status, false, v_existing_applied;
      RETURN;
    END IF;
  END IF;

  IF p_stripe_session_id IS NOT NULL AND NOT v_is_refund THEN
    SELECT rp.id, rp.applied INTO v_payment_id, v_existing_applied
      FROM public.rental_payments rp
     WHERE rp.stripe_session_id = p_stripe_session_id AND rp.direction = 'credit';
    IF FOUND THEN
      RETURN QUERY SELECT v_payment_id, v_curr_pay_status, v_curr_status, false, v_existing_applied;
      RETURN;
    END IF;
  END IF;

  -- 4. Net applied before this payment
  SELECT
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.direction = 'credit' AND rp.applied
                                      AND rp.kind IN ('rental_charge', 'advance', 'balance')), 0)
    - COALESCE(SUM(rp.amount) FILTER (WHERE rp.direction = 'debit' AND rp.applied
                                      AND rp.kind = 'refund'), 0)
    INTO v_net_before
    FROM public.rental_payments rp
   WHERE rp.booking_id = p_booking_id;

  -- 5. Validate. Stripe: decide a refusal reason (stored, never raised).
  --             Offline: raise.
  IF v_is_stripe THEN
    IF v_cur IS DISTINCT FROM lower(v_snapshot_currency) THEN
      v_refuse := 'currency_mismatch';
    ELSIF v_is_refund THEN
      IF p_amount > v_net_before THEN
        v_refuse := 'refund_exceeds_paid';
      END IF;
    ELSIF v_curr_status IN ('cancelled', 'expired', 'no_show') THEN
      v_refuse := 'terminal_status';
    ELSIF v_curr_status = 'pending' AND v_conf_mode = 'approval' THEN
      v_refuse := 'approval_pending_payment_refused';
    ELSIF p_kind IN ('rental_charge', 'advance')
          AND (v_curr_status NOT IN ('pending', 'awaiting_payment')
               OR (v_amount_due_online > 0 AND v_net_before >= v_amount_due_online)) THEN
      v_refuse := 'already_satisfied';
    ELSIF p_kind IN ('rental_charge', 'advance')
          AND abs(p_amount - v_amount_due_online) > 0.01 THEN
      v_refuse := 'amount_mismatch';
    ELSIF p_kind = 'balance'
          AND (v_curr_pay_status = 'paid' OR v_net_before + p_amount > v_rental_amount) THEN
      v_refuse := 'already_satisfied';
    END IF;
  ELSE
    IF v_cur IS DISTINCT FROM lower(v_snapshot_currency) THEN
      RAISE EXCEPTION 'CURRENCY_MISMATCH: received %, expected %', p_currency, v_snapshot_currency;
    END IF;
    IF v_is_refund THEN
      IF p_amount > v_net_before THEN
        RAISE EXCEPTION 'REFUND_EXCEEDS_PAID: refund % is larger than net paid %', p_amount, v_net_before;
      END IF;
    ELSE
      IF v_curr_status IN ('cancelled', 'expired', 'no_show') THEN
        RAISE EXCEPTION 'CANNOT_RECORD_PAYMENT_TERMINAL: booking % is %', p_booking_id, v_curr_status;
      END IF;
      IF v_curr_status = 'pending' AND v_conf_mode = 'approval' THEN
        RAISE EXCEPTION 'BOOKING_NOT_APPROVED: booking % is awaiting owner approval', p_booking_id;
      END IF;
      IF p_kind IN ('rental_charge', 'advance', 'balance') THEN
        IF v_curr_pay_status = 'paid' THEN
          RAISE EXCEPTION 'PAYMENT_ALREADY_SATISFIED: booking % is already paid in full', p_booking_id;
        END IF;
        IF v_net_before + p_amount > v_rental_amount THEN
          RAISE EXCEPTION 'OVERPAYMENT_REJECTED: % + % exceeds rental amount %', v_net_before, p_amount, v_rental_amount;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. Refused Stripe payment: store as unapplied, alert, return
  IF v_refuse IS NOT NULL THEN
    INSERT INTO public.rental_payments (
      booking_id, organizer_id, kind, method, amount, currency, direction, applied,
      stripe_session_id, stripe_payment_intent_id, stripe_refund_id, recorded_by, notes
    ) VALUES (
      p_booking_id, p_organizer_id, p_kind, p_method, p_amount, v_cur, p_direction, false,
      v_sess, p_stripe_payment_intent_id, p_stripe_refund_id, p_recorded_by, p_notes
    ) RETURNING id INTO v_payment_id;

    IF p_stripe_session_id IS NOT NULL AND NOT v_is_refund THEN
      UPDATE public.rental_checkout_sessions cs
         SET status = 'completed'
       WHERE cs.stripe_session_id = p_stripe_session_id;
    END IF;

    INSERT INTO public.payment_reconciliation_failures (
      kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
    ) VALUES (
      'rental_booking', v_ref, p_amount, v_cur, v_buyer_email,
      jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id,
                         'stripe_session_id', p_stripe_session_id,
                         'booking_status', v_curr_status,
                         'booking_payment_status', v_curr_pay_status,
                         'amount_due_online', v_amount_due_online,
                         'reason', v_refuse),
      'Stripe payment not applied: ' || v_refuse
    ) ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT v_payment_id, v_curr_pay_status, v_curr_status, true, false;
    RETURN;
  END IF;

  -- 7. Record the applied payment
  INSERT INTO public.rental_payments (
    booking_id, organizer_id, kind, method, amount, currency, direction, applied,
    stripe_session_id, stripe_payment_intent_id, stripe_refund_id, recorded_by, notes
  ) VALUES (
    p_booking_id, p_organizer_id, p_kind, p_method, p_amount, v_cur, p_direction, true,
    v_sess, p_stripe_payment_intent_id, p_stripe_refund_id, p_recorded_by, p_notes
  ) RETURNING id INTO v_payment_id;

  IF p_stripe_session_id IS NOT NULL AND NOT v_is_refund THEN
    UPDATE public.rental_checkout_sessions cs
       SET status = 'completed'
     WHERE cs.stripe_session_id = p_stripe_session_id;
  END IF;

  -- 8. Recompute net paid (applied rows only)
  SELECT
    COALESCE(SUM(rp.amount) FILTER (WHERE rp.direction = 'credit' AND rp.applied
                                      AND rp.kind IN ('rental_charge', 'advance', 'balance')), 0)
    - COALESCE(SUM(rp.amount) FILTER (WHERE rp.direction = 'debit' AND rp.applied
                                      AND rp.kind = 'refund'), 0)
    INTO v_net_paid
    FROM public.rental_payments rp
   WHERE rp.booking_id = p_booking_id;

  v_new_pay_status :=
    CASE
      WHEN v_net_paid >= v_rental_amount THEN 'paid'
      WHEN v_net_paid > 0 THEN 'partially_paid'
      WHEN EXISTS (SELECT 1 FROM public.rental_payments rp
                    WHERE rp.booking_id = p_booking_id AND rp.direction = 'debit' AND rp.applied)
        THEN 'refunded'
      ELSE 'unpaid'
    END;

  -- 9. Confirmation: ANY applied payment (card, cash, offline) covering the amount due
  v_new_status := v_curr_status;
  IF NOT v_is_refund AND v_amount_due_online > 0 AND v_net_paid >= v_amount_due_online THEN
    IF v_curr_status = 'awaiting_payment'
       OR (v_curr_status = 'pending' AND v_conf_mode = 'instant') THEN
      v_new_status := 'confirmed';
    END IF;
  END IF;

  UPDATE public.rental_bookings
     SET payment_status = v_new_pay_status,
         status = v_new_status,
         expires_at = CASE WHEN v_new_status = 'confirmed' THEN NULL ELSE expires_at END,
         updated_at = now()
   WHERE id = p_booking_id;

  IF v_new_status <> v_curr_status THEN
    INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
    VALUES (p_booking_id, p_organizer_id, 'status_change', p_recorded_by,
            jsonb_build_object('from_status', v_curr_status, 'to_status', v_new_status,
                               'cause', 'payment', 'method', p_method, 'amount', p_amount));
  END IF;

  -- 10. Payout ledger (Stripe only). Rentals credit the gross amount, no fee entry.
  IF v_is_stripe THEN
    v_recipient_id := public.resolve_recipient('organizer', NULL, p_organizer_id, NULL);

    IF v_recipient_id IS NULL THEN
      INSERT INTO public.payment_reconciliation_failures (
        kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
      ) VALUES (
        'rental_booking', v_ref, p_amount, v_cur, v_buyer_email,
        jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id,
                           'stripe_session_id', p_stripe_session_id, 'reason', 'recipient_unresolved'),
        'Cannot resolve recipient for organizer ' || p_organizer_id::text
      ) ON CONFLICT DO NOTHING;

    ELSIF v_is_refund THEN
      SELECT EXISTS (
        SELECT 1 FROM public.recipient_ledger_entries le
         WHERE le.entry_type = 'credit'
           AND le.source_type = 'rental_booking'
           AND le.source_id = p_booking_id
      ) INTO v_credit_exists;

      IF v_credit_exists THEN
        INSERT INTO public.recipient_ledger_entries (
          recipient_id, entry_type, amount, currency, source_type, source_id,
          external_reference, description
        ) VALUES (
          v_recipient_id, 'refund', -abs(p_amount), v_cur,
          'rental_booking', p_booking_id, p_stripe_refund_id, 'Rental booking refund processed'
        );
      ELSE
        INSERT INTO public.payment_reconciliation_failures (
          kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
        ) VALUES (
          'rental_booking', v_ref, p_amount, v_cur, v_buyer_email,
          jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id,
                             'stripe_refund_id', p_stripe_refund_id, 'reason', 'refund_without_ledger_credit'),
          'Refund recorded but no payout-ledger credit exists for this booking'
        ) ON CONFLICT DO NOTHING;
      END IF;

    ELSIF p_kind IN ('rental_charge', 'advance', 'balance') THEN
      INSERT INTO public.recipient_ledger_entries (
        recipient_id, entry_type, amount, currency, source_type, source_id, description
      ) VALUES (
        v_recipient_id, 'credit', p_amount, v_cur,
        'rental_booking', p_booking_id, 'Rental booking payment received'
      )
      ON CONFLICT DO NOTHING;   -- any unique index (source dedup) makes this idempotent

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        INSERT INTO public.payment_reconciliation_failures (
          kind, stripe_payment_intent_id, amount, currency, buyer_email, raw_metadata, error_message
        ) VALUES (
          'rental_booking', v_ref, p_amount, v_cur, v_buyer_email,
          jsonb_build_object('booking_id', p_booking_id, 'organizer_id', p_organizer_id,
                             'stripe_session_id', p_stripe_session_id,
                             'reason', 'ledger_credit_duplicate_prevented'),
          'Duplicate ledger credit prevented by unique index'
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_payment_id, v_new_pay_status, v_new_status, true, true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_rental_payment FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rental_payment TO service_role;

-- 7. record_rental_balance_and_pickup: the ONE place all pickup rules live ------
-- p_amount = 0 (default) means "no payment now": use it for fully paid bookings.
CREATE FUNCTION public.record_rental_balance_and_pickup(
  p_booking_id      uuid,
  p_organizer_id    uuid,
  p_actor_id        uuid,
  p_method          text    DEFAULT NULL,
  p_amount          numeric DEFAULT 0,
  p_currency        text    DEFAULT NULL,
  p_override_reason text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL
) RETURNS TABLE (
  out_booking_id     uuid,
  out_payment_id     uuid,
  out_payment_status text,
  out_booking_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_booking    public.rental_bookings;
  v_payment_id uuid;
  v_pay_status text;
  v_applied    boolean;
  v_reason     text := NULLIF(trim(COALESCE(p_override_reason, '')), '');
  v_audit      text;
BEGIN
  IF p_method = 'stripe' THEN
    RAISE EXCEPTION 'INVALID_METHOD: balance at pickup must be recorded as cash, mobile_money, card_offline or other';
  END IF;

  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not belong to organizer %', p_booking_id, p_organizer_id;
  END IF;

  -- Same lock order as every other function: category -> vehicle -> row
  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_booking.category_id::text));
  IF v_booking.vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_booking.vehicle_id::text));
  END IF;

  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id
     FOR UPDATE;

  -- Pickup rules (checked BEFORE any money is recorded)
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'PICKUP_BLOCKED_STATUS: booking must be confirmed (current: %)', v_booking.status
      USING ERRCODE = 'RB012';
  END IF;

  IF v_booking.vehicle_id IS NULL THEN
    RAISE EXCEPTION 'VEHICLE_NOT_ASSIGNED: a vehicle must be assigned before recording pickup'
      USING ERRCODE = 'RB010';
  END IF;

  IF now() < v_booking.starts_at - interval '4 hours' THEN
    IF v_reason IS NULL OR length(v_reason) < 5 THEN
      RAISE EXCEPTION 'TOO_EARLY_FOR_PICKUP: pickup cannot be recorded more than 4 hours before the scheduled start without a written reason (at least 5 characters)'
        USING ERRCODE = 'RB011';
    END IF;
  END IF;

  -- Optional balance payment (offline only)
  v_pay_status := v_booking.payment_status;
  IF COALESCE(p_amount, 0) > 0 THEN
    IF p_method IS NULL OR p_currency IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYMENT: method and currency are required when an amount is given';
    END IF;

    SELECT r.out_payment_id, r.out_payment_status, r.out_applied
      INTO v_payment_id, v_pay_status, v_applied
      FROM public.record_rental_payment(
             p_booking_id, p_organizer_id, 'balance', p_method, p_amount,
             p_currency, 'credit', NULL, NULL, NULL, p_actor_id, p_notes
           ) AS r;

    IF v_applied IS NOT TRUE THEN
      RAISE EXCEPTION 'PAYMENT_NOT_APPLIED: balance payment was not applied to booking %', p_booking_id;
    END IF;
  END IF;

  IF v_pay_status <> 'paid' THEN
    RAISE EXCEPTION 'PICKUP_BLOCKED_UNPAID: booking is % ; the full balance is required before pickup', v_pay_status
      USING ERRCODE = 'RB013';
  END IF;

  -- Early-pickup override: stored with the reason
  IF now() < v_booking.starts_at - interval '4 hours' THEN
    v_audit := '[Early pickup override ' || now()::text || '] ' || v_reason;
    UPDATE public.rental_bookings
       SET notes = CASE WHEN notes IS NOT NULL AND notes <> ''
                        THEN notes || E'\n' || v_audit ELSE v_audit END
     WHERE id = p_booking_id;

    INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
    VALUES (p_booking_id, p_organizer_id, 'payment_override', p_actor_id,
            jsonb_build_object('type', 'early_pickup', 'reason', v_reason));
  END IF;

  UPDATE public.rental_bookings
     SET status = 'active', picked_up_at = now(), updated_at = now()
   WHERE id = p_booking_id;

  INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
  VALUES (p_booking_id, p_organizer_id, 'status_change', p_actor_id,
          jsonb_build_object('from_status', 'confirmed', 'to_status', 'active',
                             'picked_up_at', now(), 'balance_paid', COALESCE(p_amount, 0)));

  RETURN QUERY SELECT p_booking_id, v_payment_id, v_pay_status, 'active'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.record_rental_balance_and_pickup FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rental_balance_and_pickup TO service_role;

-- 8. prepare_rental_checkout_session -----------------------------------------
-- Returns the displaced (still-live) Stripe session id so the caller can expire it at Stripe.
CREATE FUNCTION public.prepare_rental_checkout_session(
  p_booking_id   uuid,
  p_organizer_id uuid
) RETURNS TABLE (
  out_booking_id           uuid,
  out_can_create           boolean,
  out_reusable_session_id  text,
  out_displaced_session_id text,
  out_kind                 text,
  out_amount_due           numeric,
  out_currency             text,
  out_customer_email       text,
  out_booking_number       text,
  out_payment_due_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_category_id  uuid;
  v_vehicle_id   uuid;
  v_booking      public.rental_bookings;
  v_open_session public.rental_checkout_sessions;
  v_is_payable   boolean;
  v_kind         text;
  v_displaced    text := NULL;
BEGIN
  SELECT rb.category_id, rb.vehicle_id INTO v_category_id, v_vehicle_id
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rental_category_' || v_category_id::text));
  IF v_vehicle_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('rental_vehicle_' || v_vehicle_id::text));
  END IF;

  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id
     FOR UPDATE;

  v_kind := CASE WHEN v_booking.snapshot_payment_policy = 'full_online' THEN 'full' ELSE 'advance' END;

  v_is_payable := (
    v_booking.status IN ('pending', 'awaiting_payment')
    AND (v_booking.status <> 'pending' OR v_booking.snapshot_confirmation_mode = 'instant')
    AND (v_booking.status <> 'pending' OR v_booking.expires_at IS NULL OR v_booking.expires_at > now())
    AND (v_booking.status <> 'awaiting_payment' OR v_booking.payment_due_at IS NULL OR v_booking.payment_due_at > now())
    AND v_booking.amount_due_online > 0
    AND v_booking.payment_status <> 'paid'
  );

  IF NOT v_is_payable THEN
    RETURN QUERY SELECT v_booking.id, false, NULL::text, NULL::text, v_kind,
                        v_booking.amount_due_online, v_booking.snapshot_currency,
                        v_booking.customer_email, v_booking.booking_number, v_booking.payment_due_at;
    RETURN;
  END IF;

  SELECT cs.* INTO v_open_session
    FROM public.rental_checkout_sessions cs
   WHERE cs.booking_id = p_booking_id AND cs.status = 'open'
     FOR UPDATE;

  IF FOUND THEN
    IF v_open_session.amount = v_booking.amount_due_online
       AND v_open_session.expires_at > now() + interval '2 minutes' THEN
      RETURN QUERY SELECT v_booking.id, true, v_open_session.stripe_session_id, NULL::text, v_kind,
                          v_booking.amount_due_online, v_booking.snapshot_currency,
                          v_booking.customer_email, v_booking.booking_number, v_booking.payment_due_at;
      RETURN;
    END IF;

    UPDATE public.rental_checkout_sessions cs
       SET status = 'expired'
     WHERE cs.id = v_open_session.id;

    IF v_open_session.expires_at > now() THEN
      v_displaced := v_open_session.stripe_session_id;   -- still live at Stripe: caller expires it
    END IF;
  END IF;

  RETURN QUERY SELECT v_booking.id, true, NULL::text, v_displaced, v_kind,
                      v_booking.amount_due_online, v_booking.snapshot_currency,
                      v_booking.customer_email, v_booking.booking_number, v_booking.payment_due_at;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_rental_checkout_session FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_rental_checkout_session TO service_role;

-- 9. commit_rental_checkout_session ------------------------------------------
-- Serialized by the booking row lock; two quick Pay Now clicks leave ONE open session
-- and the loser's Stripe session id is returned for the caller to expire at Stripe.
CREATE FUNCTION public.commit_rental_checkout_session(
  p_booking_id        uuid,
  p_stripe_session_id text,
  p_kind              text,
  p_amount            numeric,
  p_expires_at        timestamptz
) RETURNS TABLE (
  out_session_id           uuid,
  out_displaced_session_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_session_id    uuid;
  v_booking       public.rental_bookings;
  v_expected_kind text;
  v_displaced     text := NULL;
BEGIN
  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id;
  END IF;

  -- Retry of the same commit: return the existing row
  SELECT cs.id INTO v_session_id
    FROM public.rental_checkout_sessions cs
   WHERE cs.stripe_session_id = p_stripe_session_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_session_id, NULL::text;
    RETURN;
  END IF;

  IF v_booking.status NOT IN ('pending', 'awaiting_payment')
     OR (v_booking.status = 'pending' AND v_booking.snapshot_confirmation_mode <> 'instant')
     OR (v_booking.status = 'awaiting_payment'
         AND v_booking.payment_due_at IS NOT NULL
         AND v_booking.payment_due_at < now()) THEN
    RAISE EXCEPTION 'BOOKING_NOT_PAYABLE: booking % cannot accept a checkout session in status %', p_booking_id, v_booking.status;
  END IF;

  IF p_amount IS DISTINCT FROM v_booking.amount_due_online OR v_booking.amount_due_online <= 0 THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH: session amount % does not match amount due online %', p_amount, v_booking.amount_due_online;
  END IF;

  v_expected_kind := CASE WHEN v_booking.snapshot_payment_policy = 'full_online' THEN 'full' ELSE 'advance' END;
  IF p_kind IS DISTINCT FROM v_expected_kind THEN
    RAISE EXCEPTION 'KIND_MISMATCH: session kind % does not match policy (expected %)', p_kind, v_expected_kind;
  END IF;

  SELECT cs.stripe_session_id INTO v_displaced
    FROM public.rental_checkout_sessions cs
   WHERE cs.booking_id = p_booking_id AND cs.status = 'open' AND cs.expires_at > now()
   LIMIT 1;

  UPDATE public.rental_checkout_sessions cs
     SET status = 'expired'
   WHERE cs.booking_id = p_booking_id AND cs.status = 'open';

  INSERT INTO public.rental_checkout_sessions (booking_id, stripe_session_id, kind, amount, expires_at, status)
  VALUES (p_booking_id, p_stripe_session_id, p_kind, p_amount, p_expires_at, 'open')
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT v_session_id, v_displaced;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_rental_checkout_session FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_rental_checkout_session TO service_role;

-- 10. checkout.session.expired webhook helper --------------------------------
CREATE FUNCTION public.expire_rental_checkout_session(p_stripe_session_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  UPDATE public.rental_checkout_sessions cs
     SET status = 'expired'
   WHERE cs.stripe_session_id = p_stripe_session_id AND cs.status = 'open'
  RETURNING cs.booking_id INTO v_booking_id;
  RETURN v_booking_id;   -- NULL if already closed (idempotent)
END;
$$;

REVOKE ALL ON FUNCTION public.expire_rental_checkout_session FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_rental_checkout_session TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';