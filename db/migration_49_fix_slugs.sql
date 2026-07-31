-- migration_49_fix_slugs.sql
-- Phase A Follow-up: Fix the slug generation algorithm to lowercase before sanitizing.
-- This repairs existing incorrect slugs in the database while preserving uniqueness and collision handling.

DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  candidate TEXT;
  counter INT;
BEGIN
  -- 1. Temporarily clear slugs so there are no unique constraint conflicts during recalculation
  UPDATE organizers SET slug = NULL;

  -- 2. Recalculate correctly using regexp_replace(lower(...)) instead of lower(regexp_replace(...))
  FOR rec IN SELECT id, name FROM organizers ORDER BY created_at ASC LOOP
    base_slug := regexp_replace(lower(trim(rec.name)), '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    IF base_slug = '' THEN base_slug := 'organization'; END IF;

    candidate := base_slug;
    counter := 2;
    WHILE EXISTS (SELECT 1 FROM organizers WHERE slug = candidate) LOOP
      candidate := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;

    UPDATE organizers SET slug = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- Enforce NOT NULL on the slug column now that all rows are guaranteed to have a clean, valid slug.
ALTER TABLE organizers ALTER COLUMN slug SET NOT NULL;
