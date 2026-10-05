/**
 * Stage 18 — no autonomous production actions (guardrails, no runtime changes).
 *
 * Prohibited: autonomous production deployment, autonomous DB migration,
 * arbitrary shell execution, arbitrary filesystem access, autonomous
 * financial transactions, unrestricted infrastructure control. Agents stay L0.
 *
 * Static source-evidence tests (studio-boundary precedent): forbidden
 * imports/APIs absent from agent-reachable paths; env reads allowlisted;
 * financial tables never written from agent paths; autonomy never raised.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["lib/ai", "lib/exec", "lib/qa", "lib/workforce", "app/api/ai", "app/api/exec", "app/api/qa", "app/api/cron"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function runtimeFiles() {
  const out = [];
  for (const d of DIRS) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs, out);
  }
  // Tests assert on source; they must not match their own patterns.
  return out.filter((f) => !f.includes("__tests__") && !/\.test\.(cjs|ts)$/.test(f));
}

function scan(patterns) {
  const hits = [];
  for (const f of runtimeFiles()) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const [re, label] of patterns) {
        if (re.test(line)) hits.push(`${path.relative(ROOT, f).split(path.sep).join("/")}:${i + 1} [${label}] ${line.trim().slice(0, 120)}`);
      }
    });
  }
  return hits;
}

// ── 1. Forbidden imports and APIs ───────────────────────────────────────────

test("no shell, filesystem-write, eval, deploy, payment-write or DDL APIs in agent paths", () => {
  const hits = scan([
    [/\bchild_process\b/, "child_process"],
    [/\b(execSync|execFile(Sync)?|spawnSync|fork)\b/, "process-spawn"],
    [/spawn\s*\(/, "spawn("],
    [/fs\.(writeFile|appendFile|mkdir|createWriteStream|rm|rmdir|unlink)|writeFileSync/, "fs-write"],
    [/\beval\s*\(/, "eval"],
    [/new Function\s*\(/, "new-Function"],
    [/api\.vercel\.com|@vercel\/|VERCEL_TOKEN/, "vercel-api"],
    [/api\.github\.com|octokit|GITHUB_TOKEN/, "github-api"],
    [/stripe\.|paymentIntents|NOWPayments/, "payment-api"],
    [/\b(payouts|charges|refunds)\b\s*\(/, "payment-write-call"],
    [/CREATE TABLE|DROP TABLE|ALTER TABLE/, "runtime-ddl"],
    [/VERCEL_TOKEN|DEPLOY_|FLY_|RENDER_|NETLIFY|AWS_|CLOUDFLARE_TOKEN/, "infra-token"],
    [/\.github\//, ".github-write"],
  ]);
  // Pinned benign occurrence: workflow-path constant with a never-dispatch
  // header (github-actions-provider.ts:9-13). Anything else is a violation.
  const unpinned = hits.filter((h) => !h.includes("lib/qa/github-actions-provider.ts:27"));
  assert.deepEqual(unpinned, [], `forbidden API hits:\n${unpinned.join("\n")}`);
});

// ── 2. Env reads allowlisted ────────────────────────────────────────────────

const REVIEWED_ENV = new Set([
  "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "EXEC_WORKER_TOKEN", "EXEC_WORKER_TOKEN_PREV", "QA_INGEST_TOKEN", "QA_INGEST_TOKEN_PREV",
  "AI_PROVIDER_DEFAULT", "GEMINI_API_KEY", "GEMINI_MODEL", "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL", "NEXT_PUBLIC_BASE_URL", "TAVILY_API_KEY", "BRAVE_TAVILY_API_KEY",
  "SEARCH_PROVIDER",
]);

test("no deploy, infra or payment-write env vars read in agent paths", () => {
  const found = new Set();
  for (const f of runtimeFiles()) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z_0-9]+)/g)) found.add(m[1]);
  }
  const unreviewed = [...found].filter((v) => !REVIEWED_ENV.has(v));
  assert.deepEqual(unreviewed, [], `unreviewed env reads:\n${unreviewed.join("\n")}`);
});

// ── 3. Financial tables never written from agent paths ─────────────────────

const FINANCIAL_TABLES = [
  "payments", "payouts", "donations", "ticket_orders", "product_orders",
  "orders", "charges", "refunds", "subscriptions", "invoices",
];

test("no tool executor writes to financial tables", () => {
  const offenders = [];
  for (const f of runtimeFiles()) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/\.(insert|update|upsert|delete)\s*\(/.test(line)) {
        const window = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
        for (const t of FINANCIAL_TABLES) {
          if (window.includes(`from('${t}')`) || window.includes(`from("${t}")`)) {
            offenders.push(`${path.relative(ROOT, f)}:${i + 1} writes ${t}`);
          }
        }
      }
    });
  }
  assert.deepEqual(offenders, [], `financial writes:\n${offenders.join("\n")}`);
});

test("agent-path writes limited to the reviewed table set", () => {
  const REVIEWED_WRITES = new Set([
    "agent_runs", "agent_tasks", "agent_steps", "agent_reports", "approvals",
    "ai_guard_rejections", "ai_tool_invocations", "ai_content_calendar",
    "qa_runs", "qa_test_results", // Stage 7 worker plane (claim/ingest), reviewed
    "studio_chat_conversations", "studio_chat_messages", // Stage 22 chat threads (admin owner RLS, display text only), reviewed
    // Cron/operator plane (not agent-reachable executors), reviewed per route:
    "ai_content_items", // daily-post, promotion-engine
    "event_invitations", // invitation-retention
    "profiles", // purge-accounts (suspension only)
    "incidents", // sentinel-sweep run stamp (O-3)
  ]);
  const offenders = [];
  for (const f of runtimeFiles()) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/\.(insert|update|upsert|delete)\s*\(/.test(line)) {
        const window = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
        const tables = [...window.matchAll(/\.from\(['"](\w+)['"]\)/g)].map((m) => m[1]);
        for (const t of tables) {
          if (!REVIEWED_WRITES.has(t)) offenders.push(`${path.relative(ROOT, f)}:${i + 1} writes unreviewed table ${t}`);
        }
      }
    });
  }
  assert.deepEqual(offenders, [], `unreviewed writes:\n${offenders.join("\n")}`);
});

// ── 4. Exec dispatch accepts only registry tools ────────────────────────────

test("exec dispatch routes only through the tool registry", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/exec/dispatch.ts"), "utf8");
  assert.ok(src.includes("executeAITool") || src.includes("executeTenantTool"), "dispatch uses registry executors");
  const imports = [...src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"](\.\.\/ai\/tools\/[^'"]+)['"]/g)];
  const valueImports = imports
    .filter((m) => !/\btype\b/.test(m[1]))
    .map((m) => `import ${m[1].trim().split("\n").pop()} from '${m[2]}'`);
  assert.deepEqual(valueImports, [], `dispatch imports no tool module directly:\n${valueImports.join("\n")}`);
});

// ── 5. Registry invariants: L0, snapshot, grant confinement ────────────────

const EXPECTED_TOOLS = [
  "createNotification", "execSmokeNotify", "fetch_rss_feed", "fetch_url_summary",
  "get_active_fundraisers", "get_active_incidents", "get_available_products",
  "get_content_history", "get_featured_businesses", "get_guard_rejections",
  "get_recent_articles", "get_recent_events", "get_recent_webhook_failures",
  "get_upcoming_events", "getDonationStatus", "getEvent", "getFundraiser",
  "getPaymentStatus", "getProduct", "getProductAvailability", "getProductOrderStatus",
  "getTicketAvailability", "getTicketOrderStatus", "memory_propose", "notifyOwner",
  "request_qa_run", "search_trends", "searchEvents", "searchFundraisers", "searchProducts",
].sort();

test("agent-reachable tool set equals the reviewed 30-tool snapshot", () => {
  const names = [];
  for (const f of runtimeFiles()) {
    if (!f.includes(`${path.sep}tools${path.sep}`) && !f.includes("lib/ai/tools-registry.ts")) continue;
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/name:\s*'([^']+)'/g)) names.push(m[1]);
  }
  assert.deepEqual([...new Set(names)].sort(), EXPECTED_TOOLS, "tool set drifted — review the boundary");
});

test("every seeded agent is L0", () => {
  const mig = fs.readFileSync(path.join(ROOT, "db/migration_140_agent_registry.sql"), "utf8");
  const seeds = [...mig.matchAll(/'(dylan|sentinel|qa)'[^;]*?'(L\d)'/g)].map((m) => m[2]);
  assert.ok(seeds.length === 3, `expected 3 seeded agents, saw ${seeds.length}`);
  for (const l of seeds) assert.equal(l, "L0", "seeded agent must be L0");
});

test("write-capable tools are granted to almost nobody", () => {
  const seeds = ["db/migration_140_agent_registry.sql", "db/migration_147_exec_smoke_notify.sql", "db/migration_149_agent_memory.sql"]
    .map((p) => fs.readFileSync(path.join(ROOT, p), "utf8")).join("\n");
  // createNotification / notifyOwner appear in NO agent grant.
  assert.ok(!/a\.name = '(dylan|sentinel|qa)'[^;]*createNotification/s.test(seeds), "createNotification granted to nobody");
  assert.ok(!/a\.name = '(dylan|sentinel|qa)'[^;]*notifyOwner/s.test(seeds), "notifyOwner granted to nobody");
  // execSmokeNotify: dylan only; memory_propose: dylan only; request_qa_run: qa only.
  assert.ok(seeds.includes("execSmokeNotify"), "smoke tool seeded");
  assert.ok(seeds.includes("memory_propose"), "memory tool seeded");
  assert.ok(seeds.includes("request_qa_run"), "qa tool seeded");
});

test("fallback allowlist contains no write-capable tool", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/ai/agent-registry.ts"), "utf8");
  const start = src.indexOf("FALLBACK");
  const block = start === -1 ? src : src.slice(start, start + 4000);
  for (const w of ["createNotification", "notifyOwner", "execSmokeNotify", "request_qa_run", "memory_propose"]) {
    assert.ok(!block.includes(w), `fallback must not offer ${w}`);
  }
});

// ── 6. Autonomy invariant: L0 can never be raised ───────────────────────────

test("no code path raises an agent above L0", () => {
  const offenders = [];
  for (const f of runtimeFiles()) {
    const src = fs.readFileSync(f, "utf8");
    if (/\.from\(['"]agents['"]\)[\s\S]{0,200}\.(insert|update|upsert)\s*\(/.test(src)) {
      offenders.push(`${path.relative(ROOT, f)} writes agents`);
    }
    if (/'L[1-4]'/.test(src)) offenders.push(`${path.relative(ROOT, f)} mentions L1-L4`);
  }
  assert.deepEqual(offenders, [], `autonomy escalation paths:\n${offenders.join("\n")}`);
  const approvals = fs.readFileSync(path.join(ROOT, "lib/ai/approvals.ts"), "utf8");
  assert.ok(approvals.includes("autonomyLevel === 'L0'") || approvals.includes("autonomy_level"), "L0 gate present");
});
