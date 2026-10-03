/**
 * Stage 16 (B1e) — agent configuration is manageable by nobody at runtime.
 *
 * Authorization by absence: no code path outside migrations and seeds writes
 * to agents, agent_versions, agent_tools or tool_definitions, and no route
 * or server action exists to manage them. Writes happen only in db/ seeds
 * (reviewed, versioned SQL); the application is read-only by construction.
 * Static source evidence — hermetic.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const CONFIG_TABLES = ["agents", "agent_versions", "agent_tools", "tool_definitions"];

function runtimeFiles() {
  const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "components"))];
  return files.filter(
    (f) => !f.includes("__tests__") && !f.includes("/helpers/") && !f.endsWith(".test.cjs") && !f.endsWith(".test.ts")
  );
}

test("no runtime code writes to agent-config tables", () => {
  const offenders = [];
  for (const f of runtimeFiles()) {
    const src = fs.readFileSync(f, "utf8");
    for (const t of CONFIG_TABLES) {
      const writes = [
        `.from('${t}').insert`, `.from("${t}").insert`,
        `.from('${t}').update`, `.from("${t}").update`,
        `.from('${t}').upsert`, `.from("${t}").upsert`,
        `.from('${t}').delete`, `.from("${t}").delete`,
      ];
      for (const w of writes) {
        if (src.includes(w)) offenders.push(`${path.relative(ROOT, f)}: ${w}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `runtime writes to agent-config tables:\n${offenders.join("\n")}`);
});

test("writes to agent-config tables exist only in db/ migrations and seeds", () => {
  const offenders = [];
  for (const f of runtimeFiles()) {
    const src = fs.readFileSync(f, "utf8");
    for (const t of CONFIG_TABLES) {
      const re = new RegExp(`INSERT INTO ${t}\\b`, "i");
      if (re.test(src)) offenders.push(`${path.relative(ROOT, f)}: INSERT INTO ${t}`);
    }
  }
  assert.deepEqual(offenders, [], `non-migration INSERTs into agent-config tables:\n${offenders.join("\n")}`);
  // And the migrations that do seed are the known, reviewed set.
  const seeders = [];
  const dbFiles = [];
  (function walkSql(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkSql(full);
      else if (full.endsWith(".sql")) dbFiles.push(full);
    }
  })(path.join(ROOT, "db"));
  for (const f of dbFiles) {
    if (f.includes("rollback")) continue;
    const src = fs.readFileSync(f, "utf8");
    for (const t of CONFIG_TABLES) {
      if (new RegExp(`INSERT INTO ${t}\\b`, "i").test(src)) seeders.push(`${path.basename(f)} → ${t}`);
    }
  }
  assert.ok(seeders.length > 0, "seed migrations must exist and be enumerable");
  for (const s of seeders) {
    assert.ok(/^migration_1(3[9]|4[0-9]|50)_/.test(s), `unexpected seeder outside 139-150: ${s}`);
  }
});

test("no route or server action manages agent config", () => {
  const offenders = [];
  const routes = walk(path.join(ROOT, "app", "api")).filter((f) => f.endsWith("route.ts"));
  const actions = walk(path.join(ROOT, "lib", "actions")).filter(
    (f) => f.endsWith(".ts") && !f.includes("__tests__")
  );
  for (const f of [...routes, ...actions]) {
    const src = fs.readFileSync(f, "utf8");
    for (const t of CONFIG_TABLES) {
      if (src.includes(`from('${t}')`) || src.includes(`from("${t}")`)) {
        offenders.push(`${path.relative(ROOT, f)} reads ${t}`);
      }
    }
  }
  // Reads allowed ONLY where pinned below (admin UI detail + gateway registry
  // + orchestrator/exec gates, all service-role or admin-gated). Anything
  // else — especially a manage (write) surface — fails this test.
  const PINNED_READERS = [
    "lib/workforce/agents.ts",
    "lib/actions/workforce-memory.ts",
    "lib/ai/agent-registry.ts",
    "lib/ai/orchestrator.ts",
    "app/api/ai/gateway/route.ts",
    "app/api/exec/run/route.ts",
  ];
  const unpinned = offenders
    .map((o) => o.split(path.sep).join("/"))
    .filter((o) => !PINNED_READERS.some((p) => o.startsWith(p + " ") || o.startsWith(p + ":")));
  assert.deepEqual(unpinned, [], `unpinned agent-config readers (possible manage surface):\n${unpinned.join("\n")}`);
});
