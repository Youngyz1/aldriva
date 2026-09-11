-- migration_111_conversations_messages.sql
--
-- Phase A: generic cross-channel conversations/messages tables.
-- Distinct from ai_conversations/ai_messages (migration_88), which are
-- ADMIN-scoped (admin_id owner, admin-only RLS). These are tenant/customer
-- threads: tenant_id = organizers.id. ai_* tables are untouched.
--
-- conversations.channel_asset_id -> channel_assets(id) is SET NULL so asset
-- cleanup never destroys thread history. customer_identity_id ->
-- customer_identities(id) is SET NULL for the same reason.
-- messages.tenant_id mirrors conversations.tenant_id (fail-closed trigger).

BEGIN;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  channel TEXT,
  channel_asset_id UUID REFERENCES channel_assets(id) ON DELETE SET NULL,
  customer_identity_id UUID REFERENCES customer_identities(id) ON DELETE SET NULL,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'resolved', 'closed', 'archived')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversations IS
  'Generic tenant/customer threads. Distinct from ai_conversations (admin-scoped). tenant_id = organizers.id.';

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id
  ON conversations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_conversations_channel_asset_id
  ON conversations(channel_asset_id)
  WHERE channel_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_customer_identity_id
  ON conversations(customer_identity_id)
  WHERE customer_identity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_message
  ON conversations(tenant_id, last_message_at DESC);

CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read conversations" ON conversations;
CREATE POLICY "Tenant members can read conversations"
  ON conversations FOR SELECT
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant writers can manage conversations" ON conversations;
CREATE POLICY "Tenant writers can manage conversations"
  ON conversations FOR ALL
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'organizer', 'ai', 'system')),
  external_message_id TEXT,
  content TEXT,
  provider TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE messages IS
  'Generic thread messages. Distinct from ai_messages (admin-scoped). tenant_id mirrors parent conversations.tenant_id; mismatch is rejected. content holds text only, never secrets.';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_id
  ON messages(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_external_message_id
  ON messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- Fail closed: tenant_id must match the parent conversation's tenant.
CREATE OR REPLACE FUNCTION enforce_message_tenant_match()
RETURNS TRIGGER AS $$
DECLARE
  parent_tenant UUID;
BEGIN
  SELECT tenant_id INTO parent_tenant
  FROM conversations WHERE id = NEW.conversation_id;
  IF parent_tenant IS NULL OR parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'messages.tenant_id must equal parent conversations.tenant_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_tenant_match ON messages;
CREATE TRIGGER trg_messages_tenant_match
  BEFORE INSERT OR UPDATE OF conversation_id, tenant_id ON messages
  FOR EACH ROW
  EXECUTE FUNCTION enforce_message_tenant_match();

-- Keep conversations.last_message_at fresh on new messages.
CREATE OR REPLACE FUNCTION touch_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_messages_touch_conversation ON messages;
CREATE TRIGGER trg_messages_touch_conversation
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION touch_conversation_last_message();

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read messages" ON messages;
CREATE POLICY "Tenant members can read messages"
  ON messages FOR SELECT
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Messages are append-only for members: INSERT + SELECT, no UPDATE/DELETE
-- via client roles (corrections happen as new messages). Service role
-- (channel ingestion / AI replies) bypasses RLS.
DROP POLICY IF EXISTS "Tenant writers can append messages" ON messages;
CREATE POLICY "Tenant writers can append messages"
  ON messages FOR INSERT
  WITH CHECK (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
