-- migration_46_eventbrite_source_columns.sql
-- Adds the two columns app/api/eventbrite-sync/route.ts has always expected
-- but were never created: source_url and eventbrite_event_id. Their absence
-- broke the pre-insert duplicate check (`.eq("source_url", ...)` errors
-- silently against a missing column, and the code only destructured
-- `{ data: existing }`, discarding the error, so `existing` was always null)
-- meaning every re-sync would re-insert every organizer's events as
-- duplicates. It also meant every insert fell into the "missing optional
-- column" retry path, which stripped source_organizer_name/url/description
-- too, even though those columns already existed.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS eventbrite_event_id text;

-- Real dedup guarantee at the DB level, not just app-side. Partial (WHERE
-- eventbrite_event_id IS NOT NULL) so native Aldriva events and other
-- import sources, which leave this null, are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS events_eventbrite_event_id_key
  ON events(eventbrite_event_id)
  WHERE eventbrite_event_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
