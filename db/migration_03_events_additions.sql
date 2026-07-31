-- migration_03_events_additions.sql
-- Adds visibility, status, is_featured, featured_until to the events table.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'
    CHECK (visibility IN ('public', 'private'));

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

-- Indexes for filtering on the events listing page.
CREATE INDEX IF NOT EXISTS idx_events_visibility ON events(visibility);
CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_is_featured ON events(is_featured);

NOTIFY pgrst, 'reload schema';
