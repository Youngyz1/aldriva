-- migration_151_workforce_rls_narrowing_rollback.sql
-- Stage 15 rollback: restores the exact prior SELECT policies and grants
-- replaced by migration_151_workforce_rls_narrowing.sql, dependency-safe
-- order (child policies first, then parents, then grants).
-- Re-applying this rollback re-opens the S-1/S-2/S-4/S-8/S-14 read surface.

BEGIN;

-- Child scoped policies back to broad reads.
DROP POLICY IF EXISTS "Admins can read qa test results" ON qa_test_results;
CREATE POLICY "Authenticated can read qa test results"
  ON qa_test_results FOR SELECT USING (auth.role() = 'authenticated');

-- Restore full-column SELECT on qa_runs (re-opens claim_token_hash etc.).
REVOKE SELECT ON qa_runs FROM anon, authenticated;
GRANT SELECT ON qa_runs TO anon, authenticated;

DROP POLICY IF EXISTS "Admins can read qa runs" ON qa_runs;
CREATE POLICY "Authenticated can read qa runs"
  ON qa_runs FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and scoped readers can read approved chunks" ON knowledge_chunks;
CREATE POLICY "Authenticated can read chunks"
  ON knowledge_chunks FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Admins and scoped readers can read knowledge versions" ON knowledge_document_versions;
CREATE POLICY "Authenticated can read knowledge versions"
  ON knowledge_document_versions FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and tenant members can read agent steps" ON agent_steps;
CREATE POLICY "Authenticated can read agent steps" ON agent_steps FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and tenant members can read agent reports" ON agent_reports;
CREATE POLICY "Authenticated can read agent reports" ON agent_reports FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and tenant members can read agent runs" ON agent_runs;
CREATE POLICY "Authenticated can read agent runs" ON agent_runs FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and tenant members can read approvals" ON approvals;
CREATE POLICY "Authenticated can read approvals" ON approvals FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and tenant members can read agent tasks" ON agent_tasks;
CREATE POLICY "Authenticated can read agent tasks" ON agent_tasks FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can read tool definitions" ON tool_definitions;
CREATE POLICY "Authenticated can read tool definitions"
  ON tool_definitions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can read agent tools" ON agent_tools;
CREATE POLICY "Authenticated can read agent tools"
  ON agent_tools FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can read agent versions" ON agent_versions;
CREATE POLICY "Authenticated can read agent versions"
  ON agent_versions FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can read agents" ON agents;
CREATE POLICY "Authenticated can read agents"
  ON agents FOR SELECT
  USING (auth.role() = 'authenticated');

COMMIT;

NOTIFY pgrst, 'reload schema';
