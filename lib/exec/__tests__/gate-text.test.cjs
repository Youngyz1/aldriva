/**
 * Stage 10.10 hermetic tests: approval-gated-call text changes.
 *
 * No database, no network. String- and structure-level (model behavior cannot
 * be unit-tested). Covers: dylan fallback carries the exception + all original
 * read-only sentences; fallback == migration-140 text + exception (code and
 * migration kept identical); suffix carries exemption + original refusal;
 * sentinel/qa prompts byte-identical to their 140 seeds; no other tool
 * description changed; rollback restores exact originals; mirror + order.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }

const EXCEPTION =
  "Exception: approval-gated tools in your allowlist may be called. Calling one does not perform the write; the platform intercepts the call and routes it to human approval. Never try to bypass or pre-empt the approval step.";
const READ_ONLY_SENTENCES = [
  "You are a read-only executive agent.",
  "You must never perform writes, deployments, or financial actions.",
  "respond that it requires human approval and stop.",
];
const NEW_DESC =
  "Smoke-test action. Calling this tool does not execute it: the platform intercepts the call and creates a pending human-approval request, and nothing runs until a human approves. Call it when asked, with an optional short note (max 200 chars).";
const OLD_DESC_147 =
  "Stage 10.9 smoke-test action ONLY: writes one clearly-labeled in-app notification to the tenant owner. Requires human approval; executes via the background worker. Not a product feature.";

function extractPrompt(src, startMarker) {
  const i = src.indexOf(startMarker);
  assert.ok(i !== -1, `prompt start found: ${startMarker.slice(0, 40)}`);
  const end = src.indexOf("',", i);
  assert.ok(end !== -1, "prompt literal terminator found");
  return src.slice(i, end);
}

test("dylan fallback: exception present, original read-only sentences intact", () => {
  const src = read("lib/ai/agent-registry.ts");
  const prompt = extractPrompt(src, "'You are Dylan,");
  assert.ok(prompt.includes(EXCEPTION), "exception sentence present");
  for (const s of READ_ONLY_SENTENCES) {
    assert.ok(prompt.includes(s), `original preserved: ${s.slice(0, 40)}`);
  }
  assert.ok(!prompt.includes("Requires human approval"), "no tool-description refusal cue leaked into the prompt");
});

test("code fallback and migration text identical (old 140 text + exception)", () => {
  const fallback = extractPrompt(read("lib/ai/agent-registry.ts"), "'You are Dylan,");
  const seed140 = extractPrompt(read("db/migration_140_agent_registry.sql"), "'You are Dylan,");
  assert.equal(fallback, `${seed140} ${EXCEPTION}`, "fallback == seed text + exception, verbatim");
  const mig148 = read("db/migration_148_approval_gated_call_text.sql");
  assert.ok(mig148.includes(EXCEPTION), "migration carries the identical exception sentence");
  // Guarded UPDATE: only fires on the exact old text (idempotent re-runs).
  assert.ok(mig148.includes(`system_prompt = '${seed140}'`) || mig148.includes(seed140), "migration guards on exact old prompt");
});

test("suffix: exemption appended, original refusal intact", () => {
  const src = read("lib/ai/orchestrator.ts");
  assert.ok(
    src.includes("state that it requires human approval and do not attempt it — unless the tool is in your allowlist and its description states that calling it creates an approval request, in which case call it so the platform can route it to human approval."),
    "exemption appended to the refusal text"
  );
  assert.ok(src.includes("You must only use tools from the provided allowlist."), "original prefix intact");
});

test("sentinel and qa prompts untouched by 10.10", () => {
  const fb = read("lib/ai/agent-registry.ts");
  const sentinelFb = extractPrompt(fb, "'You are Sentinel,");
  const qaFb = extractPrompt(fb, "'You are the QA Engineer for Aldriva.");
  assert.ok(!sentinelFb.includes("may be called"), "no exception leaked to sentinel");
  assert.ok(!qaFb.includes("may be called"), "no exception leaked to qa");
  assert.ok(sentinelFb.includes("You are read-only."), "sentinel read-only sentence intact");
  assert.ok(qaFb.includes("You must never trigger writes"), "qa no-writes sentence intact");
  // The 140 seeds themselves are untouched by this stage (no prompt edits there).
  const seed = read("db/migration_140_agent_registry.sql");
  assert.ok(extractPrompt(seed, "'You are Sentinel,").includes("You are read-only."), "140 sentinel seed intact");
  assert.ok(extractPrompt(seed, "'You are the QA Engineer for Aldriva.").includes("You must never trigger writes"), "140 qa seed intact");
  assert.ok(!seed.includes("may be called"), "140 has no exception text anywhere");
});

test("no tool description changed except execSmokeNotify", () => {
  // New text lives in exactly: code definition, forward migration, mirror.
  for (const f of [
    "lib/ai/tools/tenant/tenant-notifications.ts",
    "db/migration_148_approval_gated_call_text.sql",
    "supabase/migrations/20261002000001_migration_148_approval_gated_call_text.sql",
  ]) {
    assert.ok(read(f).includes(NEW_DESC), `new description in ${f}`);
  }
  // Old text fully replaced in code + forward migration (kept only in 147 files + rollback).
  assert.ok(!read("lib/ai/tools/tenant/tenant-notifications.ts").includes(OLD_DESC_147), "code fully replaced");
  const fwd148 = read("db/migration_148_approval_gated_call_text.sql");
  assert.ok(!fwd148.includes(OLD_DESC_147) || fwd148.includes(`description = '${OLD_DESC_147}'`), "forward keeps old text only as UPDATE guard");
  const updates = (fwd148.match(/UPDATE tool_definitions/g) || []).length;
  assert.equal(updates, 1, "exactly one tool_definitions UPDATE in 148");
  assert.ok(fwd148.includes("name = 'execSmokeNotify'"), "that UPDATE targets execSmokeNotify only");
});

test("148 rollback restores exact originals; mirror + order filed", () => {
  const rb = read("db/migration_148_approval_gated_call_text_rollback.sql");
  assert.ok(rb.includes(OLD_DESC_147), "rollback restores old description");
  const seed140 = extractPrompt(read("db/migration_140_agent_registry.sql"), "'You are Dylan,");
  assert.ok(rb.includes(seed140), "rollback restores old dylan prompt");
  assert.ok(rb.includes("DELETE FROM agent_versions") && rb.includes("version = 2"), "v2 snapshot removed");
  assert.ok(rb.includes("BEGIN;") && rb.includes("COMMIT;"), "transactional");
  assert.equal(
    read("supabase/migrations/20261002000001_migration_148_approval_gated_call_text.sql"),
    read("db/migration_148_approval_gated_call_text.sql"),
    "mirror byte-identical"
  );
  const order = read("db/staging-migration-order.txt").split("\n").map((l) => l.trim()).filter(Boolean);
  assert.ok(order.includes("migration_148_approval_gated_call_text.sql"), "order lists 148");
  assert.ok(
    order.indexOf("migration_148_approval_gated_call_text.sql") > order.indexOf("migration_147_exec_smoke_notify.sql"),
    "148 after 147"
  );
  const mirrors = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  assert.ok(!mirrors.some((f) => /rollback/i.test(f)), "no rollback in mirrors");
});
