-- migration_214_scan_actions_and_branches.sql
-- Phase 3 Scan Actions and Branches
-- idempotent forward migration: branch backfill, scan_codes.branch_id,
-- scan_events table, RPCs, triggers.  No grants/revokes on any existing table.
-- Rollback twin: db/migration_214_scan_actions_and_branches_rollback.sql
-- Mirror: supabase/migrations/20261103000000_migration_214_scan_actions_and_branches.sql
-- Read-only checks: db/tests/migration_214_checks.sql (SELECT assertions only)

BEGIN;

-- ── B. Backfill business_branches with each business's main branch ──────────
-- label = left(coalesce(nullif(btrim(b.name),''),'Main branch'),100);
-- if result < 2 chars use 'Main branch'. Only insert where no main branch exists yet.
INSERT INTO public.business_branches (business_id, label, address, is_main, status)
SELECT
  b.id,
  left(coalesce(nullif(btrim(b.name),''),'Main branch'),100),
  b.address,
  true,
  'active'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1
    FROM public.business_branches x
   WHERE x.business_id = b.id
     AND x.is_main = true
);

-- ── C. Add branch_id column to orders if missing ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.orders'::regclass
       AND attname = 'branch_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN branch_id uuid NULL
      REFERENCES public.business_branches(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON public.orders(branch_id);

-- ── D. Add branch_id column to reservations if missing ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.reservations'::regclass
       AND attname = 'branch_id'
  ) THEN
    ALTER TABLE public.reservations ADD COLUMN branch_id uuid NULL
      REFERENCES public.business_branches(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_reservations_branch_id ON public.reservations(branch_id);

-- ── E1. Backfill scan_codes branch_id for order subjects (simple UPDATE ... FROM)
UPDATE public.scan_codes sc
SET branch_id = bb.id
FROM public.orders o
JOIN public.business_branches bb ON bb.business_id = o.business_id AND bb.is_main = true
WHERE sc.order_id = o.id
  AND sc.branch_id IS NULL;

-- ── E2. Backfill scan_codes branch_id for reservation subjects (simple UPDATE ... FROM)
UPDATE public.scan_codes sc
SET branch_id = bb.id
FROM public.reservations r
JOIN public.business_branches bb ON bb.business_id = r.business_id AND bb.is_main = true
WHERE sc.reservation_id = r.id
  AND sc.branch_id IS NULL;

-- ── F. Create public.scan_events table (NO updated_at column or trigger) ────
CREATE TABLE IF NOT EXISTS public.scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz NULL,
  tenant_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  business_id uuid NULL,
  branch_id uuid NULL,
  code_type text NOT NULL CHECK (code_type IN ('ticket','order','reservation')),
  subject_id uuid NULL,
  scan_code_id uuid NULL REFERENCES public.scan_codes(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('check_in','pick_up','deliver','refund','seat','no_show')),
  outcome text NOT NULL CHECK (outcome IN ('pending','success','already_done','rejected','conflict','error')),
  reason text NULL CHECK (char_length(reason) <= 80),
  from_status text NULL,
  to_status text NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','staff_member','worker','token')),
  actor_user_id uuid NULL,
  actor_worker_id uuid NULL,
  actor_role text NULL,
  device_id text NULL CHECK (char_length(device_id) <= 64),
  client_scan_id text NULL CHECK (char_length(client_scan_id) <= 64),
  client_scanned_at timestamptz NULL,
  source text NOT NULL CHECK (source IN ('online','offline_sync')) DEFAULT 'online',
  meta jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(meta) = 'object')
);

ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scan_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_scan_events_tenant_created ON public.scan_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_business_branch_created ON public.scan_events(business_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_subject ON public.scan_events(subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_scan_events_tenant_client
  ON public.scan_events(tenant_id, client_scan_id) WHERE client_scan_id IS NOT NULL;

-- ── G1. trigger fn: set orders.branch_id on insert from business main branch ──
CREATE OR REPLACE FUNCTION public.trg_orders_branch_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $trg_orders_branch_on_insert$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.business_id IS NOT NULL THEN
    SELECT id INTO NEW.branch_id
      FROM public.business_branches bb
     WHERE bb.business_id = NEW.business_id
       AND bb.is_main = true
     LIMIT 1;
    IF NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'NO_MAIN_BRANCH_FOR_BUSINESS'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$trg_orders_branch_on_insert$;

DROP TRIGGER IF EXISTS trg_orders_set_branch_on_insert ON public.orders;
CREATE TRIGGER trg_orders_set_branch_on_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_branch_on_insert();

-- ── G2. trigger fn: set reservations.branch_id on insert from business main branch ──
CREATE OR REPLACE FUNCTION public.trg_reservations_branch_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $trg_reservations_branch_on_insert$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.business_id IS NOT NULL THEN
    SELECT id INTO NEW.branch_id
      FROM public.business_branches bb
     WHERE bb.business_id = NEW.business_id
       AND bb.is_main = true
     LIMIT 1;
    IF NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'NO_MAIN_BRANCH_FOR_BUSINESS'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$trg_reservations_branch_on_insert$;

DROP TRIGGER IF EXISTS trg_reservations_set_branch_on_insert ON public.reservations;
CREATE TRIGGER trg_reservations_set_branch_on_insert
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.trg_reservations_branch_on_insert();

-- ── G3. AFTER INSERT trigger on businesses creating its main branch ──────────
CREATE OR REPLACE FUNCTION public.trg_business_create_main_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $trg_business_create_main_branch$
DECLARE
  v_label text;
BEGIN
  v_label := left(coalesce(nullif(btrim(NEW.name),''),'Main branch'),100);
  IF char_length(v_label) < 2 THEN
    v_label := 'Main branch';
  END IF;
  INSERT INTO public.business_branches (business_id, label, address, is_main, status)
  SELECT NEW.id, v_label, NEW.address, true, 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.business_branches x
     WHERE x.business_id = NEW.id AND x.is_main = true
  );
  RETURN NEW;
END;
$trg_business_create_main_branch$;

DROP TRIGGER IF EXISTS trg_businesses_create_main_branch ON public.businesses;
CREATE TRIGGER trg_businesses_create_main_branch
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.trg_business_create_main_branch();

-- ── H1. Backfill existing orders.branch_id from business main branch ─────────
UPDATE public.orders o
SET branch_id = bb.id
FROM public.business_branches bb
WHERE bb.business_id = o.business_id
  AND bb.is_main = true
  AND o.branch_id IS NULL;

-- ── H2. Backfill existing reservations.branch_id from business main branch ───
UPDATE public.reservations r
SET branch_id = bb.id
FROM public.business_branches bb
WHERE bb.business_id = r.business_id
  AND bb.is_main = true
  AND r.branch_id IS NULL;

-- ── part 2 ── issue_scan_code CREATE OR REPLACE ──────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_scan_code(
  p_code_type text,
  p_subject_id uuid
)
RETURNS TABLE (
  out_code text,
  out_code_type text,
  out_status text,
  out_created boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $issue_scan_code$
DECLARE
  v_prefix text;
  v_tenant_id uuid;
  v_business_id uuid;
  v_branch_id uuid;
  v_order public.orders%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_existing record;
  v_code text;
  v_attempt int;
  v_constraint_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_code_type IS NULL OR p_code_type NOT IN ('order','reservation') OR p_subject_id IS NULL THEN
    RETURN;
  END IF;

  IF p_code_type = 'order' THEN
    v_prefix := 'O1';
    SELECT * INTO v_order FROM public.orders WHERE id = p_subject_id;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    v_tenant_id := v_order.organizer_id;
    v_business_id := v_order.business_id;
    v_branch_id := v_order.branch_id;

    SELECT code, code_type, status INTO v_existing
      FROM public.scan_codes WHERE order_id = p_subject_id;
  ELSE
    v_prefix := 'R1';
    SELECT * INTO v_reservation FROM public.reservations WHERE id = p_subject_id;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    v_tenant_id := v_reservation.organizer_id;
    v_business_id := v_reservation.business_id;
    v_branch_id := v_reservation.branch_id;

    SELECT code, code_type, status INTO v_existing
      FROM public.scan_codes WHERE reservation_id = p_subject_id;
  END IF;

  IF FOUND THEN
    out_code := v_existing.code;
    out_code_type := v_existing.code_type;
    out_status := v_existing.status;
    out_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_attempt IN 1..5 LOOP
    BEGIN
      v_code := v_prefix || '-' || public.generate_scan_code_body();

      INSERT INTO public.scan_codes (
        code, code_type, order_id, reservation_id, tenant_id, business_id, branch_id
      )
      VALUES (
        v_code,
        p_code_type,
        CASE WHEN p_code_type = 'order' THEN p_subject_id ELSE NULL END,
        CASE WHEN p_code_type = 'reservation' THEN p_subject_id ELSE NULL END,
        v_tenant_id,
        v_business_id,
        v_branch_id
      )
      RETURNING code, code_type, status INTO v_existing;

      out_code := v_existing.code;
      out_code_type := v_existing.code_type;
      out_status := v_existing.status;
      out_created := true;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

      IF v_constraint_name = 'scan_codes_code_key' AND v_attempt < 5 THEN
        CONTINUE;
      ELSIF v_constraint_name IN ('scan_codes_order_id_unique','scan_codes_reservation_id_unique') THEN
        IF p_code_type = 'order' THEN
          SELECT code, code_type, status INTO v_existing
            FROM public.scan_codes WHERE order_id = p_subject_id;
        ELSE
          SELECT code, code_type, status INTO v_existing
            FROM public.scan_codes WHERE reservation_id = p_subject_id;
        END IF;
        IF FOUND THEN
          out_code := v_existing.code;
          out_code_type := v_existing.code_type;
          out_status := v_existing.status;
          out_created := false;
          RETURN NEXT;
        END IF;
        RETURN;
      ELSE
        RETURN;
      END IF;
    END;
  END LOOP;

  RETURN;
END;
$issue_scan_code$;

REVOKE ALL ON FUNCTION public.issue_scan_code(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_scan_code(text, uuid) TO service_role;

-- ── part 3 ── begin_scan_event and finalize_scan_event RPCs ─────────────────
CREATE OR REPLACE FUNCTION public.begin_scan_event(
  p_tenant_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_code_type text,
  p_subject_id uuid,
  p_scan_code_id uuid,
  p_action text,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_actor_worker_id uuid,
  p_actor_role text,
  p_client_scan_id text,
  p_device_id text,
  p_source text,
  p_client_scanned_at timestamptz
)
RETURNS TABLE (
  out_id uuid,
  out_created_at timestamptz,
  out_finalized_at timestamptz,
  out_outcome text,
  out_from_status text,
  out_to_status text,
  out_reason text,
  out_is_replay boolean,
  out_scan_event_id uuid,
  out_actor_kind text,
  out_actor_user_id uuid,
  out_actor_worker_id uuid,
  out_actor_role text,
  out_device_id text,
  out_client_scan_id text,
  out_client_scanned_at timestamptz,
  out_source text,
  out_meta jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $begin_scan_event$
DECLARE
  v_id uuid;
  v_row record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.scan_events (
    tenant_id, business_id, branch_id, code_type, subject_id, scan_code_id,
    action, outcome, from_status, to_status, reason,
    actor_kind, actor_user_id, actor_worker_id, actor_role,
    device_id, client_scan_id, client_scanned_at, source, meta
  )
  VALUES (
    p_tenant_id, p_business_id, p_branch_id, p_code_type, p_subject_id, p_scan_code_id,
    p_action, 'pending', null, null, null,
    p_actor_kind, p_actor_user_id, p_actor_worker_id, p_actor_role,
    p_device_id, p_client_scan_id, p_client_scanned_at, p_source, '{}'::jsonb
  )
  ON CONFLICT (tenant_id, client_scan_id) WHERE client_scan_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT
      id, created_at, finalized_at, outcome, from_status, to_status, reason,
      false as is_replay,
      id as scan_event_id,
      actor_kind, actor_user_id, actor_worker_id, actor_role,
      device_id, client_scan_id, client_scanned_at, source, meta
    FROM public.scan_events
    WHERE id = v_id;
  ELSE
    -- Conflict on client_scan_id: return existing row only if action and subject match.
    SELECT id, action, subject_id, created_at, finalized_at, outcome, from_status, to_status, reason,
           actor_kind, actor_user_id, actor_worker_id, actor_role,
           device_id, client_scan_id, client_scanned_at, source, meta
      INTO v_row
      FROM public.scan_events
     WHERE tenant_id = p_tenant_id
       AND client_scan_id = p_client_scan_id
     ORDER BY created_at DESC
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CLIENT_SCAN_ID_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    IF v_row.action IS DISTINCT FROM p_action OR v_row.subject_id IS DISTINCT FROM p_subject_id THEN
      RAISE EXCEPTION 'CLIENT_SCAN_ID_REUSED' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      v_row.id, v_row.created_at, v_row.finalized_at, v_row.outcome, v_row.from_status, v_row.to_status, v_row.reason,
      true as is_replay,
      v_row.id as scan_event_id,
      v_row.actor_kind, v_row.actor_user_id, v_row.actor_worker_id, v_row.actor_role,
      v_row.device_id, v_row.client_scan_id, v_row.client_scanned_at, v_row.source, v_row.meta;
  END IF;
END;
$begin_scan_event$;

REVOKE ALL ON FUNCTION public.begin_scan_event(
  uuid, uuid, uuid, text, uuid, uuid, text,
  text, uuid, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_scan_event(
  uuid, uuid, uuid, text, uuid, uuid, text,
  text, uuid, uuid, text, text, text, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_scan_event(
  p_id uuid,
  p_outcome text,
  p_reason text,
  p_from_status text,
  p_to_status text,
  p_meta jsonb
)
RETURNS TABLE (
  out_id uuid,
  out_created_at timestamptz,
  out_finalized_at timestamptz,
  out_finalized_now boolean,
  out_outcome text,
  out_from_status text,
  out_to_status text,
  out_reason text,
  out_actor_kind text,
  out_actor_user_id uuid,
  out_actor_worker_id uuid,
  out_actor_role text,
  out_device_id text,
  out_client_scan_id text,
  out_client_scanned_at timestamptz,
  out_source text,
  out_meta jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $finalize_scan_event$
DECLARE
  v_updated boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_outcome = 'pending' THEN
    RAISE EXCEPTION 'CANNOT_FINALIZE_TO_PENDING' USING ERRCODE = '22023';
  END IF;

  UPDATE public.scan_events
     SET outcome = p_outcome,
         reason = p_reason,
         from_status = p_from_status,
         to_status = p_to_status,
         finalized_at = now(),
         meta = COALESCE(p_meta, '{}'::jsonb)
   WHERE id = p_id
     AND outcome = 'pending'
   RETURNING true INTO v_updated;

  IF v_updated THEN
    RETURN QUERY SELECT
      id, created_at, finalized_at, true as out_finalized_now,
      outcome, from_status, to_status, reason,
      actor_kind, actor_user_id, actor_worker_id, actor_role,
      device_id, client_scan_id, client_scanned_at, source, meta
    FROM public.scan_events
    WHERE id = p_id;
  ELSE
    RETURN QUERY SELECT
      id, created_at, finalized_at, false as out_finalized_now,
      outcome, from_status, to_status, reason,
      actor_kind, actor_user_id, actor_worker_id, actor_role,
      device_id, client_scan_id, client_scanned_at, source, meta
    FROM public.scan_events
    WHERE id = p_id;
  END IF;
END;
$finalize_scan_event$;

REVOKE ALL ON FUNCTION public.finalize_scan_event(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_scan_event(uuid, text, text, text, text, jsonb) TO service_role;

-- ── part 4 ── scan_reservation_action RPC ────────────────────────────────────
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

  -- Update the existing scan_events row in the same transaction.
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