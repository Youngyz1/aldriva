-- Migration 198: Table & Menu QR Codes, Dine-In Ordering, and Waiter Confirmation
-- Phase: Phases 5-6 (Table & Menu QR Codes)
-- Additive only. Backward-compatible with existing order paths.

BEGIN;

-- ── 1. Extensions ─────────────────────────────────────────────────────────────
-- Ensure pgcrypto exists in extensions schema for cryptographically secure random bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 2. Helper function to generate URL-safe random codes ─────────────────────
CREATE OR REPLACE FUNCTION public.generate_qr_short_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  -- 6 random bytes hex-encoded is 12 characters (minimum 8 chars required)
  RETURN lower(encode(extensions.gen_random_bytes(6), 'hex'));
END;
$$;

-- ── 3. public.business_tables ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 50),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_tables_business_label_unique UNIQUE (business_id, label)
);

CREATE INDEX IF NOT EXISTS idx_business_tables_business_id
  ON public.business_tables(business_id);
CREATE INDEX IF NOT EXISTS idx_business_tables_business_position
  ON public.business_tables(business_id, position);

-- ── 4. public.qr_redirect_codes ──────────────────────────────────────────────
-- The short code itself is the secret. Regenerate = deactivate old row + insert new row.
CREATE TABLE IF NOT EXISTS public.qr_redirect_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (char_length(code) >= 8),
  target_type text NOT NULL CHECK (target_type IN ('menu', 'table')),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  table_id uuid NULL REFERENCES public.business_tables(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_redirect_table_check CHECK (
    (target_type = 'menu' AND table_id IS NULL)
    OR (target_type = 'table' AND table_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_qr_redirect_codes_lookup
  ON public.qr_redirect_codes(code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_qr_redirect_codes_business
  ON public.qr_redirect_codes(business_id);
CREATE INDEX IF NOT EXISTS idx_qr_redirect_codes_table
  ON public.qr_redirect_codes(table_id) WHERE table_id IS NOT NULL;

-- ── 5. public.table_sessions ─────────────────────────────────────────────────
-- Created lazily upon first order submission (POST), NOT on GET /q/<code>.
-- session_token_hash stores SHA-256 hash at rest (raw token never stored).
CREATE TABLE IF NOT EXISTS public.table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.business_tables(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE CHECK (session_token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'bill_requested', 'paid', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Self-healing reconciliation for environments where draft 1 (bea9888) was previously applied
DO $$
DECLARE
  v_invalid_active_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'table_sessions'
       AND column_name = 'session_token_hash'
  ) THEN
    -- Check if legacy session_token column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'table_sessions'
         AND column_name = 'session_token'
    ) THEN
      -- Safety check: ensure no active/bill_requested sessions have null or empty tokens
      SELECT count(*) INTO v_invalid_active_count
        FROM public.table_sessions
       WHERE status IN ('active', 'bill_requested')
         AND (session_token IS NULL OR char_length(btrim(session_token)) = 0);

      IF v_invalid_active_count > 0 THEN
        RAISE EXCEPTION
          'MIGRATION_198_BLOCKED: % active table_session(s) have NULL or empty session_token. Refusing to invent synthetic hashes. Resolve or close these sessions manually before running migration.',
          v_invalid_active_count;
      END IF;

      -- Add session_token_hash as nullable initially
      ALTER TABLE public.table_sessions
        ADD COLUMN session_token_hash text NULL;

      -- Deterministically compute SHA-256 for all sessions that have a token
      UPDATE public.table_sessions
         SET session_token_hash = encode(extensions.digest(session_token, 'sha256'), 'hex')
       WHERE session_token IS NOT NULL AND char_length(btrim(session_token)) > 0;

      -- For closed/paid legacy sessions with null tokens (if any exist), assign a deterministic closed-tombstone hash
      UPDATE public.table_sessions
         SET session_token_hash = encode(extensions.digest('closed_legacy_session:' || id::text, 'sha256'), 'hex')
       WHERE session_token_hash IS NULL AND status IN ('closed', 'paid');

      -- If any rows still lack a hash (e.g. unknown status), raise exception rather than fabricating tokens
      IF EXISTS (
        SELECT 1 FROM public.table_sessions WHERE session_token_hash IS NULL
      ) THEN
        RAISE EXCEPTION 'MIGRATION_198_BLOCKED: Unmapped rows remain without session_token_hash. Manual inspection required.';
      END IF;

      -- Now enforce NOT NULL and format check
      ALTER TABLE public.table_sessions
        ALTER COLUMN session_token_hash SET NOT NULL;

      ALTER TABLE public.table_sessions
        ADD CONSTRAINT table_sessions_session_token_hash_check
        CHECK (session_token_hash ~ '^[0-9a-f]{64}$');

      ALTER TABLE public.table_sessions
        ADD CONSTRAINT table_sessions_session_token_hash_key UNIQUE (session_token_hash);

      -- Complete the security migration: drop plaintext token column and its index
      DROP INDEX IF EXISTS public.idx_table_sessions_token;
      ALTER TABLE public.table_sessions DROP CONSTRAINT IF EXISTS table_sessions_session_token_key;
      ALTER TABLE public.table_sessions DROP COLUMN IF EXISTS session_token;
    ELSE
      -- table_sessions exists without session_token and without session_token_hash
      ALTER TABLE public.table_sessions
        ADD COLUMN session_token_hash text NOT NULL UNIQUE CHECK (session_token_hash ~ '^[0-9a-f]{64}$');
    END IF;
  END IF;
END;
$$;

-- Guard duplicate active sessions: never guess or arbitrarily close/delete sessions
DO $$
DECLARE
  v_dup_tables integer;
BEGIN
  SELECT count(*) INTO v_dup_tables
    FROM (
      SELECT table_id
        FROM public.table_sessions
       WHERE status IN ('active', 'bill_requested')
       GROUP BY table_id
      HAVING count(*) > 1
    ) dups;

  IF v_dup_tables > 0 THEN
    RAISE EXCEPTION
      'MIGRATION_198_BLOCKED: % table(s) have duplicate active/bill_requested sessions. Automatic index creation refused to prevent arbitrary data loss. Resolve duplicates manually before retrying.',
      v_dup_tables;
  END IF;
END;
$$;

-- Clean up legacy non-unique active sessions index from bea9888 draft if present
DROP INDEX IF EXISTS public.idx_table_sessions_table_active;

-- Partial unique index ensures at most ONE active or bill_requested session per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_sessions_table_active_unique
  ON public.table_sessions(table_id)
  WHERE status IN ('active', 'bill_requested');

CREATE INDEX IF NOT EXISTS idx_table_sessions_business
  ON public.table_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_token_hash
  ON public.table_sessions(session_token_hash);

-- Atomic helper to get or create an active table session without race conditions
CREATE OR REPLACE FUNCTION public.get_or_create_active_table_session(
  p_table_id uuid,
  p_business_id uuid,
  p_session_token_hash text
)
RETURNS TABLE (
  out_session_id uuid,
  out_session_token_hash text,
  out_session_status text,
  out_is_new boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_session public.table_sessions%ROWTYPE;
BEGIN
  IF p_session_token_hash IS NULL OR p_session_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_SESSION_TOKEN_HASH: must be a 64-character lowercase hex string';
  END IF;

  -- 1. Strictly verify table exists, is active, and belongs to p_business_id
  IF NOT EXISTS (
    SELECT 1 FROM public.business_tables t
     WHERE t.id = p_table_id
       AND t.business_id = p_business_id
       AND t.is_active = true
  ) THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND_OR_BUSINESS_MISMATCH: Table % does not exist, is inactive, or does not belong to business %', p_table_id, p_business_id;
  END IF;

  -- 2. Try to fetch existing active/bill_requested session for this table and business
  SELECT s.* INTO v_session
    FROM public.table_sessions s
   WHERE s.table_id = p_table_id
     AND s.business_id = p_business_id
     AND s.status IN ('active', 'bill_requested')
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_session.id, v_session.session_token_hash, v_session.status, false;
    RETURN;
  END IF;

  -- 3. Insert new session handling race condition
  INSERT INTO public.table_sessions (
    table_id,
    business_id,
    session_token_hash,
    status
  ) VALUES (
    p_table_id,
    p_business_id,
    p_session_token_hash,
    'active'
  )
  ON CONFLICT (table_id) WHERE status IN ('active', 'bill_requested')
  DO NOTHING
  RETURNING * INTO v_session;

  IF FOUND THEN
    RETURN QUERY SELECT v_session.id, v_session.session_token_hash, v_session.status, true;
  ELSE
    -- Lost race, fetch the winning session
    SELECT s.* INTO v_session
      FROM public.table_sessions s
     WHERE s.table_id = p_table_id
       AND s.business_id = p_business_id
       AND s.status IN ('active', 'bill_requested')
     LIMIT 1;
    RETURN QUERY SELECT v_session.id, v_session.session_token_hash, v_session.status, false;
  END IF;
END;
$$;

-- ── 6. public.businesses: table_ordering_mode ────────────────────────────────
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS table_ordering_mode text NOT NULL DEFAULT 'order_pay_later';

DO $$
BEGIN
  -- If constraint exists, drop and replace to ensure all 5 modes are supported
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.businesses'::regclass
       AND conname = 'businesses_table_ordering_mode_check'
  ) THEN
    ALTER TABLE public.businesses DROP CONSTRAINT businesses_table_ordering_mode_check;
  END IF;

  ALTER TABLE public.businesses
    ADD CONSTRAINT businesses_table_ordering_mode_check
    CHECK (table_ordering_mode IN ('disabled', 'menu_only', 'order_pay_later', 'order_pay_now', 'pay_online_first'))
    NOT VALID;
  ALTER TABLE public.businesses
    VALIDATE CONSTRAINT businesses_table_ordering_mode_check;
END;
$$;

-- ── 7. public.orders: dine_in extensions ─────────────────────────────────────
-- Add columns (nullable / with defaults, completely backward-compatible)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_id uuid NULL REFERENCES public.business_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS table_session_id uuid NULL REFERENCES public.table_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS table_label text NULL,
  ADD COLUMN IF NOT EXISTS guest_token_hash text NULL,
  ADD COLUMN IF NOT EXISTS dine_in_confirmation text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS dine_in_declined_reason text NULL;

-- Validate guest_token_hash format if provided
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_guest_token_hash_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_guest_token_hash_check
      CHECK (guest_token_hash IS NULL OR guest_token_hash ~ '^[0-9a-f]{64}$')
      NOT VALID;
    ALTER TABLE public.orders
      VALIDATE CONSTRAINT orders_guest_token_hash_check;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_table_session_id
  ON public.orders(table_session_id) WHERE table_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_table_id
  ON public.orders(table_id) WHERE table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_dine_in_pending
  ON public.orders(business_id, created_at) WHERE dine_in_confirmation = 'pending';
CREATE INDEX IF NOT EXISTS idx_orders_dine_in_guest_pending
  ON public.orders(guest_token_hash, business_id) WHERE dine_in_confirmation = 'pending';

-- Update fulfilment_type check to include 'dine_in' via NOT VALID + VALIDATE
-- Preserves existing live constraint: (fulfilment_type = ANY (ARRAY['pickup'::text, 'delivery'::text]))
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_fulfilment_type_check'
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_fulfilment_type_check;
  END IF;

  ALTER TABLE public.orders
    ADD CONSTRAINT orders_fulfilment_type_check
    CHECK (fulfilment_type = ANY (ARRAY['pickup'::text, 'delivery'::text, 'dine_in'::text]))
    NOT VALID;
  ALTER TABLE public.orders
    VALIDATE CONSTRAINT orders_fulfilment_type_check;
END;
$$;

-- Update delivery address required check to allow dine_in via NOT VALID + VALIDATE
-- Preserves existing live constraint: ((((fulfilment_type = 'delivery'::text) AND (delivery_address IS NOT NULL) AND (length(TRIM(BOTH FROM delivery_address)) > 0)) OR (fulfilment_type = 'pickup'::text)))
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_delivery_address_required'
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_delivery_address_required;
  END IF;

  ALTER TABLE public.orders
    ADD CONSTRAINT orders_delivery_address_required
    CHECK (
      (((fulfilment_type = 'delivery'::text) AND (delivery_address IS NOT NULL) AND (length(TRIM(BOTH FROM delivery_address)) > 0))
       OR (fulfilment_type = 'pickup'::text)
       OR (fulfilment_type = 'dine_in'::text))
    )
    NOT VALID;
  ALTER TABLE public.orders
    VALIDATE CONSTRAINT orders_delivery_address_required;
END;
$$;

-- Add dine_in_confirmation check via NOT VALID + VALIDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_dine_in_confirmation_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_dine_in_confirmation_check
      CHECK (dine_in_confirmation IN ('not_applicable', 'pending', 'confirmed', 'declined'))
      NOT VALID;
    ALTER TABLE public.orders
      VALIDATE CONSTRAINT orders_dine_in_confirmation_check;
  END IF;
END;
$$;

-- Make customer_phone optional for dine_in only, maintaining requirement for pickup/delivery
ALTER TABLE public.orders ALTER COLUMN customer_phone DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname = 'orders_phone_required_by_fulfilment'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_phone_required_by_fulfilment
      CHECK (
        fulfilment_type = 'dine_in'
        OR (customer_phone IS NOT NULL AND length(btrim(customer_phone)) > 0)
      )
      NOT VALID;
    ALTER TABLE public.orders
      VALIDATE CONSTRAINT orders_phone_required_by_fulfilment;
  END IF;
END;
$$;

-- ── 8. Atomic Dine-In Order Submission Function ──────────────────────────────
-- Idempotency check executes FIRST before cap validation.
-- Checks table_ordering_mode != 'menu_only'.
-- Device-level advisory lock serializes submissions across distinct table sessions.
-- Enforces caps atomically: max 2 pending per device, max 4 pending per session.
-- Bounded retry loop on orders_organizer_order_number_key collisions.
-- Unconditionally forces dine_in_confirmation = 'pending'.
CREATE OR REPLACE FUNCTION public.submit_dine_in_order(
  p_business_id uuid,
  p_table_session_id uuid,
  p_guest_token_hash text,
  p_customer_name text,
  p_customer_email text DEFAULT NULL,
  p_customer_note text DEFAULT NULL,
  p_currency text DEFAULT 'USD',
  p_subtotal numeric DEFAULT 0.00,
  p_total_amount numeric DEFAULT 0.00,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (
  out_order_id uuid,
  out_order_number text,
  out_tracking_token text,
  out_table_id uuid,
  out_table_label text,
  out_dine_in_confirmation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_table public.business_tables%ROWTYPE;
  v_biz public.businesses%ROWTYPE;
  v_organizer_id uuid;
  v_device_pending_count int;
  v_session_pending_count int;
  v_order_number text;
  v_order public.orders%ROWTYPE;
  v_tracking_token text;
  v_attempt int;
  v_constraint_name text;
BEGIN
  IF p_guest_token_hash IS NULL OR p_guest_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_GUEST_TOKEN_HASH: must be a 64-character lowercase hex string';
  END IF;

  -- 1. Fetch business and organizer_id
  SELECT b.* INTO v_biz
    FROM public.businesses b
   WHERE b.id = p_business_id
     AND b.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUSINESS_NOT_FOUND_OR_INACTIVE';
  END IF;

  v_organizer_id := v_biz.organizer_id;

  -- 2. Fast pre-lock idempotency check
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT o.* INTO v_order
      FROM public.orders o
     WHERE o.organizer_id = v_organizer_id
       AND o.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      -- Anti-tamper verification: reject material payload differences
      IF v_order.business_id != p_business_id
         OR v_order.total_amount != p_total_amount
         OR v_order.currency != p_currency THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Idempotency key % was already used for a different order payload', p_idempotency_key;
      END IF;

      RETURN QUERY SELECT
        v_order.id,
        v_order.order_number,
        v_order.tracking_token,
        v_order.table_id,
        v_order.table_label,
        v_order.dine_in_confirmation;
      RETURN;
    END IF;
  END IF;

  -- 3. Verify ordering mode allows order placement
  IF v_biz.table_ordering_mode = 'disabled' THEN
    RAISE EXCEPTION 'TABLE_ORDERING_DISABLED: Business has disabled table ordering';
  ELSIF v_biz.table_ordering_mode = 'menu_only' THEN
    RAISE EXCEPTION 'TABLE_ORDERING_MENU_ONLY: Business has configured table ordering to menu_only';
  END IF;

  -- 4. Acquire transaction-level advisory lock on guest device hash.
  -- Serializes all submissions from the same guest device across the entire database,
  -- preventing concurrent submissions across distinct table sessions from bypassing the device pending cap.
  -- Uses two 32-bit integer keys derived via hashtext() across the 64-hex token hash.
  PERFORM pg_advisory_xact_lock(
    hashtext(substr(p_guest_token_hash, 1, 32)),
    hashtext(substr(p_guest_token_hash, 33, 32))
  );

  -- 5. Lock table session row to serialize submissions targeting this specific table
  SELECT s.* INTO v_session
    FROM public.table_sessions s
   WHERE s.id = p_table_session_id
     AND s.business_id = p_business_id
     AND s.status IN ('active', 'bill_requested')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_INACTIVE_TABLE_SESSION';
  END IF;

  -- Verify table exists and is active
  SELECT t.* INTO v_table
    FROM public.business_tables t
   WHERE t.id = v_session.table_id
     AND t.business_id = p_business_id
     AND t.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND_OR_INACTIVE';
  END IF;

  -- Recheck idempotency key under lock to handle concurrent requests with same key
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT o.* INTO v_order
      FROM public.orders o
     WHERE o.organizer_id = v_organizer_id
       AND o.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF v_order.table_id != v_table.id
         OR v_order.total_amount != p_total_amount
         OR v_order.currency != p_currency THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Idempotency key % was already used for a different order payload', p_idempotency_key;
      END IF;

      RETURN QUERY SELECT
        v_order.id,
        v_order.order_number,
        v_order.tracking_token,
        v_order.table_id,
        v_order.table_label,
        v_order.dine_in_confirmation;
      RETURN;
    END IF;
  END IF;

  -- 6. Check pending caps atomically under locks (fully qualified column names)
  -- Device cap: max 2 pending dine-in orders per device per business
  SELECT count(*) INTO v_device_pending_count
    FROM public.orders o
   WHERE o.guest_token_hash = p_guest_token_hash
     AND o.business_id = p_business_id
     AND o.dine_in_confirmation = 'pending';

  IF v_device_pending_count >= 2 THEN
    RAISE EXCEPTION 'DEVICE_PENDING_ORDER_LIMIT_REACHED: Maximum 2 pending dine-in orders per device allowed';
  END IF;

  -- Session cap: max 4 pending dine-in orders per table session
  SELECT count(*) INTO v_session_pending_count
    FROM public.orders o
   WHERE o.table_session_id = p_table_session_id
     AND o.dine_in_confirmation = 'pending';

  IF v_session_pending_count >= 4 THEN
    RAISE EXCEPTION 'TABLE_SESSION_PENDING_ORDER_LIMIT_REACHED: Maximum 4 pending dine-in orders per table session allowed';
  END IF;

  -- 7. Insert order with bounded retry loop on order number collisions
  -- Protects against random collision on orders_organizer_order_number_key
  v_tracking_token := encode(extensions.gen_random_bytes(24), 'hex');

  FOR v_attempt IN 1..5 LOOP
    BEGIN
      v_order_number := 'DIN-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));

      -- Unconditionally forces dine_in_confirmation = 'pending'
      INSERT INTO public.orders (
        organizer_id,
        business_id,
        order_number,
        tracking_token,
        customer_name,
        customer_phone,
        customer_email,
        customer_note,
        fulfilment_type,
        table_id,
        table_session_id,
        table_label,
        guest_token_hash,
        currency,
        subtotal,
        delivery_fee,
        total_amount,
        status,
        payment_method,
        payment_status,
        dine_in_confirmation,
        items,
        idempotency_key
      ) VALUES (
        v_organizer_id,
        p_business_id,
        v_order_number,
        v_tracking_token,
        p_customer_name,
        NULL, -- phone is optional for dine-in
        p_customer_email,
        p_customer_note,
        'dine_in',
        v_table.id,
        v_session.id,
        v_table.label,
        p_guest_token_hash,
        p_currency,
        p_subtotal,
        0.00,
        p_total_amount,
        'pending',
        'on_fulfilment',
        'unpaid',
        'pending',
        p_items,
        p_idempotency_key
      )
      RETURNING * INTO v_order;

      EXIT; -- Successfully inserted, exit retry loop
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'orders_organizer_order_number_key' AND v_attempt < 5 THEN
        -- Collision on random 6-hex order number; retry with freshly generated code
        CONTINUE;
      ELSIF v_constraint_name LIKE '%idempotency%' THEN
        -- Race on idempotency key won by concurrent transaction: fetch winner's order and verify payload
        SELECT o.* INTO v_order
          FROM public.orders o
         WHERE o.organizer_id = v_organizer_id
           AND o.idempotency_key = p_idempotency_key;

        IF FOUND THEN
          IF v_order.total_amount != p_total_amount OR v_order.currency != p_currency THEN
            RAISE EXCEPTION 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Idempotency key % was already used for a different order payload', p_idempotency_key;
          END IF;
          EXIT; -- successfully recovered winner's order
        ELSE
          RAISE;
        END IF;
      ELSE
        -- Re-raise unexpected unique violations or exhausted retries
        IF v_constraint_name = 'orders_organizer_order_number_key' THEN
          RAISE EXCEPTION 'ORDER_NUMBER_COLLISION_MAX_RETRIES_EXCEEDED: Failed to allocate unique order number after % attempts', v_attempt;
        ELSE
          RAISE;
        END IF;
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT
    v_order.id,
    v_order.order_number,
    v_order.tracking_token,
    v_order.table_id,
    v_order.table_label,
    v_order.dine_in_confirmation;
END;
$$;

-- ── 9. Row Level Security & Permissions ──────────────────────────────────────
ALTER TABLE public.business_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_redirect_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

-- Revoke blanket public and client privileges
REVOKE ALL ON TABLE public.business_tables, public.qr_redirect_codes, public.table_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.business_tables, public.qr_redirect_codes, public.table_sessions TO service_role;

-- Authenticated staff permissions (scoped via business organizer membership)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.business_tables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.qr_redirect_codes TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.table_sessions TO authenticated;

-- Revoke direct execute on helper functions from client roles, grant to service_role
REVOKE ALL ON FUNCTION public.get_or_create_active_table_session(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_table_session(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.submit_dine_in_order(uuid, uuid, text, text, text, text, text, numeric, numeric, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_dine_in_order(uuid, uuid, text, text, text, text, text, numeric, numeric, jsonb, text) TO service_role;

-- Ensure helper functions are owned by postgres/system role
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.generate_qr_short_code() OWNER TO postgres';
  EXECUTE 'ALTER FUNCTION public.get_or_create_active_table_session(uuid, uuid, text) OWNER TO postgres';
  EXECUTE 'ALTER FUNCTION public.submit_dine_in_order(uuid, uuid, text, text, text, text, text, numeric, numeric, jsonb, text) OWNER TO postgres';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- business_tables policies
DROP POLICY IF EXISTS "Staff can view business tables" ON public.business_tables;
CREATE POLICY "Staff can view business tables"
  ON public.business_tables FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = business_tables.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  );

DROP POLICY IF EXISTS "Staff can manage business tables" ON public.business_tables;
CREATE POLICY "Staff can manage business tables"
  ON public.business_tables FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = business_tables.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = business_tables.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  );

-- qr_redirect_codes policies
DROP POLICY IF EXISTS "Staff can view qr redirect codes" ON public.qr_redirect_codes;
CREATE POLICY "Staff can view qr redirect codes"
  ON public.qr_redirect_codes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = qr_redirect_codes.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  );

DROP POLICY IF EXISTS "Staff can manage qr redirect codes" ON public.qr_redirect_codes;
CREATE POLICY "Staff can manage qr redirect codes"
  ON public.qr_redirect_codes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = qr_redirect_codes.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = qr_redirect_codes.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  );

-- table_sessions policies
DROP POLICY IF EXISTS "Staff can view table sessions" ON public.table_sessions;
CREATE POLICY "Staff can view table sessions"
  ON public.table_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = table_sessions.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  );

DROP POLICY IF EXISTS "Staff can update table sessions" ON public.table_sessions;
CREATE POLICY "Staff can update table sessions"
  ON public.table_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = table_sessions.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
       WHERE b.id = table_sessions.business_id
         AND (
           public.is_entity_member(b.organizer_id, ARRAY['owner','admin','manager'])
           OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
         )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
