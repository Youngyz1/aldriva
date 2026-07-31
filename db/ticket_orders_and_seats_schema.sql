-- ticket_orders_and_seats_schema.sql
-- Run this in your Supabase SQL editor

-- 1. Venue seat layouts (linked to events)
CREATE TABLE IF NOT EXISTS venue_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Main Hall',
  sections JSONB NOT NULL DEFAULT '[]',
  -- e.g. [{"name":"A","rows":5,"seatsPerRow":10},{"name":"VIP","rows":2,"seatsPerRow":10}]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_layouts_event_id ON venue_layouts(event_id);

-- 2. Individual seats table
CREATE TABLE IF NOT EXISTS seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES venue_layouts(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold')),
  reserved_until TIMESTAMPTZ,
  ticket_id UUID,
  price_override NUMERIC(12, 2),
  UNIQUE(layout_id, section, row_label, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_seats_layout_id ON seats(layout_id);
CREATE INDEX IF NOT EXISTS idx_seats_event_id ON seats(event_id);
CREATE INDEX IF NOT EXISTS idx_seats_status ON seats(status);

-- 3. Ticket orders with QR codes
CREATE TABLE IF NOT EXISTS ticket_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_id UUID,
  seat_id UUID REFERENCES seats(id),
  seat_label TEXT,            -- e.g. "Section A, Row 3, Seat 7"
  buyer_email TEXT,
  buyer_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_amount NUMERIC(12, 2) NOT NULL,
  qr_code TEXT UNIQUE NOT NULL,  -- unique UUID used in QR code URL
  status TEXT NOT NULL DEFAULT 'valid'
    CHECK (status IN ('valid', 'used', 'cancelled', 'refunded')),
  stripe_session_id TEXT,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_orders_event_id ON ticket_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_qr_code ON ticket_orders(qr_code);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_stripe_session ON ticket_orders(stripe_session_id);

-- 4. Add lat/lng to events for map features
ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 5. Auto-expire seat reservations (call this periodically or use a cron)
-- This function releases seats whose reservation has expired
CREATE OR REPLACE FUNCTION release_expired_seat_reservations()
RETURNS void AS $$
BEGIN
  UPDATE seats
  SET status = 'available', reserved_until = NULL
  WHERE status = 'reserved'
    AND reserved_until IS NOT NULL
    AND reserved_until < NOW();
END;
$$ LANGUAGE plpgsql;
