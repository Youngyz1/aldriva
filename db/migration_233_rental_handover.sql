-- Migration 233: rental handover (pickup/return inspections, deposit settlement, late fees)
-- NOT APPLIED. Owner applies by hand in Supabase SQL editor.
-- Forward migration; rollback: db/migration_233_rental_handover_rollback.sql
--
-- Matches TypeScript contract in lib/actions/rental-handover.ts and lib/actions/rental-settings.ts:
--   tables: rental_inspections (selected columns: id, booking_id, kind, odometer, fuel_level, photos,
--           damage_notes, customer_confirmed_name, customer_confirmed_at, created_by, created_at)
--   businesses: rental_late_fee_grace_minutes, rental_late_fee_per_day, rental_late_fee_currency
--   rpcs: calculate_rental_late_fee(p_scheduled_end,p_actual_return,p_grace_minutes,p_fee_per_day)
--           -> (out_overdue_minutes,out_overdue_days,out_fee_amount)
--         record_rental_pickup_handover(p_booking_id,p_organizer_id,p_actor_id,p_odometer,p_fuel_level,
--           p_photos,p_damage_notes,p_customer_confirmed_name,p_customer_confirmed_at,p_method,p_amount,
--           p_currency,p_override_reason,p_notes)
--         record_rental_return_handover(p_booking_id,p_organizer_id,p_actor_id,p_odometer,p_fuel_level,
--           p_photos,p_damage_notes,p_customer_confirmed_name,p_customer_confirmed_at,p_deposit_action,
--           p_deposit_retained_amount,p_deposit_reason,p_late_fee_action,p_late_fee_amount,
--           p_late_fee_reason,p_actual_return_at)

BEGIN;

-- 1. rental_inspections -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_inspections (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id               uuid NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  organizer_id             uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  kind                     text NOT NULL CHECK (kind IN ('pickup', 'return')),
  odometer                 integer CHECK (odometer IS NULL OR odometer >= 0),
  fuel_level               text,
  photos                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  damage_notes             text,
  customer_confirmed_name  text NOT NULL,
  customer_confirmed_at    timestamptz NOT NULL,
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rental_inspections_booking_kind UNIQUE (booking_id, kind),
  CONSTRAINT chk_rental_inspections_photos_array CHECK (jsonb_typeof(photos) = 'array'),
  CONSTRAINT chk_rental_inspections_photos_max5 CHECK (jsonb_array_length(photos) <= 5)
);

CREATE INDEX IF NOT EXISTS idx_rental_inspections_booking_id
  ON public.rental_inspections (booking_id);
CREATE INDEX IF NOT EXISTS idx_rental_inspections_organizer_id
  ON public.rental_inspections (organizer_id);

ALTER TABLE public.rental_inspections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rental_inspections FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rental_inspections TO service_role;

COMMENT ON TABLE public.rental_inspections IS
  'Pickup/return handover inspections. Service-role writes only (no RLS policies).';

