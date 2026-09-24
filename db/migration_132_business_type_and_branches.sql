-- migration_132_business_type_and_branches.sql
-- Adds business_type column to businesses and creates business_branches table (1:N).
-- Branches belong to Business, not Website. Single-location businesses keep address on businesses.

BEGIN;

-- Add business_type to businesses (nullable, validated in app via business-taxonomy.ts)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_type text;
COMMENT ON COLUMN businesses.business_type IS 'Controlled taxonomy: Business Type/Subcategory via lib/business-taxonomy.ts BUSINESS_TYPES_BY_CATEGORY';

-- Create business_branches table
CREATE TABLE IF NOT EXISTS business_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) >= 2 AND char_length(label) <= 100),
  address text,
  city text,
  state text,
  country text,
  phone text,
  is_main boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_branches_business_id ON business_branches(business_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_branches_one_main_per_business ON business_branches(business_id) WHERE is_main = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_business_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_branches_updated_at ON business_branches;
CREATE TRIGGER trg_business_branches_updated_at
  BEFORE UPDATE ON business_branches
  FOR EACH ROW EXECUTE FUNCTION update_business_branches_updated_at();

ALTER TABLE business_branches ENABLE ROW LEVEL SECURITY;

-- Policies: owner of business can manage branches (business.owner_id = auth.uid())
DROP POLICY IF EXISTS "Owners can manage branches" ON business_branches;
CREATE POLICY "Owners can manage branches"
  ON business_branches FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM businesses WHERE businesses.id = business_branches.business_id AND businesses.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM businesses WHERE businesses.id = business_branches.business_id AND businesses.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Public can view branches" ON business_branches;
CREATE POLICY "Public can view branches"
  ON business_branches FOR SELECT
  USING (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
