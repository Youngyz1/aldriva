-- migration_48_organization_system.sql
-- Phase A: Evolve the organizers table into a universal Organization system.
-- All changes are additive and backward-compatible — no existing columns removed.

-- 1. New columns
ALTER TABLE organizers
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS org_type TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS youtube TEXT,
  ADD COLUMN IF NOT EXISTS tiktok TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. org_type constraint
ALTER TABLE organizers
  ADD CONSTRAINT organizers_org_type_check
  CHECK (org_type IN ('nonprofit','business','church','school','creator','community','government','restaurant','sports_club','other'));

-- 3. Backfill slugs from existing names (collision-safe)
DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  candidate TEXT;
  counter INT;
BEGIN
  FOR rec IN SELECT id, name FROM organizers WHERE slug IS NULL ORDER BY created_at ASC LOOP
    base_slug := lower(regexp_replace(trim(rec.name), '[^a-z0-9]+', '-', 'g'));
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    IF base_slug = '' THEN base_slug := 'organization'; END IF;

    candidate := base_slug;
    counter := 2;
    WHILE EXISTS (SELECT 1 FROM organizers WHERE slug = candidate AND id <> rec.id) LOOP
      candidate := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;

    UPDATE organizers SET slug = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- 4. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizers_slug ON organizers(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizers_org_type ON organizers(org_type);

-- 5. updated_at auto-update trigger
CREATE OR REPLACE FUNCTION update_organizers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizers_updated_at ON organizers;
CREATE TRIGGER trg_organizers_updated_at
  BEFORE UPDATE ON organizers
  FOR EACH ROW EXECUTE FUNCTION update_organizers_updated_at();

-- NOTE: After verifying all rows have slugs in production, run:
--   ALTER TABLE organizers ALTER COLUMN slug SET NOT NULL;
-- as a separate step (migration_49).