-- 2. Late-fee business settings -----------------------------------------------
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS rental_late_fee_grace_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS rental_late_fee_per_day numeric(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS rental_late_fee_currency text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_businesses_rental_late_fee_grace') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT chk_businesses_rental_late_fee_grace
      CHECK (rental_late_fee_grace_minutes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_businesses_rental_late_fee_per_day') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT chk_businesses_rental_late_fee_per_day
      CHECK (rental_late_fee_per_day >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.businesses.rental_late_fee_grace_minutes IS
  'Grace period after scheduled return before a late fee accrues (minutes). Default 60.';
COMMENT ON COLUMN public.businesses.rental_late_fee_per_day IS
  'Late fee per overdue day or part thereof after grace. 0 disables calculation.';
COMMENT ON COLUMN public.businesses.rental_late_fee_currency IS
  'Optional currency code for late fee display; nullable.';

-- 3. Extend rental_booking_events event_type CHECK -----------------------------
-- Preserve all existing values from migration 228 and add handover event types.
ALTER TABLE public.rental_booking_events
  DROP CONSTRAINT IF EXISTS rental_booking_events_event_type_check;
ALTER TABLE public.rental_booking_events
  ADD CONSTRAINT rental_booking_events_event_type_check CHECK (event_type IN (
    'status_change',
    'payment_link_sent',
    'deadline_extended',
    'payment_override',
    'email_sent',
    'email_failed',
    'inspection_recorded',
    'deposit_settled',
    'late_fee_applied',
    'late_fee_waived'
  ));

-- 4. calculate_rental_late_fee ------------------------------------------------
-- Must match lib/rental/late-fee.ts exactly:
--   grace = max(0, graceMinutes ?? 60), rate = max(0, feePerDay ?? 0)
--   invalid dates -> (0,0,0)
--   if actual <= scheduledEnd + grace -> (0,0,0)
--   overdueMinutes = max(0, floor((actual-scheduledEnd)/60s) - grace)
--   overdueDays = max(1, ceil(overdueMinutes/1440))
--   feeAmount = round(overdueDays*rate*100)/100
CREATE OR REPLACE FUNCTION public.calculate_rental_late_fee(
  p_scheduled_end timestamptz,
  p_actual_return timestamptz,
  p_grace_minutes integer,
  p_fee_per_day numeric
) RETURNS TABLE(out_overdue_minutes integer, out_overdue_days integer, out_fee_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grace integer := GREATEST(0, COALESCE(p_grace_minutes, 60));
  v_rate numeric := GREATEST(0, COALESCE(p_fee_per_day, 0));
  v_overdue_min integer;
  v_days integer;
BEGIN
  IF p_scheduled_end IS NULL OR p_actual_return IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0::numeric;
    RETURN;
  END IF;

  IF p_actual_return <= p_scheduled_end + make_interval(mins => v_grace) THEN
    RETURN QUERY SELECT 0, 0, 0::numeric;
    RETURN;
  END IF;

  v_overdue_min := GREATEST(
    0,
    FLOOR(EXTRACT(EPOCH FROM (p_actual_return - p_scheduled_end)) / 60.0)::integer - v_grace
  );
  v_days := GREATEST(1, CEIL(v_overdue_min / 1440.0)::integer);

  RETURN QUERY SELECT v_overdue_min, v_days, ROUND((v_days * v_rate)::numeric, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_rental_late_fee(timestamptz, timestamptz, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_rental_late_fee(timestamptz, timestamptz, integer, numeric) TO service_role;

-- 5. record_rental_pickup_handover --------------------------------------------
-- Reuses record_rental_balance_and_pickup (migration 229) for all pickup rules
-- (status/vehicle/4h-override/payment). Inspection insert + start_mileage happen
-- in the same transaction; a unique violation on (booking_id, kind) maps to
-- ALREADY_SUBMITTED and rolls everything back.
CREATE OR REPLACE FUNCTION public.record_rental_pickup_handover(
  p_booking_id              uuid,
  p_organizer_id            uuid,
  p_actor_id                uuid,
  p_odometer                integer DEFAULT NULL,
  p_fuel_level              text DEFAULT NULL,
  p_photos                  jsonb DEFAULT '[]'::jsonb,
  p_damage_notes            text DEFAULT NULL,
  p_customer_confirmed_name text DEFAULT NULL,
  p_customer_confirmed_at   timestamptz DEFAULT NULL,
  p_method                  text DEFAULT NULL,
  p_amount                  numeric DEFAULT 0,
  p_currency                text DEFAULT NULL,
  p_override_reason         text DEFAULT NULL,
  p_notes                   text DEFAULT NULL
) RETURNS TABLE (
  out_booking_id     uuid,
  out_payment_id     uuid,
  out_payment_status text,
  out_booking_status text,
  out_inspection_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_conf_name text := NULLIF(trim(COALESCE(p_customer_confirmed_name, '')), '');
  v_conf_at   timestamptz := COALESCE(p_customer_confirmed_at, now());
  v_photos    jsonb := COALESCE(p_photos, '[]'::jsonb);
  v_pick      record;
  v_insp_id   uuid;
BEGIN
  IF v_conf_name IS NULL THEN
    RAISE EXCEPTION 'CONFIRMATION_REQUIRED: customer confirmation name is required' USING ERRCODE = 'RB050';
  END IF;
  IF jsonb_typeof(v_photos) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PHOTOS: photos must be a JSON array';
  END IF;
  IF jsonb_array_length(v_photos) > 5 THEN
    RAISE EXCEPTION 'INVALID_PHOTOS: at most 5 photos are allowed';
  END IF;
  IF p_odometer IS NOT NULL AND p_odometer < 0 THEN
    RAISE EXCEPTION 'INVALID_ODOMETER: odometer must be non-negative';
  END IF;

  -- Reuse existing pickup rules/payment/state transition (migration 229).
  -- Runs in the same transaction; its locks/checks/updates/events apply here.
  SELECT *
    INTO v_pick
    FROM public.record_rental_balance_and_pickup(
      p_booking_id,
      p_organizer_id,
      p_actor_id,
      p_method,
      p_amount,
      p_currency,
      p_override_reason,
      p_notes
    );

  -- Persist start mileage snapshot if provided (booking is now active).
  IF p_odometer IS NOT NULL THEN
    UPDATE public.rental_bookings
       SET start_mileage = p_odometer, updated_at = now()
     WHERE id = p_booking_id AND organizer_id = p_organizer_id;
  END IF;

  -- Wrap ONLY the inspection INSERT so errors from reused 229 function propagate unchanged.
  BEGIN
    INSERT INTO public.rental_inspections (
      booking_id, organizer_id, kind, odometer, fuel_level, photos,
      damage_notes, customer_confirmed_name, customer_confirmed_at, created_by
    ) VALUES (
      p_booking_id, p_organizer_id, 'pickup', p_odometer, p_fuel_level, v_photos,
      NULLIF(trim(COALESCE(p_damage_notes, '')), ''),
      v_conf_name, v_conf_at, p_actor_id
    )
    RETURNING id INTO v_insp_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED: pickup inspection already recorded for this booking' USING ERRCODE = 'RB051';
  END;

  INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
  VALUES (
    p_booking_id, p_organizer_id, 'inspection_recorded', p_actor_id,
    jsonb_build_object(
      'kind', 'pickup',
      'inspection_id', v_insp_id,
      'odometer', p_odometer,
      'fuel_level', p_fuel_level,
      'customer_confirmed_name', v_conf_name,
      'customer_confirmed_at', v_conf_at
    )
  );

  RETURN QUERY SELECT
    v_pick.out_booking_id,
    v_pick.out_payment_id,
    v_pick.out_payment_status,
    v_pick.out_booking_status,
    v_insp_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_rental_pickup_handover(uuid, uuid, uuid, integer, text, jsonb, text, text, timestamptz, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rental_pickup_handover(uuid, uuid, uuid, integer, text, jsonb, text, text, timestamptz, text, numeric, text, text, text) TO service_role;

-- 6. record_rental_return_handover --------------------------------------------
-- Reuses transition_rental_booking (migration 230, cause 'return') for the
-- active->completed transition/locking/events, then records inspection, end
-- mileage, deposit settlement and late fee in the same transaction.
CREATE OR REPLACE FUNCTION public.record_rental_return_handover(
  p_booking_id              uuid,
  p_organizer_id            uuid,
  p_actor_id                uuid,
  p_odometer                integer DEFAULT NULL,
  p_fuel_level              text DEFAULT NULL,
  p_photos                  jsonb DEFAULT '[]'::jsonb,
  p_damage_notes            text DEFAULT NULL,
  p_customer_confirmed_name text DEFAULT NULL,
  p_customer_confirmed_at   timestamptz DEFAULT NULL,
  p_deposit_action          text DEFAULT 'none',
  p_deposit_retained_amount numeric DEFAULT 0,
  p_deposit_reason          text DEFAULT NULL,
  p_late_fee_action         text DEFAULT 'none',
  p_late_fee_amount         numeric DEFAULT NULL,
  p_late_fee_reason         text DEFAULT NULL,
  p_actual_return_at        timestamptz DEFAULT NULL
) RETURNS TABLE (
  out_booking_id      uuid,
  out_status          text,
  out_inspection_id   uuid,
  out_deposit_status  text,
  out_late_fee_amount numeric,
  out_late_fee_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_booking        public.rental_bookings;
  v_conf_name      text := NULLIF(trim(COALESCE(p_customer_confirmed_name, '')), '');
  v_conf_at        timestamptz := COALESCE(p_customer_confirmed_at, now());
  v_photos         jsonb := COALESCE(p_photos, '[]'::jsonb);
  v_dep_action     text := COALESCE(NULLIF(trim(COALESCE(p_deposit_action, '')), ''), 'none');
  v_lf_action      text := COALESCE(NULLIF(trim(COALESCE(p_late_fee_action, '')), ''), 'none');
  v_dep_reason     text := NULLIF(trim(COALESCE(p_deposit_reason, '')), '');
  v_lf_reason      text := NULLIF(trim(COALESCE(p_late_fee_reason, '')), '');
  v_actual         timestamptz;
  v_now            timestamptz := now();
  v_insp_id        uuid;
  v_dep_status     text;
  v_dep_collected  numeric(12,2);
  v_dep_retained   numeric(12,2);
  v_dep_already    boolean;
  v_lf_amount      numeric(12,2) := 0;
  v_lf_status      text := 'none';
  v_calc_amount    numeric(12,2) := 0;
  v_calc_minutes   integer := 0;
  v_calc_days      integer := 0;
  v_grace          integer := 60;
  v_fee_per_day    numeric(12,2) := 0;
  v_tr             record;
BEGIN
  IF v_conf_name IS NULL THEN
    RAISE EXCEPTION 'CONFIRMATION_REQUIRED: customer confirmation name is required' USING ERRCODE = 'RB050';
  END IF;
  IF jsonb_typeof(v_photos) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PHOTOS: photos must be a JSON array';
  END IF;
  IF jsonb_array_length(v_photos) > 5 THEN
    RAISE EXCEPTION 'INVALID_PHOTOS: at most 5 photos are allowed';
  END IF;
  IF p_odometer IS NOT NULL AND p_odometer < 0 THEN
    RAISE EXCEPTION 'INVALID_ODOMETER: odometer must be non-negative';
  END IF;
  IF v_dep_action NOT IN ('none', 'return_full', 'retain_partial', 'retain_full') THEN
    RAISE EXCEPTION 'INVALID_DEPOSIT_ACTION: %', v_dep_action USING ERRCODE = 'RB052';
  END IF;
  IF v_lf_action NOT IN ('none', 'apply', 'waive') THEN
    RAISE EXCEPTION 'INVALID_LATE_FEE_ACTION: %', v_lf_action USING ERRCODE = 'RB053';
  END IF;

  -- Pre-read for tenant verification and time validation context.
  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not belong to organizer %', p_booking_id, p_organizer_id;
  END IF;

  IF p_odometer IS NOT NULL AND v_booking.start_mileage IS NOT NULL AND p_odometer < v_booking.start_mileage THEN
    RAISE EXCEPTION 'INVALID_ODOMETER: return odometer cannot be less than start mileage';
  END IF;

  -- Actual return time: DB clock by default; if provided, clamp small future skew,
  -- reject >5 min future, reject >24h before now, reject before picked_up_at.
  IF p_actual_return_at IS NULL THEN
    v_actual := v_now;
  ELSE
    IF p_actual_return_at > v_now + interval '5 minutes' THEN
      RAISE EXCEPTION 'INVALID_RETURN_TIME: actual return time cannot be more than 5 minutes in the future';
    ELSIF p_actual_return_at > v_now THEN
      v_actual := v_now;
    ELSIF p_actual_return_at < v_now - interval '24 hours' THEN
      RAISE EXCEPTION 'INVALID_RETURN_TIME: actual return time cannot be more than 24 hours before now';
    ELSE
      v_actual := p_actual_return_at;
    END IF;

    IF v_booking.picked_up_at IS NOT NULL AND v_actual < v_booking.picked_up_at THEN
      RAISE EXCEPTION 'INVALID_RETURN_TIME: actual return time cannot be before picked_up_at';
    END IF;
  END IF;

  -- Reuse transition logic (migration 230, cause 'return'): enforces active-only,
  -- locking, completion, is_overdue reset, net_paid/status_change event.
  SELECT *
    INTO v_tr
    FROM public.transition_rental_booking(p_booking_id, p_organizer_id, p_actor_id, 'return', NULL);

  -- Apply provided/DB-clock return time (transition sets now(); honor explicit time).
  UPDATE public.rental_bookings
     SET returned_at = v_actual,
         end_mileage = COALESCE(p_odometer, end_mileage),
         updated_at = now()
   WHERE id = p_booking_id AND organizer_id = p_organizer_id;

  -- Lock and read current row state for settlement/fee decisions.
  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND rb.organizer_id = p_organizer_id
     FOR UPDATE;

  -- Insert return inspection (double-submit guard). Wrap ONLY this INSERT so errors
  -- from reused 230 function and other logic propagate unchanged.
  BEGIN
    INSERT INTO public.rental_inspections (
      booking_id, organizer_id, kind, odometer, fuel_level, photos,
      damage_notes, customer_confirmed_name, customer_confirmed_at, created_by
    ) VALUES (
      p_booking_id, p_organizer_id, 'return', p_odometer, p_fuel_level, v_photos,
      NULLIF(trim(COALESCE(p_damage_notes, '')), ''),
      v_conf_name, v_conf_at, p_actor_id
    )
    RETURNING id INTO v_insp_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED: return inspection already recorded for this booking' USING ERRCODE = 'RB051';
  END;

  -- Deposit settlement
  v_dep_status := v_booking.deposit_status;
  v_dep_collected := COALESCE(v_booking.deposit_collected_amount, 0)::numeric(12,2);
  v_dep_retained := COALESCE(v_booking.deposit_retained_amount, 0)::numeric(12,2);
  v_dep_already := v_dep_status IN ('returned_full', 'partially_retained', 'retained_full');

  IF v_dep_action <> 'none' THEN
    IF v_dep_already THEN
      RAISE EXCEPTION 'DEPOSIT_ALREADY_SETTLED: deposit has already been settled for this booking' USING ERRCODE = 'RB054';
    END IF;
    IF v_dep_status <> 'collected_offline' THEN
      RAISE EXCEPTION 'DEPOSIT_NOT_COLLECTED: deposit can only be settled when collected offline (current status: %)', v_dep_status USING ERRCODE = 'RB056';
    END IF;

    IF v_dep_action = 'return_full' THEN
      v_dep_status := 'returned_full';
      v_dep_retained := 0;
    ELSIF v_dep_action = 'retain_full' THEN
      IF v_dep_collected <= 0 THEN
        RAISE EXCEPTION 'DEPOSIT_NOT_COLLECTED: no collected deposit amount to retain' USING ERRCODE = 'RB056';
      END IF;
      IF v_dep_reason IS NULL OR length(v_dep_reason) < 3 THEN
        RAISE EXCEPTION 'DEPOSIT_REASON_REQUIRED: a reason of at least 3 characters is required to retain a deposit' USING ERRCODE = 'RB055';
      END IF;
      v_dep_status := 'retained_full';
      v_dep_retained := v_dep_collected;
    ELSIF v_dep_action = 'retain_partial' THEN
      IF COALESCE(p_deposit_retained_amount, 0) <= 0 OR COALESCE(p_deposit_retained_amount, 0) > v_dep_collected THEN
        RAISE EXCEPTION 'INVALID_DEPOSIT_AMOUNT: retained amount must be > 0 and <= collected amount' USING ERRCODE = 'RB057';
      END IF;
      IF v_dep_reason IS NULL OR length(v_dep_reason) < 3 THEN
        RAISE EXCEPTION 'DEPOSIT_REASON_REQUIRED: a reason of at least 3 characters is required to retain a deposit' USING ERRCODE = 'RB055';
      END IF;
      v_dep_status := 'partially_retained';
      v_dep_retained := ROUND(COALESCE(p_deposit_retained_amount, 0)::numeric, 2);
    END IF;

    UPDATE public.rental_bookings
       SET deposit_status = v_dep_status,
           deposit_retained_amount = v_dep_retained,
           deposit_retention_reason = CASE WHEN v_dep_action IN ('retain_partial', 'retain_full') THEN v_dep_reason ELSE deposit_retention_reason END,
           deposit_retention_authorized_by = p_actor_id,
           updated_at = now()
     WHERE id = p_booking_id AND organizer_id = p_organizer_id;
  END IF;

  -- Late fee: compute on server (never trust client amount for apply).
  SELECT COALESCE(b.rental_late_fee_grace_minutes, 60),
         COALESCE(b.rental_late_fee_per_day, 0)::numeric(12,2)
    INTO v_grace, v_fee_per_day
    FROM public.businesses b
   WHERE b.id = v_booking.business_id;

  SELECT c.out_overdue_minutes, c.out_overdue_days, c.out_fee_amount
    INTO v_calc_minutes, v_calc_days, v_calc_amount
    FROM public.calculate_rental_late_fee(v_booking.ends_at, v_actual, v_grace, v_fee_per_day) c;
  v_calc_amount := COALESCE(v_calc_amount, 0)::numeric(12,2);

  IF v_calc_amount > 0 AND v_lf_action = 'none' THEN
    RAISE EXCEPTION 'LATE_FEE_DECISION_REQUIRED: a late fee is due and must be applied or waived' USING ERRCODE = 'RB059';
  END IF;

  IF v_lf_action = 'apply' THEN
    v_lf_amount := v_calc_amount;
    v_lf_status := CASE WHEN v_lf_amount > 0 THEN 'pending' ELSE 'none' END;
    UPDATE public.rental_bookings
       SET late_fee_amount = v_lf_amount,
           late_fee_status = v_lf_status,
           late_fee_notes = COALESCE(v_lf_reason, late_fee_notes),
           updated_at = now()
     WHERE id = p_booking_id AND organizer_id = p_organizer_id;
  ELSIF v_lf_action = 'waive' THEN
    IF v_lf_reason IS NULL OR length(v_lf_reason) < 3 THEN
      RAISE EXCEPTION 'LATE_FEE_REASON_REQUIRED: a reason of at least 3 characters is required to waive a late fee' USING ERRCODE = 'RB058';
    END IF;
    v_lf_amount := v_calc_amount;
    v_lf_status := CASE WHEN v_lf_amount > 0 THEN 'waived' ELSE 'none' END;
    UPDATE public.rental_bookings
       SET late_fee_amount = v_lf_amount,
           late_fee_status = v_lf_status,
           late_fee_notes = v_lf_reason,
           updated_at = now()
     WHERE id = p_booking_id AND organizer_id = p_organizer_id;
  END IF;

  -- Read final state for return values.
  SELECT rb.* INTO v_booking
    FROM public.rental_bookings rb
   WHERE rb.id = p_booking_id AND organizer_id = p_organizer_id;

  -- Event logging (all in same transaction).
  INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
  VALUES (
    p_booking_id, p_organizer_id, 'inspection_recorded', p_actor_id,
    jsonb_build_object(
      'kind', 'return',
      'inspection_id', v_insp_id,
      'odometer', p_odometer,
      'fuel_level', p_fuel_level,
      'customer_confirmed_name', v_conf_name,
      'customer_confirmed_at', v_conf_at,
      'actual_return_at', v_actual
    )
  );

  IF v_dep_action <> 'none' THEN
    INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
    VALUES (
      p_booking_id, p_organizer_id, 'deposit_settled', p_actor_id,
      jsonb_build_object(
        'action', v_dep_action,
        'deposit_status', v_dep_status,
        'collected_amount', v_dep_collected,
        'retained_amount', v_dep_retained,
        'reason', v_dep_reason
      )
    );
  END IF;

  IF v_lf_action = 'apply' THEN
    INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
    VALUES (
      p_booking_id, p_organizer_id, 'late_fee_applied', p_actor_id,
      jsonb_build_object(
        'amount', v_lf_amount,
        'calculated_amount', v_calc_amount,
        'overdue_minutes', v_calc_minutes,
        'overdue_days', v_calc_days,
        'grace_minutes', v_grace,
        'fee_per_day', v_fee_per_day,
        'actual_return_at', v_actual,
        'reason', v_lf_reason
      )
    );
  ELSIF v_lf_action = 'waive' THEN
    INSERT INTO public.rental_booking_events (booking_id, organizer_id, event_type, actor_id, payload)
    VALUES (
      p_booking_id, p_organizer_id, 'late_fee_waived', p_actor_id,
      jsonb_build_object(
        'amount', v_lf_amount,
        'calculated_amount', v_calc_amount,
        'overdue_minutes', v_calc_minutes,
        'overdue_days', v_calc_days,
        'grace_minutes', v_grace,
        'fee_per_day', v_fee_per_day,
        'actual_return_at', v_actual,
        'reason', v_lf_reason
      )
    );
  END IF;

  RETURN QUERY SELECT
    p_booking_id,
    COALESCE(v_tr.out_status, 'completed'),
    v_insp_id,
    COALESCE(v_booking.deposit_status, 'none'),
    COALESCE(v_booking.late_fee_amount, 0)::numeric,
    COALESCE(v_booking.late_fee_status, 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.record_rental_return_handover(uuid, uuid, uuid, integer, text, jsonb, text, text, timestamptz, text, numeric, text, text, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rental_return_handover(uuid, uuid, uuid, integer, text, jsonb, text, text, timestamptz, text, numeric, text, text, numeric, text, timestamptz) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
