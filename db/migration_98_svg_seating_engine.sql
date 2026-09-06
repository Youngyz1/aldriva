-- migration_98_svg_seating_engine.sql
-- Phase 6: Interactive SVG Seating Engine & Persistent Venue Geometry Architecture

BEGIN;

-- 1. Extend venue_layouts with spatial canvas dimensions, versioning, publishing, and venue_objects
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS canvas_width INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS canvas_height INTEGER NOT NULL DEFAULT 800;
ALTER TABLE venue_layouts ADD COLUMN IF NOT EXISTS venue_objects JSONB NOT NULL DEFAULT '[]';

-- 2. Extend seats with spatial coordinates, geometry, rotation, object_type, accessibility, and ticket_type_id
ALTER TABLE seats ADD COLUMN IF NOT EXISTS x NUMERIC(10, 2);
ALTER TABLE seats ADD COLUMN IF NOT EXISTS y NUMERIC(10, 2);
ALTER TABLE seats ADD COLUMN IF NOT EXISTS width NUMERIC(10, 2) DEFAULT 26;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS height NUMERIC(10, 2) DEFAULT 26;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS rotation NUMERIC(6, 2) DEFAULT 0;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS object_type TEXT NOT NULL DEFAULT 'seat';
ALTER TABLE seats ADD COLUMN IF NOT EXISTS is_accessible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS ticket_type_id UUID REFERENCES tickets(id) ON DELETE SET NULL;

