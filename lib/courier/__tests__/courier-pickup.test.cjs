const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let db;
let deniedRate = false;
let coreResult = { success: true, nextStatus: "picked_up", paymentStatus: "unpaid" };
let effectsCalls = [];
let coreCalls = [];
let rpcCalls = [];
let rateCalls = [];

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolve.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolve.call(this, request, parent, isMain, options);
};

class FakeQuery {
  constructor(owner, table) {
    this.owner = owner;
    this.table = table;
    this.filters = [];
    this.mode = "select";
    this.patch = null;
    this.insertRows = [];
    this.one = false;
  }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value, "eq"]); return this; }
  is(key, value) { this.filters.push([key, value, "is"]); return this; }
  in(key, values) { this.filters.push([key, values, "in"]); return this; }
  gt(key, value) { this.filters.push([key, value, "gt"]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  update(patch) { this.mode = "update"; this.patch = patch; return this; }
  insert(rows) { this.mode = "insert"; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(row) { this.mode = "upsert"; this.insertRows = [row]; return this; }
  matches(row) {
    return this.filters.every(([key, value, op]) => op === "eq"
      ? row[key] === value
      : op === "is"
        ? value === null ? row[key] == null : row[key] === value
        : op === "in" ? value.includes(row[key])
          : op === "gt" ? String(row[key]) > String(value) : false);
  }
  execute() {
    const rows = this.owner.tables[this.table] ?? (this.owner.tables[this.table] = []);
    if (this.mode === "insert" || this.mode === "upsert") {
      const inserted = this.insertRows.map((input) => {
        const row = { id: `fake-${this.table}-${++this.owner.sequence}`, ...input };
        rows.push(row);
        return row;
      });
      return this.one ? inserted[0] ?? null : inserted;
    }
    const matched = rows.filter((row) => this.matches(row));
    if (this.mode === "update") {
      matched.forEach((row) => Object.assign(row, this.patch));
      this.owner.writes.push({ table: this.table, filters: this.filters, patch: this.patch });
    } else this.owner.reads.push({ table: this.table, filters: this.filters });
    return this.one ? matched[0] ?? null : matched;
  }
  then(resolve, reject) {
    try { resolve({ data: this.execute(), error: null }); } catch (error) { reject(error); }
  }
}

function makeDb(tables = {}, rpcHandler = null) {
  return {
    tables: structuredClone(tables),
    reads: [],
    writes: [],
    sequence: 0,
    from(table) { return new FakeQuery(this, table); },
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      return rpcHandler ? rpcHandler(name, params) : { data: [], error: null };
    },
  };
}

class NextResponseShim extends Response {
  constructor(body, init) {
    super(body, init);
    this.cookies = { set: (name, value, options) => this.headers.append("Set-Cookie", `${name}=${value}; Path=${options.path}; Max-Age=${options.maxAge ?? 0}`) };
  }
  static json(value, init = {}) {
    return new NextResponseShim(JSON.stringify(value), { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  }
}

const expiry = new Date(Date.now() + 86400000).toISOString();
const mockModules = {
  "server-only": () => ({}),
  "next/server": () => ({ NextResponse: NextResponseShim }),
  "next/headers": () => ({ cookies: async () => ({ get: () => undefined, set() {} }) }),
  "next/cache": () => ({ revalidatePath() {} }),
  "@/lib/supabase-admin": () => ({ createSupabaseAdmin: () => db }),
  "@/lib/auth": () => ({ getCurrentUser: async () => ({ id: "manager-a" }) }),
  "@/lib/entity-auth": () => ({ checkTenantAccess: async () => ({ hasAccess: true }) }),
  "@/lib/rate-limit": () => ({
    clientIp: () => "203.0.113.10",
    checkRateLimitFailClosed: async (name, identifier) => {
      rateCalls.push({ name, identifier });
      return deniedRate ? { allowed: false, remaining: 0, retryAfter: 60 } : { allowed: true, remaining: 5, retryAfter: 0 };
    },
  }),
  "@/lib/kitchen/worker-session": () => ({
    COURIER_SESSION_COOKIE: "aldriva_courier_session",
    hashWorkerToken: (token) => crypto.createHash("sha256").update(token).digest("hex"),
    readRequestCookie: (request, name) => {
      const part = (request.headers.get("cookie") ?? "").split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
      return part ? part.slice(name.length + 1) : null;
    },
    validateAndRenewWorkerSession: async (token, expectedRole) => {
      if (token !== "courier-token" || expectedRole !== "courier") return null;
      return { workerId: "courier-1", businessId: "business-a", kitchenId: null, role: "courier", expiresAt: expiry };
    },
  }),
  "@/lib/orders/transition-core": () => ({
    executeOrderStatusTransitionCore: async (...args) => { coreCalls.push(args); return coreResult; },
    runOrderStatusPostPersistEffects: async (...args) => { effectsCalls.push(args); },
  }),
};

Module._load = function loadMocks(request, parent, isMain) {
  if (mockModules[request]) return mockModules[request]();
  return originalLoad.call(this, request, parent, isMain);
};

function load(rel) {
  const filename = path.join(ROOT, rel);
  delete require.cache[filename];
  return require(filename);
}

function request(url, method = "GET", body, cookie) {
  return new Request(url, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function reset(tables = {}) {
  db = makeDb(tables);
  deniedRate = false;
  coreResult = { success: true, nextStatus: "picked_up", paymentStatus: "unpaid" };
  effectsCalls = [];
  coreCalls = [];
  rpcCalls = [];
  rateCalls = [];
}

test("pickup route: confirms pickup transitioning ready -> picked_up", async () => {
  const orderId = "00000000-0000-4000-8000-000000000010";
  const order = {
    id: orderId,
    organizer_id: "organizer-a",
    business_id: "business-a",
    order_number: "P-10",
    status: "ready",
    courier_worker_id: "courier-1",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    customer_name: "John Doe",
    customer_phone: "5550001",
    fulfilment_type: "delivery",
    delivery_address: "123 Main St",
    currency: "XOF",
    total_amount: 1200,
    items: [],
    tracking_token: "track-10",
    status_history: [],
  };
  reset({
    business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, full_name: "Courier Fast" }],
    orders: [order],
  });

  const route = load("app/api/courier/orders/[orderId]/pickup/route.ts");
  const response = await route.POST(
    request(`http://local/api/courier/orders/${orderId}/pickup`, "POST", {}, "aldriva_courier_session=courier-token"),
    { params: Promise.resolve({ orderId }) }
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.status, "picked_up");
  assert.equal(coreCalls.length, 1);
  assert.equal(coreCalls[0][0].expectedCurrentStatus, "ready");
  assert.equal(coreCalls[0][0].nextStatus, "picked_up");
  assert.match(coreCalls[0][0].historyNote, /picked up/i);
  assert.deepEqual(coreCalls[0][6], { workerId: "courier-1", workerName: "Courier Fast" });
});

test("pickup route: rejects when order is not assigned to current courier or not ready", async () => {
  const orderId = "00000000-0000-4000-8000-000000000011";
  const order = {
    id: orderId,
    organizer_id: "organizer-a",
    business_id: "business-a",
    status: "out_for_delivery",
    courier_worker_id: "courier-other",
  };
  reset({
    business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, full_name: "Courier Fast" }],
    orders: [order],
  });

  const route = load("app/api/courier/orders/[orderId]/pickup/route.ts");
  const response = await route.POST(
    request(`http://local/api/courier/orders/${orderId}/pickup`, "POST", {}, "aldriva_courier_session=courier-token"),
    { params: Promise.resolve({ orderId }) }
  );

  assert.equal(response.status, 404);
  assert.equal(coreCalls.length, 0);
});

test("depart route: transitions picked_up -> out_for_delivery", async () => {
  const orderId = "00000000-0000-4000-8000-000000000012";
  const order = {
    id: orderId,
    organizer_id: "organizer-a",
    business_id: "business-a",
    order_number: "P-12",
    status: "picked_up",
    courier_worker_id: "courier-1",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    customer_name: "Jane Smith",
    customer_phone: "5550002",
    fulfilment_type: "delivery",
    delivery_address: "456 Oak St",
    currency: "XOF",
    total_amount: 1500,
    items: [],
    tracking_token: "track-12",
    status_history: [],
  };
  coreResult = { success: true, nextStatus: "out_for_delivery", paymentStatus: "unpaid" };
  reset({
    business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, full_name: "Courier Fast" }],
    orders: [order],
  });

  const route = load("app/api/courier/orders/[orderId]/depart/route.ts");
  const response = await route.POST(
    request(`http://local/api/courier/orders/${orderId}/depart`, "POST", {}, "aldriva_courier_session=courier-token"),
    { params: Promise.resolve({ orderId }) }
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.status, "out_for_delivery");
  assert.equal(coreCalls.length, 1);
  assert.equal(coreCalls[0][0].expectedCurrentStatus, "picked_up");
  assert.equal(coreCalls[0][0].nextStatus, "out_for_delivery");
  assert.deepEqual(coreCalls[0][6], { workerId: "courier-1", workerName: "Courier Fast" });
});

