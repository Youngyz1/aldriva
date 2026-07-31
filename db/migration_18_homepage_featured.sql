-- migration_18_homepage_featured.sql
-- Adds is_homepage_featured flag for Homepage CMS featured slider (separate from is_featured marketplace flag).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_homepage_featured BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS is_homepage_featured BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
