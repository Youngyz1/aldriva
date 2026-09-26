-- migration_142_agent_runtime.sql
-- Phase 142: Gateway + Orchestrator persistence — tasks, runs, steps, approvals, reports.
-- No background queue in this phase (synchronous L0 only). Approvals enforce L0 boundary.

BEGIN;

-- ── 1. agent_tasks — queued intents (synchronous completion in Phase 142; rows retained for Workforce UI) ──
CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','awaiting_approval','completed','failed','cancelled','expired')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  approval_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_tasks IS 'Workforce tasks. In Phase 142 synchronous gateway creates one task + run per request; future queue will use status=queued + FOR UPDATE SKIP LOCKED leasing.';
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON agent_tasks(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_id ON agent_tasks(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status, created_at DESC);

CREATE OR REPLACE FUNCTION update_agent_tasks_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agent_tasks_updated_at ON agent_tasks;
CREATE TRIGGER trg_agent_tasks_updated_at BEFORE UPDATE ON agent_tasks FOR EACH ROW EXECUTE FUNCTION update_agent_tasks_updated_at();
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read agent tasks" ON agent_tasks;
CREATE POLICY "Authenticated can read agent tasks" ON agent_tasks FOR SELECT USING (auth.role() = 'authenticated');

-- ── 2. approvals — human gates for high/critical risk ──────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 200),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  proposed_outcome jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  audit_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE approvals IS 'Human approval gates. Application-enforced: orchestrator must not execute high/critical tools without approved row. Model instructions are never authoritative.';
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approvals_tenant_id ON approvals(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_agent_id ON approvals(requested_by_agent_id, created_at DESC);
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read approvals" ON approvals;
CREATE POLICY "Authenticated can read approvals" ON approvals FOR SELECT USING (auth.role() = 'authenticated');

-- ── 3. agent_runs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  triggered_by text NOT NULL CHECK (triggered_by IN ('manual','schedule','webhook','incident','qa','cron','telegram','gateway')),
  model_used text,
  provider_used text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','awaiting_approval','completed','failed','cancelled')),
  guard_result text NOT NULL DEFAULT 'pass' CHECK (guard_result IN ('pass','flagged','rejected')),
  duration_ms int CHECK (duration_ms IS NULL OR duration_ms >= 0),
  approval_id uuid REFERENCES approvals(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

COMMENT ON TABLE agent_runs IS 'One execution attempt per task/gateway call. Stores provider/model/guard_result/duration/error for Workforce UI and audit.';
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON agent_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_id ON agent_runs(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read agent runs" ON agent_runs;
CREATE POLICY "Authenticated can read agent runs" ON agent_runs FOR SELECT USING (auth.role() = 'authenticated');

-- ── 4. agent_steps ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq int NOT NULL CHECK (seq >= 0),
  kind text NOT NULL CHECK (kind IN ('thought','tool_call','tool_result','model_output','guard_verdict','approval_request','knowledge_retrieval','error')),
  tool_name text,
  args_redacted jsonb,
  result_summary text, -- short snippet; full result via ai_tool_invocations when tool_result
  content text,
  guard_verdict text CHECK (guard_verdict IS NULL OR guard_verdict IN ('pass','flagged','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

COMMENT ON TABLE agent_steps IS 'Steps within a run. args_redacted via redactArgs(); never stores secrets. Result linkage via ai_tool_invocations when tool_result.';
CREATE INDEX IF NOT EXISTS idx_agent_steps_run_id ON agent_steps(run_id, seq);
ALTER TABLE agent_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read agent steps" ON agent_steps;
CREATE POLICY "Authenticated can read agent steps" ON agent_steps FOR SELECT USING (auth.role() = 'authenticated');

-- ── 5. agent_reports — structured run summaries ────────────────────────
CREATE TABLE IF NOT EXISTS agent_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE SET NULL,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  report_type text NOT NULL DEFAULT 'task' CHECK (report_type IN ('task','incident','daily','weekly','investigation')),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 5000),
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_reports IS 'Structured run reports. sections JSONB contains what_happened, investigation, findings, evidence, actions, remaining, needs_from_human, next_steps.';
CREATE INDEX IF NOT EXISTS idx_agent_reports_agent_id ON agent_reports(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reports_tenant_id ON agent_reports(tenant_id, created_at DESC);
ALTER TABLE agent_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read agent reports" ON agent_reports;
CREATE POLICY "Authenticated can read agent reports" ON agent_reports FOR SELECT USING (auth.role() = 'authenticated');

-- ── 6. Wire agent_tasks.approval_id FK after approvals exists ─────────
-- (approval_id on agent_tasks is loose uuid until this; now constrain via trigger-less check)
-- Keep as loose FK via application — no extra constraint needed; the join is via agent_runs.approval_id.

COMMIT;

NOTIFY pgrst, 'reload schema';
