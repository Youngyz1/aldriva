-- migration_44_notifications.sql
-- Real in-app notifications: table + RLS + Realtime, backing the nav bell.

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- recipient
  actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,        -- who triggered it (null for guests)
  type         TEXT NOT NULL CHECK (type IN (
                 'donation', 'comment', 'like', 'fundraiser_approved',
                 'fundraiser_rejected', 'follow', 'ticket_purchase'
               )),
  title        TEXT NOT NULL,
  body         TEXT,
  link         TEXT,
  related_type TEXT CHECK (related_type IN ('fundraiser', 'comment', 'event', 'profile')),
  related_id   UUID,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;
CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can mark their own notifications read" ON notifications;
CREATE POLICY "Users can mark their own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No public INSERT/DELETE policy: rows are only ever written by the service role
-- from lib/notifications.ts.

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

NOTIFY pgrst, 'reload schema';
