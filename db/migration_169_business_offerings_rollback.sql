-- Roll back Phase 2a business-offering keys.
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_offerings_key_format,
  DROP CONSTRAINT IF EXISTS businesses_offerings_max_20,
  DROP COLUMN IF EXISTS offerings;
