-- migration_02_organizers_additions.sql
-- Adds status + verified_at columns to the existing organizers table.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE organizers
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'suspended'));

ALTER TABLE organizers
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Index for fast admin queue lookups by status.
CREATE INDEX IF NOT EXISTS idx_organizers_status ON organizers(status);

NOTIFY pgrst, 'reload schema';
