-- Rollback for migration 186. Files only; owner applies manually.
-- Run db/migration_186_staging_test_data_cleanup.sql first.

BEGIN;

DO $rollback_guard$
BEGIN
  IF to_regclass('public.business_courier_offers') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_186_ROLLBACK_BLOCKED: business_courier_offers is missing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.business_courier_offers) THEN
    RAISE EXCEPTION 'MIGRATION_186_ROLLBACK_BLOCKED: run staging cleanup to clear all offers first';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders WHERE courier_worker_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'MIGRATION_186_ROLLBACK_BLOCKED: run staging cleanup to clear assignments first';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_workers WHERE is_available = true
  ) THEN
    RAISE EXCEPTION 'MIGRATION_186_ROLLBACK_BLOCKED: run staging cleanup to turn couriers offline first';
  END IF;
END;
$rollback_guard$;

DROP TRIGGER IF EXISTS trg_offer_ready_delivery_insert ON public.orders;
DROP TRIGGER IF EXISTS trg_offer_ready_delivery_update ON public.orders;
DROP TRIGGER IF EXISTS trg_force_inactive_worker_offline ON public.business_workers;
DROP TRIGGER IF EXISTS trg_sync_courier_offers_on_availability ON public.business_workers;
DROP TRIGGER IF EXISTS trg_resolve_courier_offers_on_order_status ON public.orders;

DROP FUNCTION IF EXISTS public.offer_ready_delivery_couriers();
DROP FUNCTION IF EXISTS public.sync_courier_availability_and_offer_ready_deliveries();
DROP FUNCTION IF EXISTS public.resolve_courier_offers_on_order_status();
DROP FUNCTION IF EXISTS public.claim_business_courier_offer(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.decline_business_courier_offer(uuid, uuid, text);

DROP VIEW IF EXISTS public.business_courier_offer_feed;
DROP TABLE public.business_courier_offers;
DROP INDEX IF EXISTS public.idx_orders_one_active_order_per_courier;
DROP INDEX IF EXISTS public.idx_orders_courier_worker_active;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_courier_worker_id_fkey,
  DROP COLUMN IF EXISTS courier_worker_id,
  DROP CONSTRAINT IF EXISTS orders_id_business_id_key;

ALTER TABLE public.business_workers
  DROP CONSTRAINT IF EXISTS business_workers_courier_availability_check,
  DROP CONSTRAINT IF EXISTS business_workers_inactive_offline_check,
  DROP CONSTRAINT IF EXISTS business_workers_id_business_id_key,
  DROP COLUMN IF EXISTS is_available;

-- Restore migration 185's cook-only invitation consumer. Session lifetime,
-- hash validation, last-four phone check, and atomic token consumption are
-- unchanged from the Phase 1 definition.
DROP FUNCTION public.consume_business_worker_invitation(text, text, text);
CREATE FUNCTION public.consume_business_worker_invitation(
  p_invitation_token_hash text,
  p_phone_last4 text,
  p_session_token_hash text
)
RETURNS TABLE (
  out_worker_id uuid,
  out_business_id uuid,
  out_kitchen_id uuid,
  out_session_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_invitation_id uuid;
  v_worker_id uuid;
  v_business_id uuid;
  v_kitchen_id uuid;
  v_session_expires_at timestamptz;
BEGIN
  IF p_invitation_token_hash IS NULL
     OR p_invitation_token_hash !~ '^[0-9a-f]{64}$'
     OR p_session_token_hash IS NULL
     OR p_session_token_hash !~ '^[0-9a-f]{64}$'
     OR p_phone_last4 IS NULL
     OR p_phone_last4 !~ '^[0-9]{4}$' THEN
    RETURN;
  END IF;

  SELECT i.id, w.id, w.business_id, w.kitchen_id
    INTO v_invitation_id, v_worker_id, v_business_id, v_kitchen_id
    FROM public.business_worker_invitations AS i
    JOIN public.business_workers AS w ON w.id = i.worker_id
   WHERE i.token_hash = p_invitation_token_hash
     AND i.expires_at > v_now
     AND i.token_consumed_at IS NULL
     AND i.revoked_at IS NULL
     AND w.role = 'cook'
     AND w.is_active = true
     AND w.deactivated_at IS NULL
     AND char_length(regexp_replace(w.phone, '[^0-9]', '', 'g')) >= 4
     AND right(regexp_replace(w.phone, '[^0-9]', '', 'g'), 4) = p_phone_last4
   FOR UPDATE OF i, w;

  IF v_invitation_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.business_worker_invitations
     SET token_consumed_at = v_now,
         accepted_at = COALESCE(accepted_at, v_now),
         updated_at = v_now
   WHERE id = v_invitation_id
     AND token_consumed_at IS NULL
     AND revoked_at IS NULL
     AND expires_at > v_now;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_session_expires_at := v_now + interval '30 days';

  INSERT INTO public.business_worker_sessions (
    worker_id, invitation_id, token_hash, created_at, expires_at,
    hard_expires_at, last_renewed_at, updated_at
  )
  VALUES (
    v_worker_id, v_invitation_id, p_session_token_hash, v_now,
    v_session_expires_at, v_now + interval '90 days', v_now, v_now
  );

  RETURN QUERY
  SELECT v_worker_id, v_business_id, v_kitchen_id, v_session_expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_business_worker_invitation(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_business_worker_invitation(text, text, text)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
