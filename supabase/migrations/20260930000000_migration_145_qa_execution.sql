-- migration_145_qa_execution.sql
-- Stage 7: QA execution plane persistence (control-plane tables only).
-- The worker (GitHub Actions, external) never touches the DB directly: all
-- writes go through the poll/claim + ingest routes with the two-layer token
-- design (see docs/STAGE-7-QA-EXECUTION-DESIGN.md + addendum A2).
--
-- Contents:
--  1) qa_runs — one row per requested/approved/executed QA run.
--  2) qa_test_results — one row per test case within a run.
--  3) Additive 'qa_failure' system_events kind for the existing incident
--     pipeline (verified absent from the 9-value CHECK in migration_143).
--  4) Per-run claim token hash + expiry columns (addendum A2).
--
-- Rollback: db/migration_145_qa_execution_rollback.sql. Caveats (in the
-- rollback header, not here): purge qa_failure events before restoring the
-- kind CHECK; forward-fix only once real runs exist.

BEGIN;

-- ── 1. qa_runs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite TEXT NOT NULL CHECK (suite IN ('smoke','auth','payments')),
  environment TEXT NOT NULL CHECK (environment IN ('staging')),
  target_tenant_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
  commit_sha TEXT CHECK (commit_sha IS NULL OR commit_sha ~ '^[0-9a-f]{7,40}$'),
  triggered_by TEXT NOT NULL DEFAULT 'schedule'
    CHECK (triggered_by IN ('schedule','manual','qa','incident')),
  requested_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES approvals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','running','passed','failed','cancelled','expired')),
  idempotency_key UUID NOT NULL UNIQUE,
  passed INT NOT NULL DEFAULT 0 CHECK (passed >= 0),
  failed INT NOT NULL DEFAULT 0 CHECK (failed >= 0),
  skipped INT NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  external_run_id TEXT,
  artifact_base_url TEXT,
  error TEXT CHECK (error IS NULL OR char_length(error) <= 2000),
  claim_token_hash TEXT,
  claim_expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qa_runs_terminal_needs_finish CHECK (
    status NOT IN ('passed','failed','cancelled','expired') OR finished_at IS NOT NULL)
);

COMMENT ON TABLE qa_runs IS 'QA execution-plane runs. Rows are created by request_qa_run (control plane) or the approve path; the external worker only transitions them via poll/claim + ingest. claim_token_hash stores SHA-256 of the single-use per-run claim token (addendum A2). metadata carries worker identity notes and shadow-mode would-be emission records (addendum A3).';
COMMENT ON COLUMN qa_runs.environment IS 'Closed enum: staging only. Production is structurally unrepresentable.';

CREATE INDEX IF NOT EXISTS idx_qa_runs_claim ON qa_runs(status, created_at)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_qa_runs_suite_created ON qa_runs(suite, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_runs_idempotency ON qa_runs(idempotency_key);

-- ── 2. qa_test_results ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  file TEXT NOT NULL CHECK (char_length(file) BETWEEN 1 AND 300),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped','flaky')),
  duration_ms INT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error TEXT CHECK (error IS NULL OR char_length(error) <= 2000),
  screenshot_url TEXT,
  trace_url TEXT,
  logs_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qa_results_unique_test UNIQUE (run_id, file, name)
);

COMMENT ON TABLE qa_test_results IS 'Per-test outcomes within a qa_runs row. Natural key (run_id, file, name) makes worker re-POSTs idempotent.';

CREATE INDEX IF NOT EXISTS idx_qa_results_run ON qa_test_results(run_id);

-- ── 3. qa_failure kind (additive; verified absent in migration_143) ──
ALTER TABLE system_events DROP CONSTRAINT IF EXISTS system_events_kind_check;
ALTER TABLE system_events ADD CONSTRAINT system_events_kind_check CHECK (kind IN (
  'api_error','job_error','webhook_error','payment_reconciliation','auth_failure',
  'storage_error','guard_rejection','approval_block','agent_tool_error','qa_failure'));

-- ── 4. RLS: authenticated reads; service-role writes only ────────────
ALTER TABLE qa_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read qa runs" ON qa_runs;
CREATE POLICY "Authenticated can read qa runs"
  ON qa_runs FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE qa_test_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read qa test results" ON qa_test_results;
CREATE POLICY "Authenticated can read qa test results"
  ON qa_test_results FOR SELECT USING (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policies: writes are service-role only, via the
-- poll/claim + ingest routes. Same posture as agent_tasks/approvals.

-- ── 5. request_qa_run tool definition + QA agent ACL ─────────────────
-- Transactional/medium/approval_required: L0 QA can only ever trigger the
-- approval gate with this tool (never execute). The external worker
-- consumes the approved approvals row via poll-and-claim; see
-- lib/ai/tools/qa/request-qa-run.ts and lib/qa/claim.ts.
INSERT INTO tool_definitions (name, description, input_schema, output_schema, scope, risk, approval_required, executor_ref) VALUES
('request_qa_run','Proposes a QA test-suite run on staging. Records a human approval request only — never executes tests. Approved in Workforce Approvals before any worker acts.','{"type":"object","properties":{"suite":{"type":"string"},"environment":{"type":"string"},"tenantId":{"type":"string"},"commitSha":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["suite","environment","idempotencyKey"]}'::jsonb,'{}'::jsonb,'transactional','medium',true,'lib/ai/tools/qa/request-qa-run:requestQaRun')
ON CONFLICT (name) DO NOTHING;

INSERT INTO agent_tools (agent_id, tool_name, allowed)
SELECT a.id, t.name, true
FROM agents a CROSS JOIN tool_definitions t
WHERE a.name = 'qa' AND t.name IN ('request_qa_run')
ON CONFLICT (agent_id, tool_name) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
