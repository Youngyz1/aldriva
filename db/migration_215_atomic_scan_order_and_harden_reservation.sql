-- migration_215_atomic_scan_order_and_harden_reservation.sql
-- Phase 5.1 Stage 1: atomic order scan action + reservation hardening
-- Final correction

BEGIN;

-- scan_order_action (SECURITY DEFINER, service_role only)
CREATE OR REPLACE FUNCTION public.scan_order_action(
  p_tenant_id uuid,
  p_order_id uuid,
  p_action text,
  p_scan_event_id uuid,
  p_actor jsonb,
  p_cash_collected boolean DEFAULT false,
  p_client_scan_id text DEFAULT NULL,
  p_device_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $scan_order_action$
DECLARE
  v_event public.scan_events%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_actor_kind text;
  v_actor_user_id uuid;
  v_from_status text;
  v_to_status text;
  v_outcome text;
  v_reason text;
  v_new_status text;
  v_branch_id uuid;
  v_business_id uuid;
  v_payment_status_cur text;
  v_courier_worker_id uuid;
  v_require_courier boolean := false;
  v_terminal_success boolean := false;
  v_mark_payment_collected boolean := false;
  v_new_payment_status text;
  v_history_event jsonb;
  v_existing_history jsonb;
  v_now timestamptz := now();
  v_event_rows int := 0;
  v_fulfilment_type text;
  v_payment_method text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_action IS NULL OR p_scan_event_id IS NULL OR p_actor IS NULL THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  v_actor_kind := NULLIF(btrim(p_actor->>'kind'), '');
  v_actor_user_id := NULLIF(p_actor->>'userId','')::uuid;

  IF v_actor_kind = 'worker' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_actor_kind IS DISTINCT FROM 'user' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_actor_user_id IS NULL THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  SELECT * INTO v_event FROM public.scan_events WHERE id = p_scan_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  IF v_event.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.code_type IS DISTINCT FROM 'order' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.subject_id IS DISTINCT FROM p_order_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.action IS DISTINCT FROM p_action THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  IF v_event.actor_kind IS DISTINCT FROM 'user' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.actor_user_id IS DISTINCT FROM v_actor_user_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.actor_worker_id IS NOT NULL THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  IF v_order.organizer_id IS DISTINCT FROM p_tenant_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  v_branch_id := v_order.branch_id;
  v_business_id := v_order.business_id;

  IF v_business_id IS NOT NULL THEN
    IF v_event.business_id IS NULL OR v_event.business_id IS DISTINCT FROM v_business_id THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  ELSE
    IF v_event.business_id IS NOT NULL THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  END IF;

  IF v_branch_id IS NOT NULL THEN
    IF v_event.branch_id IS NULL OR v_event.branch_id IS DISTINCT FROM v_branch_id THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  ELSE
    IF v_event.branch_id IS NOT NULL THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  END IF;

  IF v_event.outcome IS DISTINCT FROM 'pending' THEN
    RETURN json_build_object('outcome', v_event.outcome, 'from_status', v_event.from_status, 'to_status', v_event.to_status, 'reason', v_event.reason, 'payment_status', NULL, 'event_finalized', true, 'branch_id', v_event.branch_id, 'business_id', v_event.business_id);
  END IF;

  v_from_status := v_order.status;
  v_fulfilment_type := v_order.fulfilment_type;
  v_payment_method := NULLIF(btrim(v_order.payment_method), '');
  v_payment_status_cur := v_order.payment_status;
  v_courier_worker_id := v_order.courier_worker_id;

  IF p_action = 'pick_up' THEN
    IF v_fulfilment_type IN ('pickup','dine_in') THEN
      IF v_from_status = 'ready' THEN
        v_new_status := 'completed'; v_to_status := 'completed'; v_outcome := 'pending_exec';
      ELSIF v_from_status = 'completed' THEN
        v_outcome := 'already_done'; v_to_status := 'completed';
      ELSE
        v_outcome := 'rejected'; v_reason := 'invalid_transition'; v_to_status := v_from_status;
      END IF;
    ELSIF v_fulfilment_type = 'delivery' THEN
      IF v_from_status = 'ready' THEN
        v_new_status := 'picked_up'; v_to_status := 'picked_up'; v_outcome := 'pending_exec'; v_require_courier := true;
      ELSIF v_from_status = 'picked_up' THEN
        v_outcome := 'already_done'; v_to_status := 'picked_up';
      ELSE
        v_outcome := 'rejected'; v_reason := 'invalid_transition'; v_to_status := v_from_status;
      END IF;
    ELSE
      v_outcome := 'rejected'; v_reason := 'fulfilment_not_supported'; v_to_status := v_from_status;
    END IF;
  ELSIF p_action = 'deliver' THEN
    IF v_fulfilment_type <> 'delivery' THEN
      v_outcome := 'rejected'; v_reason := 'fulfilment_not_supported'; v_to_status := v_from_status;
    ELSIF v_from_status IN ('picked_up','out_for_delivery') THEN
      v_new_status := 'delivered'; v_to_status := 'delivered'; v_outcome := 'pending_exec'; v_require_courier := true;
    ELSIF v_from_status = 'delivered' THEN
      v_outcome := 'already_done'; v_to_status := 'delivered';
    ELSE
      v_outcome := 'rejected'; v_reason := 'invalid_transition'; v_to_status := v_from_status;
    END IF;
  ELSE
    v_outcome := 'rejected'; v_reason := 'action_not_supported'; v_to_status := v_from_status;
  END IF;

  IF v_outcome IN ('already_done','rejected') THEN
    UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = v_now, business_id = COALESCE(v_event.business_id, v_business_id), branch_id = COALESCE(v_event.branch_id, v_branch_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
    GET DIAGNOSTICS v_event_rows = ROW_COUNT;
    IF v_event_rows <> 1 THEN
      RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
    END IF;
    RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status_cur,'event_finalized',true,'branch_id',v_event.branch_id,'business_id',v_event.business_id);
  END IF;

  IF v_require_courier THEN
    IF v_courier_worker_id IS NULL THEN
      v_outcome := 'rejected'; v_reason := 'courier_required'; v_to_status := v_from_status;
      UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = v_now, business_id = COALESCE(v_event.business_id, v_business_id), branch_id = COALESCE(v_event.branch_id, v_branch_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
      GET DIAGNOSTICS v_event_rows = ROW_COUNT;
      IF v_event_rows <> 1 THEN
        RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
      END IF;
      RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status_cur,'event_finalized',true,'branch_id',v_event.branch_id,'business_id',v_event.business_id);
    END IF;
  END IF;

  v_terminal_success := (v_new_status = 'completed' OR v_new_status = 'delivered');
  IF v_terminal_success AND v_payment_status_cur IS DISTINCT FROM 'paid' THEN
    IF v_payment_method = 'online' THEN
      v_outcome := 'rejected'; v_reason := 'payment_required'; v_to_status := v_from_status;
      UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = v_now, business_id = COALESCE(v_event.business_id, v_business_id), branch_id = COALESCE(v_event.branch_id, v_branch_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
      GET DIAGNOSTICS v_event_rows = ROW_COUNT;
      IF v_event_rows <> 1 THEN
        RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
      END IF;
      RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status_cur,'event_finalized',true,'branch_id',v_event.branch_id,'business_id',v_event.business_id);
    END IF;
    IF v_payment_method IS NULL THEN
      v_outcome := 'rejected'; v_reason := 'payment_required'; v_to_status := v_from_status;
      UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = v_now, business_id = COALESCE(v_event.business_id, v_business_id), branch_id = COALESCE(v_event.branch_id, v_branch_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
      GET DIAGNOSTICS v_event_rows = ROW_COUNT;
      IF v_event_rows <> 1 THEN
        RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
      END IF;
      RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status_cur,'event_finalized',true,'branch_id',v_event.branch_id,'business_id',v_event.business_id);
    END IF;
    IF COALESCE(p_cash_collected,false) IS FALSE THEN
      v_outcome := 'rejected'; v_reason := 'cash_confirmation_required'; v_to_status := v_from_status;
      UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = v_now, business_id = COALESCE(v_event.business_id, v_business_id), branch_id = COALESCE(v_event.branch_id, v_branch_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
      GET DIAGNOSTICS v_event_rows = ROW_COUNT;
      IF v_event_rows <> 1 THEN
        RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
      END IF;
      RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status_cur,'event_finalized',true,'branch_id',v_event.branch_id,'business_id',v_event.business_id);
    END IF;
    v_mark_payment_collected := true;
  END IF;

  v_new_payment_status := CASE WHEN v_mark_payment_collected THEN 'paid' ELSE v_payment_status_cur END;
  v_existing_history := COALESCE(v_order.status_history,'[]'::jsonb);
  v_history_event := jsonb_build_object('status',v_new_status,'at',to_char(v_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'by_user_id',v_actor_user_id,'reason',NULL,'note','Scanned','source','scanner');

  UPDATE public.orders SET status = v_new_status, updated_at = v_now, payment_status = v_new_payment_status, status_history = v_existing_history || v_history_event WHERE id = p_order_id AND organizer_id = p_tenant_id AND status IS NOT DISTINCT FROM v_from_status;
  IF NOT FOUND THEN
    SELECT status INTO v_from_status FROM public.orders WHERE id = p_order_id AND organizer_id = p_tenant_id;
    IF v_from_status = v_new_status THEN
      v_outcome := 'already_done'; v_to_status := v_new_status; v_reason := NULL;
    ELSE
      v_outcome := 'rejected'; v_reason := 'status_changed'; v_to_status := v_from_status;
    END IF;
    UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = v_now, business_id = COALESCE(v_event.business_id, v_business_id), branch_id = COALESCE(v_event.branch_id, v_branch_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
    GET DIAGNOSTICS v_event_rows = ROW_COUNT;
    IF v_event_rows <> 1 THEN
      RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
    END IF;
    SELECT payment_status INTO v_payment_status_cur FROM public.orders WHERE id = p_order_id AND organizer_id = p_tenant_id;
    RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status_cur,'event_finalized',true,'branch_id',v_event.branch_id,'business_id',v_event.business_id);
  END IF;

  v_outcome := 'success'; v_to_status := v_new_status; v_reason := NULL;
  UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = v_now, business_id = COALESCE(v_event.business_id, v_business_id), branch_id = COALESCE(v_event.branch_id, v_branch_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
  GET DIAGNOSTICS v_event_rows = ROW_COUNT;
  IF v_event_rows <> 1 THEN
    RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
  END IF;
  SELECT payment_status INTO v_payment_status_cur FROM public.orders WHERE id = p_order_id AND organizer_id = p_tenant_id;
  RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status_cur,'event_finalized',true,'branch_id',v_event.branch_id,'business_id',v_event.business_id);
END;
$scan_order_action$;

REVOKE ALL ON FUNCTION public.scan_order_action(uuid,uuid,text,uuid,jsonb,boolean,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_order_action(uuid,uuid,text,uuid,jsonb,boolean,text,text) TO service_role;

-- Harden scan_reservation_action
CREATE OR REPLACE FUNCTION public.scan_reservation_action(
  p_tenant_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_scan_event_id uuid,
  p_actor jsonb
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $scan_reservation_action$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_event public.scan_events%ROWTYPE;
  v_from_status text;
  v_outcome text := null;
  v_to_status text := null;
  v_reason text := null;
  v_new_status text := null;
  v_branch_id uuid := null;
  v_business_id uuid := null;
  v_payment_status text := null;
  v_event_rows int := 0;
  v_actor_kind text;
  v_actor_user_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF p_tenant_id IS NULL OR p_reservation_id IS NULL OR p_action IS NULL OR p_scan_event_id IS NULL OR p_actor IS NULL THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  v_actor_kind := NULLIF(btrim(p_actor->>'kind'), '');
  v_actor_user_id := NULLIF(p_actor->>'userId','')::uuid;

  IF v_actor_kind = 'worker' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_actor_kind IS DISTINCT FROM 'user' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_actor_user_id IS NULL THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  SELECT * INTO v_event FROM public.scan_events WHERE id = p_scan_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  IF v_event.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.code_type IS DISTINCT FROM 'reservation' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.subject_id IS DISTINCT FROM p_reservation_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.action IS DISTINCT FROM p_action THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  IF v_event.actor_kind IS DISTINCT FROM 'user' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.actor_user_id IS DISTINCT FROM v_actor_user_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_event.actor_worker_id IS NOT NULL THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;
  IF v_reservation.organizer_id IS DISTINCT FROM p_tenant_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  v_branch_id := v_reservation.branch_id;
  v_business_id := v_reservation.business_id;

  IF v_business_id IS NOT NULL THEN
    IF v_event.business_id IS NULL OR v_event.business_id IS DISTINCT FROM v_business_id THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  ELSE
    IF v_event.business_id IS NOT NULL THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  END IF;

  IF v_branch_id IS NOT NULL THEN
    IF v_event.branch_id IS NULL OR v_event.branch_id IS DISTINCT FROM v_branch_id THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  ELSE
    IF v_event.branch_id IS NOT NULL THEN
      RETURN json_build_object('outcome','rejected','reason','not_found');
    END IF;
  END IF;

  IF v_event.outcome IS DISTINCT FROM 'pending' THEN
    RETURN json_build_object('outcome', v_event.outcome, 'from_status', v_event.from_status, 'to_status', v_event.to_status, 'reason', v_event.reason, 'payment_status', NULL, 'event_finalized', true, 'branch_id', v_event.branch_id);
  END IF;

  v_from_status := v_reservation.status;
  v_payment_status := v_reservation.payment_status;

  IF p_action = 'seat' THEN
    IF v_from_status = 'confirmed' THEN
      v_new_status := 'seated';
      v_to_status := 'seated';
      v_outcome := 'success';
      v_reason := null;
      UPDATE public.reservations SET status = v_new_status, status_history = COALESCE(v_reservation.status_history,'[]'::jsonb) || jsonb_build_object('status',v_new_status,'at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'by_user_id',v_actor_user_id,'reason',null,'note','Scanned','source','scanner','scan_event_id',p_scan_event_id,'actor_worker_id',NULL,'staff_member_id',NULL), updated_at = now() WHERE id = p_reservation_id AND status IS NOT DISTINCT FROM v_from_status;
      IF NOT FOUND THEN
        SELECT status INTO v_from_status FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
        IF v_from_status = 'seated' THEN
          v_outcome := 'already_done'; v_to_status := 'seated'; v_reason := NULL;
        ELSIF v_from_status = 'confirmed' THEN
          v_outcome := 'rejected'; v_reason := 'status_changed'; v_to_status := v_from_status;
        ELSE
          v_outcome := 'rejected'; v_reason := 'invalid_transition'; v_to_status := v_from_status;
        END IF;
      END IF;
    ELSIF v_from_status = 'seated' THEN
      v_outcome := 'already_done';
      v_to_status := 'seated';
    ELSE
      v_outcome := 'rejected';
      v_reason := 'invalid_transition';
      v_to_status := v_from_status;
    END IF;
  ELSIF p_action = 'no_show' THEN
    IF v_from_status = 'confirmed' THEN
      IF now() >= v_reservation.starts_at THEN
        v_new_status := 'no_show';
        v_to_status := 'no_show';
        v_outcome := 'success';
        v_reason := null;
        UPDATE public.reservations SET status = v_new_status, status_history = COALESCE(v_reservation.status_history,'[]'::jsonb) || jsonb_build_object('status',v_new_status,'at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'by_user_id',v_actor_user_id,'reason',null,'note','Scanned','source','scanner','scan_event_id',p_scan_event_id,'actor_worker_id',NULL,'staff_member_id',NULL), updated_at = now() WHERE id = p_reservation_id AND status IS NOT DISTINCT FROM v_from_status;
        IF NOT FOUND THEN
          SELECT status INTO v_from_status FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
          IF v_from_status = 'no_show' THEN
            v_outcome := 'already_done'; v_to_status := 'no_show'; v_reason := NULL;
          ELSIF v_from_status = 'confirmed' THEN
            v_outcome := 'rejected'; v_reason := 'status_changed'; v_to_status := v_from_status;
          ELSE
            v_outcome := 'rejected'; v_reason := 'invalid_transition'; v_to_status := v_from_status;
          END IF;
        END IF;
      ELSE
        v_outcome := 'rejected';
        v_reason := 'too_early';
        v_to_status := v_from_status;
      END IF;
    ELSIF v_from_status = 'seated' THEN
      v_outcome := 'rejected';
      v_reason := 'reason_required';
      v_to_status := v_from_status;
    ELSIF v_from_status = 'no_show' THEN
      v_outcome := 'already_done';
      v_to_status := 'no_show';
    ELSE
      v_outcome := 'rejected';
      v_reason := 'invalid_transition';
      v_to_status := v_from_status;
    END IF;
  ELSE
    v_outcome := 'rejected';
    v_reason := 'action_not_supported';
    v_to_status := v_from_status;
  END IF;

  UPDATE public.scan_events SET outcome = v_outcome, reason = v_reason, from_status = v_from_status, to_status = v_to_status, finalized_at = now(), branch_id = COALESCE(v_event.branch_id, v_branch_id), business_id = COALESCE(v_event.business_id, v_business_id) WHERE id = p_scan_event_id AND outcome = 'pending' AND tenant_id IS NOT DISTINCT FROM p_tenant_id;
  GET DIAGNOSTICS v_event_rows = ROW_COUNT;
  IF v_event_rows <> 1 THEN
    RAISE EXCEPTION 'SCAN_EVENT_FINALIZE_FAILED' USING ERRCODE = 'P0001';
  END IF;
  RETURN json_build_object('outcome',v_outcome,'from_status',v_from_status,'to_status',v_to_status,'reason',v_reason,'payment_status',v_payment_status,'event_finalized',true,'branch_id',v_event.branch_id);
END;
$scan_reservation_action$;

REVOKE ALL ON FUNCTION public.scan_reservation_action(uuid,uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_reservation_action(uuid,uuid,text,uuid,jsonb) TO service_role;

COMMIT;
