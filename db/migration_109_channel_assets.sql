-- migration_109_channel_assets.sql
--
-- Phase A: channel_assets table. Each asset (page, number, handle) belongs to
-- one connected_accounts row and is redundantly stamped with tenant_id =
-- organizers.id so RLS can check is_entity_member(tenant_id) without a join.
-- The tenant_id MUST equal its parent connected_accounts.tenant_id
-- (enforced by chk_channel_assets_tenant_matches_parent).

BEGIN;

CREATE TABLE IF NOT EXISTS channel_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_account_id UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  asset_type TEXT,
  provider_asset_id TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked', 'expired')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE channel_assets IS
  'Tenant-owned channel assets (pages/handles/numbers). tenant_id mirrors the parent connected_accounts.tenant_id for RLS; mismatch is rejected.';

CREATE INDEX IF NOT EXISTS idx_channel_assets_tenant_id
  ON channel_assets(tenant_id);

CREATE INDEX IF NOT EXISTS idx_channel_assets_connected_account_id
  ON channel_assets(connected_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_assets_channel_provider_asset
  ON channel_assets(channel, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_channel_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_channel_assets_updated_at ON channel_assets;
CREATE TRIGGER trg_channel_assets_updated_at
  BEFORE UPDATE ON channel_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_channel_assets_updated_at();

-- Fail closed: tenant_id must match the parent connected account's tenant.
CREATE OR REPLACE FUNCTION enforce_channel_asset_tenant_match()
RETURNS TRIGGER AS $$
DECLARE
  parent_tenant UUID;
BEGIN
  SELECT tenant_id INTO parent_tenant
  FROM connected_accounts WHERE id = NEW.connected_account_id;
  IF parent_tenant IS NULL OR parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'channel_assets.tenant_id must equal parent connected_accounts.tenant_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_channel_assets_tenant_match ON channel_assets;
CREATE TRIGGER trg_channel_assets_tenant_match
  BEFORE INSERT OR UPDATE OF connected_account_id, tenant_id ON channel_assets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_channel_asset_tenant_match();

ALTER TABLE channel_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read channel assets" ON channel_assets;
CREATE POLICY "Tenant members can read channel assets"
  ON channel_assets FOR SELECT
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant managers can manage channel assets" ON channel_assets;
CREATE POLICY "Tenant managers can manage channel assets"
  ON channel_assets FOR ALL
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
