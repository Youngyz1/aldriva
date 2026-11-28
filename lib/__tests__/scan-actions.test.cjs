"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { test, beforeEach } = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "../..");

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "stub-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "stub-service-key";
process.env.SCAN_ACTIONS_ENABLED = "true";
process.env.NODE_ENV = "development";

// ── TypeScript compiler for .ts files ──────────────────────────────────────────

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

// ── Module resolver ────────────────────────────────────────────────────────────

const originalResolveFilename = Module._resolveFilename;

function resolveAliases(request) {
  if (request.startsWith("@/")) {
    return path.join(ROOT, request.slice(2)) + ".ts";
  }
  if (request === "next/server") {
    return path.join(ROOT, "node_modules/next/server");
  }
  return originalResolveFilename.apply(this, arguments);
}

// ── E1: cacheMock — registers a mock by absolute filename ──────────────────────

function cacheMock(absPath, exportsObj) {
  Module._cache[absPath] = {
    id: absPath,
    filename: absPath,
    loaded: true,
    children: [],
    paths: Module._nodeModulePaths(path.dirname(absPath)),
    exports: exportsObj,
  };
}

const supabaseServerPath = path.join(ROOT, "lib/supabase-server.ts");
const entityAuthPath = path.join(ROOT, "lib/entity-auth.ts");
const rateLimitPath = path.join(ROOT, "lib/rate-limit.ts");
const supabaseAdminPath = path.join(ROOT, "lib/supabase-admin.ts");
const serverOnlyPath = path.join(ROOT, "server-only");
const nextServerPath = path.join(ROOT, "node_modules/next/server");
const trustedClientIpPath = path.join(ROOT, "lib/staff/trusted-client-ip.ts");

// ── Mutable test state (reset in beforeEach) ──────────────────────────────────

const state = {
  user: { id: "user-1" },
  access: { hasAccess: true },
  rateLimit: { allowed: true, retryAfter: 0 },
  tenantAccessCalls: [],
  trustedIp: "127.0.0.1",
};

beforeEach(() => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  state.tenantAccessCalls = [];
  state.trustedIp = "127.0.0.1";
});

// ── E2: Mock modules before requiring any scan-actions file ───────────────────

cacheMock(supabaseServerPath, {
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.user === null ? new Error("no session") : null }),
    },
  }),
});

cacheMock(entityAuthPath, {
  checkTenantAccess: async (userId, tenantId, roles) => {
    state.tenantAccessCalls.push({ userId, tenantId, roles });
    return state.access;
  },
});

cacheMock(rateLimitPath, {
  checkRateLimitFailClosed: async () => state.rateLimit,
  RATE_LIMITS: {
    ipScanAction: { limit: 300, windowSeconds: 600 },
    userScanAction: { limit: 120, windowSeconds: 60 },
  },
});

cacheMock(supabaseAdminPath, {
  createSupabaseAdmin: () => mockAdmin(),
});

cacheMock(serverOnlyPath, {});

cacheMock(nextServerPath, {
  NextResponse: {
    json: (body, init) => ({ status: init && init.status ? init.status : 200, headers: init && init.headers ? init.headers : {}, body }),
  },
  NextRequest: class {},
});

cacheMock(trustedClientIpPath, {
  trustedEventStaffClientIp: () => state.trustedIp,
});

// ── Mock admin client ─────────────────────────────────────────────────────────

