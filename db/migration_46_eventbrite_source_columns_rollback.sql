-- Rollback for migration_46_eventbrite_source_columns.sql

DROP INDEX IF EXISTS events_eventbrite_event_id_key;

ALTER TABLE events
  DROP COLUMN IF EXISTS source_url,
  DROP COLUMN IF EXISTS eventbrite_event_id;

NOTIFY pgrst, 'reload schema';
