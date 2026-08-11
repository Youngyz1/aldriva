-- migration_73_payouts_and_balance_rpcs.sql
-- Phase B.3 of the Recipient/Ledger/Payout architecture.
-- Creates the `payouts` table, status transition trigger, balance function,
-- and atomic SECURITY DEFINER RPCs for payout requests, processing transitions,
-- completions, failures, and cancellations.

BEGIN;

-- ── 1. Payouts Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recipient_id UUID NOT NULL
    REFERENCES recipients(id)
    ON DELETE RESTRICT,

  amount NUMERIC NOT NULL
    CONSTRAINT payouts_amount_positive CHECK (amount > 0),

  currency TEXT NOT NULL
    CONSTRAINT payouts_currency_format CHECK (
      currency = lower(currency)
      AND currency ~ '^[a-z]{3}$'
    ),

  status TEXT NOT NULL DEFAULT 'requested'
    CONSTRAINT payouts_status_check CHECK (
      status IN ('requested', 'processing', 'completed', 'failed', 'cancelled')
    ),

  destination_type TEXT NOT NULL
    CONSTRAINT payouts_destination_type_check CHECK (
      destination_type IN ('stripe_connect', 'bank_transfer', 'crypto', 'manual')
    ),

  destination_reference TEXT,

  external_payout_id TEXT,

  client_idempotency_key TEXT,

  failure_reason TEXT,

  requested_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  processed_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Indexes & Uniqueness Constraints ──────────────────────────────────────