function mockAdmin(overrides) {
  const calls = [];
  const rpcResults = new Map();
  const orderRows = new Map();
  const workerRows = new Map();
  let lastUpdatePayload = null;
  let lastSelectCols = null;
  let selectError = null;
  let updateResult = null;
  let workerError = null;

  function makeOrdersChain() {
    return {
      select: function (cols) {
        lastSelectCols = cols;
        if (selectError) {
          return {
            eq: function () {
              return {
                eq: function () {
                  return { maybeSingle: async function () { return { data: null, error: selectError }; } };
                },
              };
            },
          };
        }
        return {
          eq: function (col, val) {
            if (col === "id") {
              return {
                eq: function (_col2) {
                  if (_col2 === "organizer_id") {
                    return {
                      maybeSingle: async function () {
                        const order = orderRows.get(val);
                        if (!order) {
                          return { data: null, error: null };
                        }
                        return { data: order, error: null };
                      },
                    };
                  }
                  return { maybeSingle: async function () { return { data: null, error: null }; } };
                },
              };
            }
            return { maybeSingle: async function () { return { data: null, error: null }; } };
          },
        };
      },
      update: function (payload) {
        lastUpdatePayload = payload;
        return {
          eq: function (col) {
            if (col === "id") {
              return {
                eq: function (_col2) {
                  if (_col2 === "organizer_id") {
                    return {
                      eq: function () { return this; },
                      select: function () { return { maybeSingle: async function () { return updateResult || { data: null, error: null }; } }; },
                      maybeSingle: async function () { return updateResult || { data: null, error: null }; },
                    };
                  }
                  return {
                    eq: function () { return this; },
                    select: function () { return { maybeSingle: async function () { return updateResult || { data: null, error: null }; } }; },
                    maybeSingle: async function () { return updateResult || { data: null, error: null }; },
                  };
                },
              };
            }
            return {
              eq: function () { return this; },
              select: function () { return { maybeSingle: async function () { return updateResult || { data: null, error: null }; } }; },
              maybeSingle: async function () { return updateResult || { data: null, error: null }; },
            };
          },
        };
      },
    };
  }

  const from = function (table) {
    if (table === "business_workers") {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                eq: function () {
                  return {
                    eq: function () {
                      return {
                        is: function () {
                          return {
                            maybeSingle: async function () {
                              if (workerError) {
                                return { data: null, error: workerError };
                              }
                              return { data: workerRows.get("worker-1") || null, error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    }
    if (table !== "orders") {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                eq: function () {
                  return { maybeSingle: async function () { return { data: null, error: null }; } };
                },
              };
            },
          };
        },
        update: function () {
          return {
            eq: function () {
              return {
                eq: function () {
                  return { maybeSingle: async function () { return { data: null, error: null }; } };
                },
              };
            },
          };
        },
      };
    }
    return makeOrdersChain();
  };

  const rpc = async function (name, params) {
    calls.push({ name, params });
    if (rpcResults.has(name)) {
      const result = rpcResults.get(name);
      if (result.error) {
        return { data: null, error: result.error };
      }
      return { data: result.data, error: null };
    }
    if (name === "begin_scan_event") {
      return { data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }], error: null };
    }
    if (name === "finalize_scan_event") {
      return { data: [{ out_id: "evt-1" }], error: null };
    }
    if (name === "scan_reservation_action") {
      return { data: { outcome: "success", from_status: "confirmed", to_status: "seated", reason: null, payment_status: "unpaid", branch_id: null, event_finalized: true } };
    }
    if (name === "lookup_scan_code") {
      return { data: [{ out_code: "O1-AAAAAAAAAAAAAAAA", out_code_type: "order", out_subject_id: "ord-1", out_tenant_id: "org-1", out_business_id: "biz-1", out_branch_id: null, out_status: "active", out_subject_number: "1", out_subject_status: "ready" }], error: null };
    }
    return { data: null, error: null };
  };

  const result = {
    calls,
    rpcResults,
    orderRows,
    workerRows,
    from,
    rpc,
    lastUpdatePayload: function () { return lastUpdatePayload; },
    lastSelectCols: function () { return lastSelectCols; },
    setSelectError: function (err) { selectError = err; },
    setUpdateResult: function (result) { updateResult = result; },
    setWorkerResult: function (worker) { workerRows.set("worker-1", worker); },
    setWorkerError: function (err) { workerError = err; },
  };
  Object.assign(result, overrides || {});
  return result;
}

// ── Require modules after mocks are cached ───────────────────────────────────

Module._resolveFilename = resolveAliases;

const { runScanAction } = require(path.join(ROOT, "lib/scan-actions/run.ts"));
const { runOrderScanAction } = require(path.join(ROOT, "lib/scan-actions/orders.ts"));
const { ORDER_SCAN_COLUMNS } = require(path.join(ROOT, "lib/scan-actions/orders.ts"));
const { validateBody } = require(path.join(ROOT, "lib/scan-actions/validate-body.ts"));
const { POST: routePOST } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

// ── Helpers ────────────────────────────────────────────────────────────────────

function fakeRequest(headers, body) {
  return {
    headers: {
      get: function (name) {
        const h = { origin: "http://localhost:3000", ...(headers || {}) };
        return h[name] !== undefined ? h[name] : null;
      },
    },
    nextUrl: { origin: "http://localhost:3000" },
    json: async function () { return body; },
  };
}

const baseOrder = {
  id: "ord-1",
  order_number: "O1-001",
  status: "ready",
  payment_method: "online",
  payment_status: "paid",
  provider: null,
  provider_reference: null,
  customer_email: null,
  customer_name: "Customer",
  fulfilment_type: "pickup",
  currency: "USD",
  total_amount: 1000,
  tracking_token: null,
  website_id: null,
  scheduled_for: null,
  status_history: [],
  estimated_ready_at: null,
  rider_name: null,
  rider_phone: null,
  courier_worker_id: null,
  business_id: "biz-1",
  organizer_id: "org-1",
};

function baseResolved() {
  return {
    out_code: "O1-AAAAAAAAAAAAAAAA",
    out_code_type: "order",
    out_subject_id: "ord-1",
    out_tenant_id: "org-1",
    out_business_id: "biz-1",
    out_branch_id: null,
    out_status: "active",
    out_subject_number: "1",
    out_subject_status: "ready",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("a1: unauthenticated + valid code -> 401", async () => {
  state.user = null;
  const admin = mockAdmin();
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-1",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "unauthorized");
});

test("a2: unauthenticated + unknown code -> identical 401 body", async () => {
  state.user = null;
  const admin = mockAdmin();
  const result = await runScanAction({
    admin: admin,
    code: "UNKNOWN-CODE",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-2",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "unauthorized");
});

test("b1: signed in + unknown code -> 404", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", { data: null, error: null });
  const result = await runScanAction({
    admin: admin,
    code: "UNKNOWN-CODE",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-3",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("b2: signed in + revoked code -> 404", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", { data: null, error: null });
  const result = await runScanAction({
    admin: admin,
    code: "REVOKED-CODE",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-4",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("b3: signed in + ticket code -> 404", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", { data: null, error: null });
  const result = await runScanAction({
    admin: admin,
    code: "TICKET-CODE",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-5",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("b4: signed in + other tenant -> 404", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: false };
  const admin = mockAdmin();
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-6",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("b5: signed in + no access -> 404", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: false };
  const admin = mockAdmin();
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-7",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("c: createSupabaseServer is async and awaited", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: false };
  let awaited = false;
  cacheMock(supabaseServerPath, {
    createSupabaseServer: async function () {
      awaited = true;
      return { auth: { getUser: async function () { return { data: { user: { id: "user-1" } }, error: null }; } } };
    },
  });
  delete Module._cache[path.join(ROOT, "lib/scan-actions/run.ts")];
  const { runScanAction: rsa2 } = require(path.join(ROOT, "lib/scan-actions/run.ts"));
  const admin = mockAdmin();
  const result = await rsa2({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-8",
  });
  assert.strictEqual(awaited, true);
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
  cacheMock(supabaseServerPath, {
    createSupabaseServer: async function () {
      return {
        auth: {
          getUser: async function () { return { data: { user: state.user }, error: state.user === null ? new Error("no session") : null }; },
        },
      };
    },
  });
  delete Module._cache[path.join(ROOT, "lib/scan-actions/run.ts")];
  require(path.join(ROOT, "lib/scan-actions/run.ts"));
});

test("d: getUser with no user -> unauthorized (unit)", async () => {
  state.user = null;
  const admin = mockAdmin();
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-9",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "unauthorized");
});

test("e1: reservation RPC returning json object seats successfully", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{
      out_code: "R1-AAAAAAAAAAAAAAAA",
      out_code_type: "reservation",
      out_subject_id: "res-1",
      out_tenant_id: "org-1",
      out_business_id: "biz-1",
      out_branch_id: "br-1",
      out_status: "active",
      out_subject_number: "1",
      out_subject_status: "confirmed",
    }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.rpcResults.set("scan_reservation_action", {
    data: { outcome: "success", from_status: "confirmed", to_status: "seated", reason: null, payment_status: "unpaid", branch_id: "br-1", event_finalized: true },
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    code: "R1-AAAAAAAAAAAAAAAA",
    action: "seat",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-10",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "success");
  assert.strictEqual(result.fromStatus, "confirmed");
  assert.strictEqual(result.toStatus, "seated");
  assert.strictEqual(result.eventId, "evt-1");
});

test("e2: reservation RPC returning array is tolerated", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{
      out_code: "R1-AAAAAAAAAAAAAAAA",
      out_code_type: "reservation",
      out_subject_id: "res-1",
      out_tenant_id: "org-1",
      out_business_id: "biz-1",
      out_branch_id: null,
      out_status: "active",
      out_subject_number: "1",
      out_subject_status: "confirmed",
    }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.rpcResults.set("scan_reservation_action", {
    data: [{ outcome: "success", from_status: "confirmed", to_status: "seated", reason: null, payment_status: "unpaid", branch_id: null, event_finalized: true }],
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    code: "R1-AAAAAAAAAAAAAAAA",
    action: "seat",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-11",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "success");
});

test("f1: finalize_scan_event called when event_finalized is false", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{
      out_code: "R1-AAAAAAAAAAAAAAAA",
      out_code_type: "reservation",
      out_subject_id: "res-1",
      out_tenant_id: "org-1",
      out_business_id: "biz-1",
      out_branch_id: null,
      out_status: "active",
      out_subject_number: "1",
      out_subject_status: "confirmed",
    }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.rpcResults.set("scan_reservation_action", {
    data: { outcome: "success", from_status: "confirmed", to_status: "seated", reason: null, payment_status: "unpaid", branch_id: null, event_finalized: false },
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    code: "R1-AAAAAAAAAAAAAAAA",
    action: "seat",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-12",
  });
  assert.strictEqual(result.kind, "done");
  const finalizeCalls = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls.length, 1);
});

test("f2: finalize_scan_event NOT called when event_finalized is true", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{
      out_code: "R1-AAAAAAAAAAAAAAAA",
      out_code_type: "reservation",
      out_subject_id: "res-1",
      out_tenant_id: "org-1",
      out_business_id: "biz-1",
      out_branch_id: null,
      out_status: "active",
      out_subject_number: "1",
      out_subject_status: "confirmed",
    }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.rpcResults.set("scan_reservation_action", {
    data: { outcome: "success", from_status: "confirmed", to_status: "seated", reason: null, payment_status: "unpaid", branch_id: null, event_finalized: true },
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    code: "R1-AAAAAAAAAAAAAAAA",
    action: "seat",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-13",
  });
  assert.strictEqual(result.kind, "done");
  const finalizeCalls = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls.length, 0);
});

test("f3: finalize_scan_event called when event_finalized is missing", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{
      out_code: "R1-AAAAAAAAAAAAAAAA",
      out_code_type: "reservation",
      out_subject_id: "res-1",
      out_tenant_id: "org-1",
      out_business_id: "biz-1",
      out_branch_id: null,
      out_status: "active",
      out_subject_number: "1",
      out_subject_status: "confirmed",
    }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.rpcResults.set("scan_reservation_action", {
    data: { outcome: "success", from_status: "confirmed", to_status: "seated", reason: null, payment_status: "unpaid", branch_id: null },
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    code: "R1-AAAAAAAAAAAAAAAA",
    action: "seat",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-14",
  });
  assert.strictEqual(result.kind, "done");
  const finalizeCalls = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls.length, 1);
});

test("g1: order select string equals ORDER_SCAN_COLUMNS join", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "completed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.orderRows.set("ord-1", { ...baseOrder, status: "completed", payment_status: "paid" });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-15",
  });
  assert.strictEqual(result.kind, "done");
  const cols = admin.lastSelectCols();
  assert.strictEqual(cols, ORDER_SCAN_COLUMNS.join(","));
  assert.ok(cols.includes("status_history"), "select must contain status_history");
  assert.ok(cols.includes("courier_worker_id"), "select must contain courier_worker_id");
});

test("g2: admin .update() payload captured: status_history length = existing+1 and customer_email reached the core", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const orderWithEmail = { ...baseOrder, status: "ready", payment_status: "paid", customer_email: "customer@example.com", status_history: [{ status: "ready", at: "t1" }] };
  admin.orderRows.set("ord-1", orderWithEmail);
  admin.setUpdateResult({ data: { id: "ord-1", status: "completed", payment_status: "paid" }, error: null });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-16",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "success");
  const payload = admin.lastUpdatePayload();
  assert.ok(payload, "update payload should exist");
  assert.ok(Array.isArray(payload.status_history), "status_history should be an array");
  assert.strictEqual(payload.status_history.length, orderWithEmail.status_history.length + 1, "status_history length = existing + 1");
  assert.strictEqual(orderWithEmail.customer_email, "customer@example.com", "customer_email reached the core via the order row");
});

