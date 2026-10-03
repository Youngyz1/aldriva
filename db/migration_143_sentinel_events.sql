-- migration_143_sentinel_events.sql
-- Phase 143b — Sentinel Observability (Amendments 1 & 2)
-- 1) ai_guard_rejections.tenant_id (nullable, FK organizers) — Amendment 1
-- 2) system_events + incidents + incident_events (source='aldriva' default) — Amendment 2

BEGIN;

-- ── Amendment 1: ai_guard_rejections.tenant_id ──────────────────────────
ALTER TABLE ai_guard_rejections
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_guard_rejections.tenant_id IS 'Tenant context at rejection time. NULL = platform-level (no tenant). Populated by logRejection/logInputRejection when caller has tenant_id. Pre-migration rows stay NULL by design.';

CREATE INDEX IF NOT EXISTS idx_ai_guard_rejections_tenant_id ON ai_guard_rejections(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_guard_rejections_context ON ai_guard_rejections(context);

-- Replace admin-only SELECT with tenant-scoped policy (Phase 139-142 pattern)
DROP POLICY IF EXISTS "Admins can view ai_guard_rejections" ON ai_guard_rejections;
-- Keep insert policy for service_role bypass; re-create SELECT as tenant-aware
DROP POLICY IF EXISTS "Tenant members and admins can read guard rejections" ON ai_guard_rejections;
CREATE POLICY "Tenant members and admins can read guard rejections"
  ON ai_guard_rejections FOR SELECT
  USING (
    (tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='admin' AND profiles.status='active'))
    OR (tenant_id IS NOT NULL AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='admin' AND profiles.status='active')
  );

-- ── Amendment 2 + Report §2: system_events ───────────────────────────────
CREATE TABLE IF NOT EXISTS system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('api_error','job_error','webhook_error','payment_reconciliation','auth_failure','storage_error','guard_rejection','approval_block','agent_tool_error')),
  severity_hint text NOT NULL CHECK (severity_hint IN ('info','warn','error','critical')),
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  route text,
  tool_name text,
  status_code smallint CHECK (status_code IS NULL OR (status_code >= 100 AND status_code <= 599)),
  error_code text,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 400),
  source text NOT NULL DEFAULT 'aldriva' CHECK (source ~ '^[a-z][a-z0-9_]{1,30}$')
);

COMMENT ON TABLE system_events IS 'Raw occurrence stream. Insert-only, service_role writes, best-effort. Grouped into incidents via dedupe_key 60-min window.';
COMMENT ON COLUMN system_events.source IS 'Emitter source. Phase 143b: aldriva only (future: external signals without schema change).';
COMMENT ON COLUMN system_events.dedupe_key IS 'Deterministic: kind:route:tool_name:error_code:tenant_id|platform';

CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_dedupe_created ON system_events(dedupe_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_kind ON system_events(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_tenant_id ON system_events(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read system events" ON system_events;
CREATE POLICY "Authenticated can read system events"
  ON system_events FOR SELECT
  USING (
    (tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='admin' AND profiles.status='active'))
    OR (tenant_id IS NOT NULL AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='admin' AND profiles.status='active')
  );

-- ── incidents + incident_events ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','expired')),
  severity text NOT NULL CHECK (severity IN ('s1','s2','s3','s4')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 300),
  summary text,
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 400),
  event_count int NOT NULL DEFAULT 1 CHECK (event_count >= 1),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  agent_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE incidents IS 'Correlated grouping of system_events sharing dedupe_key within 60-min window. Deterministic severity at open (S1-S4 per report §2). Retained indefinitely.';
CREATE INDEX IF NOT EXISTS idx_incidents_dedupe_status ON incidents(dedupe_key, status) WHERE status IN ('open','investigating');
CREATE INDEX IF NOT EXISTS idx_incidents_status_severity ON incidents(status, severity, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_id ON incidents(tenant_id, updated_at DESC) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_open_dedupe ON incidents(dedupe_key) WHERE status IN ('open','investigating');

CREATE OR REPLACE FUNCTION update_incidents_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION update_incidents_updated_at();

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read incidents" ON incidents;
CREATE POLICY "Authenticated can read incidents"
  ON incidents FOR SELECT
  USING (
    (tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='admin' AND profiles.status='active'))
    OR (tenant_id IS NOT NULL AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role='admin' AND profiles.status='active')
  );

CREATE TABLE IF NOT EXISTS incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES system_events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, event_id)
);

COMMENT ON TABLE incident_events IS 'Join append-only: incident ↔ system_events. One incident groups 1-N events sharing dedupe_key.';
CREATE INDEX IF NOT EXISTS idx_incident_events_incident_id ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_events_event_id ON incident_events(event_id);

ALTER TABLE incident_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read incident events" ON incident_events;
DROP POLICY IF EXISTS "Tenant members and admins can read incident events" ON incident_events;
CREATE POLICY "Tenant members and admins can read incident events"
  ON incident_events FOR SELECT
  USING (
    incident_id IN (
      SELECT id FROM incidents
      WHERE (tenant_id IS NULL AND EXISTS (
               SELECT 1 FROM profiles
               WHERE profiles.id = auth.uid()
                 AND profiles.role='admin' AND profiles.status='active'))
         OR (tenant_id IS NOT NULL AND is_entity_member(
               tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    )
  );

-- ── Seed Sentinel ACL: 20 -> 24 (Dylan/QA unchanged) ────────────────────
-- Tool definitions for 4 new Sentinel read-only tools
INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('get_recent_events','Retrieves recent system events. Filters by kind and tenant. Read-only, tenant-scoped.','{"type":"object","properties":{"kind":{"type":"string"},"limit":{"type":"number"},"hoursBack":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/sentinel/sentinel-events:getRecentEvents'),
('get_active_incidents','Retrieves open/investigating incidents. Tenant-scoped. Read-only.','{"type":"object","properties":{"status":{"type":"string"},"limit":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/sentinel/sentinel-incidents:getActiveIncidents'),
('get_guard_rejections','Retrieves recent AI guard rejections (ai_guard_rejections). Tenant-scoped via tenant_id column. Read-only.','{"type":"object","properties":{"category":{"type":"string"},"limit":{"type":"number"},"hoursBack":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','low',false,'lib/ai/tools/sentinel/sentinel-guards:getGuardRejections'),
('get_recent_webhook_failures','Retrieves recent payment reconciliation failures and webhook errors. Reads payment_reconciliation_failures + system_events. Tenant-scoped.','{"type":"object","properties":{"limit":{"type":"number"},"hoursBack":{"type":"number"}},"required":[]}'::jsonb,'{}'::jsonb,'tenant_scoped','medium',false,'lib/ai/tools/sentinel/sentinel-webhooks:getRecentWebhookFailures')
ON CONFLICT (name) DO NOTHING;

INSERT INTO agent_tools (agent_id, tool_name, allowed)
SELECT a.id, t.name, true
FROM agents a CROSS JOIN tool_definitions t
WHERE a.name = 'sentinel' AND t.name IN ('get_recent_events','get_active_incidents','get_guard_rejections','get_recent_webhook_failures')
ON CONFLICT (agent_id, tool_name) DO NOTHING;

COMMIT;
NOTIFY pgrst, 'reload schema';
