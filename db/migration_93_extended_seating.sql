-- migration_93_extended_seating.sql
-- Phase 2: Seating Engine Extensions (Tables, VIP metadata, and Invitation Seat Assignment).

BEGIN;

-- 1. Ensure composite unique key on event_invitations for cross-table event isolation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_event_invitations_id_event_id'
  ) THEN
    ALTER TABLE event_invitations ADD CONSTRAINT uq_event_invitations_id_event_id UNIQUE (id, event_id);
  END IF;
END $$;

-- 2. Extend seats table
ALTER TABLE seats ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS table_capacity INTEGER;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE seats ADD COLUMN IF NOT EXISTS assigned_invitation_id UUID;

-- 3. Add foreign key for assigned_invitation_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seats_assigned_invitation_id_fkey'
  ) THEN
    ALTER TABLE seats
      ADD CONSTRAINT seats_assigned_invitation_id_fkey
      FOREIGN KEY (assigned_invitation_id)
      REFERENCES event_invitations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Cross-table event isolation constraint (composite foreign key enforcing seat and invitation belong to the same event)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seats_assigned_invitation_event_fkey'
  ) THEN
    ALTER TABLE seats
      ADD CONSTRAINT seats_assigned_invitation_event_fkey
      FOREIGN KEY (assigned_invitation_id, event_id)
      REFERENCES event_invitations(id, event_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Exclusivity constraint: one invitation cannot hold multiple seats simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS idx_seats_unique_assigned_invitation
  ON seats(assigned_invitation_id)
  WHERE assigned_invitation_id IS NOT NULL;

-- 6. Indexes for table seating and VIP queries
CREATE INDEX IF NOT EXISTS idx_seats_table_number ON seats(layout_id, table_number) WHERE table_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seats_is_vip ON seats(event_id, is_vip) WHERE is_vip = true;
CREATE INDEX IF NOT EXISTS idx_seats_assigned_invitation_id ON seats(assigned_invitation_id) WHERE assigned_invitation_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
