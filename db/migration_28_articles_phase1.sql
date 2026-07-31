-- migration_28_articles_phase1.sql
-- Phase 1: Articles foundation only.
-- Businesses/products/tiers/entitlements/payments are intentionally deferred.

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 180),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt TEXT CHECK (excerpt IS NULL OR char_length(excerpt) <= 320),
  body TEXT NOT NULL CHECK (char_length(trim(body)) >= 20),
  cover_image_url TEXT,
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  seo_title TEXT CHECK (seo_title IS NULL OR char_length(seo_title) <= 70),
  seo_description TEXT CHECK (seo_description IS NULL OR char_length(seo_description) <= 180),
  canonical_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'expired', 'archived', 'rejected')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE articles IS
  'Editorial articles published by Aldriva users. Optional business ownership is deferred until the businesses table exists.';

COMMENT ON COLUMN articles.owner_id IS
  'Per-table owner reference to auth.users, matching the safer ownership pattern selected in the platform ADR.';

COMMENT ON COLUMN articles.organizer_id IS
  'Optional current-platform publisher profile. Future business_id FK should be added in the businesses phase.';

CREATE INDEX IF NOT EXISTS idx_articles_owner_id
  ON articles(owner_id);

CREATE INDEX IF NOT EXISTS idx_articles_organizer_id
  ON articles(organizer_id);

CREATE INDEX IF NOT EXISTS idx_articles_public_listing
  ON articles(status, visibility, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_articles_category
  ON articles(category);

CREATE INDEX IF NOT EXISTS idx_articles_tags
  ON articles USING GIN(tags);

CREATE OR REPLACE FUNCTION update_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articles_updated_at ON articles;
CREATE TRIGGER trg_articles_updated_at
BEFORE INSERT OR UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_articles_updated_at();

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published public articles are readable" ON articles;
CREATE POLICY "Published public articles are readable"
  ON articles FOR SELECT
  USING (status = 'published' AND visibility = 'public');

DROP POLICY IF EXISTS "Article owners can read their articles" ON articles;
CREATE POLICY "Article owners can read their articles"
  ON articles FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can read all articles" ON articles;
CREATE POLICY "Admins can read all articles"
  ON articles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Active users can create their own articles" ON articles;
CREATE POLICY "Active users can create their own articles"
  ON articles FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
    AND (
      organizer_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM organizers
        WHERE organizers.id = articles.organizer_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Article owners can update their articles" ON articles;
CREATE POLICY "Article owners can update their articles"
  ON articles FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
    AND (
      organizer_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM organizers
        WHERE organizers.id = articles.organizer_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Article owners can delete draft articles" ON articles;
CREATE POLICY "Article owners can delete draft articles"
  ON articles FOR DELETE
  USING (
    auth.uid() = owner_id
    AND status = 'draft'
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all articles" ON articles;
CREATE POLICY "Admins can manage all articles"
  ON articles FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';
