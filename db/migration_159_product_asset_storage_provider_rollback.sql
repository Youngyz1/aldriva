-- Refuse rollback while R2-backed assets exist; their provider metadata is
-- required to locate the private objects and mint buyer download URLs.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_assets WHERE storage_provider = 'r2'
  ) THEN
    RAISE EXCEPTION 'Cannot roll back migration 159 while R2-backed product assets exist';
  END IF;
END $$;

ALTER TABLE public.product_assets
  DROP CONSTRAINT IF EXISTS product_assets_storage_provider_check;

ALTER TABLE public.product_assets
  DROP COLUMN IF EXISTS storage_provider;

COMMIT;

NOTIFY pgrst, 'reload schema';
