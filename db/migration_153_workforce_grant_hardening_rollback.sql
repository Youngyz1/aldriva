-- migration_153_workforce_grant_hardening_rollback.sql
-- Stage 23 rollback: restores the pre-153 Supabase-default table grants
-- (GRANT ALL to anon and authenticated) on the 19 Workforce tables, plus
-- 151's qa_runs column grant for exactness. RLS policies, tables, indexes,
-- functions and data are untouched — grants only, like the forward file.
-- EMERGENCY USE ONLY: re-opens the anon/authenticated table-level surface
-- that 153 closes.

BEGIN;

GRANT ALL ON TABLE tool_definitions TO anon, authenticated;
GRANT ALL ON TABLE agents TO anon, authenticated;
GRANT ALL ON TABLE agent_versions TO anon, authenticated;
GRANT ALL ON TABLE agent_tools TO anon, authenticated;
GRANT ALL ON TABLE knowledge_documents TO anon, authenticated;
GRANT ALL ON TABLE knowledge_document_versions TO anon, authenticated;
GRANT ALL ON TABLE knowledge_chunks TO anon, authenticated;
GRANT ALL ON TABLE agent_tasks TO anon, authenticated;
GRANT ALL ON TABLE approvals TO anon, authenticated;
GRANT ALL ON TABLE agent_runs TO anon, authenticated;
GRANT ALL ON TABLE agent_steps TO anon, authenticated;
GRANT ALL ON TABLE agent_reports TO anon, authenticated;
GRANT ALL ON TABLE system_events TO anon, authenticated;
GRANT ALL ON TABLE incidents TO anon, authenticated;
GRANT ALL ON TABLE incident_events TO anon, authenticated;
GRANT ALL ON TABLE qa_runs TO anon, authenticated;
GRANT SELECT (
  id, suite, environment, target_tenant_id, commit_sha, triggered_by,
  requested_by_agent_id, approval_id, status, passed, failed, skipped,
  external_run_id, artifact_base_url, error, started_at, finished_at,
  claimed_at, created_at
) ON qa_runs TO anon, authenticated;
GRANT ALL ON TABLE qa_test_results TO anon, authenticated;
GRANT ALL ON TABLE agent_memory TO anon, authenticated;
GRANT ALL ON TABLE agent_memory_versions TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
