-- Track which private storage provider holds each paid-product asset.
-- Existing rows remain on Supabase; new production uploads may use private R2.
BEGIN;

ALTER TABLE public.product_assets
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase';

ALTER TABLE public.product_assets
  DROP CONSTRAINT IF EXISTS product_assets_storage_provider_check;

ALTER TABLE public.product_assets
  ADD CONSTRAINT product_assets_storage_provider_check
  CHECK (storage_provider IN ('supabase', 'r2'));

COMMENT ON COLUMN public.product_assets.storage_provider IS
  'Private object provider for this asset. Existing assets default to supabase; newly uploaded assets may use r2.';

COMMIT;

NOTIFY pgrst, 'reload schema';
