-- migration_98_svg_seating_engine_rollback.sql
-- Rollback for Phase 6: Interactive SVG Seating Engine & Persistent Venue Geometry Architecture

BEGIN;

-- 1. Drop stored procedures
DROP FUNCTION IF EXISTS assign_seat_to_invitation_atomic(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS reserve_seats_atomic(UUID[], INT);

-- 2. Drop indexes
DROP INDEX IF EXISTS idx_seats_ticket_type_id;
DROP INDEX IF EXISTS idx_seats_object_type;
DROP INDEX IF EXISTS idx_seats_spatial;

-- 3. Restore seats status constraint
DO $$
BEGIN
  ALTER TABLE seats DROP CONSTRAINT IF EXISTS seats_status_check;
  ALTER TABLE seats ADD CONSTRAINT seats_status_check
    CHECK (status IN ('available', 'reserved', 'sold'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 4. Drop columns added to seats
ALTER TABLE seats DROP COLUMN IF EXISTS ticket_type_id;
ALTER TABLE seats DROP COLUMN IF EXISTS is_accessible;
ALTER TABLE seats DROP COLUMN IF EXISTS object_type;
ALTER TABLE seats DROP COLUMN IF EXISTS rotation;
ALTER TABLE seats DROP COLUMN IF EXISTS height;
ALTER TABLE seats DROP COLUMN IF EXISTS width;
ALTER TABLE seats DROP COLUMN IF EXISTS y;
ALTER TABLE seats DROP COLUMN IF EXISTS x;

-- 5. Drop columns added to venue_layouts
ALTER TABLE venue_layouts DROP COLUMN IF EXISTS venue_objects;
ALTER TABLE venue_layouts DROP COLUMN IF EXISTS canvas_height;
ALTER TABLE venue_layouts DROP COLUMN IF EXISTS canvas_width;
ALTER TABLE venue_layouts DROP COLUMN IF EXISTS published_at;
ALTER TABLE venue_layouts DROP COLUMN IF EXISTS is_published;
ALTER TABLE venue_layouts DROP COLUMN IF EXISTS version;

COMMIT;

NOTIFY pgrst, 'reload schema';
