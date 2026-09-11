-- migration_110_customer_identities.sql
--
-- Phase A: customer_identities table. Maps an external per-channel customer
-- id to an optional Aldriva user. Tenant = organizers.id. No plaintext
-- secrets in metadata by convention (enforced in application code, not SQL).

BEGIN;

CREATE TABLE IF NOT EXISTS customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  external_customer_id TEXT NOT NULL,
  aldriva_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone TEXT,
  email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE customer_identities IS
  'External customer id -> Aldriva user mapping, scoped per tenant. One row per (tenant, channel, external id).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_identities_tenant_channel_external
  ON customer_identities(tenant_id, channel, external_customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_identities_tenant_id
  ON customer_identities(tenant_id);

CREATE INDEX IF NOT EXISTS idx_customer_identities_aldriva_user
  ON customer_identities(aldriva_user_id)
  WHERE aldriva_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_customer_identities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_identities_updated_at ON customer_identities;
CREATE TRIGGER trg_customer_identities_updated_at
  BEFORE UPDATE ON customer_identities
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_identities_updated_at();

ALTER TABLE customer_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read customer identities" ON customer_identities;
CREATE POLICY "Tenant members can read customer identities"
  ON customer_identities FOR SELECT
  USING (
    is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Writes: tenant content-writers + active admins. Service role (channel
-- ingestion) bypasses RLS. Customers never write their own identity rows.
DROP POLICY IF EXISTS "Tenant writers can manage customer identities" ON customer_identities;
CREATE POLICY "Tenant writers can manage customer identities"
  ON customer_identities FOR ALL
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

COMMIT;

NOTIFY pgrst, 'reload schema';
