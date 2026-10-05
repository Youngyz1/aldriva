-- migration_153_workforce_grant_hardening.sql
-- Stage 23 (Phase B): table-grant hardening for the Workforce plane.
--
-- Doctrine (migration_129): REVOKE ALL from PUBLIC and anon first, then
-- least-privilege to authenticated; service_role untouched. RLS policies
-- (narrowed by migration_151) remain the row gate; this migration changes
-- GRANTS ONLY — no tables, policies, indexes, functions, views, triggers
-- or data are created, altered or dropped.
--
-- Why: migrations 139-149 created every table below without any GRANT or
-- REVOKE, so each one still carries the Supabase default privileges
-- (GRANT ALL ON TABLES to anon + authenticated — see
-- docs/migration-audit/sql/008_grants.sql). RLS returns zero rows to anon,
-- but the table-level grants should never have survived. Table list is
-- enumerated from SQL: every CREATE TABLE in migrations 139-152, minus the
-- two studio_chat_* tables (migration_152 already revokes first).
--
-- Per-table shape (18 tables): REVOKE ALL FROM PUBLIC, anon; REVOKE ALL
-- FROM authenticated; GRANT SELECT TO authenticated. Writes everywhere on
-- this plane go through the service-role client (orchestrator, exec/qa
-- worker routes, decide/memory actions, model tools); session clients only
-- ever SELECT (Phase A audit) — so authenticated loses nothing it uses.
--
-- qa_runs exception: migration_151 revoked table-level SELECT and re-granted
-- SELECT on 19 non-secret columns only (claim_token_hash and friends stay
-- hidden). Here we revoke table-level privileges only and re-issue 151's
-- exact column list verbatim; qa_runs NEVER gets table-level SELECT back.
-- qa_test_results holds no secret columns (id/run_id/name/file/status/
-- timings/urls only), so it takes the standard SELECT grant.
--
-- ALTER DEFAULT PRIVILEGES is deliberately NOT touched here (separate
-- follow-up proposal): this migration hardens existing tables only.
--
-- Transactional + idempotent (bare REVOKE/GRANT re-run as no-ops).
-- Rollback: db/migration_153_workforce_grant_hardening_rollback.sql
-- restores today's Supabase-default grants (GRANT ALL to anon and
-- authenticated on all 19 tables).

BEGIN;

-- ── 139: tool registry ─────────────────────────────────────────────────

REVOKE ALL ON TABLE tool_definitions FROM PUBLIC, anon;
REVOKE ALL ON TABLE tool_definitions FROM authenticated;
GRANT SELECT ON TABLE tool_definitions TO authenticated;

-- ── 140: agent registry ────────────────────────────────────────────────

REVOKE ALL ON TABLE agents FROM PUBLIC, anon;
REVOKE ALL ON TABLE agents FROM authenticated;
GRANT SELECT ON TABLE agents TO authenticated;

REVOKE ALL ON TABLE agent_versions FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_versions FROM authenticated;
GRANT SELECT ON TABLE agent_versions TO authenticated;

REVOKE ALL ON TABLE agent_tools FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_tools FROM authenticated;
GRANT SELECT ON TABLE agent_tools TO authenticated;

-- ── 141: knowledge foundation ──────────────────────────────────────────

REVOKE ALL ON TABLE knowledge_documents FROM PUBLIC, anon;
REVOKE ALL ON TABLE knowledge_documents FROM authenticated;
GRANT SELECT ON TABLE knowledge_documents TO authenticated;

REVOKE ALL ON TABLE knowledge_document_versions FROM PUBLIC, anon;
REVOKE ALL ON TABLE knowledge_document_versions FROM authenticated;
GRANT SELECT ON TABLE knowledge_document_versions TO authenticated;

REVOKE ALL ON TABLE knowledge_chunks FROM PUBLIC, anon;
REVOKE ALL ON TABLE knowledge_chunks FROM authenticated;
GRANT SELECT ON TABLE knowledge_chunks TO authenticated;

-- ── 142: agent runtime ─────────────────────────────────────────────────

REVOKE ALL ON TABLE agent_tasks FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_tasks FROM authenticated;
GRANT SELECT ON TABLE agent_tasks TO authenticated;

REVOKE ALL ON TABLE approvals FROM PUBLIC, anon;
REVOKE ALL ON TABLE approvals FROM authenticated;
GRANT SELECT ON TABLE approvals TO authenticated;

REVOKE ALL ON TABLE agent_runs FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_runs FROM authenticated;
GRANT SELECT ON TABLE agent_runs TO authenticated;

REVOKE ALL ON TABLE agent_steps FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_steps FROM authenticated;
GRANT SELECT ON TABLE agent_steps TO authenticated;

REVOKE ALL ON TABLE agent_reports FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_reports FROM authenticated;
GRANT SELECT ON TABLE agent_reports TO authenticated;

-- ── 143: sentinel events ───────────────────────────────────────────────

REVOKE ALL ON TABLE system_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE system_events FROM authenticated;
GRANT SELECT ON TABLE system_events TO authenticated;

REVOKE ALL ON TABLE incidents FROM PUBLIC, anon;
REVOKE ALL ON TABLE incidents FROM authenticated;
GRANT SELECT ON TABLE incidents TO authenticated;

REVOKE ALL ON TABLE incident_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE incident_events FROM authenticated;
GRANT SELECT ON TABLE incident_events TO authenticated;

-- ── 145: QA execution ──────────────────────────────────────────────────
-- qa_runs: table-level revoke ONLY, then 151's 19-column grant verbatim.

REVOKE ALL ON TABLE qa_runs FROM PUBLIC, anon;
REVOKE ALL ON TABLE qa_runs FROM authenticated;
GRANT SELECT (
  id, suite, environment, target_tenant_id, commit_sha, triggered_by,
  requested_by_agent_id, approval_id, status, passed, failed, skipped,
  external_run_id, artifact_base_url, error, started_at, finished_at,
  claimed_at, created_at
) ON qa_runs TO anon, authenticated;

REVOKE ALL ON TABLE qa_test_results FROM PUBLIC, anon;
REVOKE ALL ON TABLE qa_test_results FROM authenticated;
GRANT SELECT ON TABLE qa_test_results TO authenticated;

-- ── 149: agent memory ──────────────────────────────────────────────────

REVOKE ALL ON TABLE agent_memory FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_memory FROM authenticated;
GRANT SELECT ON TABLE agent_memory TO authenticated;

REVOKE ALL ON TABLE agent_memory_versions FROM PUBLIC, anon;
REVOKE ALL ON TABLE agent_memory_versions FROM authenticated;
GRANT SELECT ON TABLE agent_memory_versions TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
