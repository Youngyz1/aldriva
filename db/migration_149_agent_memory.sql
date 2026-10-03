-- migration_149_agent_memory.sql
-- Stage 12: approved persistent agent memory (ADDITIVE ONLY).
--
-- Agents cannot write durable memory. An agent proposes (tool memory_propose
-- → approvals row action='memory_propose'); a human decides; a controlled
-- server-side applier persists the exact approved state. Human direct
-- creation (source='human', proposer NULL) is versioned and audited the
-- same way. No free-form agent-writable memory exists anywhere here.
--
-- Scope: tenant_id NULL = platform-wide (platform-admin only);
-- tenant_id = X = tenant memory; agent_id NULL = shared within scope;
-- agent_id = X = agent-specific. UNIQUE(agent_id, tenant_id, fact_key)
-- relies on PostgreSQL NULL-distinct behavior so platform/shared and
-- scoped keys coexist.
--
-- Status is state, never deletion: revoked/expired rows stay readable as
-- history. Agent retrieval predicates (lib/ai/memory.ts) return only
-- status='active' AND (expires_at IS NULL OR expires_at > now).
--
-- Rollback: db/migration_149_agent_memory_rollback.sql (drops policies,
-- indexes, history table, memory table, trigger function; deletes the
-- memory_propose seed rows; base/registry rows untouched).

BEGIN;

-- ── 1. agent_memory: current live facts ─────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  fact_key text NOT NULL CHECK (char_length(fact_key) BETWEEN 1 AND 120),
  fact_value text NOT NULL CHECK (char_length(fact_value) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  source text NOT NULL DEFAULT 'human' CHECK (source IN ('human','system','agent-proposed')),
  proposed_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  proposed_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  proposed_task_id uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, tenant_id, fact_key)
);

COMMENT ON TABLE agent_memory IS 'Stage 12: approved persistent facts. Agents propose via approvals (action=memory_propose); only the server applier and human direct-create write here. NULL tenant = platform (platform-admin only); NULL agent = shared within scope.';
COMMENT ON COLUMN agent_memory.status IS 'Live state only. revoked/expired rows are retained for audit and excluded from agent retrieval.';

CREATE INDEX IF NOT EXISTS idx_agent_memory_scope
  ON agent_memory (tenant_id ASC NULLS FIRST, agent_id ASC NULLS FIRST, status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agent_memory_expiry
  ON agent_memory (expires_at ASC)
  WHERE status = 'active' AND expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION update_agent_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_memory_updated_at ON agent_memory;
CREATE TRIGGER trg_agent_memory_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW EXECUTE FUNCTION update_agent_memory_updated_at();

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members and admins can read scoped memory" ON agent_memory;
CREATE POLICY "Members and admins can read scoped memory"
  ON agent_memory FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- Writes via service-role only (applier + human direct-create action). No
-- INSERT/UPDATE/DELETE policies for authenticated roles by design.

-- ── 2. agent_memory_versions: append-only history ───────────────────────
CREATE TABLE IF NOT EXISTS agent_memory_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id uuid NOT NULL REFERENCES agent_memory(id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),
  fact_value text NOT NULL,
  status text NOT NULL,
  expires_at timestamptz,
  approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
  proposed_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  proposed_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  proposed_task_id uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fact_id, version)
);

COMMENT ON TABLE agent_memory_versions IS 'Stage 12: immutable per-version snapshots. Every accepted mutation inserts one row first. No UPDATE/DELETE policies exist — history is append-only.';

CREATE INDEX IF NOT EXISTS idx_agent_memory_versions_fact
  ON agent_memory_versions (fact_id, version DESC);

ALTER TABLE agent_memory_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members and admins can read memory history" ON agent_memory_versions;
CREATE POLICY "Members and admins can read memory history"
  ON agent_memory_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agent_memory m
      WHERE m.id = agent_memory_versions.fact_id
        AND (
          m.tenant_id IS NULL
          OR m.tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        )
    )
  );

-- ── 3. Tool seed: memory_propose (approval-gated, dylan only) ──────────
-- Mirrors the Stage 10.9 execSmokeNotify precedent: definition row plus a
-- single-agent grant, both conflict-safe. The orchestrator L0 gate
-- intercepts calls (approval_required=true) and creates the
-- action='memory_propose' approval; the executor itself only ever
-- validates and records proposals, never mutates memory.
INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('memory_propose','Propose a durable memory fact for human approval. Calling this tool does not write memory: the platform intercepts the call and creates a pending human-approval request, and nothing is stored until a human approves. Propose operation (CREATE/UPDATE/REVOKE/EXPIRE), scope (platform/shared via allowlisted values only), fact key (max 120 chars) and value (max 4000 chars, never secrets).','{"type":"object","properties":{"op":{"type":"string","enum":["CREATE","UPDATE","REVOKE","EXPIRE"]},"scope":{"type":"string","enum":["own-tenant-shared","own-tenant-self","platform-shared"]},"agent":{"type":"string","enum":["self","shared"]},"fact_key":{"type":"string"},"fact_value":{"type":"string"},"base_version":{"type":"integer"},"expires_at":{"type":"string"},"reason":{"type":"string"}},"required":["op","fact_key"]}'::jsonb,'{}'::jsonb,'transactional','medium',true,'lib/ai/tools/workforce/memory-propose:memoryPropose')
ON CONFLICT (name) DO NOTHING;

INSERT INTO agent_tools (agent_id, tool_name, allowed)
SELECT a.id, t.name, true
FROM agents a CROSS JOIN tool_definitions t
WHERE a.name = 'dylan' AND t.name IN ('memory_propose')
ON CONFLICT (agent_id, tool_name) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
