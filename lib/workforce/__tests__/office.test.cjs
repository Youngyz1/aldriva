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
const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
// Boundary stub: the scene's router usage never executes in these tests.
require.cache[require.resolve("next/navigation")] = {
  exports: { useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "" },
};
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    filename
  );
};
require.extensions[".tsx"] = require.extensions[".ts"];

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

const {
  animationFor,
  boundsCorners,
  describeRoomMeshes,
  fitDistance,
  sceneBounds,
} = require("../office");

// ── headless click-picking (real three math, no WebGL) ──────────────────────

test("pickAgentAt: projected figure center hits, empty space misses", () => {
  const THREE = require("three");
  const { pickAgentAt } = require("../../../app/admin/workforce/office/OfficeScene.tsx");
  const camera = new THREE.PerspectiveCamera(45, 800 / 420, 0.1, 400);
  camera.position.set(14, 11, 14);
  camera.lookAt(6, 0, 0);
  camera.updateMatrixWorld();
  const parent = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  body.position.set(0, 1, 0);
  body.userData.agentId = "agent-7";
  parent.add(body);
  const decoy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  decoy.position.set(30, 1, 0);
  parent.add(decoy);
  parent.updateMatrixWorld(true);
  const rect = { left: 0, top: 0, width: 800, height: 420 };
  // Project the body center to client coords, then pick there.
  const ndc = body.position.clone().project(camera);
  const cx = ((ndc.x + 1) / 2) * rect.width;
  const cy = ((1 - ndc.y) / 2) * rect.height;
  assert.equal(pickAgentAt(cx, cy, rect, camera, [body, decoy]), "agent-7", "center hit resolves the agent");
  assert.equal(pickAgentAt(799, 419, rect, camera, [body, decoy]), null, "empty corner misses");
  assert.equal(pickAgentAt(cx, cy, { left: 0, top: 0, width: 0, height: 0 }, camera, [body]), null, "zero rect misses");
});

// ── Pass 2: grid, fit, animation, budget ────────────────────────────────────

function pass2Raw(departments, opts = {}) {
  const agents = departments.map((dep, i) => ({
    id: `a${i}`, name: `bot${i}`, display_name: `Bot${i}`, department: dep, status: "active",
  }));
  return {
    agents,
    runs: agents.map((a) => ({
      id: `r-${a.id}`, agent_id: a.id,
      status: opts.awaiting === a.id ? "awaiting_approval" : opts.running === a.id ? "running" : "completed",
      approval_id: opts.awaiting === a.id ? "ap-1" : null,
      created_at: "2026-09-30T00:00:00Z", completed_at: "2026-09-30T01:00:00Z",
    })),
    tasks: [],
    approvals: [],
    reports: [], incidents: opts.incidents ? [{ id: "i1" }] : [], events: [],
    qaRunCount: 0,
    decidedApprovalIds: [],
  };
}

test("null/empty departments share one deterministic unassigned cell", () => {
  const snap = buildOfficeSnapshot({
    ...pass2Raw([]),
    agents: [
      { id: "a1", name: "x", display_name: "X", department: "", status: "active" },
      { id: "a2", name: "y", display_name: "Y", department: null, status: "active" },
      { id: "a3", name: "z", display_name: "Z", department: "  ", status: "active" },
    ],
  });
  assert.ok(snap.agents.every((a) => a.department === "unassigned"), "all normalized");
  const scene = buildOfficeScene(snap);
  assert.equal(scene.rooms.length, 1, "single shared cell");
  assert.equal(scene.rooms[0].desks.length, 3, "all three seated");
});

test("animation mapping is pure and covers unknown state", () => {
  assert.equal(animationFor("busy"), "typing");
  assert.equal(animationFor("awaiting"), "stand");
  assert.equal(animationFor("idle"), "breathe");
  assert.equal(animationFor("neutral"), "none");
  assert.equal(animationFor("dreaming"), "none", "unknown state never animates");
});

test("fit contains every geometry corner at 1/3/8 rooms, wide and narrow", () => {
  const THREE = require("three");
  const TAN = Math.tan(THREE.MathUtils.degToRad(45 / 2));
  const DIR = new THREE.Vector3(14, 11, 14).normalize();
  const roomSets = [
    ["executive", "executive"],
    ["executive", "reliability", "field-ops"],
    ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"],
  ];
  for (const deps of roomSets) {
    const scene = buildOfficeScene(buildOfficeSnapshot(pass2Raw(deps, { incidents: true, running: "a0", awaiting: "a1" })));
    const b = sceneBounds(scene);
    const target = new THREE.Vector3((b.minX + b.maxX) / 2, 1, 0);
    for (const aspect of [16 / 9, 9 / 16]) {
      const cam = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
      cam.position.copy(target);
      cam.lookAt(target.clone().sub(DIR));
      cam.updateMatrixWorld();
      const vs = boundsCorners(b).map((c) => {
        const v = cam.worldToLocal(new THREE.Vector3(c.x, c.y, c.z));
        return { x: v.x, y: v.y, z: v.z };
      });
      const dist = fitDistance(vs, TAN, aspect);
      cam.position.copy(target).addScaledVector(DIR, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let worst = 0;
      for (const c of boundsCorners(b)) {
        const p = new THREE.Vector3(c.x, c.y, c.z).project(cam);
        worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
      }
      assert.ok(worst <= 0.98, `${deps.length} rooms @${aspect.toFixed(2)} inside frustum (worst ${worst.toFixed(3)})`);
    }
  }
});

test("mesh budget is exact per room shape", () => {
  const scene = buildOfficeScene(buildOfficeSnapshot(pass2Raw(["d1", "d1", "d2"], { incidents: true, awaiting: "a0" })));
  const byDept = Object.fromEntries(scene.rooms.map((r) => [r.department, describeRoomMeshes(r)]));
  // d1: 2 desks (1 awaiting marker) = 8 + 4 + 18 + 2 = 32; d2: 1 desk = 8 + 9 = 17.
  assert.equal(byDept["d1"].meshes, 8 + 4 + 2 * 9 + 2, "two-desk room with marker");
  assert.equal(byDept["d2"].meshes, 8 + 1 * 9, "single-desk room");
  const annex = scene.rooms.find((r) => r.department === "reliability");
  assert.ok(annex && annex.alertLight, "annex lit");
  assert.equal(describeRoomMeshes(annex).meshes, 9, "empty lit annex");
  const total = scene.rooms.reduce((s, r) => s + describeRoomMeshes(r).meshes, 0);
  assert.ok(total < 200, `total stays bounded (${total} here)`);
});

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
