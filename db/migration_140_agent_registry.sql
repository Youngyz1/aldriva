-- migration_140_agent_registry.sql
-- Phase 140: Agent Registry — minimal extensible identity for specialized agents.
-- Initial agents: dylan, sentinel, qa — all L0 READ_ONLY. Future agents via INSERT only.

BEGIN;

-- ── 1. agents ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]{1,30}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  department text NOT NULL CHECK (char_length(department) BETWEEN 2 AND 60),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
  system_prompt text NOT NULL CHECK (char_length(system_prompt) BETWEEN 50 AND 8000),
  model_selection text NOT NULL DEFAULT 'aldriva' CHECK (model_selection IN ('aldriva','gemini','openrouter')),
  autonomy_level text NOT NULL DEFAULT 'L0' CHECK (autonomy_level IN ('L0','L1','L2','L3','L4')),
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','deprecated')),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agents IS 'AI workforce identities. Tenant_id NULL = platform agent. Extensible via INSERT — no schema change per new agent.';
COMMENT ON COLUMN agents.tenant_id IS 'NULL for platform agents (Dylan, Sentinel, QA). Tenant-scoped agents reference organizers.id.';
COMMENT ON COLUMN agents.autonomy_level IS 'L0 read-only only in Phase 140-142. Escalation requires approvals table and human signature.';

CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status) WHERE status = 'active';

CREATE OR REPLACE FUNCTION update_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_updated_at ON agents;
CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_agents_updated_at();

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read agents" ON agents;
CREATE POLICY "Authenticated can read agents"
  ON agents FOR SELECT
  USING (auth.role() = 'authenticated');

-- Writes via service_role only

-- ── 2. agent_versions — immutable snapshots ───────────────────────────────
CREATE TABLE IF NOT EXISTS agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),
  system_prompt text NOT NULL,
  model_selection text NOT NULL,
  autonomy_level text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version)
);

COMMENT ON TABLE agent_versions IS 'Immutable snapshot on each agent config change. Version increments via application — not DB trigger.';

CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id ON agent_versions(agent_id, version DESC);
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read agent versions" ON agent_versions;
CREATE POLICY "Authenticated can read agent versions"
  ON agent_versions FOR SELECT USING (auth.role() = 'authenticated');

-- ── 3. agent_tools ACL ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tools (
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_name text NOT NULL REFERENCES tool_definitions(name) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT true,
  risk_override text CHECK (risk_override IS NULL OR risk_override IN ('low','medium','high','critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, tool_name)
);

COMMENT ON TABLE agent_tools IS 'Per-agent allowlist. Software-enforced in orchestrator — not advisory. Model cannot grant itself tools.';

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent_id ON agent_tools(agent_id);
ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read agent tools" ON agent_tools;
CREATE POLICY "Authenticated can read agent tools"
  ON agent_tools FOR SELECT USING (auth.role() = 'authenticated');

-- ── 4. Seed agents (L0 READ_ONLY — no side effects) ─────────────────────
INSERT INTO agents (name, display_name, department, description, system_prompt, model_selection, autonomy_level, status)
VALUES
('dylan','Dylan — Executive Coordinator','executive','Executive coordinator and orchestrator for the AI workforce. Routes tasks and aggregates reports. L0 read-only in this phase.','You are Dylan, the Executive Coordinator for the Aldriva AI workforce. You are a read-only executive agent. Your responsibilities: coordinate tasks, summarize status, and provide grounded answers from knowledge and authorized tools. You must never perform writes, deployments, or financial actions. You must call only tools explicitly allowed for your identity. If a task requires a write or high-risk action, respond that it requires human approval and stop.', 'aldriva','L0','active'),
('sentinel','Sentinel — Reliability Intelligence','reliability','Reliability and engineering intelligence. Observes and reports platform health. L0 read-only in this phase.','You are Sentinel, the Reliability Intelligence agent for Aldriva. You are read-only. Your responsibilities: observe available health signals, correlate evidence from authorized tools and knowledge, classify severity, and report findings with evidence. You must never modify code, deploy, or access production secrets. You must call only tools explicitly allowed for your identity.', 'aldriva','L0','active'),
('qa','QA Engineer','quality','Quality assurance. Prepares and reports test observations. L0 read-only in this phase.','You are the QA Engineer for Aldriva. You are read-only. Your responsibilities: describe test plans, analyze available test evidence from authorized tools and knowledge, and report quality findings. You must never trigger writes, deploys, or production mutations. You must call only tools explicitly allowed for your identity.', 'aldriva','L0','active')
ON CONFLICT (name) DO NOTHING;

-- Seed versions (v1 snapshot)
INSERT INTO agent_versions (agent_id, version, system_prompt, model_selection, autonomy_level)
SELECT id, 1, system_prompt, model_selection, autonomy_level FROM agents WHERE name IN ('dylan','sentinel','qa')
ON CONFLICT (agent_id, version) DO NOTHING;

-- ── 5. Seed agent_tools ACL — L0 read-only: allow SELECT catalog + tenant reads, deny transactional writes
-- Dylan: broad read-only (public catalog + tenant reads + admin history), no transactional
INSERT INTO agent_tools (agent_id, tool_name, allowed)
SELECT a.id, t.name, true FROM agents a CROSS JOIN tool_definitions t
WHERE a.name = 'dylan' AND t.name IN (
  'get_upcoming_events','get_active_fundraisers','get_featured_businesses','get_recent_articles','get_available_products',
  'fetch_url_summary','fetch_rss_feed','search_trends',
  'get_content_history',
  'searchEvents','getEvent','getTicketAvailability','getTicketOrderStatus',
  'searchFundraisers','getFundraiser','getDonationStatus',
  'searchProducts','getProduct','getProductAvailability','getProductOrderStatus',
  'getPaymentStatus'
)
ON CONFLICT (agent_id, tool_name) DO NOTHING;

-- Sentinel: same as Dylan but explicitly without admin content history (observability focused)
INSERT INTO agent_tools (agent_id, tool_name, allowed)
SELECT a.id, t.name, true FROM agents a CROSS JOIN tool_definitions t
WHERE a.name = 'sentinel' AND t.name IN (
  'get_upcoming_events','get_active_fundraisers','get_featured_businesses','get_recent_articles','get_available_products',
  'fetch_url_summary','fetch_rss_feed','search_trends',
  'searchEvents','getEvent','getTicketAvailability','getTicketOrderStatus',
  'searchFundraisers','getFundraiser','getDonationStatus',
  'searchProducts','getProduct','getProductAvailability','getProductOrderStatus',
  'getPaymentStatus'
)
ON CONFLICT (agent_id, tool_name) DO NOTHING;

-- QA: same read-only set as Sentinel
INSERT INTO agent_tools (agent_id, tool_name, allowed)
SELECT a.id, t.name, true FROM agents a CROSS JOIN tool_definitions t
WHERE a.name = 'qa' AND t.name IN (
  'get_upcoming_events','get_active_fundraisers','get_featured_businesses','get_recent_articles','get_available_products',
  'fetch_url_summary','fetch_rss_feed','search_trends',
  'searchEvents','getEvent','getTicketAvailability','getTicketOrderStatus',
  'searchFundraisers','getFundraiser','getDonationStatus',
  'searchProducts','getProduct','getProductAvailability','getProductOrderStatus',
  'getPaymentStatus'
)
ON CONFLICT (agent_id, tool_name) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
