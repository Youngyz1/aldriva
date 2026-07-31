-- migration_24_fundraiser_category.sql
-- Adds `category` column to the fundraisers table.
-- The dashboard query at lib/dashboard-data.ts line 250 selects `category` but
-- it was never defined in the original schema. This migration adds it safely.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE fundraisers
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Common fundraiser categories for the UI filter
-- No constraint applied — free-form text allows custom categories.
-- Example values: 'Medical', 'Education', 'Emergency', 'Community', 'Animals', 'Environment'

CREATE INDEX IF NOT EXISTS idx_fundraisers_category
  ON fundraisers(category);

NOTIFY pgrst, 'reload schema';
