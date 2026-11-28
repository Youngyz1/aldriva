-- migration_215_atomic_scan_order_and_harden_reservation_rollback.sql
-- Rollback for migration_215_atomic_scan_order_and_harden_reservation.sql
-- Drops scan_order_action and restores original scan_reservation_action from migration_214

BEGIN;

DROP FUNCTION IF EXISTS public.scan_order_action(uuid,uuid,text,uuid,jsonb,boolean,text,text);

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
  v_from_status text;
  v_outcome text := null;
  v_to_status text := null;
  v_reason text := null;
  v_new_status text := null;
  v_branch_id uuid := null;
  v_payment_status text := null; v_event_rows int := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  SELECT * INTO v_reservation
    FROM public.reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND OR v_reservation.organizer_id IS DISTINCT FROM p_tenant_id THEN
    RETURN json_build_object('outcome','rejected','reason','not_found');
  END IF;

  v_from_status := v_reservation.status;
  v_payment_status := v_reservation.payment_status;
  v_branch_id := v_reservation.branch_id;

  IF p_action = 'seat' THEN
    IF v_from_status = 'confirmed' THEN
      v_new_status := 'seated';
      v_to_status := 'seated';
      v_outcome := 'success';
      v_reason := null;
      UPDATE public.reservations
         SET status = v_new_status,
             status_history = COALESCE(v_reservation.status_history,'[]'::jsonb)
                               || jsonb_build_object(
                                 'status', v_new_status,
                                 'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                 'by_user_id', (NULLIF(p_actor->>'userId',''))::uuid,
                                 'reason', null,
                                 'note', 'Scanned',
                                 'source', 'scanner',
                                 'scan_event_id', p_scan_event_id,
                                 'actor_worker_id', (NULLIF(p_actor->>'workerId',''))::uuid, 'staff_member_id', (NULLIF(p_actor->>'staffMemberId',''))::uuid
                                ),
             updated_at = now()
       WHERE id = p_reservation_id
         AND status = v_from_status;
      IF NOT FOUND THEN
        v_outcome := 'already_done';
        v_to_status := 'seated';
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
        UPDATE public.reservations
           SET status = v_new_status,
               status_history = COALESCE(v_reservation.status_history,'[]'::jsonb)
                                 || jsonb_build_object(
                                   'status', v_new_status,
                                   'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                    'by_user_id', (NULLIF(p_actor->>'userId',''))::uuid,
                                    'reason', null,
                                    'note', 'Scanned',
                                    'source', 'scanner',
                                    'scan_event_id', p_scan_event_id,
                                    'actor_worker_id', (NULLIF(p_actor->>'workerId',''))::uuid, 'staff_member_id', (NULLIF(p_actor->>'staffMemberId',''))::uuid
                                  ),
               updated_at = now()
         WHERE id = p_reservation_id
           AND status = v_from_status;
        IF NOT FOUND THEN
          v_outcome := 'already_done';
          v_to_status := 'no_show';
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

  UPDATE public.scan_events
     SET outcome = v_outcome,
         reason = v_reason,
         from_status = v_from_status,
         to_status = v_to_status,
         finalized_at = now(),
         branch_id = v_branch_id,
         business_id = v_reservation.business_id
   WHERE id = p_scan_event_id
     AND outcome = 'pending'
     AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_event_rows = ROW_COUNT;

  RETURN json_build_object(
    'outcome', v_outcome,
    'from_status', v_from_status,
    'to_status', v_to_status,
    'reason', v_reason,
    'payment_status', v_payment_status,
    'event_finalized', (v_event_rows = 1),
    'branch_id', v_branch_id
  );
END;
$scan_reservation_action$;

REVOKE ALL ON FUNCTION public.scan_reservation_action(uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_reservation_action(uuid, uuid, text, uuid, jsonb) TO service_role;

COMMIT;
