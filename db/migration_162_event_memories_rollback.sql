-- migration_162_event_memories_rollback.sql
-- Rollback for migration_162_event_memories.sql.
-- Drops policies, tables (children first), then the storage bucket row only
-- when empty — never deletes stored objects. Reverse order of the forward
-- migration. Safe to re-run.

BEGIN;

DROP POLICY IF EXISTS "Organizers and event managers can manage retention notices" ON public.event_memory_retention_notices;
DROP POLICY IF EXISTS "Organizers and event managers can manage memory reports" ON public.event_memory_reports;
DROP POLICY IF EXISTS "Organizers and event managers can manage memories" ON public.event_memories;
DROP POLICY IF EXISTS "Organizers and event managers can manage memory settings" ON public.event_memory_settings;

DROP TABLE IF EXISTS public.event_memory_retention_notices;
DROP TABLE IF EXISTS public.event_memory_reports;
DROP TABLE IF EXISTS public.event_memories;
DROP TABLE IF EXISTS public.event_memory_settings;

-- Storage bucket: remove the row only when it holds no objects.
DELETE FROM storage.buckets
WHERE id = 'event-memories'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'event-memories'
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
