-- import_sources_schema.sql
-- Optional source URL tracking for events and fundraisers imported from the web.

ALTER TABLE events
ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS eventbrite_event_id TEXT;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS source_organizer_name TEXT;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS source_organizer_url TEXT;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS source_organizer_description TEXT;

CREATE INDEX IF NOT EXISTS idx_events_source_url ON events(source_url);

CREATE INDEX IF NOT EXISTS idx_events_eventbrite_event_id ON events(eventbrite_event_id);

ALTER TABLE fundraisers
ADD COLUMN IF NOT EXISTS source_url TEXT;

ALTER TABLE fundraisers
ADD COLUMN IF NOT EXISTS gofundme_source_id UUID;

CREATE INDEX IF NOT EXISTS idx_fundraisers_source_url ON fundraisers(source_url);

CREATE INDEX IF NOT EXISTS idx_fundraisers_gofundme_source_id ON fundraisers(gofundme_source_id);
