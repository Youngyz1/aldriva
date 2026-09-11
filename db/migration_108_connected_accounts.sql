-- migration_108_connected_accounts.sql
--
-- Phase A (Aldriva multi-tenant AI architecture): connected_accounts table.
-- Tenant = organizers.id (canonical Entity table per migration_58).
-- No Meta/OAuth/external integration logic here — storage + RLS only.
-- RLS reuses is_entity_member() (migration_62), no ad hoc membership logic.

BEGIN;

CREATE TABLE IF NOT EXISTS connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta')),
  account_type TEXT,
  provider_account_id TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked', 'expired')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE connected_accounts IS
  'Tenant-owned external social account links. tenant_id = organizers.id. Secrets (tokens) are never stored here — see ai_provider_configs for the no-plaintext-secrets rule; provider OAuth tokens live outside this phase.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_connected_accounts_tenant_provider_account
  ON connected_accounts(tenant_id, provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_connected_accounts_tenant_id
  ON connected_accounts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_status
  ON connected_accounts(status);

CREATE OR REPLACE FUNCTION update_connected_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connected_accounts_updated_at ON connected_accounts;
CREATE TRIGGER trg_connected_accounts_updated_at
  BEFORE UPDATE ON connected_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_connected_accounts_updated_at();

ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant members (any role) + active admins.
DROP POLICY IF EXISTS "Tenant members can read connected accounts" ON connected_accounts;
CREATE POLICY "Tenant members can read connected accounts"
  ON connected_accounts FOR SELECT
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE: tenant managers + active admins only. No client
-- path for customers; channel ingestion writes via service role.
DROP POLICY IF EXISTS "Tenant managers can manage connected accounts" ON connected_accounts;
CREATE POLICY "Tenant managers can manage connected accounts"
  ON connected_accounts FOR ALL
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
