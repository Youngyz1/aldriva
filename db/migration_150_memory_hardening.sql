-- migration_150_memory_hardening.sql
-- Stage 13: Agent Memory Hardening (ADDITIVE ONLY; F-3 retention untouched).
--
-- F-1 NULL uniqueness: the base UNIQUE(agent_id, tenant_id, fact_key) does
-- not constrain NULLs, so three partial unique indexes cover the scopes
-- containing NULLs (agent-specific tenant rows with all columns set stay
-- covered by the base constraint). A pre-check DO block fails loudly with
-- duplicate counts instead of allowing a cryptic index failure or silently
-- merging rows — reconciliation would need a business decision, never an
-- automatic merge/delete.
--
-- F-2 atomicity: apply_agent_memory() performs approval verification, fact
-- write, history insert, and approval stamp inside ONE transaction. Any
-- failure rolls back everything: a fact can never commit without its
-- history. Concurrent CREATEs collide on the F-1 indexes (unique_violation
-- → clean conflict, no partial state).
--
-- F-4 append-only history: reject_agent_memory_versions_mutation() blocks
-- UPDATE and DELETE on agent_memory_versions for ALL roles (triggers fire
-- regardless of RLS/service role). INSERT stays open for the applier path.
--
-- F-5 audit kind: agent_steps.kind CHECK extended additively with
-- 'memory_retrieval' (migration_145 qa_failure precedent). Existing rows
-- necessarily satisfy the old set, a subset of the new one.
--
-- Rollback: db/migration_150_memory_hardening_rollback.sql. Caveat (same
-- class as migration_145): purge 'memory_retrieval' steps before restoring
-- the kind CHECK; forward-fix only once real runs exist.

BEGIN;

-- ── 0. Duplicate guard: fail loudly, never merge/delete ────────────────
DO $$
DECLARE
  v_platform int;
  v_tenant   int;
  v_agent    int;
BEGIN
  SELECT COUNT(*) INTO v_platform FROM (
    SELECT fact_key FROM agent_memory
    WHERE agent_id IS NULL AND tenant_id IS NULL
    GROUP BY fact_key HAVING COUNT(*) > 1
  ) d;
  SELECT COUNT(*) INTO v_tenant FROM (
    SELECT tenant_id, fact_key FROM agent_memory
    WHERE agent_id IS NULL AND tenant_id IS NOT NULL
    GROUP BY tenant_id, fact_key HAVING COUNT(*) > 1
  ) d;
  SELECT COUNT(*) INTO v_agent FROM (
    SELECT agent_id, fact_key FROM agent_memory
    WHERE agent_id IS NOT NULL AND tenant_id IS NULL
    GROUP BY agent_id, fact_key HAVING COUNT(*) > 1
  ) d;
  IF v_platform + v_tenant + v_agent > 0 THEN
    RAISE EXCEPTION 'migration_150 blocked: duplicate logical memory facts exist (platform %, tenant %, agent %); reconcile manually, never auto-merge',
      v_platform, v_tenant, v_agent;
  END IF;
END $$;

-- ── F-1: partial unique indexes (base UNIQUE keeps all-non-null rows) ───
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_memory_platform
  ON agent_memory (fact_key) WHERE agent_id IS NULL AND tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_memory_tenant
  ON agent_memory (tenant_id, fact_key) WHERE agent_id IS NULL AND tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_memory_agent_platform
  ON agent_memory (agent_id, fact_key) WHERE agent_id IS NOT NULL AND tenant_id IS NULL;

