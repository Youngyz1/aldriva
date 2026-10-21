// Mocked Stage 3B tests: auth, tenant access, business lookup, and RPC boundaries.
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const { loadWithStubs, ROOT } = require("./helpers/hermetic.cjs");

const originalLoad = Module._load;
Module._load = function loadServerOnlyMock(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORGANIZER_ID = "33333333-3333-4333-8333-333333333333";
const BUSINESS_ID = "44444444-4444-4444-8444-444444444444";
const COOK_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST = { organizerId: ORGANIZER_ID, businessId: BUSINESS_ID, range: "today" };

const accessState = { result: null, calls: [] };
const entityAuthPath = path.join(ROOT, "lib/entity-auth.ts");
require.cache[entityAuthPath] = {
  exports: {
    checkTenantAccess: async (...args) => {
      accessState.calls.push(args);
      return accessState.result;
    },
  },
};

function rpcRow(overrides = {}) {
  return {
    cook_worker_id: COOK_ID,
    cook_name: "Test Cook",
    cook_is_active: true,
    orders_handled: 4,
    accepted_to_preparing_n: 3,
    accepted_to_preparing_median_minutes: 5,
    preparing_to_ready_n: 3,
    preparing_to_ready_median_minutes: 12,
    customer_name: "Must not be returned",
    customer_phone: "+10000000000",
    ...overrides,
  };
}

const state = {};
let currentDb;

function makeAdminDb() {
  const db = {
    calls: { businessQueries: [], rpcs: [], sequence: [] },
    from(table) {
      const query = { filters: [], selected: null };
      query.select = (columns) => { query.selected = columns; return query; };
      query.eq = (column, value) => { query.filters.push([column, value]); return query; };
      query.maybeSingle = () => query;
      query.then = (resolve, reject) => {
        try {
          db.calls.sequence.push(`from:${table}`);
          db.calls.businessQueries.push({ table, selected: query.selected, filters: query.filters });
          const idFilter = query.filters.find(([column]) => column === "id");
          const data = table === "businesses" && idFilter && state.business?.id === idFilter[1]
            ? state.business
            : null;
          resolve({ data, error: state.businessError ?? null });
        } catch (error) {
          reject(error);
        }
      };
      return query;
    },
    rpc(fn, params) {
      db.calls.sequence.push(`rpc:${fn}`);
      db.calls.rpcs.push({ fn, params });
      return Promise.resolve({ data: state.rpcData, error: state.rpcError ?? null });
    },
  };
  return db;
}

const bootDb = makeAdminDb();
const { mod, stubs } = loadWithStubs("lib/actions/cook-performance.ts", {
  auth: { mode: "admin", userId: USER_ID },
  adminDb: bootDb,
});

function reset({ role = "owner", access = true, businessOrganizerId = ORGANIZER_ID } = {}) {
  accessState.result = { hasAccess: access, role, isDirectOwner: false };
  accessState.calls = [];
  state.business = { id: BUSINESS_ID, organizer_id: businessOrganizerId };
  state.businessError = null;
  state.rpcData = [rpcRow()];
  state.rpcError = null;
  stubs.authMode = "admin";
  stubs.userId = USER_ID;
  currentDb = makeAdminDb();
  stubs.adminDb = currentDb;
}

reset();

test("mocked: owner, admin, and manager can load only after tenant access is checked", async () => {
  for (const role of ["owner", "admin", "manager"]) {
    reset({ role });
    const result = await mod.loadCookPerformance(REQUEST);
    assert.equal(result.ok, true, `${role} should be allowed`);
    assert.equal(accessState.calls.length, 1, "tenant access checked on every request");
    assert.equal(accessState.calls[0][0], USER_ID);
    assert.equal(accessState.calls[0][1], ORGANIZER_ID);
    assert.deepEqual(accessState.calls[0][2], ["owner", "admin", "manager"]);
    assert.equal(currentDb.calls.rpcs.length, 1);
    assert.deepEqual(currentDb.calls.sequence, ["from:businesses", "rpc:get_business_cook_performance"]);
    assert.equal(currentDb.calls.rpcs[0].params.p_organizer_id, ORGANIZER_ID);
    assert.match(currentDb.calls.rpcs[0].params.p_range_start, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(currentDb.calls.rpcs[0].params.p_range_end, /^\d{4}-\d{2}-\d{2}T/);
  }
});

test("mocked: editor, finance, viewer, cook, and courier roles are denied", async () => {
  for (const role of ["editor", "finance", "viewer", "cook", "courier"]) {
    // A cook/courier role must fail closed even if a mocked access provider
    // incorrectly reports hasAccess=true.
    reset({ role, access: role === "cook" || role === "courier" });
    const result = await mod.loadCookPerformance(REQUEST);
    assert.deepEqual(result, { ok: false, error: "forbidden" }, `${role} should be denied`);
    assert.equal(currentDb.calls.rpcs.length, 0, `${role} must not reach the RPC`);
    assert.equal(currentDb.calls.businessQueries.length, 0, `${role} must not read business data`);
  }
});

test("mocked: business attached to another organizer is denied before RPC", async () => {
  reset({ businessOrganizerId: OTHER_ORGANIZER_ID });
  const result = await mod.loadCookPerformance(REQUEST);
  assert.deepEqual(result, { ok: false, error: "forbidden" });
  assert.equal(currentDb.calls.rpcs.length, 0);
  assert.equal(currentDb.calls.businessQueries[0].selected, "id, organizer_id");
  assert.deepEqual(currentDb.calls.businessQueries[0].filters, [["id", BUSINESS_ID]]);
});

test("mocked: invalid range is rejected after authorization and before data access", async () => {
  reset();
  const result = await mod.loadCookPerformance({ ...REQUEST, range: "all-time" });
  assert.deepEqual(result, { ok: false, error: "invalid_range" });
  assert.equal(accessState.calls.length, 1);
  assert.equal(currentDb.calls.businessQueries.length, 0);
  assert.equal(currentDb.calls.rpcs.length, 0);
});

test("mocked: RPC failure returns a safe error without the database message", async () => {
  reset();
  state.rpcError = { message: "private schema detail" };
  const result = await mod.loadCookPerformance(REQUEST);
  assert.deepEqual(result, { ok: false, error: "unavailable" });
  assert.equal(JSON.stringify(result).includes("private schema detail"), false);
});

test("mocked: UTC ranges are explicit and today begins at 00:00 UTC", () => {
  const now = new Date("2026-06-15T12:34:56.789Z");
  assert.deepEqual(mod.getCookPerformanceWindow("today", now), {
    rangeStart: "2026-06-15T00:00:00.000Z",
    rangeEnd: "2026-06-15T12:34:56.789Z",
  });
  assert.deepEqual(mod.getCookPerformanceWindow("7-days", now), {
    rangeStart: "2026-06-08T12:34:56.789Z",
    rangeEnd: "2026-06-15T12:34:56.789Z",
  });
  assert.deepEqual(mod.getCookPerformanceWindow("30-days", now), {
    rangeStart: "2026-05-16T12:34:56.789Z",
    rangeEnd: "2026-06-15T12:34:56.789Z",
  });
  assert.equal(mod.getCookPerformanceWindow("90-days", now), null);
});

test("mocked: n below 3 hides the median while preserving n and only RPC fields", () => {
  const shaped = mod.shapeCookPerformanceRows([
    rpcRow({
      accepted_to_preparing_n: 2,
      accepted_to_preparing_median_minutes: 4.5,
      preparing_to_ready_n: 1,
      preparing_to_ready_median_minutes: 9,
    }),
  ]);
  assert.equal(shaped.length, 1);
  assert.equal(shaped[0].accepted_to_preparing_n, 2);
  assert.equal(shaped[0].accepted_to_preparing_median_minutes, null);
  assert.equal(shaped[0].preparing_to_ready_n, 1);
  assert.equal(shaped[0].preparing_to_ready_median_minutes, null);
  assert.deepEqual(Object.keys(shaped[0]), [
    "cook_worker_id",
    "cook_name",
    "cook_is_active",
    "orders_handled",
    "accepted_to_preparing_n",
    "accepted_to_preparing_median_minutes",
    "preparing_to_ready_n",
    "preparing_to_ready_median_minutes",
  ]);
  assert.equal("customer_name" in shaped[0], false);
  assert.equal("customer_phone" in shaped[0], false);
});

test("mocked: null medians remain null even when n is at least 3", () => {
  const shaped = mod.shapeCookPerformanceRows([
    rpcRow({
      accepted_to_preparing_n: 3,
      accepted_to_preparing_median_minutes: null,
      preparing_to_ready_n: 4,
      preparing_to_ready_median_minutes: null,
    }),
  ]);
  assert.equal(shaped[0].accepted_to_preparing_n, 3);
  assert.equal(shaped[0].accepted_to_preparing_median_minutes, null);
  assert.equal(shaped[0].preparing_to_ready_n, 4);
  assert.equal(shaped[0].preparing_to_ready_median_minutes, null);
});

test("mocked: Organizer cook-performance panel keys exist in English and French", () => {
  const en = require("../../../messages/en.json").Organizer.cookPerformance;
  const fr = require("../../../messages/fr.json").Organizer.cookPerformance;
  assert.equal(en.waitBeforeStarting, "Wait before starting");
  assert.equal(en.prepTime, "Prep time");
  assert.equal(fr.waitBeforeStarting, "Attente avant de commencer");
  assert.equal(fr.prepTime, "Temps de préparation");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
});
