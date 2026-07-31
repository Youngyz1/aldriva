-- migration_35_articles_fixes.sql
-- Phase 1 articles schema fixes identified during verification.
--
-- Decisions recorded here (ADR):
--   owner_id: KEPT as-is. Platform-wide convention for all user-owned content
--             tables (articles, businesses, products). The spec's "author_id"
--             was informal naming. owner_id is used consistently going forward.
--   categories: Renamed from category TEXT (singular) to categories TEXT[]
--               (array), matching the tags TEXT[] pattern in the same table and
--               the spec's plural wording. A relational join table is deferred
--               until Phase 4 if taxonomy management is needed.

-- ── 1. Extend the status CHECK to include 'scheduled' ────────────────────────
ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_status_check;

ALTER TABLE articles
  ADD CONSTRAINT articles_status_check
    CHECK (status IN ('draft', 'published', 'scheduled', 'archived', 'expired', 'rejected'));

-- ── 2. Add scheduled_for ─────────────────────────────────────────────────────
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

COMMENT ON COLUMN articles.scheduled_for IS
  'When status=''scheduled'', the article becomes publicly visible at this UTC '
  'timestamp. Access control is enforced server-side on EVERY request — the '
  'Server Component fetch checks now() >= scheduled_for before rendering. '
  'Do not rely on a cron status flip or RLS alone for this gate.';

-- ── 3. Add reading_time ──────────────────────────────────────────────────────
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS reading_time INTEGER
    CHECK (reading_time IS NULL OR reading_time >= 1);

COMMENT ON COLUMN articles.reading_time IS
  'Estimated reading time in minutes. '
  'Computed in the server action as Math.max(1, Math.round(word_count / 200)). '
  'The Math.max(1,...) ensures this never violates the >= 1 CHECK constraint.';

-- ── 4. Add business_id (no FK yet — businesses table added in Phase 2) ───────
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS business_id UUID;

COMMENT ON COLUMN articles.business_id IS
  'Optional business owner. No FK constraint until the businesses table is '
  'created in Phase 2. Add FK in Phase 2 migration: '
  'ALTER TABLE articles ADD CONSTRAINT articles_business_id_fkey '
  'FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;';

-- ── 5. Rename category TEXT → categories TEXT[] ──────────────────────────────
ALTER TABLE articles
  RENAME COLUMN category TO categories;

-- Convert the existing TEXT value to a single-element TEXT[] (or empty array).
-- Any row that had a non-empty category string becomes ARRAY['that string'].
ALTER TABLE articles
  ALTER COLUMN categories TYPE TEXT[]
    USING CASE
      WHEN categories IS NULL OR categories = ''
        THEN ARRAY[]::TEXT[]
      ELSE ARRAY[categories]
    END;

ALTER TABLE articles
  ALTER COLUMN categories SET NOT NULL,
  ALTER COLUMN categories SET DEFAULT ARRAY[]::TEXT[];

-- ── 6. Drop the old single-column category btree index, add GIN for array ────
DROP INDEX IF EXISTS idx_articles_category;

CREATE INDEX IF NOT EXISTS idx_articles_categories
  ON articles USING GIN(categories);

-- ── 7. Index on scheduled_for for efficient "due to publish" queries ─────────
CREATE INDEX IF NOT EXISTS idx_articles_scheduled_for
  ON articles(scheduled_for)
  WHERE status = 'scheduled';

-- ── 8. Notify PostgREST to reload schema ─────────────────────────────────────
NOTIFY pgrst, 'reload schema';