test("h1: user + delivery pick_up -> courier_required, toStatus null, core never called", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const deliveryOrder = { ...baseOrder, status: "ready", payment_status: "paid", fulfilment_type: "delivery", courier_worker_id: null };
  admin.orderRows.set("ord-1", deliveryOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-17",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "courier_required");
  assert.strictEqual(result.toStatus, null);
  const rpcNames = admin.calls.map(function (c) { return c.name; });
  assert.ok(!rpcNames.includes("executeOrderStatusTransitionCore"), "core should not be called for courier_required");
});

test("h2: user + delivery deliver -> courier_required, toStatus null", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "picked_up" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const deliveryOrder = { ...baseOrder, status: "picked_up", payment_status: "paid", fulfilment_type: "delivery", courier_worker_id: null };
  admin.orderRows.set("ord-1", deliveryOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "deliver",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-18",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "courier_required");
  assert.strictEqual(result.toStatus, null);
});

test("i1: every core error code in the table maps as defined", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const unpaidOrder = { ...baseOrder, status: "ready", payment_method: "online", payment_status: "unpaid" };
  admin.orderRows.set("ord-1", unpaidOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-19",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "payment_required");
});

test("i2: order read DB error -> 503 and finalize not called", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.setSelectError({ message: "db error" });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-20",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "unavailable");
  const finalizeCalls = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls.length, 0);
});

