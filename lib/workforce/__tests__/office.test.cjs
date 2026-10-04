/**
 * Stage 19 — 3D office tests (visualization ONLY, hermetic).
 *
 * Pure view-model behavior + static source scans. The office must never
 * start, approve, edit or mutate anything — every scan below pins that.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename
  );
};

const { buildOfficeSnapshot, buildOfficeScene } = require("../office");

const OFFICE_FILES = [
  "app/admin/workforce/office/page.tsx",
  "app/admin/workforce/office/OfficeView.tsx",
  "app/admin/workforce/office/OfficeScene.tsx",
  "app/admin/workforce/office/OfficeFallback.tsx",
  "lib/workforce/office.ts",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function raw(over = {}) {
  return {
    agents: [
      { id: "a1", name: "dylan", display_name: "Dylan", department: "executive", status: "active" },
      { id: "a2", name: "sentinel", display_name: "Sentinel", department: "reliability", status: "active" },
    ],
    runs: [
      { id: "r1", agent_id: "a1", status: "running", approval_id: null, created_at: "2026-09-30T00:00:00Z", completed_at: null },
      { id: "r2", agent_id: "a2", status: "awaiting_approval", approval_id: "ap-1", created_at: "2026-09-30T00:00:00Z", completed_at: null },
    ],
    tasks: [
      { id: "t1", agent_id: "a1", title: "x".repeat(200), status: "running", created_at: "2026-09-30T00:00:00Z" },
    ],
    approvals: [{ id: "ap-1", status: "pending" }],
    reports: [], incidents: [{ id: "i1" }], events: [],
    qaRunCount: 0,
    decidedApprovalIds: [],
    ...over,
  };
}

// ── view-model mapping ──────────────────────────────────────────────────────

test("presence mapping: running=busy, awaiting=marker, idle=seated", () => {
  const snap = buildOfficeSnapshot(raw());
  assert.equal(snap.agents.find((a) => a.id === "a1").presence, "busy");
  assert.equal(snap.agents.find((a) => a.id === "a2").presence, "awaiting");
});

test("decided approval turns awaiting into neutral (stale)", () => {
  const snap = buildOfficeSnapshot(raw({ decidedApprovalIds: ["ap-1"] }));
  assert.equal(snap.agents.find((a) => a.id === "a2").presence, "neutral");
});

test("unknown status maps to neutral, never invented activity", () => {
  const snap = buildOfficeSnapshot(raw({ runs: [{ id: "r9", agent_id: "a1", status: "dreaming", approval_id: null, created_at: "2026-09-30T00:00:00Z", completed_at: null }] }));
  assert.equal(snap.agents.find((a) => a.id === "a1").presence, "neutral");
});

test("scene: poses, markers, reliability annex only with open incidents", () => {
  const scene = buildOfficeScene(buildOfficeSnapshot(raw()));
  const desks = Object.fromEntries(scene.rooms.flatMap((r) => r.desks.map((d) => [d.agentId, d])));
  assert.equal(desks["a1"].pose, "working");
  assert.equal(desks["a2"].marker, "awaiting");
  assert.ok(scene.rooms.some((r) => r.department === "reliability" && r.alertLight), "alert annex present");
  const calm = buildOfficeScene(buildOfficeSnapshot(raw({ incidents: [] })));
  assert.ok(!calm.rooms.some((r) => r.alertLight), "no annex without incidents");
  assert.ok(calm.rooms.some((r) => r.department === "reliability"), "registry reliability room still mapped");
});

test("a new registry agent gets a desk automatically (no hardcoded names)", () => {
  const base = raw();
  base.agents.push({ id: "a9", name: "newbot", display_name: "Newbot", department: "field-ops", status: "active" });
  const scene = buildOfficeScene(buildOfficeSnapshot(base));
  const room = scene.rooms.find((r) => r.department === "field-ops");
  assert.ok(room, "room derived from registry department");
  assert.ok(room.desks.some((d) => d.agentId === "a9"), "desk assigned");
  for (const f of OFFICE_FILES) {
    const src = read(f);
    assert.ok(!src.includes("dylan") && !src.includes("sentinel") && !src.includes("newbot"), `${f} hardcodes no agent name`);
  }
});

// ── snapshot hygiene ────────────────────────────────────────────────────────

test("snapshot carries ids/names/roles/labels/counts only; titles trimmed", () => {
  const snap = buildOfficeSnapshot(raw());
  const blob = JSON.stringify(snap);
  for (const banned of ["prompt", "tool_args", "evidence", "token", "tenant_id", "secret", "proposed_outcome"]) {
    assert.ok(!blob.toLowerCase().includes(banned), `snapshot must not contain ${banned}`);
  }
  const dylan = snap.agents.find((a) => a.id === "a1");
  assert.equal(dylan.currentTaskTitle.length, 80, "titles trimmed to 80 chars");
  assert.equal(snap.openIncidents, 1);
  assert.equal(snap.pendingApprovals, 1);
});

// ── page gate ordering ──────────────────────────────────────────────────────

test("office page calls requireAdmin() before any data access", () => {
  const src = read("app/admin/workforce/office/page.tsx");
  const gate = src.indexOf("await requireAdmin()");
  assert.ok(gate !== -1, "page must call requireAdmin()");
  for (const marker of ["createSupabaseServer()", "fetchCommandCenterData(", "buildOfficeSnapshot("]) {
    const at = src.indexOf(marker);
    if (at !== -1) assert.ok(gate < at, `requireAdmin() must precede ${marker}`);
  }
});

// ── static prohibitions ─────────────────────────────────────────────────────

test("office files: no service-role, no network, no eval, no writes, no external URLs", () => {
  const offenders = [];
  for (const f of OFFICE_FILES) {
    const src = read(f);
    const checks = [
      ["createSupabaseAdmin", "service-role"],
      ["fetch(", "fetch"],
      ["XMLHttpRequest", "XHR"],
      ["WebSocket", "websocket"],
      ["eval(", "eval"],
      ["new Function", "new-Function"],
      ["dangerouslySetInnerHTML", "dangerous-html"],
      [".insert(", "db-insert"],
      [".update(", "db-update"],
      [".upsert(", "db-upsert"],
      [".delete(", "db-delete"],
      [".rpc(", "db-rpc"],
      ["https://", "external-url"],
      ["http://", "external-url"],
    ];
    for (const [pattern, label] of checks) {
      if (src.includes(pattern)) offenders.push(`${f} [${label}]`);
    }
  }
  assert.deepEqual(offenders, [], `office prohibitions violated:\n${offenders.join("\n")}`);
});

test("three.js imported only in the imperative scene file (no react-three-fiber)", () => {
  for (const f of OFFICE_FILES) {
    const src = read(f);
    const hasThreeImport = /^import\s+.*\bthree\b/m.test(src) || /from\s+['"]three['"]/.test(src) || /require\(['"]three['"]\)/.test(src);
    assert.ok(!/(import|from|require\()\s*['"]@react-three\/fiber['"]/.test(src), `${f} must not import react-three-fiber (global JSX typing breaks unrelated components)`);
    if (f.endsWith("OfficeScene.tsx")) {
      assert.ok(hasThreeImport, "scene must import three");
    } else {
      assert.ok(!hasThreeImport, `${f} must not import three`);
    }
  }
});

test("no file in the repo imports @react-three/fiber", () => {
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
        const src = fs.readFileSync(full, "utf8");
        if (/(import|from|require\()\s*['"]@react-three\/fiber['"]/.test(src)) offenders.push(path.relative(ROOT, full).split(path.sep).join("/"));
      }
    }
  })(ROOT);
  assert.deepEqual(offenders, [], `fiber imports:\n${offenders.join("\n")}`);
});