-- Client idempotency retry guard
CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_client_idempotency_key
  ON payouts(client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

-- External payout reference deduplication (prevents double-attaching a transfer ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_external_payout_id
  ON payouts(destination_type, external_payout_id)
  WHERE external_payout_id IS NOT NULL;

-- Recipient payout history queries
CREATE INDEX IF NOT EXISTS idx_payouts_recipient_currency_status
  ON payouts(recipient_id, currency, status);

-- Admin payout queue filtering
CREATE INDEX IF NOT EXISTS idx_payouts_status_created_at
  ON payouts(status, created_at DESC);

-- ── 3. State Machine Trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_payout_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot transition to anything
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'payouts: payout % is completed (terminal state) and cannot change status to %', OLD.id, NEW.status;
  ELSIF OLD.status = 'failed' THEN
    RAISE EXCEPTION 'payouts: payout % is failed (terminal state) and cannot change status to %', OLD.id, NEW.status;
  ELSIF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'payouts: payout % is cancelled (terminal state) and cannot change status to %', OLD.id, NEW.status;
  END IF;

  -- Valid non-terminal transitions
  IF OLD.status = 'requested' AND NEW.status IN ('processing', 'completed', 'failed', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'processing' AND NEW.status IN ('completed', 'failed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'payouts: invalid status transition for payout % from % to %', OLD.id, OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_payouts_status_transition ON payouts;
CREATE TRIGGER trg_payouts_status_transition
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payout_status_transition();

-- ── 4. RLS & Privileges on Payouts Table ─────────────────────────────────────

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins can view payouts" ON payouts;
CREATE POLICY "Owners and admins can view payouts"
  ON payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recipients r
      WHERE r.id = payouts.recipient_id
        AND (
          auth.uid() = r.user_id
          OR EXISTS (
            SELECT 1 FROM organizers WHERE organizers.id = r.organizer_id AND organizers.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM businesses WHERE businesses.id = r.business_id AND businesses.owner_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON payouts FROM anon, authenticated;

-- ── 5. RPC: get_recipient_balance ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_recipient_balance(
  p_recipient_id UUID,
  p_currency TEXT DEFAULT 'usd'
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_balance
  FROM recipient_ledger_entries
  WHERE recipient_ledger_entries.recipient_id = p_recipient_id
    AND recipient_ledger_entries.currency = lower(p_currency);

  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_recipient_balance(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_recipient_balance(UUID, TEXT) TO service_role;

-- ── 6. RPC: request_payout_and_debit ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION request_payout_and_debit(
  p_recipient_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_destination_type TEXT,
  p_destination_reference TEXT,
  p_requested_by UUID,
  p_client_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
  payout_id UUID,
  ledger_entry_id UUID,
  new_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency TEXT;
  v_existing_payout_id UUID;
  v_existing_ledger_id UUID;
  v_payout_id UUID;
  v_ledger_entry_id UUID;
  v_current_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'request_payout_and_debit: amount must be greater than zero';
  END IF;

  v_currency := lower(p_currency);

  -- 1. Idempotency fast-path
  IF p_client_idempotency_key IS NOT NULL THEN
    SELECT payouts.id INTO v_existing_payout_id
    FROM payouts
    WHERE payouts.client_idempotency_key = p_client_idempotency_key;

    IF v_existing_payout_id IS NOT NULL THEN
      SELECT recipient_ledger_entries.id INTO v_existing_ledger_id
      FROM recipient_ledger_entries
      WHERE recipient_ledger_entries.source_type = 'payout'
        AND recipient_ledger_entries.source_id = v_existing_payout_id
        AND recipient_ledger_entries.entry_type = 'payout';

      v_current_balance := get_recipient_balance(p_recipient_id, v_currency);
      RETURN QUERY SELECT v_existing_payout_id, v_existing_ledger_id, v_current_balance;
      RETURN;
    END IF;
  END IF;

  -- 2. Lock recipient row for update to prevent concurrent double-spend overdrafts
  PERFORM 1 FROM recipients WHERE recipients.id = p_recipient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_payout_and_debit: recipient % not found', p_recipient_id;
  END IF;

  -- 3. Check available balance
  v_current_balance := get_recipient_balance(p_recipient_id, v_currency);
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'request_payout_and_debit: insufficient balance (% available, % requested)',
      v_current_balance, p_amount;
  END IF;

  -- 4. Create payout row
  INSERT INTO payouts (
    recipient_id,
    amount,
    currency,
    status,
    destination_type,
    destination_reference,
    client_idempotency_key,
    requested_by
  ) VALUES (
    p_recipient_id,
    p_amount,
    v_currency,
    'requested',
    p_destination_type,
    p_destination_reference,
    p_client_idempotency_key,
    p_requested_by
  ) RETURNING payouts.id INTO v_payout_id;

  -- 5. Insert negative payout ledger entry
  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    description,
    created_by
  ) VALUES (
    p_recipient_id,
    'payout',
    -p_amount,
    v_currency,
    'payout',
    v_payout_id,
    'Payout requested',
    p_requested_by
  ) RETURNING recipient_ledger_entries.id INTO v_ledger_entry_id;

  RETURN QUERY SELECT v_payout_id, v_ledger_entry_id, (v_current_balance - p_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION request_payout_and_debit(
  UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION request_payout_and_debit(
  UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT
) TO service_role;

-- ── 7. RPC: transition_payout_processing ─────────────────────────────────────

CREATE OR REPLACE FUNCTION transition_payout_processing(
  p_payout_id UUID,
  p_processed_by UUID
) RETURNS TABLE (
  payout_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_updated_id UUID;
  v_updated_status TEXT;
BEGIN
  SELECT payouts.status INTO v_current_status
  FROM payouts
  WHERE payouts.id = p_payout_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'transition_payout_processing: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already processing, return cleanly
  IF v_current_status = 'processing' THEN
    RETURN QUERY SELECT p_payout_id, 'processing'::TEXT;
    RETURN;
  END IF;

  UPDATE payouts
  SET
    status = 'processing',
    processed_by = COALESCE(p_processed_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id
    AND payouts.status = 'requested'
  RETURNING payouts.id, payouts.status INTO v_updated_id, v_updated_status;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'transition_payout_processing: cannot transition payout % from status %',
      p_payout_id, v_current_status;
  END IF;

  RETURN QUERY SELECT v_updated_id, v_updated_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION transition_payout_processing(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION transition_payout_processing(UUID, UUID) TO service_role;

-- ── 8. RPC: complete_payout ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION complete_payout(
  p_payout_id UUID,
  p_external_payout_id TEXT,
  p_processed_by UUID
) RETURNS TABLE (
  payout_id UUID,
  status TEXT,
  external_payout_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_current_ext_id TEXT;
  v_updated_id UUID;
  v_updated_status TEXT;
  v_updated_ext_id TEXT;
BEGIN
  SELECT payouts.status, payouts.external_payout_id
  INTO v_current_status, v_current_ext_id
  FROM payouts
  WHERE payouts.id = p_payout_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'complete_payout: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already completed, return cleanly
  IF v_current_status = 'completed' THEN
    IF p_external_payout_id IS NOT NULL AND v_current_ext_id IS DISTINCT FROM p_external_payout_id THEN
      RAISE EXCEPTION 'complete_payout: payout % is already completed with external ID %',
        p_payout_id, v_current_ext_id;
    END IF;
    RETURN QUERY SELECT p_payout_id, v_current_status, v_current_ext_id;
    RETURN;
  END IF;

  UPDATE payouts
  SET
    status = 'completed',
    external_payout_id = COALESCE(p_external_payout_id, payouts.external_payout_id),
    processed_by = COALESCE(p_processed_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id
    AND payouts.status IN ('requested', 'processing')
  RETURNING payouts.id, payouts.status, payouts.external_payout_id
  INTO v_updated_id, v_updated_status, v_updated_ext_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'complete_payout: cannot complete payout % in state %',
      p_payout_id, v_current_status;
  END IF;

  RETURN QUERY SELECT v_updated_id, v_updated_status, v_updated_ext_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_payout(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_payout(UUID, TEXT, UUID) TO service_role;

-- ── 9. RPC: fail_payout ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fail_payout(
  p_payout_id UUID,
  p_failure_reason TEXT,
  p_processed_by UUID
) RETURNS TABLE (
  payout_id UUID,
  status TEXT,
  reversal_ledger_entry_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id UUID;
  v_amount NUMERIC;
  v_currency TEXT;
  v_current_status TEXT;
  v_existing_reversal_id UUID;
  v_reversal_id UUID;
BEGIN
  -- Lock payout row
  SELECT payouts.recipient_id, payouts.amount, payouts.currency, payouts.status
  INTO v_recipient_id, v_amount, v_currency, v_current_status
  FROM payouts
  WHERE payouts.id = p_payout_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'fail_payout: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already failed, return existing reversal entry
  IF v_current_status = 'failed' THEN
    SELECT recipient_ledger_entries.id INTO v_existing_reversal_id
    FROM recipient_ledger_entries
    WHERE recipient_ledger_entries.source_type = 'payout'
      AND recipient_ledger_entries.source_id = p_payout_id
      AND recipient_ledger_entries.entry_type = 'adjustment';

    RETURN QUERY SELECT p_payout_id, 'failed'::TEXT, v_existing_reversal_id;
    RETURN;
  END IF;

  IF v_current_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'fail_payout: payout % is in terminal state % and cannot be marked failed',
      p_payout_id, v_current_status;
  END IF;

  -- Lock recipient row
  PERFORM 1 FROM recipients WHERE recipients.id = v_recipient_id FOR UPDATE;

  -- Update payout status
  UPDATE payouts
  SET
    status = 'failed',
    failure_reason = p_failure_reason,
    processed_by = COALESCE(p_processed_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id;

  -- Insert single compensating credit adjustment
  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    external_reference,
    description,
    created_by
  ) VALUES (
    v_recipient_id,
    'adjustment',
    v_amount,
    v_currency,
    'payout',
    p_payout_id,
    p_payout_id::text,
    'Reversal for failed payout',
    p_processed_by
  ) RETURNING recipient_ledger_entries.id INTO v_reversal_id;

  RETURN QUERY SELECT p_payout_id, 'failed'::TEXT, v_reversal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION fail_payout(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fail_payout(UUID, TEXT, UUID) TO service_role;

-- ── 10. RPC: cancel_payout ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_payout(
  p_payout_id UUID,
  p_cancelled_by UUID
) RETURNS TABLE (
  payout_id UUID,
  status TEXT,
  reversal_ledger_entry_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id UUID;
  v_amount NUMERIC;
  v_currency TEXT;
  v_current_status TEXT;
  v_existing_reversal_id UUID;
  v_reversal_id UUID;
BEGIN
  -- Lock payout row
  SELECT payouts.recipient_id, payouts.amount, payouts.currency, payouts.status
  INTO v_recipient_id, v_amount, v_currency, v_current_status
  FROM payouts
  WHERE payouts.id = p_payout_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'cancel_payout: payout % not found', p_payout_id;
  END IF;

  -- Idempotency check: if already cancelled, return existing reversal entry
  IF v_current_status = 'cancelled' THEN
    SELECT recipient_ledger_entries.id INTO v_existing_reversal_id
    FROM recipient_ledger_entries
    WHERE recipient_ledger_entries.source_type = 'payout'
      AND recipient_ledger_entries.source_id = p_payout_id
      AND recipient_ledger_entries.entry_type = 'adjustment';

    RETURN QUERY SELECT p_payout_id, 'cancelled'::TEXT, v_existing_reversal_id;
    RETURN;
  END IF;

  IF v_current_status <> 'requested' THEN
    RAISE EXCEPTION 'cancel_payout: payout % is in status % (can only cancel from requested status)',
      p_payout_id, v_current_status;
  END IF;

  -- Lock recipient row
  PERFORM 1 FROM recipients WHERE recipients.id = v_recipient_id FOR UPDATE;

  -- Update payout status
  UPDATE payouts
  SET
    status = 'cancelled',
    processed_by = COALESCE(p_cancelled_by, payouts.processed_by),
    updated_at = now()
  WHERE payouts.id = p_payout_id;

  -- Insert single compensating credit adjustment
  INSERT INTO recipient_ledger_entries (
    recipient_id,
    entry_type,
    amount,
    currency,
    source_type,
    source_id,
    external_reference,
    description,
    created_by
  ) VALUES (
    v_recipient_id,
    'adjustment',
    v_amount,
    v_currency,
    'payout',
    p_payout_id,
    p_payout_id::text,
    'Reversal for cancelled payout',
    p_cancelled_by
  ) RETURNING recipient_ledger_entries.id INTO v_reversal_id;

  RETURN QUERY SELECT p_payout_id, 'cancelled'::TEXT, v_reversal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_payout(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_payout(UUID, UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