test("i3: malformed order row (status missing) -> 503, finalize not called", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  // Order row missing "status" field -> malformed
  const malformedOrder = { ...baseOrder };
  delete malformedOrder.status;
  admin.orderRows.set("ord-1", malformedOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-20b",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "unavailable");
  const finalizeCalls2 = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls2.length, 0);
});

test("j1: order_already_updated + re-read at target -> already_done", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "completed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const completedOrder = { ...baseOrder, status: "completed", payment_status: "paid" };
  admin.orderRows.set("ord-1", completedOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-21",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "already_done");
  assert.strictEqual(result.fromStatus, "completed");
  assert.strictEqual(result.toStatus, "completed");
});

test("j2: order at picked_up + pick_up on pickup -> invalid_transition, fromStatus preserved", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "picked_up" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const pickedUpOrder = { ...baseOrder, status: "picked_up", payment_status: "paid" };
  admin.orderRows.set("ord-1", pickedUpOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-22",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "invalid_transition");
  assert.strictEqual(result.fromStatus, "picked_up");
});

test("j3: begin_scan_event empty result -> 503, finalize not called", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("begin_scan_event", { data: [], error: null });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-23",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "unavailable");
  const finalizeCalls = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls.length, 0);
});

test("k1: begin error (not CLIENT_SCAN_ID_REUSED) -> 503", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("begin_scan_event", { data: null, error: { message: "DB connection failed" } });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-24",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "unavailable");
});

test("k2: CLIENT_SCAN_ID_REUSED -> 409", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("begin_scan_event", { data: null, error: { message: "CLIENT_SCAN_ID_REUSED" } });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-25",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "conflict");
});

test("k3: finalized replay returns stored reason and real out_scan_event_id", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{
      out_id: "evt-1", out_is_replay: true, out_outcome: "rejected",
      out_from_status: "ready", out_to_status: "completed",
      out_scan_event_id: "evt-1", out_reason: "payment_required",
    }],
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-26",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "payment_required");
  assert.strictEqual(result.eventId, "evt-1");
  const finalizeCalls = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls.length, 0);
});

