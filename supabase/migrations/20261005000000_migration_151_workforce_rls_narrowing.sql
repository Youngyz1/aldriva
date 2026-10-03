-- migration_151_workforce_rls_narrowing.sql
-- Stage 15 (pass one): narrow over-broad SELECT policies (ADDITIVE NARROWING ONLY).
--
-- Which policies changed and why:
--  S-1: agents / agent_versions / agent_tools / tool_definitions were readable by
--       ANY authenticated user (incl. system_prompt snapshots). Now admin-only.
--       All session-client readers are admin Workforce pages (Phase A audit);
--       gateway/orchestrator/exec read via service-role, unaffected.
--  S-2: knowledge_document_versions was any-auth with no tenant/status gate.
--       Now gated through the parent document's visibility (approved +
--       platform/member/admin, admins all) via EXISTS — the migration_149
--       agent_memory_versions precedent.
--  S-4: agent_tasks / approvals / agent_runs / agent_reports were any-auth with
--       tenant_id ignored. Now admin OR tenant member (the migration_143
--       system_events/incidents reference pattern). agent_steps inherits scope
--       via parent agent_runs (run_id), like memory versions do.
--       approvals.evidence embeds a raw args slice at write time — narrowing
--       the read surface contains it.
--  S-8: knowledge_chunks had a tenant/member/admin gate but no status check,
--       so deprecated-document chunks stayed readable. Non-admin reads now
--       additionally require the parent document status='approved'. Admins
--       keep full visibility (admin review pages list deprecated docs).
--  S-14 (qa hardening): qa_runs was any-auth; qa_test_results scoped only by
--       known run_id. qa_runs is now admin-only. claim_token_hash (plus
--       claim_expires_at, idempotency_key, metadata) is additionally hidden
--       from anon/authenticated via column-level GRANT — the migration_55
--       doctrine (RLS restricts ROWS, never COLUMNS). Admin UI selects explicit
--       column lists (lib/workforce/qa.ts QA_RUN_COLS) that exclude the secrets;
--       service-role readers (ingest route, lib/qa) bypass grants, unaffected.
--       qa_test_results inherits scope via parent qa_runs (run_id).
--
-- Rules kept: SELECT narrowing only — no INSERT/UPDATE/DELETE policies added.
-- Platform rows (NULL tenant) remain readable by admins. Service-role paths
-- are unaffected. Transactional + idempotent (IF EXISTS / IF NOT EXISTS).
--
-- Rollback: db/migration_151_workforce_rls_narrowing_rollback.sql restores the
-- exact prior policies and grants.

BEGIN;

-- ── S-1: registry catalog tables → admin only ──────────────────────────────

DROP POLICY IF EXISTS "Authenticated can read agents" ON agents;
CREATE POLICY "Admins can read agents"
  ON agents FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Authenticated can read agent versions" ON agent_versions;
CREATE POLICY "Admins can read agent versions"
  ON agent_versions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Authenticated can read agent tools" ON agent_tools;
CREATE POLICY "Admins can read agent tools"
  ON agent_tools FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Authenticated can read tool definitions" ON tool_definitions;
CREATE POLICY "Admins can read tool definitions"
  ON tool_definitions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ── S-4: runtime tables → admin OR tenant member (143 pattern) ─────────────

DROP POLICY IF EXISTS "Authenticated can read agent tasks" ON agent_tasks;
CREATE POLICY "Admins and tenant members can read agent tasks"
  ON agent_tasks FOR SELECT
  USING (
    (tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'))
    OR (tenant_id IS NOT NULL AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Authenticated can read approvals" ON approvals;
CREATE POLICY "Admins and tenant members can read approvals"
  ON approvals FOR SELECT
  USING (
    (tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'))
    OR (tenant_id IS NOT NULL AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Authenticated can read agent runs" ON agent_runs;
CREATE POLICY "Admins and tenant members can read agent runs"
  ON agent_runs FOR SELECT
  USING (
    (tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'))
    OR (tenant_id IS NOT NULL AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Authenticated can read agent reports" ON agent_reports;
CREATE POLICY "Admins and tenant members can read agent reports"
  ON agent_reports FOR SELECT
  USING (
    (tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'))
    OR (tenant_id IS NOT NULL AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- S-4: agent_steps inherits scope via parent agent_runs (149 precedent).
DROP POLICY IF EXISTS "Authenticated can read agent steps" ON agent_steps;
CREATE POLICY "Admins and tenant members can read agent steps"
  ON agent_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agent_runs r
      WHERE r.id = agent_steps.run_id
        AND (
          (r.tenant_id IS NULL AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'))
          OR (r.tenant_id IS NOT NULL AND is_entity_member(r.tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer']))
          OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        )
    )
  );

-- ── S-2: versions gated through parent document visibility ─────────────────

DROP POLICY IF EXISTS "Authenticated can read knowledge versions" ON knowledge_document_versions;
CREATE POLICY "Admins and scoped readers can read knowledge versions"
  ON knowledge_document_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_documents d
      WHERE d.id = knowledge_document_versions.document_id
        AND (
          (d.status = 'approved' AND (
            d.tenant_id IS NULL
            OR d.tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id = auth.uid())
            OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
          ))
          OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
        )
    )
  );

-- ── S-8: chunks require parent status='approved' for non-admins ────────────

DROP POLICY IF EXISTS "Authenticated can read chunks" ON knowledge_chunks;
CREATE POLICY "Admins and scoped readers can read approved chunks"
  ON knowledge_chunks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    OR (
      (
        knowledge_chunks.tenant_id IS NULL
        OR knowledge_chunks.tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id = auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM knowledge_documents d
        WHERE d.id = knowledge_chunks.document_id AND d.status = 'approved'
      )
    )
  );

-- ── S-14: qa_runs admin-only + secret columns hidden from anon/auth ────────

DROP POLICY IF EXISTS "Authenticated can read qa runs" ON qa_runs;
CREATE POLICY "Admins can read qa runs"
  ON qa_runs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- Column-level GRANT (migration_55 doctrine): RLS restricts ROWS, never
-- COLUMNS. Service-role readers bypass grants, so ingest/claim flows are
-- unaffected. Admin UI selects explicit lists (QA_RUN_COLS) covered below.
REVOKE SELECT ON qa_runs FROM anon, authenticated;
GRANT SELECT (
  id, suite, environment, target_tenant_id, commit_sha, triggered_by,
  requested_by_agent_id, approval_id, status, passed, failed, skipped,
  external_run_id, artifact_base_url, error, started_at, finished_at,
  claimed_at, created_at
) ON qa_runs TO anon, authenticated;

-- qa_test_results inherits scope via parent qa_runs (149 precedent).
DROP POLICY IF EXISTS "Authenticated can read qa test results" ON qa_test_results;
CREATE POLICY "Admins can read qa test results"
  ON qa_test_results FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
    AND EXISTS (SELECT 1 FROM qa_runs q WHERE q.id = qa_test_results.run_id)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
