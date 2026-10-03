-- migration_146_background_execution.sql
-- Stage 10.1: durable generic background-execution state (ADDITIVE ONLY).
--
-- The discovery audit (docs/STAGE-10-BACKGROUND-EXECUTION-DISCOVERY.md §§6,18)
-- determined the existing schema cannot support durable execution: no lease
-- owner/expiry/heartbeat, no attempt count, no job-level idempotency UNIQUE,
-- no run-after/delay, no result pointer, and no claim-safe index anywhere
-- outside the QA-scoped qa_runs columns. This migration adds exactly those
-- fields to the existing workforce runtime tables. It creates NO new table:
-- agent_tasks already carries agent/tenant/payload/priority/tenant-RLS and
-- agent_runs is already the attempt record (task_id + approval_id FKs) — a
-- parallel job table would duplicate identity columns and split RLS/audit.
--
-- Status vocabulary: REUSED, not extended. agent_tasks.status already spans
-- queued/running/awaiting_approval/completed/failed/cancelled/expired.
-- Stage 10 maps: queued (pending incl. retryable when attempt_count>0 and
-- run_after is future), running (claimed), completed (succeeded),
-- failed (terminal), cancelled/expired/awaiting_approval (unchanged
-- semantics). Interrupted = derived (running + lease expired), never stored.
--
-- Deliberately NOT done here (documented, not forgotten):
--  * agent_tasks.approval_id stays LOOSE (no FK): live orphans are UNVERIFIED
--    and a tighten could fail on production rows. Binding is enforced in app
--    code (lib/exec/binding.ts) instead.
--  * RLS untouched: authenticated SELECT-only preserved; worker writes stay
--    service-role via server routes (existing trust boundary).
--  * No worker DB identity: worker auth is HTTP-layer split tokens
--    (EXEC_WORKER_TOKEN + per-claim token, QA two-layer precedent).
--
-- Rollback: db/migration_146_background_execution_rollback.sql (drops indexes,
-- constraints, columns in reverse order; data in new columns is discarded,
-- base rows untouched).

BEGIN;

-- ── 1. agent_tasks: lease + idempotency + attempt + delay + result ──
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS run_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_ref TEXT;

COMMENT ON COLUMN agent_tasks.idempotency_key IS 'Stage 10: enqueue dedupe. Same key returns the existing job, never a second row (qa_runs precedent). NULL = no dedupe requested.';
COMMENT ON COLUMN agent_tasks.lease_owner IS 'Stage 10: worker identity string that holds the lease (e.g. gha:<run_id>, manual:<user-id>). Text, not FK: no worker identity table exists by design.';
COMMENT ON COLUMN agent_tasks.lease_expires_at IS 'Stage 10: lease TTL. running + expired lease = interrupted/reclaimable (derived, never a stored status).';
COMMENT ON COLUMN agent_tasks.last_heartbeat_at IS 'Stage 10: worker renewal marker. Only the lease owner may renew (enforced in app, not RLS).';
COMMENT ON COLUMN agent_tasks.claim_token_hash IS 'Stage 10: SHA-256 of the single-use per-claim token (QA two-layer precedent). NULL when unclaimed or consumed. Never the plaintext.';
COMMENT ON COLUMN agent_tasks.attempt_count IS 'Stage 10: attempts started. attempt_count>0 + queued + future run_after = retryable.';
COMMENT ON COLUMN agent_tasks.max_attempts IS 'Stage 10: bounded retries. Budget exhaustion = terminal failed.';
COMMENT ON COLUMN agent_tasks.run_after IS 'Stage 10: delayed visibility (backoff). NULL = immediately claimable.';
COMMENT ON COLUMN agent_tasks.result_ref IS 'Stage 10: pointer to the result artifact/report. Free text like approvals.audit_ref.';

-- Enqueue dedupe (NULLs distinct: only set keys enforce uniqueness).
ALTER TABLE agent_tasks
  ADD CONSTRAINT uq_agent_tasks_idempotency UNIQUE (idempotency_key);

-- Claim poll: status=queued AND (run_after IS NULL OR run_after<=now)
-- ORDER BY run_after NULLS FIRST, created_at LIMIT n FOR UPDATE SKIP LOCKED.
CREATE INDEX IF NOT EXISTS idx_agent_tasks_claim
  ON agent_tasks (run_after ASC NULLS FIRST, created_at ASC)
  WHERE status = 'queued';

-- Stale-lease recovery scan.
CREATE INDEX IF NOT EXISTS idx_agent_tasks_lease
  ON agent_tasks (lease_expires_at ASC)
  WHERE lease_expires_at IS NOT NULL;

-- ── 2. agent_runs: numbered attempts ──
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS attempt_no INT CHECK (attempt_no IS NULL OR attempt_no >= 1);

COMMENT ON COLUMN agent_runs.attempt_no IS 'Stage 10: 1-based attempt number within the task. NULL = legacy pre-Stage-10 row.';

-- Concurrency-safe attempt creation (NULLs distinct: legacy rows unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_runs_task_attempt
  ON agent_runs (task_id, attempt_no);

-- ── 3. Approved-poll index (generic claim reads approvals the way
-- lib/qa/claim.ts does for request_qa_run; the pending-only index never helped) ──
CREATE INDEX IF NOT EXISTS idx_approvals_approved_poll
  ON approvals (action, expires_at ASC, created_at ASC)
  WHERE status = 'approved' AND audit_ref IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