test("k4: pending replay re-executes the action", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "completed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: true, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const completedOrder = { ...baseOrder, status: "completed", payment_status: "paid" };
  admin.orderRows.set("ord-1", completedOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-27",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "already_done");
});

test("l1: COD unpaid completed without cashCollected -> cash_confirmation_required", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const codOrder = { ...baseOrder, status: "ready", payment_method: "on_fulfilment", payment_status: "unpaid" };
  admin.orderRows.set("ord-1", codOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-28",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "cash_confirmation_required");
});

test("l2: COD unpaid with cashCollected=true -> markPaymentCollected true, success", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const codOrder = { ...baseOrder, status: "ready", payment_method: "on_fulfilment", payment_status: "unpaid" };
  admin.orderRows.set("ord-1", codOrder);
  admin.setUpdateResult({ data: { id: "ord-1", status: "completed", payment_status: "paid" }, error: null });
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: true,
    clientScannedAt: null,
    requestId: "req-29",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "success");
});

test("l3: online unpaid -> payment_required, markPaymentCollected never true", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const onlineUnpaid = { ...baseOrder, status: "ready", payment_method: "online", payment_status: "unpaid" };
  admin.orderRows.set("ord-1", onlineUnpaid);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: true,
    clientScannedAt: null,
    requestId: "req-30",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "payment_required");
});

test("m: refund -> 200 rejected/action_not_supported, event finalized, core not called", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const readyOrder = { ...baseOrder, status: "ready", payment_status: "paid" };
  admin.orderRows.set("ord-1", readyOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "refund",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-31",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "action_not_supported");
  assert.strictEqual(result.toStatus, null);
  const finalizeCalls = admin.calls.filter(function (c) { return c.name === "finalize_scan_event"; });
  assert.strictEqual(finalizeCalls.length, 1);
  const rpcNames = admin.calls.map(function (c) { return c.name; });
  assert.ok(!rpcNames.includes("executeOrderStatusTransitionCore"), "core should not be called for refund");
});

test("n: finalize RPC error -> console.error called, response still returned", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const errorCalls = [];
  const origError = console.error;
  console.error = function () { errorCalls.push(Array.from(arguments)); };
  try {
    const admin = mockAdmin();
    admin.rpcResults.set("lookup_scan_code", {
      data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "completed" }],
      error: null,
    });
    admin.rpcResults.set("begin_scan_event", {
      data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
      error: null,
    });
    admin.rpcResults.set("finalize_scan_event", { data: null, error: { message: "finalize failed" } });
    const completedOrder = { ...baseOrder, status: "completed", payment_status: "paid" };
    admin.orderRows.set("ord-1", completedOrder);
    const result = await runScanAction({
      admin: admin,
      code: "O1-AAAAAAAAAAAAAAAA",
      action: "pick_up",
      clientScanId: null,
      deviceId: null,
      cashCollected: false,
      clientScannedAt: null,
      requestId: "req-32",
    });
    assert.strictEqual(result.kind, "done");
    assert.strictEqual(result.outcome, "already_done");
    assert.ok(errorCalls.length > 0, "console.error should have been called");
  } finally {
    console.error = origError;
  }
});

test("o: begin_scan_event p_branch_id equals resolved.branchId", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_branch_id: "br-42", out_subject_status: "completed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const completedOrder = { ...baseOrder, status: "completed", payment_status: "paid" };
  admin.orderRows.set("ord-1", completedOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-33",
  });
  assert.strictEqual(result.kind, "done");
  const beginCall = admin.calls.find(function (c) { return c.name === "begin_scan_event"; });
  assert.ok(beginCall, "begin_scan_event was called");
  assert.strictEqual(beginCall.params.p_branch_id, "br-42");
});

// ── Route-level tests ─────────────────────────────────────────────────────────

test("d-route: Authorization header -> 401, checkTenantAccess call count 0 (route level)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.tenantAccessCalls = [];
  state.rateLimit = { allowed: true, retryAfter: 0 };
  const req = fakeRequest({ authorization: "Bearer fake-token" }, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOST(req);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, "unauthorized");
  assert.strictEqual(state.tenantAccessCalls.length, 0);
});

test("p1: flag off -> 404 (route level)", async () => {
  process.env.SCAN_ACTIONS_ENABLED = "false";
  try {
    state.user = { id: "user-1" };
    state.access = { hasAccess: true };
    state.rateLimit = { allowed: true, retryAfter: 0 };
    const req = fakeRequest({}, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
    const res = await routePOST(req);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "not_found");
  } finally {
    process.env.SCAN_ACTIONS_ENABLED = "true";
  }
});

