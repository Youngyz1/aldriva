-- migration_26_category_and_media_refactor.sql
-- Refactors fundraiser_media columns and enforces required categories for fundraisers.

-- 1. fundraiser_media Consolidation Data Migration
UPDATE fundraiser_media
SET url = image_url
WHERE url IS NULL;

UPDATE fundraiser_media
SET position = sort_order
WHERE position IS NULL;

-- 2. Database Safety Verification Check
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fundraiser_media WHERE url IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate: Some fundraiser_media records have NULL url';
  END IF;
  IF EXISTS (SELECT 1 FROM fundraiser_media WHERE position IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate: Some fundraiser_media records have NULL position';
  END IF;
END;
$$;

-- 3. Alter constraints and drop legacy columns
ALTER TABLE fundraiser_media ALTER COLUMN url SET NOT NULL;
ALTER TABLE fundraiser_media DROP COLUMN IF EXISTS image_url;
ALTER TABLE fundraiser_media DROP COLUMN IF EXISTS sort_order;

-- 4. Fundraiser Category Backfill
UPDATE fundraisers
SET category = 'Other'
WHERE category IS NULL OR category = '';

-- 5. Alter category constraints
ALTER TABLE fundraisers ALTER COLUMN category SET DEFAULT 'Other';
ALTER TABLE fundraisers ALTER COLUMN category SET NOT NULL;

-- 6. Add Category CHECK constraint
ALTER TABLE fundraisers DROP CONSTRAINT IF EXISTS check_fundraiser_category;
ALTER TABLE fundraisers ADD CONSTRAINT check_fundraiser_category CHECK (
  category IN (
    'Medical', 'Memorial', 'Emergency', 'Charity', 'Education',
    'Animal', 'Environment', 'Business', 'Community', 'Competition',
    'Creative', 'Event', 'Faith', 'Family', 'Sports',
    'Travel', 'Volunteer', 'Wishes', 'Other'
  )
);

-- 7. Create Category Index
CREATE INDEX IF NOT EXISTS idx_fundraisers_category ON fundraisers(category);

-- 8. Reload Schema
NOTIFY pgrst, 'reload schema';
