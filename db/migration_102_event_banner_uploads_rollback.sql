-- migration_102_event_banner_uploads_rollback.sql
--
-- Restores the pre-102 state: removes the event-banner upload policy, so the
-- event-banners bucket returns to default-deny for authenticated browser
-- uploads (service_role writes are unaffected). Only use to back out
-- migration_102; re-opens the event banner upload failure.

BEGIN;

DROP POLICY IF EXISTS "Event managers can upload event banners" ON storage.objects;

COMMIT;

NOTIFY pgrst, 'reload schema';