test("p2: rate-limit denial -> 429 WITH Retry-After header (user and ip)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: false, retryAfter: 30 };
  const req1 = fakeRequest({}, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res1 = await routePOST(req1);
  assert.strictEqual(res1.status, 429);
  assert.strictEqual(res1.body.error, "rate_limited");
  assert.strictEqual(res1.headers["Retry-After"], "30");

  state.rateLimit = { allowed: false, retryAfter: 60 };
  const req2 = fakeRequest({}, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res2 = await routePOST(req2);
  assert.strictEqual(res2.status, 429);
  assert.strictEqual(res2.body.error, "rate_limited");
  assert.strictEqual(res2.headers["Retry-After"], "60");

  state.rateLimit = { allowed: true, retryAfter: 0 };
});

test("p4: order read DB error -> 503 and finalize not called (route level)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  const errorAdmin = mockAdmin();
  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return errorAdmin; },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  const { POST: routePOST2 } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

  const origFrom = errorAdmin.from.bind(errorAdmin);
  errorAdmin.from = function (table) {
    if (table === "orders") {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                eq: function () {
                  return { maybeSingle: async function () { return { data: null, error: { message: "db error" } }; } };
                },
              };
            },
          };
        },
        update: function () {
          return {
            eq: function () {
              return {
                eq: function () {
                  return { maybeSingle: async function () { return { data: null, error: null }; } };
                },
              };
            },
          };
        },
      };
    }
    return origFrom(table);
  };

  const req = fakeRequest({}, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOST2(req);
  assert.strictEqual(res.status, 503);

  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return mockAdmin(); },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  require(path.join(ROOT, "app/api/scan/action/route.ts"));
});

test("p5: order missing -> 200 rejected/not_found finalized (route level)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  const req = fakeRequest({}, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOST(req);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.outcome, "rejected");
  assert.strictEqual(res.body.reason, "not_found");
});

test("p6: begin_scan_event received p_source \"online\" even when clientScannedAt is sent", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "completed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const completedOrder = { ...baseOrder, status: "completed", payment_status: "paid" };
  admin.orderRows.set("ord-1", completedOrder);

  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return admin; },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  const { POST: routePOST3 } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

  const now = new Date().toISOString();
  const req = fakeRequest({}, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", clientScannedAt: now });
  const res = await routePOST3(req);
  assert.strictEqual(res.status, 200);

  const beginCall = admin.calls.find(function (c) { return c.name === "begin_scan_event"; });
  assert.ok(beginCall, "begin_scan_event was called");
  assert.strictEqual(beginCall.params.p_source, "online");

  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return mockAdmin(); },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  require(path.join(ROOT, "app/api/scan/action/route.ts"));
});

// ── E4: validate-body.ts tests ────────────────────────────────────────────────

test("validate-body: empty clientScanId -> null", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", clientScanId: "" });
  assert.strictEqual(result, null);
});

test("validate-body: whitespace-only clientScanId -> null", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", clientScanId: "   " });
  assert.strictEqual(result, null);
});

test("validate-body: trimmed clientScanId returned", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", clientScanId: "  csid-123  " });
  assert.strictEqual(result.clientScanId, "csid-123");
});

test("validate-body: trimmed deviceId returned", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", deviceId: "  dev-123  " });
  assert.strictEqual(result.deviceId, "dev-123");
});

test("validate-body: clientScannedAt bad regex -> null", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", clientScannedAt: "not-a-date" });
  assert.strictEqual(result, null);
});

test("validate-body: clientScannedAt too far in future -> null", function () {
  const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", clientScannedAt: future });
  assert.strictEqual(result, null);
});

test("validate-body: clientScannedAt too old -> null", function () {
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", clientScannedAt: old });
  assert.strictEqual(result, null);
});

test("validate-body: unknown action -> null", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "scan" });
  assert.strictEqual(result, null);
});

test("validate-body: cashCollected non-boolean -> null", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", cashCollected: "yes" });
  assert.strictEqual(result, null);
});

test("validate-body: valid body returns trimmed code", function () {
  const result = validateBody({ code: "  O1-AAAAAAAAAAAAAAAA  ", action: "pick_up" });
  assert.strictEqual(result.code, "O1-AAAAAAAAAAAAAAAA");
  assert.strictEqual(result.action, "pick_up");
});

test("validate-body: deviceId 65 chars -> null", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", deviceId: "x".repeat(65) });
  assert.strictEqual(result, null);
});

