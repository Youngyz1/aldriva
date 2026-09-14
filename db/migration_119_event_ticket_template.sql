-- migration_119_event_ticket_template.sql
-- Adds ticket_template column to events table to allow event organizers
-- to select a visual ticket pass template (modern, concert, premium, minimal).
-- Defaults to 'modern' to preserve existing appearance for all existing events.

BEGIN;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS ticket_template TEXT NOT NULL DEFAULT 'modern';

-- Drop constraint if it already exists before creating it
ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_ticket_template_check;

ALTER TABLE public.events
ADD CONSTRAINT events_ticket_template_check
CHECK (ticket_template IN ('modern', 'concert', 'premium', 'minimal'));

COMMIT;

NOTIFY pgrst, 'reload schema';
