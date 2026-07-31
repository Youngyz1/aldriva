-- migration_04_fundraisers_additions.sql
-- Adds is_featured and featured_until to the fundraisers table.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fundraisers_is_featured ON fundraisers(is_featured);

NOTIFY pgrst, 'reload schema';