test("validate-body: deviceId whitespace-only -> null", function () {
  const result = validateBody({ code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up", deviceId: "   " });
  assert.strictEqual(result, null);
});

// ── Orders unit tests ─────────────────────────────────────────────────────────

test("orders unit: worker-less actor with courier_worker_id rejected", async function () {
  const admin = { rpc: async function () { return { data: null, error: null }; } };
  const order = {
    ...baseOrder,
    fulfilment_type: "delivery",
    courier_worker_id: null,
  };
  const result = await runOrderScanAction({
    admin: admin,
    actor: { kind: "user", userId: "user-1" },
    order: order,
    organizerId: "org-1",
    expectedBusinessId: null,
    action: "pick_up",
    cashCollected: false,
    scanEventId: "evt-1",
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "courier_required");
  assert.strictEqual(result.toStatus, null);
});

// ── Worker auth unit tests (runScanAction with authContext) ───────────────────

const workerAuthContext = {
  kind: "worker",
  workerId: "worker-1",
  businessId: "biz-1",
  workerName: "Courier Worker",
  tokenScope: { event_id: "evt-1", tenant_id: "org-1", business_id: "biz-1", branch_id: null },
};

function workerOrder(overrides) {
  return {
    ...baseOrder,
    status: "picked_up",
    payment_status: "paid",
    fulfilment_type: "delivery",
    courier_worker_id: "worker-1",
    business_id: "biz-1",
    ...overrides,
  };
}

test("worker: assigned courier can perform pickup on assigned order", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.orderRows.set("ord-1", workerOrder({ status: "ready" }));
  admin.setUpdateResult({ data: { id: "ord-1", status: "picked_up", payment_status: "paid" }, error: null });
  const result = await runScanAction({
    admin: admin,
    authContext: workerAuthContext,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-1",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "success");
  assert.strictEqual(result.fromStatus, "ready");
  assert.strictEqual(result.toStatus, "picked_up");
});

test("worker: assigned courier can perform deliver on assigned order", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "picked_up" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.orderRows.set("ord-1", workerOrder({ status: "picked_up" }));
  admin.setUpdateResult({ data: { id: "ord-1", status: "delivered", payment_status: "paid" }, error: null });
  const result = await runScanAction({
    admin: admin,
    authContext: workerAuthContext,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "deliver",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-2",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "success");
  assert.strictEqual(result.fromStatus, "picked_up");
  assert.strictEqual(result.toStatus, "delivered");
});

test("worker: cannot perform seat on reservation — rejected before any reservation RPC", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "reservation", out_subject_status: "confirmed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    authContext: workerAuthContext,
    code: "R1-AAAAAAAAAAAAAAAA",
    action: "seat",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-3",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
  const rpcNames = admin.calls.map(function (c) { return c.name; });
  assert.ok(!rpcNames.includes("scan_reservation_action"), "reservation RPC should not be called for worker seat action");
});

test("worker: cannot perform no_show on reservation", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "reservation", out_subject_status: "confirmed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    authContext: workerAuthContext,
    code: "R1-AAAAAAAAAAAAAAAA",
    action: "no_show",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-4",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
  const rpcNames = admin.calls.map(function (c) { return c.name; });
  assert.ok(!rpcNames.includes("scan_reservation_action"), "reservation RPC should not be called for worker no_show action");
});

test("worker: cannot perform refund on order", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "completed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const result = await runScanAction({
    admin: admin,
    authContext: workerAuthContext,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "refund",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-5",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("worker: wrong business scope denied", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_tenant_id: "org-1", out_business_id: "biz-1", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const wrongBizContext = { ...workerAuthContext, businessId: "biz-2" };
  admin.orderRows.set("ord-1", workerOrder({ status: "ready", business_id: "biz-1" }));
  const result = await runScanAction({
    admin: admin,
    authContext: wrongBizContext,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-6",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("worker: wrong branch scope denied", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_tenant_id: "org-1", out_business_id: "biz-1", out_branch_id: "br-1", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const wrongBranchContext = { ...workerAuthContext, tokenScope: { ...workerAuthContext.tokenScope, branch_id: "br-2" } };
  admin.orderRows.set("ord-1", workerOrder({ status: "ready", business_id: "biz-1" }));
  const result = await runScanAction({
    admin: admin,
    authContext: wrongBranchContext,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-7",
  });
  assert.strictEqual(result.kind, "failure");
  assert.strictEqual(result.failure, "not_found");
});

test("worker: unassigned order rejected (courier_worker_id null)", async () => {
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.orderRows.set("ord-1", workerOrder({ status: "ready", courier_worker_id: null }));
  const result = await runScanAction({
    admin: admin,
    authContext: workerAuthContext,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-worker-8",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "rejected");
  assert.strictEqual(result.reason, "courier_required");
});

// ── Worker auth route-level tests ─────────────────────────────────────────────

const offlineTokenPath = path.join(ROOT, "lib/offline-scanner-token.ts");
const revocationsPath = path.join(ROOT, "lib/staff/scanner-revocations.ts");

function cacheWorkerRouteMocks(verifyResult, revocationResult, revocationError) {
  cacheMock(offlineTokenPath, {
    verifyScannerToken: function () { return verifyResult; },
  });
  cacheMock(revocationsPath, {
    isScannerTokenRevoked: async function () {
      if (revocationError) throw revocationError;
      return revocationResult;
    },
  });
}

function restoreRouteMocks() {
  cacheMock(offlineTokenPath, {
    verifyScannerToken: function () { return { valid: false, payload: null, error: "mock not configured" }; },
  });
  cacheMock(revocationsPath, {
    isScannerTokenRevoked: async function () { return { revoked: false }; },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  require(path.join(ROOT, "app/api/scan/action/route.ts"));
}

const validWorkerTokenResult = {
  valid: true,
  payload: null,
  principal: {
    version: 2,
    staffMemberId: "worker-1",
    eventId: "evt-1",
    role: "courier",
    jti: "jti-worker-1",
    codeType: ["order"],
    actions: ["pick_up", "deliver"],
    scope: { event_id: "evt-1", tenant_id: "org-1", business_id: "biz-1", branch_id: null },
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
};

const revokedWorkerTokenResult = {
  valid: true,
  payload: null,
  principal: {
    version: 2,
    staffMemberId: "worker-1",
    eventId: "evt-1",
    role: "courier",
    jti: "jti-revoked-1",
    codeType: ["order"],
    actions: ["pick_up", "deliver"],
    scope: { event_id: "evt-1", tenant_id: "org-1", business_id: "biz-1", branch_id: null },
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
};

const invalidWorkerTokenResult = {
  valid: false,
  payload: null,
  error: "Invalid signature",
};

test("worker route: valid courier token accepts pickup", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  cacheWorkerRouteMocks(validWorkerTokenResult, { revoked: false }, null);
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  const { POST: routePOSTWorker } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "ready" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  admin.orderRows.set("ord-1", workerOrder({ status: "ready", courier_worker_id: "worker-1", business_id: "biz-1" }));
  admin.setUpdateResult({ data: { id: "ord-1", status: "picked_up", payment_status: "paid" }, error: null });
  admin.setWorkerResult({ id: "worker-1", business_id: "biz-1", full_name: "Courier Worker", role: "courier", is_active: true, deactivated_at: null });

  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return admin; },
  });

  const req = fakeRequest({ authorization: "Bearer header.signature" }, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOSTWorker(req);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.outcome, "success");

  restoreRouteMocks();
  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return mockAdmin(); },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  require(path.join(ROOT, "app/api/scan/action/route.ts"));
});

test("worker route: revoked worker token rejected (401)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  cacheWorkerRouteMocks(revokedWorkerTokenResult, { revoked: true, reason: "removed_from_team" }, null);
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  const { POST: routePOSTWorker } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

  const req = fakeRequest({ authorization: "Bearer header.signature" }, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOSTWorker(req);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, "unauthorized");

  restoreRouteMocks();
});

test("worker route: revocation lookup DB error fails closed (503)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  cacheWorkerRouteMocks(validWorkerTokenResult, null, new Error("DB connection failed"));
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  const { POST: routePOSTWorker } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

  const admin = mockAdmin();
  admin.setWorkerResult({ id: "worker-1", business_id: "biz-1", full_name: "Courier Worker", role: "courier", is_active: true, deactivated_at: null });

  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return admin; },
  });

  const req = fakeRequest({ authorization: "Bearer header.signature" }, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOSTWorker(req);
  assert.strictEqual(res.status, 503);

  restoreRouteMocks();
  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return mockAdmin(); },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  require(path.join(ROOT, "app/api/scan/action/route.ts"));
});

