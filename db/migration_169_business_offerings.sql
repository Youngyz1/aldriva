-- Phase 2a: stable business-offering keys. Labels remain in the application
-- catalog/messages; this additive column does not alter existing RLS policies.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS offerings text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_offerings_max_20,
  ADD CONSTRAINT businesses_offerings_max_20
    CHECK (cardinality(offerings) <= 20);

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_offerings_key_format,
  ADD CONSTRAINT businesses_offerings_key_format
    CHECK (
      cardinality(offerings) = 0
      OR array_to_string(offerings, ',') ~ '^[a-z][a-z0-9_]{1,39}(,[a-z][a-z0-9_]{1,39})*$'
    );
