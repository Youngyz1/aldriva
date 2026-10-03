-- migration_133_add_event_subcategory.sql
-- Adds subcategory to events, controlled via lib/event-taxonomy.ts SUBCATEGORIES_BY_CATEGORY
-- Keeps event.category as text (backwards compat with legacy 11 values, normalized via normalizeEventCategory)

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS subcategory text;
COMMENT ON COLUMN events.subcategory IS 'Controlled via lib/event-taxonomy.ts SUBCATEGORIES_BY_CATEGORY, validated in app';

CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_subcategory ON events(subcategory);
CREATE INDEX IF NOT EXISTS idx_events_category_subcategory ON events(category, subcategory);

COMMIT;
NOTIFY pgrst, 'reload schema';
