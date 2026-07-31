-- migration_23_platform_reviews.sql
-- Modify reviews system to support global platform reviews and relax target constraints, preserving existing reviews.

-- 1. Add review_type column if it does not exist
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS review_type TEXT DEFAULT 'platform'
  CHECK (review_type IN ('event', 'fundraiser', 'organizer', 'platform'));

-- 2. Map existing reviews to correct review_type
UPDATE reviews SET review_type = 'event' WHERE event_id IS NOT NULL;
UPDATE reviews SET review_type = 'fundraiser' WHERE fundraiser_id IS NOT NULL;
UPDATE reviews SET review_type = 'organizer' WHERE organizer_id IS NOT NULL;

-- 3. Drop old target constraints
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_at_least_one_target;

-- 4. Add new constraint that allows null targets only if type is 'platform'
ALTER TABLE reviews ADD CONSTRAINT reviews_target_or_platform CHECK (
  (review_type = 'platform' AND event_id IS NULL AND fundraiser_id IS NULL AND organizer_id IS NULL) OR
  (review_type != 'platform' AND ((event_id IS NOT NULL)::integer + (fundraiser_id IS NOT NULL)::integer + (organizer_id IS NOT NULL)::integer >= 1))
);

-- 5. Add unique index to ensure one platform review per user
DROP INDEX IF EXISTS idx_unique_user_platform_review;
CREATE UNIQUE INDEX idx_unique_user_platform_review
ON reviews (user_id)
WHERE review_type = 'platform';

NOTIFY pgrst, 'reload schema';