-- ── F-2: atomic apply RPC (service-role only, check_rate_limit precedent) ─
CREATE OR REPLACE FUNCTION apply_agent_memory(
  p_approval_id      uuid,
  p_require_approval boolean,
  p_op               text,
  p_tenant_id        uuid,
  p_agent_id         uuid,
  p_fact_key         text,
  p_fact_value       text,
  p_next_status      text,
  p_expires_at       timestamptz,
  p_source           text,
  p_proposer_agent   uuid,
  p_run_id           uuid,
  p_task_id          uuid,
  p_approver         uuid,
  p_now              timestamptz,
  p_expected_version integer
)
RETURNS TABLE (applied boolean, fact_id uuid, version integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action     text;
  v_status     text;
  v_audit      text;
  v_fact_id    uuid;
  v_cur_ver    integer;
  v_cur_status text;
  v_updated    integer;
  v_stamped    integer;
BEGIN
  -- Fail-closed parameter validation (mirrors app-side validation).
  IF p_op NOT IN ('CREATE','UPDATE','REVOKE','EXPIRE') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad op'; RETURN;
  END IF;
  IF p_next_status NOT IN ('active','revoked','expired') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad status'; RETURN;
  END IF;
  IF p_source NOT IN ('human','system','agent-proposed') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad source'; RETURN;
  END IF;
  IF char_length(p_fact_key) NOT BETWEEN 1 AND 120 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad key'; RETURN;
  END IF;
  IF (p_op = 'CREATE' OR p_op = 'UPDATE') AND (p_fact_value IS NULL OR char_length(p_fact_value) NOT BETWEEN 1 AND 4000) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad value'; RETURN;
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'bad version'; RETURN;
  END IF;

  -- 1. Approval gate (locked): approved memory_propose, unclaimed.
  -- An already-stamped approval is a benign re-entry: report the fact it
  -- produced (via the approval_id linkage) instead of re-applying.
  -- Anything else non-null means a previous decision stands: do not touch.
  IF p_require_approval THEN
    SELECT a.action, a.status, a.audit_ref INTO v_action, v_status, v_audit
    FROM approvals a WHERE a.id = p_approval_id FOR UPDATE;
    IF NOT FOUND OR v_action <> 'memory_propose' OR v_status <> 'approved' THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'not appliable'; RETURN;
    END IF;
    IF v_audit IS NOT NULL AND v_audit <> 'exec-invalid-envelope' THEN
      IF v_audit LIKE 'memory:applied:%' THEN
        SELECT m.id, m.version INTO v_fact_id, v_cur_ver
        FROM agent_memory m WHERE m.approval_id = p_approval_id
        ORDER BY m.version DESC LIMIT 1;
        IF FOUND THEN
          RETURN QUERY SELECT true, v_fact_id, v_cur_ver, 'already applied'; RETURN;
        END IF;
        RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'already applied (fact missing)'; RETURN;
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'previously decided'; RETURN;
    END IF;
  END IF;

  -- Conflict helper: stamp once (conditional) so pollers never re-spin.
  -- Inline at each site (plpgsql has no local procedures pre-14... kept
  -- explicit for clarity).

  -- 2. Resolve current fact (locked; NULL-safe identity match).
  SELECT m.id, m.version, m.status INTO v_fact_id, v_cur_ver, v_cur_status
  FROM agent_memory m
  WHERE m.fact_key = p_fact_key
    AND m.tenant_id IS NOT DISTINCT FROM p_tenant_id
    AND m.agent_id IS NOT DISTINCT FROM p_agent_id
  FOR UPDATE;

  -- 3. Fact write (version-guarded; CREATE collides on F-1 indexes).
  IF p_op = 'CREATE' THEN
    IF FOUND THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'fact already exists'; RETURN;
    END IF;
    IF p_expected_version <> 0 THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'CREATE requires base 0'; RETURN;
    END IF;
    BEGIN
      INSERT INTO agent_memory
        (tenant_id, agent_id, fact_key, fact_value, status, version, source,
         proposed_by_agent_id, proposed_run_id, proposed_task_id,
         approved_by, approved_at, approval_id, effective_at, expires_at)
      VALUES
        (p_tenant_id, p_agent_id, p_fact_key, p_fact_value, 'active', 1, p_source,
         p_proposer_agent, p_run_id, p_task_id,
         p_approver, p_now, p_approval_id, p_now, p_expires_at)
      RETURNING id INTO v_fact_id;
    EXCEPTION WHEN unique_violation THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'duplicate fact (race)'; RETURN;
    END;
    v_cur_ver := 1;
  ELSE
    IF NOT FOUND THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'no current fact'; RETURN;
    END IF;
    IF v_cur_ver <> p_expected_version THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'stale base version'; RETURN;
    END IF;
    UPDATE agent_memory SET
      fact_value  = COALESCE(p_fact_value, fact_value),
      status      = p_next_status,
      version     = v_cur_ver + 1,
      expires_at  = p_expires_at,
      approval_id = COALESCE(p_approval_id, approval_id),
      effective_at = p_now
    WHERE id = v_fact_id AND version = v_cur_ver;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      IF p_require_approval THEN
        UPDATE approvals SET audit_ref = 'memory-version-conflict'
        WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
      END IF;
      RETURN QUERY SELECT false, NULL::uuid, NULL::integer, 'lost version race'; RETURN;
    END IF;
    v_cur_ver := v_cur_ver + 1;
  END IF;

  -- 4. History (same transaction — failure rolls back the fact write).
  INSERT INTO agent_memory_versions
    (fact_id, version, fact_value, status, expires_at, approval_id,
     proposed_by_agent_id, proposed_run_id, proposed_task_id,
     approved_by, approved_at)
  SELECT v_fact_id, v_cur_ver, fact_value, status, expires_at, p_approval_id,
         p_proposer_agent, p_run_id, p_task_id, p_approver, p_now
  FROM agent_memory WHERE id = v_fact_id;

  -- 5. Approval stamp (conditional — a lost race rolls everything back).
  IF p_require_approval THEN
    UPDATE approvals SET audit_ref = 'memory:applied:' || v_fact_id || ':v' || v_cur_ver
    WHERE id = p_approval_id AND (audit_ref IS NULL OR audit_ref = 'exec-invalid-envelope');
    GET DIAGNOSTICS v_stamped = ROW_COUNT;
    IF v_stamped = 0 THEN
      RAISE EXCEPTION 'approval stamp lost race';
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_fact_id, v_cur_ver, 'applied';
END;
$$;

-- Only the service role may call this: it writes memory + history + stamps.
REVOKE ALL ON FUNCTION apply_agent_memory(uuid,boolean,text,uuid,uuid,text,text,text,timestamptz,text,uuid,uuid,uuid,uuid,timestamptz,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_agent_memory(uuid,boolean,text,uuid,uuid,text,text,text,timestamptz,text,uuid,uuid,uuid,uuid,timestamptz,integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_agent_memory(uuid,boolean,text,uuid,uuid,text,text,text,timestamptz,text,uuid,uuid,uuid,uuid,timestamptz,integer) TO service_role;

-- ── F-4: structural append-only history ─────────────────────────────────
CREATE OR REPLACE FUNCTION reject_agent_memory_versions_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'agent_memory_versions is append-only (INSERT only)';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_memory_versions_no_mutation ON agent_memory_versions;
CREATE TRIGGER trg_agent_memory_versions_no_mutation
  BEFORE UPDATE OR DELETE ON agent_memory_versions
  FOR EACH ROW EXECUTE FUNCTION reject_agent_memory_versions_mutation();

-- ── F-5: memory_retrieval step kind (additive; migration_145 precedent) ──
ALTER TABLE agent_steps DROP CONSTRAINT IF EXISTS agent_steps_kind_check;
ALTER TABLE agent_steps ADD CONSTRAINT agent_steps_kind_check CHECK (kind IN (
  'thought','tool_call','tool_result','model_output','guard_verdict',
  'approval_request','knowledge_retrieval','memory_retrieval','error'));

COMMIT;

NOTIFY pgrst, 'reload schema';
