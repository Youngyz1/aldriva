/**
 * scripts/verify-staging-db.cjs — Stage 16 real-database verification.
 *
 * RUN BY A HUMAN ONLY (the agent never runs this: no credentials exist for
 * it). Reads STAGING_DATABASE_URL only. Refuses to run when unset or when
 * the URL contains the production project ref. Never prints the URL,
 * passwords or keys. Every check runs inside BEGIN ... ROLLBACK — the script
 * never commits. Prints PASS/FAIL/SKIP per check, exits non-zero on any FAIL.
 *
 * Usage: STAGING_DATABASE_URL='postgresql://...' npm run verify:staging-db
 * (NEVER commit or paste the URL anywhere.)
 */
const { Client } = require("pg");

const PROD_REF = "hkvjdtbhiycqqhgelymr";

function refusalReason(url) {
  if (!url) return "STAGING_DATABASE_URL is not set.";
  if (url.includes(PROD_REF)) return "Refusing: URL looks like the production database.";
  return null;
}

const RESULTS = [];
function record(status, name, detail) {
  RESULTS.push({ status, name, detail: detail ?? "" });
  console.log(`${status}: ${name}${detail ? ` — ${detail}` : ""}`);
}
const pass = (n, d) => record("PASS", n, d);
const fail = (n, d) => record("FAIL", n, d);
const skip = (n, d) => record("SKIP", n, d);