test("issue route: validates category and stores delivery issue in order without unassigning or cancelling", async () => {
  const orderId = "00000000-0000-4000-8000-000000000013";
  const order = {
    id: orderId,
    organizer_id: "organizer-a",
    business_id: "business-a",
    status: "out_for_delivery",
    courier_worker_id: "courier-1",
    status_history: [{ status: "out_for_delivery", at: "2026-10-22T10:00:00Z" }],
  };
  reset({
    business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, full_name: "Courier Fast" }],
    orders: [order],
  });

  const route = load("app/api/courier/orders/[orderId]/issue/route.ts");

  // Invalid category
  const badCategory = await route.POST(
    request(`http://local/api/courier/orders/${orderId}/issue`, "POST", { category: "invalid_category" }, "aldriva_courier_session=courier-token"),
    { params: Promise.resolve({ orderId }) }
  );
  assert.equal(badCategory.status, 400);

  // Valid category with note
  const valid = await route.POST(
    request(`http://local/api/courier/orders/${orderId}/issue`, "POST", { category: "customer_unreachable", note: "Phone went directly to voicemail twice." }, "aldriva_courier_session=courier-token"),
    { params: Promise.resolve({ orderId }) }
  );
  assert.equal(valid.status, 200);
  const json = await valid.json();
  assert.equal(json.ok, true);
  assert.equal(json.issue.category, "customer_unreachable");

  // Check database update was recorded without changing order status
  const orderWrite = db.writes.find((w) => w.table === "orders");
  assert.ok(orderWrite, "Orders table was updated");
  assert.equal(orderWrite.patch.delivery_issue.category, "customer_unreachable");
  assert.equal(orderWrite.patch.delivery_issue.worker_name, "Courier Fast");
  assert.equal(orderWrite.patch.status, undefined, "Status was not changed");
  assert.equal(orderWrite.patch.courier_worker_id, undefined, "Courier was not unassigned");
  assert.ok(orderWrite.patch.status_history.some((h) => h.type === "issue_report"));
});