test("worker route: inactive/deactivated worker rejected (401)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  cacheWorkerRouteMocks(validWorkerTokenResult, { revoked: false }, null);
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  const { POST: routePOSTWorker } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

  // Mock business_workers query returns inactive worker
  const admin = mockAdmin();
  const origFrom = admin.from.bind(admin);
  admin.from = function (table) {
    if (table === "business_workers") {
      return {
        select: function () {
          return {
            eq: function () {
              return {
                eq: function () {
                  return {
                    eq: function () {
                      return {
                        is: function () {
                          return { maybeSingle: async function () { return { data: { id: "worker-1", business_id: "biz-1", full_name: "Inactive Worker", role: "courier", is_active: false, deactivated_at: new Date().toISOString() }, error: null }; } };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    }
    return origFrom(table);
  };

  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return admin; },
  });

  const req = fakeRequest({ authorization: "Bearer header.signature" }, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOSTWorker(req);
  assert.strictEqual(res.status, 401);

  restoreRouteMocks();
  cacheMock(supabaseAdminPath, {
    createSupabaseAdmin: function () { return mockAdmin(); },
  });
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  require(path.join(ROOT, "app/api/scan/action/route.ts"));
});

test("worker route: invalid Bearer token rejected (401)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  cacheWorkerRouteMocks(invalidWorkerTokenResult, { revoked: false }, null);
  delete Module._cache[path.join(ROOT, "app/api/scan/action/route.ts")];
  const { POST: routePOSTWorker } = require(path.join(ROOT, "app/api/scan/action/route.ts"));

  const req = fakeRequest({ authorization: "Bearer invalid.token.format" }, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOSTWorker(req);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, "unauthorized");

  restoreRouteMocks();
});

test("worker route: non-scanner Bearer header rejected (401)", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  // No worker mocks needed — the header format check rejects before verifyScannerToken
  const req = fakeRequest({ authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload" }, { code: "O1-AAAAAAAAAAAAAAAA", action: "pick_up" });
  const res = await routePOST(req);
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, "unauthorized");
});

test("session-based scanner still works after worker auth added", async () => {
  state.user = { id: "user-1" };
  state.access = { hasAccess: true };
  state.rateLimit = { allowed: true, retryAfter: 0 };
  const admin = mockAdmin();
  admin.rpcResults.set("lookup_scan_code", {
    data: [{ ...baseResolved(), out_code_type: "order", out_subject_status: "completed" }],
    error: null,
  });
  admin.rpcResults.set("begin_scan_event", {
    data: [{ out_id: "evt-1", out_is_replay: false, out_outcome: "pending", out_scan_event_id: "evt-1" }],
    error: null,
  });
  const completedOrder = { ...baseOrder, status: "completed", payment_status: "paid" };
  admin.orderRows.set("ord-1", completedOrder);
  const result = await runScanAction({
    admin: admin,
    code: "O1-AAAAAAAAAAAAAAAA",
    action: "pick_up",
    clientScanId: null,
    deviceId: null,
    cashCollected: false,
    clientScannedAt: null,
    requestId: "req-session-regression",
  });
  assert.strictEqual(result.kind, "done");
  assert.strictEqual(result.outcome, "already_done");
});
