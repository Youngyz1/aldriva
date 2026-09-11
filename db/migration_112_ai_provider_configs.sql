-- migration_112_ai_provider_configs.sql
--
-- Phase A: ai_provider_configs table. Tenant-scoped provider routing config.
-- Configuration references only — NO plaintext secrets (no api_key, secret,
-- token columns at all). Secrets stay in env / vault; this table stores
-- provider selection, model, and non-sensitive tuning knobs.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openrouter', 'aldriva')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  model TEXT,
  fallback_provider TEXT CHECK (fallback_provider IS NULL OR fallback_provider IN ('gemini', 'openrouter', 'aldriva')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_provider_configs IS
  'Tenant AI provider routing. References only — no secret columns exist on this table by design. Secrets remain in env/vault.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_configs_tenant_provider
  ON ai_provider_configs(tenant_id, provider);

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_tenant_id
  ON ai_provider_configs(tenant_id);

CREATE OR REPLACE FUNCTION update_ai_provider_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_provider_configs_updated_at ON ai_provider_configs;
CREATE TRIGGER trg_ai_provider_configs_updated_at
  BEFORE UPDATE ON ai_provider_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_provider_configs_updated_at();

ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read ai provider configs" ON ai_provider_configs;
CREATE POLICY "Tenant members can read ai provider configs"
  ON ai_provider_configs FOR SELECT
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Writes restricted to tenant managers + active admins (provider routing is
-- integration config, ENTITY_ROLES_MANAGE tier per migration_62 comment).
DROP POLICY IF EXISTS "Tenant managers can manage ai provider configs" ON ai_provider_configs;
CREATE POLICY "Tenant managers can manage ai provider configs"
  ON ai_provider_configs FOR ALL
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
