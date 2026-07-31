-- Rollback for migration 44: remove the in-app notifications feature.
-- Destructive — drops all notification history.

ALTER PUBLICATION supabase_realtime DROP TABLE notifications;
DROP TABLE IF EXISTS notifications;

NOTIFY pgrst, 'reload schema';
