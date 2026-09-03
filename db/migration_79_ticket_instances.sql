-- migration_79_ticket_instances.sql
-- Phase 1: Ticket Instances Schema, 1:1 Legacy Backfill, RPCs, Triggers, and RLS.

BEGIN;

-- 1. Table: ticket_instances
CREATE TABLE IF NOT EXISTS ticket_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES ticket_orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id),
  seat_id UUID REFERENCES seats(id),
  seat_label TEXT,
  qr_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled', 'refunded')),
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_instances_order_id ON ticket_instances(order_id);
CREATE INDEX IF NOT EXISTS idx_ticket_instances_event_id ON ticket_instances(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_instances_qr_code ON ticket_instances(qr_code);
CREATE INDEX IF NOT EXISTS idx_ticket_instances_status ON ticket_instances(status);

-- 2. 1:1 Legacy Backfill from ticket_orders
-- NOTE: Only backfill rows whose status is accepted by ticket_instances.
-- 'pending' orders have not been confirmed by Stripe yet, have no verified QR
-- codes in any buyer's inbox, and must NOT be backfilled. Their ticket_instances
-- row will be created by the Stripe webhook handler in Phase 3.
INSERT INTO ticket_instances (
  id,
  order_id,
  event_id,
  ticket_id,
  seat_id,
  seat_label,
  qr_code,
  status,
  checked_in_at,
  created_at,
  updated_at
)
SELECT
  id AS id,
  id AS order_id,
  event_id,
  ticket_id,
  seat_id,
  seat_label,
  qr_code,
  status,
  checked_in_at,
  COALESCE(created_at, now()),
  now()
FROM ticket_orders
WHERE status IN ('valid', 'used', 'cancelled', 'refunded')
  AND qr_code IS NOT NULL
ON CONFLICT (qr_code) DO NOTHING;

-- 3. Drop NOT NULL on ticket_orders.qr_code for future multi-instance purchases
ALTER TABLE ticket_orders ALTER COLUMN qr_code DROP NOT NULL;

-- 4. Update ticket_checkins table: add ticket_instance_id, make ticket_order_id nullable
ALTER TABLE ticket_checkins ADD COLUMN IF NOT EXISTS ticket_instance_id UUID REFERENCES ticket_instances(id) ON DELETE CASCADE;
ALTER TABLE ticket_checkins ALTER COLUMN ticket_order_id DROP NOT NULL;

-- Backfill ticket_instance_id for existing ticket_checkins records
UPDATE ticket_checkins tc
SET ticket_instance_id = tc.ticket_order_id
WHERE tc.ticket_instance_id IS NULL;

-- Unique constraint ensures one checkin record per ticket instance (supports ON CONFLICT in RPC)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_checkins_instance_id_unique
  ON ticket_checkins(ticket_instance_id)
  WHERE ticket_instance_id IS NOT NULL;

-- 5. Atomic check_in_ticket RPC operating on ticket_instances
DROP FUNCTION IF EXISTS check_in_ticket(UUID);
DROP FUNCTION IF EXISTS check_in_ticket(UUID, UUID);

CREATE OR REPLACE FUNCTION check_in_ticket(
  p_ticket_instance_id UUID,
  p_scanned_by_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_event_id UUID;
  v_order_id UUID;
  v_current_status TEXT;
BEGIN
  -- Single atomic check and update on ticket_instances
  UPDATE ticket_instances
  SET status = 'used',
      checked_in_at = NOW(),
      updated_at = NOW()
  WHERE id = p_ticket_instance_id
    AND status = 'valid'
  RETURNING id, event_id, order_id INTO v_updated_id, v_event_id, v_order_id;

  -- Append-only audit insert. No ON CONFLICT: the atomicity gate above
  -- (UPDATE ... WHERE status = 'valid') guarantees only one caller reaches
  -- this INSERT per ticket_instance_id. A genuine duplicate would indicate
  -- out-of-band DB manipulation and should surface as an error, not be
  -- silently swallowed.
  IF v_updated_id IS NOT NULL THEN
    INSERT INTO ticket_checkins (ticket_instance_id, ticket_order_id, event_id, scanned_by_user_id, checked_in_at)
    VALUES (v_updated_id, v_order_id, v_event_id, p_scanned_by_user_id, NOW());

    RETURN v_updated_id;
  END IF;

  -- If no row updated, inspect status to throw exact exception
  SELECT status INTO v_current_status
  FROM ticket_instances
  WHERE id = p_ticket_instance_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  ELSIF v_current_status = 'used' THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN';
  ELSIF v_current_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  ELSIF v_current_status = 'refunded' THEN
    RAISE EXCEPTION 'TICKET_REFUNDED';
  ELSE
    RAISE EXCEPTION 'TICKET_NOT_VALID';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_in_ticket(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_in_ticket(UUID, UUID) TO service_role;

-- 6. Trigger: cascade_ticket_order_status
-- Automatically cascades refunded/cancelled status to child valid tickets only (skips 'used' tickets)
CREATE OR REPLACE FUNCTION cascade_ticket_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('refunded', 'cancelled') AND OLD.status <> NEW.status THEN
    UPDATE ticket_instances
    SET status = NEW.status,
        updated_at = NOW()
    WHERE order_id = NEW.id
      AND status = 'valid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_ticket_order_status ON ticket_orders;
CREATE TRIGGER trg_cascade_ticket_order_status
AFTER UPDATE OF status ON ticket_orders
FOR EACH ROW
EXECUTE FUNCTION cascade_ticket_order_status();

-- 7. RPC: refund_ticket_instance (partial refund of single ticket instance)
CREATE OR REPLACE FUNCTION refund_ticket_instance(
  p_ticket_instance_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
  v_current_status TEXT;
BEGIN
  UPDATE ticket_instances
  SET status = 'refunded',
      updated_at = NOW()
  WHERE id = p_ticket_instance_id
    AND status = 'valid'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NOT NULL THEN
    RETURN v_updated_id;
  END IF;

  SELECT status INTO v_current_status
  FROM ticket_instances
  WHERE id = p_ticket_instance_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND';
  ELSIF v_current_status = 'used' THEN
    RAISE EXCEPTION 'CANNOT_REFUND_TICKET';
  ELSIF v_current_status = 'refunded' THEN
    RAISE EXCEPTION 'ALREADY_REFUNDED';
  ELSIF v_current_status = 'cancelled' THEN
    RAISE EXCEPTION 'TICKET_CANCELLED';
  ELSE
    RAISE EXCEPTION 'TICKET_NOT_VALID';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION refund_ticket_instance(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refund_ticket_instance(UUID) TO service_role;

-- 8. Enable RLS for ticket_instances
ALTER TABLE ticket_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant ticket instances" ON ticket_instances;
CREATE POLICY "Users can view relevant ticket instances" ON ticket_instances
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ticket_orders
      WHERE ticket_orders.id = ticket_instances.order_id
        AND (
          (auth.jwt()->>'email' IS NOT NULL AND LOWER(ticket_orders.buyer_email) = LOWER(auth.jwt()->>'email'))
          OR ticket_orders.buyer_email IS NULL
        )
    )
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_instances.event_id
        AND (
          events.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organizers
            WHERE organizers.id = events.organizer_id
              AND (
                organizers.user_id = auth.uid()
                OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager', 'ticket_scanner'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
