-- db/migration_36_business_listings.sql
-- Phase 2: Business Listings schema, foreign keys, and RLS security.

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 180),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 20),
  industry TEXT NOT NULL CHECK (char_length(trim(industry)) >= 2),
  category TEXT NOT NULL CHECK (char_length(trim(category)) >= 2),
  logo TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  listing_tier TEXT NOT NULL DEFAULT 'free' CHECK (listing_tier IN ('free', 'one_time', 'subscription')),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('active', 'pending_payment', 'expired')),
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  stripe_price_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  seo_title TEXT CHECK (seo_title IS NULL OR char_length(seo_title) <= 70),
  seo_description TEXT CHECK (seo_description IS NULL OR char_length(seo_description) <= 180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for lookup speed and constraints
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_status_flagged ON businesses(status, is_flagged);

-- Link articles.business_id to businesses.id
ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_business_id_fkey;

ALTER TABLE articles
  ADD CONSTRAINT articles_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES businesses(id)
    ON DELETE SET NULL;

-- Automatically update updated_at trigger
CREATE OR REPLACE FUNCTION update_businesses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_businesses_updated_at ON businesses;
CREATE TRIGGER trg_businesses_updated_at
  BEFORE INSERT OR UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_businesses_updated_at();

-- Enable Row Level Security
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- 1. SELECT POLICIES
DROP POLICY IF EXISTS "Public can view active non-flagged businesses" ON businesses;
CREATE POLICY "Public can view active non-flagged businesses"
  ON businesses FOR SELECT
  USING (status = 'active' AND is_flagged = false);

DROP POLICY IF EXISTS "Owners can view their own businesses" ON businesses;
CREATE POLICY "Owners can view their own businesses"
  ON businesses FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can view all businesses" ON businesses;
CREATE POLICY "Admins can view all businesses"
  ON businesses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- 2. INSERT POLICIES
DROP POLICY IF EXISTS "Active authenticated users can create businesses" ON businesses;
CREATE POLICY "Active authenticated users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
  );

-- 3. UPDATE POLICIES
DROP POLICY IF EXISTS "Owners can update their own businesses" ON businesses;
CREATE POLICY "Owners can update their own businesses"
  ON businesses FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can update any business" ON businesses;
CREATE POLICY "Admins can update any business"
  ON businesses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- 4. DELETE POLICIES
-- Owners can delete their business only if it is not active (e.g. pending_payment or expired)
DROP POLICY IF EXISTS "Owners can delete inactive businesses" ON businesses;
CREATE POLICY "Owners can delete inactive businesses"
  ON businesses FOR DELETE
  USING (auth.uid() = owner_id AND status != 'active');

DROP POLICY IF EXISTS "Admins can delete any business" ON businesses;
CREATE POLICY "Admins can delete any business"
  ON businesses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );
