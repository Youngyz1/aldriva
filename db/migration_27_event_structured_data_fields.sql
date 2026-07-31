-- Optional event metadata used for richer Schema.org Event JSON-LD.
ALTER TABLE events
ADD COLUMN IF NOT EXISTS event_type TEXT,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS street_address TEXT,
ADD COLUMN IF NOT EXISTS address_locality TEXT,
ADD COLUMN IF NOT EXISTS address_region TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS address_country TEXT,
ADD COLUMN IF NOT EXISTS online_url TEXT,
ADD COLUMN IF NOT EXISTS performer_name TEXT;