test("courier feed: calculates cash in hand and returns recent completed deliveries", async () => {
  reset({
    business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, is_available: true }],
    business_courier_offer_feed: [],
    business_courier_offers: [],
    orders: [
      {
        id: "done-1",
        business_id: "business-a",
        courier_worker_id: "courier-1",
        status: "delivered",
        order_number: "D-1",
        delivery_address: "100 Pine St",
        total_amount: 5000,
        currency: "XOF",
        payment_method: "on_fulfilment",
        payment_status: "paid",
        updated_at: "2026-10-22T12:00:00Z",
      },
      {
        id: "done-2",
        business_id: "business-a",
        courier_worker_id: "courier-1",
        status: "delivered",
        order_number: "D-2",
        delivery_address: "200 Elm St",
        total_amount: 3000,
        currency: "XOF",
        payment_method: "online",
        payment_status: "paid",
        updated_at: "2026-10-22T13:00:00Z",
      },
    ],
    businesses: [{ id: "business-a", name: "Cafe", address: "1 Main St" }],
  });

  const route = load("app/api/courier/orders/route.ts");
  const response = await route.GET(request("http://local/api/courier/orders", "GET", undefined, "aldriva_courier_session=courier-token"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.recentDeliveries.length, 2);
  assert.equal(payload.recentDeliveries[0].orderNumber, "D-1");
  // Only the on_fulfilment order should count towards cashCollectedTotal
  assert.equal(payload.cashCollectedTotal, 5000);
});

process.on("exit", () => {
  Module._resolveFilename = originalResolve;
  Module._load = originalLoad;
});
