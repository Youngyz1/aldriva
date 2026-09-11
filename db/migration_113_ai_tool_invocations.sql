-- migration_113_ai_tool_invocations.sql
--
-- Phase A + F: ai_tool_invocations audit log. Every tenant-scoped AI tool
-- call logs one row via service role. tenant_id is nullable ONLY for
-- pre-tenant-resolution failures (fail-closed logging): rows with NULL
-- tenant_id are readable by active platform admins and by NOBODY else.
--
-- arguments_safe holds redacted args only (no tokens/PII). Payment status
-- columns are never written from AI-tool paths (see header note in the
-- tenant tools: getPaymentStatus is read-only; record_*_credit RPCs remain
-- exclusively invoked by signed webhook handlers).

BEGIN;

CREATE TABLE IF NOT EXISTS ai_tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizers(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ai', 'organizer', 'system')),
  provider TEXT,
  tool_name TEXT NOT NULL,
  arguments_safe JSONB NOT NULL DEFAULT '{}'::jsonb,
  authorization_decision TEXT NOT NULL DEFAULT 'allowed'
    CHECK (authorization_decision IN ('allowed', 'denied', 'failed_closed')),
  rows_affected INTEGER CHECK (rows_affected IS NULL OR rows_affected >= 0),
  result_classification TEXT NOT NULL DEFAULT 'success'
    CHECK (result_classification IN ('success', 'guard_rejected', 'guard_flagged', 'error')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_tool_invocations IS
  'AI action audit log. tenant_id NULL only for pre-resolution failures; those rows are admin-only. arguments_safe is redacted; never stores secrets or raw PII.';
COMMENT ON COLUMN ai_tool_invocations.tenant_id IS
  'Nullable only for fail-closed pre-tenant-resolution logging. All resolved calls carry the authoritative tenant_id derived from session+entity_members or the channel_asset chain, never from model output.';

CREATE INDEX IF NOT EXISTS idx_ai_tool_invocations_tenant_id
  ON ai_tool_invocations(tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_tool_invocations_conversation_id
  ON ai_tool_invocations(conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_tool_invocations_tool_created
  ON ai_tool_invocations(tool_name, created_at DESC);

ALTER TABLE ai_tool_invocations ENABLE ROW LEVEL SECURITY;

-- SELECT, non-null tenant: tenant members (any role) + active admins.
DROP POLICY IF EXISTS "Tenant members can read own tool invocations" ON ai_tool_invocations;
CREATE POLICY "Tenant members can read own tool invocations"
  ON ai_tool_invocations FOR SELECT
  USING (
    (
      tenant_id IS NOT NULL
      AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policies for anon/authenticated: rows are written
-- exclusively by the service role from tenant-tool code paths (fail-closed
-- logger). Admins read via the SELECT policy above through their session;
-- auditor writes never go through client roles.

COMMIT;

NOTIFY pgrst, 'reload schema';
