-- migration_114_notification_preferences.sql
--
-- Phase A: tenant-scoped notification_preferences table.
-- Intentionally SEPARATE from profiles.preferences JSONB (user-scoped email
-- topic toggles: notify_ticket_purchase/notify_donation enforced, rest
-- UI-only). That column stays as-is and is NOT extended here. This table is
-- organizer/business level (e.g. "this organizer wants WhatsApp donation
-- alerts"). Eventual reconciliation of the two systems is a Phase 1+ item.

BEGIN;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification_preferences IS
  'Tenant-scoped channel/event notification toggles. Separate system from profiles.preferences (user-scoped); do not merge this phase.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_preferences_tenant_channel_event
  ON notification_preferences(tenant_id, channel, event_type);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_tenant_id
  ON notification_preferences(tenant_id);

CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read notification preferences" ON notification_preferences;
CREATE POLICY "Tenant members can read notification preferences"
  ON notification_preferences FOR SELECT
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant managers can manage notification preferences" ON notification_preferences;
CREATE POLICY "Tenant managers can manage notification preferences"
  ON notification_preferences FOR ALL
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
