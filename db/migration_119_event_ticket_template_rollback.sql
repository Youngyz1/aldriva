-- migration_119_event_ticket_template_rollback.sql
-- Rollback for migration_119_event_ticket_template.sql

BEGIN;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_ticket_template_check;

ALTER TABLE public.events
DROP COLUMN IF EXISTS ticket_template;

COMMIT;

NOTIFY pgrst, 'reload schema';