async function inTxn(client, name, fn) {
  await client.query("BEGIN");
  try {
    await fn();
  } catch (e) {
    fail(name, `unexpected harness error: ${e.message}`);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function expectError(client, sql, params, match, name) {
  try {
    await client.query(sql, params);
    fail(name, "statement succeeded, expected rejection");
  } catch (e) {
    if (match && !match.test(e.message)) fail(name, `wrong error: ${e.message.slice(0, 160)}`);
    else pass(name);
  }
}

async function main() {
  const url = process.env.STAGING_DATABASE_URL;
  const refusal = refusalReason(url);
  if (refusal) {
    console.error(`REFUSED: ${refusal}`);
    process.exit(2);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // ── 1. SELECT-only policies on the 13 Workforce tables ────────────────
    await inTxn(client, "policies-select-only", async () => {
      const tables = [
        "agents", "agent_versions", "agent_tools", "tool_definitions",
        "agent_tasks", "approvals", "agent_runs", "agent_steps", "agent_reports",
        "knowledge_document_versions", "knowledge_chunks", "qa_runs", "qa_test_results",
      ];
      const { rows } = await client.query(
        "SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = ANY($1) AND cmd <> 'SELECT'",
        [tables]
      );
      if (rows.length === 0) pass("policies-select-only", "13 tables, no write policies");
      else fail("policies-select-only", JSON.stringify(rows).slice(0, 300));
    });

    // ── 2. Non-admin sees 0 rows in agents / agent_runs / approvals ───────
    await inTxn(client, "nonadmin-zero-rows", async () => {
      try {
        await client.query("SET LOCAL ROLE anon");
      } catch (e) {
        skip("nonadmin-zero-rows", `cannot SET ROLE anon: ${e.message.slice(0, 120)}`);
        return;
      }
      for (const t of ["agents", "agent_runs", "approvals"]) {
        const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
        if (rows[0].n === 0) pass(`nonadmin-zero-rows:${t}`, "0 rows as anon");
        else fail(`nonadmin-zero-rows:${t}`, `saw ${rows[0].n} rows as anon`);
      }
    });

    // ── 3. Column privileges on qa_runs.claim_token_hash ──────────────────
    await inTxn(client, "column-privileges", async () => {
      const checks = [
        ["anon", "claim_token_hash", false],
        ["authenticated", "claim_token_hash", false],
        ["anon", "id", true],
        ["authenticated", "id", true],
      ];
      for (const [role, col, want] of checks) {
        const { rows } = await client.query(
          "SELECT has_column_privilege($1, 'qa_runs', $2, 'SELECT') AS ok", [role, col]
        );
        if (rows[0].ok === want) pass(`column-privileges:${role}.${col}=${want}`);
        else fail(`column-privileges:${role}.${col}`, `expected ${want}`);
      }
    });

    // ── 4. Partial unique indexes reject duplicates (self-contained) ──────
    await inTxn(client, "partial-uniques", async () => {
      const agent = await client.query("SELECT id FROM agents LIMIT 1");
      const org = await client.query("SELECT id FROM organizers LIMIT 1");
      if (agent.rows.length === 0) {
        skip("partial-uniques", "no agents row to anchor fixtures");
        return;
      }
      const aid = agent.rows[0].id;
      const tid = org.rows.length ? org.rows[0].id : null;
      // Platform scope (NULL agent, NULL tenant).
      await client.query(
        "INSERT INTO agent_memory (agent_id, tenant_id, fact_key, fact_value) VALUES (NULL, NULL, 'stage16-probe-platform', 'v1')"
      );
      await expectError(
        client,
        "INSERT INTO agent_memory (agent_id, tenant_id, fact_key, fact_value) VALUES (NULL, NULL, 'stage16-probe-platform', 'v1')",
        [], /duplicate|unique/i, "partial-uniques:platform"
      );
      // Agent-on-platform scope.
      await client.query(
        "INSERT INTO agent_memory (agent_id, tenant_id, fact_key, fact_value) VALUES ($1, NULL, 'stage16-probe-agent', 'v1')",
        [aid]
      );
      await expectError(
        client,
        "INSERT INTO agent_memory (agent_id, tenant_id, fact_key, fact_value) VALUES ($1, NULL, 'stage16-probe-agent', 'v1')",
        [aid], /duplicate|unique/i, "partial-uniques:agent-platform"
      );
      // Tenant scope (shared per agent incl. NULL agent).
      if (!tid) {
        skip("partial-uniques:tenant", "no organizers row to anchor tenant fixture");
        return;
      }
      await client.query(
        "INSERT INTO agent_memory (agent_id, tenant_id, fact_key, fact_value) VALUES (NULL, $1, 'stage16-probe-tenant', 'v1')",
        [tid]
      );
      await expectError(
        client,
        "INSERT INTO agent_memory (agent_id, tenant_id, fact_key, fact_value) VALUES (NULL, $1, 'stage16-probe-tenant', 'v1')",
        [tid], /duplicate|unique/i, "partial-uniques:tenant"
      );
    });

    // ── 5. Versions append-only: UPDATE + DELETE rejected ─────────────────
    await inTxn(client, "versions-append-only", async () => {
      const m = await client.query(
        "INSERT INTO agent_memory (fact_key, fact_value) VALUES ('stage16-probe-ver', 'v1') RETURNING id"
      );
      const fid = m.rows[0].id;
      await client.query(
        "INSERT INTO agent_memory_versions (fact_id, version, fact_value, status) VALUES ($1, 1, 'v1', 'active')",
        [fid]
      );
      await expectError(
        client, "UPDATE agent_memory_versions SET fact_value='v2' WHERE fact_id=$1", [fid],
        /append-only/i, "versions-append-only:update"
      );
      await expectError(
        client, "DELETE FROM agent_memory_versions WHERE fact_id=$1", [fid],
        /append-only/i, "versions-append-only:delete"
      );
    });

    // ── 6. RPC not executable by anon/authenticated ───────────────────────
    await inTxn(client, "rpc-lockdown", async () => {
      for (const role of ["anon", "authenticated"]) {
        const { rows } = await client.query(
          "SELECT has_function_privilege($1, oid, 'EXECUTE') AS ok FROM pg_proc WHERE proname = 'apply_agent_memory'",
          [role]
        );
        if (rows.length === 0) {
          fail(`rpc-lockdown:${role}`, "function apply_agent_memory not found");
        } else if (rows.every((r) => r.ok === false)) {
          pass(`rpc-lockdown:${role}`, "EXECUTE denied");
        } else {
          fail(`rpc-lockdown:${role}`, "EXECUTE granted");
        }
      }
    });

    // ── 7. memory_retrieval in the agent_steps kind CHECK ─────────────────
    await inTxn(client, "steps-kind-check", async () => {
      const { rows } = await client.query(
        "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='agent_steps'::regclass AND contype='c'"
      );
      const hit = rows.some((r) => r.def.includes("memory_retrieval"));
      if (hit) pass("steps-kind-check", "memory_retrieval present");
      else fail("steps-kind-check", rows.map((r) => r.def).join(" | ").slice(0, 300));
    });

    // ── 8. Tenant-member isolation (needs existing fixtures) ──────────────
    await inTxn(client, "member-isolation", async () => {
      const scoped = await client.query(
        "SELECT id, tenant_id FROM approvals WHERE tenant_id IS NOT NULL LIMIT 20"
      );
      if (scoped.rows.length === 0) {
        skip("member-isolation", "no tenant-scoped approvals on staging to distinguish");
        return;
      }
      const tenantA = scoped.rows[0].tenant_id;
      const member = await client.query(
        "SELECT em.user_id FROM entity_members em JOIN profiles p ON p.id = em.user_id " +
        "WHERE em.organizer_id = $1 AND (p.role IS NULL OR p.role <> 'admin') LIMIT 1",
        [tenantA]
      );
      const tenantB = await client.query(
        "SELECT id FROM organizers WHERE id <> $1 LIMIT 1", [tenantA]
      );
      if (member.rows.length === 0 || tenantB.rows.length === 0) {
        skip("member-isolation", "no non-admin member of tenant A or no second tenant");
        return;
      }
      try {
        await client.query("SET LOCAL ROLE authenticated");
        await client.query("SET LOCAL \"request.jwt.claim.sub\" TO '" + member.rows[0].user_id + "'");
      } catch (e) {
        skip("member-isolation", `cannot assume member role: ${e.message.slice(0, 120)}`);
        return;
      }
      const seenA = await client.query("SELECT count(*)::int AS n FROM approvals WHERE tenant_id = $1", [tenantA]);
      const seenB = await client.query("SELECT count(*)::int AS n FROM approvals WHERE tenant_id = $1", [tenantB.rows[0].id]);
      if (seenB.rows[0].n === 0 && seenA.rows[0].n >= 0) {
        pass("member-isolation", `member sees A (${seenA.rows[0].n}), sees 0 of B`);
      } else {
        fail("member-isolation", `cross-tenant leak: B rows visible = ${seenB.rows[0].n}`);
      }
    });
  } finally {
    await client.end();
  }

  const fails = RESULTS.filter((r) => r.status === "FAIL").length;
  const skips = RESULTS.filter((r) => r.status === "SKIP").length;
  console.log(`\nDone: ${RESULTS.length} checks, ${fails} FAIL, ${skips} SKIP.`);
  process.exit(fails === 0 ? 0 : 1);
}

module.exports = { refusalReason, PROD_REF };

if (require.main === module) {
  main().catch((e) => {
    console.error(`FATAL: ${e.message}`);
    process.exit(1);
  });
}