-- 3. Extend status check constraint to include 'unavailable'
DO $$
BEGIN
  ALTER TABLE seats DROP CONSTRAINT IF EXISTS seats_status_check;
  ALTER TABLE seats ADD CONSTRAINT seats_status_check
    CHECK (status IN ('available', 'reserved', 'sold', 'unavailable'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 4. Spatial and lookup indexes on seats
CREATE INDEX IF NOT EXISTS idx_seats_spatial ON seats(layout_id, x, y) WHERE x IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seats_object_type ON seats(layout_id, object_type);
CREATE INDEX IF NOT EXISTS idx_seats_ticket_type_id ON seats(ticket_type_id) WHERE ticket_type_id IS NOT NULL;

-- 5. Deterministic geometry backfill for any existing legacy seats with NULL x/y
-- Arranges sections with generous vertical spacing and computes grid positions
DO $$
DECLARE
  v_rec RECORD;
  v_cur_layout UUID := NULL;
  v_cur_sec TEXT := NULL;
  v_cur_row TEXT := NULL;
  v_sec_offset_y NUMERIC := 120;
  v_row_offset_y NUMERIC := 0;
  v_seat_idx INT := 0;
BEGIN
  FOR v_rec IN (
    SELECT id, layout_id, section, row_label, seat_number
    FROM seats
    WHERE x IS NULL OR y IS NULL
    ORDER BY layout_id, section, row_label, seat_number
  ) LOOP
    IF v_cur_layout IS NULL OR v_cur_layout <> v_rec.layout_id THEN
      v_cur_layout := v_rec.layout_id;
      v_cur_sec := NULL;
      v_sec_offset_y := 120;
    END IF;

    IF v_cur_sec IS NULL OR v_cur_sec <> v_rec.section THEN
      v_cur_sec := v_rec.section;
      v_cur_row := NULL;
      v_sec_offset_y := v_sec_offset_y + 160;
      v_row_offset_y := 0;
    END IF;

    IF v_cur_row IS NULL OR v_cur_row <> v_rec.row_label THEN
      v_cur_row := v_rec.row_label;
      v_row_offset_y := v_row_offset_y + 36;
      v_seat_idx := 0;
    END IF;

    v_seat_idx := v_seat_idx + 1;

    UPDATE seats
    SET x = 80 + ((v_seat_idx - 1) * 34),
        y = v_sec_offset_y + v_row_offset_y,
        width = 26,
        height = 26,
        rotation = 0
    WHERE id = v_rec.id;
  END LOOP;
END $$;

-- 6. Atomic Stored Procedure: reserve_seats_atomic
-- Concurrency-safe hold locking with FOR UPDATE
CREATE OR REPLACE FUNCTION reserve_seats_atomic(
  p_seat_ids UUID[],
  p_hold_duration_minutes INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_reserved_until TIMESTAMPTZ := v_now + (p_hold_duration_minutes * INTERVAL '1 minute');
  v_unavailable_ids UUID[] := ARRAY[]::UUID[];
  v_reserved_count INT := 0;
BEGIN
  IF p_seat_ids IS NULL OR cardinality(p_seat_ids) = 0 THEN
    RAISE EXCEPTION 'NO_SEATS_PROVIDED';
  END IF;

  -- Lock all target seats with FOR UPDATE in deterministic order to prevent deadlocks
  FOR v_seat IN (
    SELECT id, status, reserved_until, assigned_invitation_id
    FROM seats
    WHERE id = ANY(p_seat_ids)
    ORDER BY id
    FOR UPDATE
  ) LOOP
    -- Check if seat is sold, unavailable, active-reserved, or assigned to an active invitation
    IF v_seat.status = 'sold'
       OR v_seat.status = 'unavailable'
       OR v_seat.assigned_invitation_id IS NOT NULL
       OR (v_seat.status = 'reserved' AND v_seat.reserved_until IS NOT NULL AND v_seat.reserved_until > v_now)
    THEN
      v_unavailable_ids := array_append(v_unavailable_ids, v_seat.id);
    END IF;
  END LOOP;

  -- If any requested seat is unavailable or missing from lock set, abort with details
  IF cardinality(v_unavailable_ids) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Some seats are no longer available.',
      'unavailable_ids', to_jsonb(v_unavailable_ids)
    );
  END IF;

  -- Verify all requested seats exist
  SELECT COUNT(*) INTO v_reserved_count FROM seats WHERE id = ANY(p_seat_ids);
  IF v_reserved_count <> cardinality(p_seat_ids) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'One or more seat IDs do not exist.'
    );
  END IF;

  -- Atomically apply reservation hold
  UPDATE seats
  SET status = 'reserved',
      reserved_until = v_reserved_until
  WHERE id = ANY(p_seat_ids);

  RETURN jsonb_build_object(
    'success', true,
    'reserved_until', v_reserved_until,
    'seat_ids', to_jsonb(p_seat_ids)
  );
END;
$$;

-- 7. Atomic Stored Procedure: assign_seat_to_invitation_atomic
-- Concurrency-safe seat assignment for invited guests with event boundary isolation
CREATE OR REPLACE FUNCTION assign_seat_to_invitation_atomic(
  p_event_id UUID,
  p_invitation_id UUID,
  p_seat_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat RECORD;
  v_invitation RECORD;
  v_inst RECORD;
  v_seat_label TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Lock and verify seat
  SELECT id, event_id, section, row_label, seat_number, table_number, table_name, status, reserved_until, assigned_invitation_id
  INTO v_seat
  FROM seats
  WHERE id = p_seat_id
  FOR UPDATE;

  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat not found.');
  END IF;

  IF v_seat.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event isolation violation: seat belongs to another event.');
  END IF;

  IF v_seat.status = 'sold' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is already sold to a ticket buyer.');
  END IF;

  IF v_seat.status = 'unavailable' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is marked unavailable.');
  END IF;

  IF v_seat.status = 'reserved' AND v_seat.reserved_until IS NOT NULL AND v_seat.reserved_until > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is currently reserved for an active purchase session.');
  END IF;

  IF v_seat.assigned_invitation_id IS NOT NULL AND v_seat.assigned_invitation_id <> p_invitation_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seat is already assigned to another guest.');
  END IF;

  -- 2. Lock and verify invitation
  SELECT id, event_id, guest_name, invitation_status
  INTO v_invitation
  FROM event_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found.');
  END IF;

  IF v_invitation.event_id <> p_event_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event isolation violation: invitation belongs to another event.');
  END IF;

  IF v_invitation.invitation_status IN ('cancelled', 'revoked', 'expired') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot assign seat to a ' || v_invitation.invitation_status || ' invitation.');
  END IF;

  -- 3. Check if guest is already checked in
  SELECT id, status INTO v_inst
  FROM ticket_instances
  WHERE invitation_id = p_invitation_id;

  IF v_inst IS NOT NULL AND v_inst.status = 'used' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reassign seat for a guest who has already checked in.');
  END IF;

  -- 4. Construct descriptive label
  IF v_seat.table_number IS NOT NULL AND v_seat.table_number <> '' THEN
    IF v_seat.table_name IS NOT NULL AND v_seat.table_name <> '' THEN
      v_seat_label := 'Table ' || v_seat.table_number || ' (' || v_seat.table_name || '), Seat ' || v_seat.seat_number;
    ELSE
      v_seat_label := 'Table ' || v_seat.table_number || ', Seat ' || v_seat.seat_number;
    END IF;
  ELSE
    v_seat_label := v_seat.section || ', Row ' || v_seat.row_label || ', Seat ' || v_seat.seat_number;
  END IF;

  -- 5. Clear any prior seat assigned to this invitation
  UPDATE seats
  SET assigned_invitation_id = NULL
  WHERE event_id = p_event_id
    AND assigned_invitation_id = p_invitation_id
    AND id <> p_seat_id;

  -- 6. Assign target seat
  UPDATE seats
  SET assigned_invitation_id = p_invitation_id
  WHERE id = p_seat_id;

  -- 7. Sync linked ticket_instances record
  UPDATE ticket_instances
  SET seat_id = p_seat_id,
      seat_label = v_seat_label,
      updated_at = v_now
  WHERE invitation_id = p_invitation_id;

  RETURN jsonb_build_object(
    'success', true,
    'seat_id', p_seat_id,
    'seat_label', v_seat_label
  );
END;
$$;

-- Grant execution to service_role and authenticated roles with RLS
GRANT EXECUTE ON FUNCTION reserve_seats_atomic(UUID[], INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assign_seat_to_invitation_atomic(UUID, UUID, UUID) TO service_role, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
