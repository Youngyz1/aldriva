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
let coreResult = { success: true, nextStatus: "delivered", paymentStatus: "paid" };
let effectsCalls = [];
let coreCalls = [];
let rpcCalls = [];
let rateCalls = [];
let revokeCalls = [];
let actionCookie = "";

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

const roleByToken = { "courier-token": "courier", "cook-token": "cook" };
const expiry = new Date(Date.now() + 86400000).toISOString();
const mockModules = {
  "server-only": () => ({}),
  "next/server": () => ({ NextResponse: NextResponseShim }),
  "next/headers": () => ({ cookies: async () => ({ get: (name) => name === "aldriva_kitchen_session" && actionCookie ? { value: actionCookie } : undefined, set() {} }) }),
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
    COURIER_INVITE_COOKIE: "aldriva_courier_invite",
    COURIER_INVITE_COOKIE_PATH: "/api/courier/accept",
    COURIER_SESSION_COOKIE: "aldriva_courier_session",
    KITCHEN_DISPLAY_COOKIE: "aldriva_kitchen_display",
    KITCHEN_SESSION_COOKIE: "aldriva_kitchen_session",
    generateWorkerToken: () => "b".repeat(64),
    hashWorkerToken: (token) => crypto.createHash("sha256").update(token).digest("hex"),
    consumeCourierInvitation: async () => ({ sessionToken: "new-courier-session", workerId: "courier-1", businessId: "business-a", kitchenId: null, expiresAt: expiry }),
    readRequestCookie: (request, name) => {
      const part = (request.headers.get("cookie") ?? "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
      return part ? part.slice(name.length + 1) : null;
    },
    validateAndRenewWorkerSession: async (token, expectedRole) => {
      const role = roleByToken[token];
      if (role !== expectedRole) return null;
      return { workerId: `${role}-1`, businessId: "business-a", kitchenId: role === "cook" ? "kitchen-a" : null, role, expiresAt: expiry };
    },
    revokeWorkerSession: async (token) => { revokeCalls.push(token); },
    validateKitchenDisplayToken: async () => null,
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

function reset(tables = {}, rpcHandler = null) {
  db = makeDb(tables, rpcHandler);
  deniedRate = false;
  coreResult = { success: true, nextStatus: "delivered", paymentStatus: "paid" };
  effectsCalls = [];
  coreCalls = [];
  rpcCalls = [];
  rateCalls = [];
  revokeCalls = [];
  actionCookie = "";
}

test("mocked: cook sessions are denied by courier routes and courier sessions are denied by kitchen routes", async () => {
  reset();
  const courierRoute = load("app/api/courier/orders/route.ts");
  const courierDenied = await courierRoute.GET(request("http://local/api/courier/orders", "GET", undefined, "aldriva_courier_session=cook-token"));
  assert.equal(courierDenied.status, 401);

  const kitchenRoute = load("app/api/kitchen/session/route.ts");
  const kitchenDenied = await kitchenRoute.GET(request("http://local/api/kitchen/session", "GET", undefined, "aldriva_kitchen_session=courier-token"));
  assert.equal(kitchenDenied.status, 401);
  assert.equal(kitchenDenied.headers.get("Cache-Control"), "no-store, max-age=0");

  const kitchenOrders = load("app/api/kitchen/orders/route.ts");
  const ordersDenied = await kitchenOrders.GET(request("http://local/api/kitchen/orders", "GET", undefined, "aldriva_kitchen_session=courier-token"));
  assert.equal(ordersDenied.status, 401);

  const kitchenLogout = load("app/api/kitchen/logout/route.ts");
  const logoutResponse = await kitchenLogout.POST(request("http://local/api/kitchen/logout", "POST", undefined, "aldriva_kitchen_session=courier-token"));
  assert.equal(logoutResponse.status, 200);
  assert.deepEqual(revokeCalls, [], "a courier token is not revoked through the cook logout route");

  actionCookie = "courier-token";
  const cookTransition = load("lib/actions/kitchen-orders.ts");
  const transitionResult = await cookTransition.transitionKitchenOrder("00000000-0000-4000-8000-000000000001", "accepted", "preparing");
  assert.deepEqual(transitionResult, { success: false, error: "unauthorized" });
});

test("mocked: cook sessions are denied by every session-protected courier route", async () => {
  reset();
  const sessionRoute = load("app/api/courier/session/route.ts");
  assert.equal((await sessionRoute.GET(request("http://local/api/courier/session", "GET", undefined, "aldriva_courier_session=cook-token"))).status, 401);

  const logoutRoute = load("app/api/courier/logout/route.ts");
  await logoutRoute.POST(request("http://local/api/courier/logout", "POST", undefined, "aldriva_courier_session=cook-token"));
  assert.deepEqual(revokeCalls, []);

  const availability = load("app/api/courier/availability/route.ts");
  assert.equal((await availability.PATCH(request("http://local/api/courier/availability", "PATCH", { isAvailable: true }, "aldriva_courier_session=cook-token"))).status, 401);

  const id = "00000000-0000-4000-8000-000000000006";
  const accept = load("app/api/courier/offers/[orderId]/accept/route.ts");
  assert.equal((await accept.POST(request(`http://local/api/courier/offers/${id}/accept`, "POST", {}, "aldriva_courier_session=cook-token"), { params: Promise.resolve({ orderId: id }) })).status, 401);
  const decline = load("app/api/courier/offers/[orderId]/decline/route.ts");
  assert.equal((await decline.POST(request(`http://local/api/courier/offers/${id}/decline`, "POST", {}, "aldriva_courier_session=cook-token"), { params: Promise.resolve({ orderId: id }) })).status, 401);
  const delivered = load("app/api/courier/orders/[orderId]/delivered/route.ts");
  assert.equal((await delivered.POST(request(`http://local/api/courier/orders/${id}/delivered`, "POST", {}, "aldriva_courier_session=cook-token"), { params: Promise.resolve({ orderId: id }) })).status, 401);
  assert.equal(rpcCalls.length, 0);
  assert.equal(db.writes.length, 0);
});

test("mocked: courier feed returns safe offers plus customer details only on the active assignment", async () => {
  reset({
    business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, is_available: true }],
    business_courier_offer_feed: [{ offer_id: "offer-open", order_id: "order-open", business_id: "business-a", courier_worker_id: "courier-1", offered_at: "2026-10-21T10:00:00Z", pickup_name: "Cafe", pickup_address: "1 Main St", delivery_address: "2 Side St", items: [{ name: "Rice" }], amount_to_collect: 500, currency: "XOF" }],
    business_courier_offers: [
      { id: "offer-taken", order_id: "order-taken", business_id: "business-a", courier_worker_id: "courier-1", status: "taken", offered_at: "2026-10-21T09:00:00Z" },
      { id: "offer-declined", order_id: "order-declined", business_id: "business-a", courier_worker_id: "courier-1", status: "declined", decline_message: "Too far", declined_at: "2026-10-21T09:30:00Z" },
    ],
    orders: [
      { id: "active", business_id: "business-a", courier_worker_id: "courier-1", status: "out_for_delivery", order_number: "A1", customer_name: "Private Name", customer_phone: "5551000", delivery_address: "active address", items: [{ name: "Soup" }], payment_method: "on_fulfilment", payment_status: "unpaid", total_amount: 700, currency: "XOF", updated_at: "2026-10-21T10:00:00Z" },
      { id: "order-taken", business_id: "business-a", delivery_address: "taken address", items: [], payment_method: "on_fulfilment", payment_status: "unpaid", total_amount: 300, currency: "XOF", customer_name: "Must not leak", customer_phone: "5559999" },
      { id: "order-declined", business_id: "business-a", delivery_address: "declined address", items: [], payment_method: "online", payment_status: "paid", total_amount: 800, currency: "XOF", customer_name: "Must not leak", customer_phone: "5559999" },
    ],
    businesses: [{ id: "business-a", name: "Cafe", address: "1 Main St" }],
  });
  const route = load("app/api/courier/orders/route.ts");
  const response = await route.GET(request("http://local/api/courier/orders", "GET", undefined, "aldriva_courier_session=courier-token"));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.offers.length, 1);
  assert.equal("customerName" in payload.offers[0], false);
  assert.equal(payload.assignedOrder.customerName, "Private Name");
  assert.equal(payload.assignedOrder.customerPhone, "5551000");
  assert.equal(payload.assignedOrder.amountToCollect, 700);
  assert.equal(payload.resolvedOffers.find((offer) => offer.status === "taken").customerName, undefined);
  assert.equal(payload.resolvedOffers.find((offer) => offer.status === "declined").declineMessage, "Too far");
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(rateCalls[0].name, "courierFeed");
  assert.equal(rateCalls[0].identifier, `session:${crypto.createHash("sha256").update("courier-token").digest("hex")}`);
  assert.ok(db.reads.some((query) => query.table === "business_courier_offer_feed" && query.filters.some(([key, value]) => key === "courier_worker_id" && value === "courier-1") && query.filters.some(([key, value]) => key === "business_id" && value === "business-a")));
});

test("mocked: courier feed fails closed when its session-hash limiter denies the request", async () => {
  reset();
  deniedRate = true;
  const route = load("app/api/courier/orders/route.ts");
  const response = await route.GET(request("http://local/api/courier/orders", "GET", undefined, "aldriva_courier_session=courier-token"));
  assert.equal(response.status, 429);
  assert.equal(db.reads.length, 0);
});

test("mocked: successful offer claim uses the session worker and runs only post-persist effects", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  reset({ orders: [{ id, organizer_id: "organizer-a", business_id: "business-a", order_number: "A-1", status: "out_for_delivery", courier_worker_id: "courier-1", payment_method: "on_fulfilment", payment_status: "unpaid", provider: null, provider_reference: null, customer_email: null, customer_name: "Ada", customer_phone: "5551234", fulfilment_type: "delivery", delivery_address: "2 Side St", items: [{ name: "Rice" }], currency: "XOF", total_amount: 500, tracking_token: "track", website_id: null, status_history: [], estimated_ready_at: null, rider_name: "Courier", rider_phone: "5551234" }] }, async (name) => name === "claim_business_courier_offer"
    ? { data: [{ out_order_id: id, out_business_id: "business-a", out_worker_id: "courier-1", out_customer_name: "Ada", out_customer_phone: "5551234" }], error: null }
    : { data: [], error: null });
  const route = load("app/api/courier/offers/[orderId]/accept/route.ts");
  const response = await route.POST(request(`http://local/api/courier/offers/${id}/accept`, "POST", {} , "aldriva_courier_session=courier-token"), { params: Promise.resolve({ orderId: id }) });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.order.customerName, "Ada");
  assert.equal(payload.order.customerPhone, "5551234");
  assert.equal(rpcCalls[0].params.p_worker_id, "courier-1");
  assert.equal(rpcCalls[0].params.p_history_entry.status, "out_for_delivery");
  assert.equal(effectsCalls.length, 1);
  assert.equal(db.writes.length, 0, "the route never issues a second order status write");
});

test("mocked: a zero-row claim returns taken without customer data or side effects", async () => {
  const id = "00000000-0000-4000-8000-000000000002";
  reset({}, async () => ({ data: [], error: null }));
  const route = load("app/api/courier/offers/[orderId]/accept/route.ts");
  const response = await route.POST(request(`http://local/api/courier/offers/${id}/accept`, "POST", {}, "aldriva_courier_session=courier-token"), { params: Promise.resolve({ orderId: id }) });
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.match(payload.error, /taken/i);
  assert.equal(JSON.stringify(payload).includes("customer"), false);
  assert.equal(effectsCalls.length, 0);
});

test("mocked: decline limits message length and calls only the courier-specific RPC", async () => {
  const id = "00000000-0000-4000-8000-000000000003";
  reset({}, async (name) => name === "decline_business_courier_offer" ? { data: true, error: null } : { data: [], error: null });
  const route = load("app/api/courier/offers/[orderId]/decline/route.ts");
  const tooLong = await route.POST(request(`http://local/api/courier/offers/${id}/decline`, "POST", { message: "x".repeat(301) }, "aldriva_courier_session=courier-token"), { params: Promise.resolve({ orderId: id }) });
  assert.equal(tooLong.status, 400);
  assert.equal(rpcCalls.length, 0);
  const response = await route.POST(request(`http://local/api/courier/offers/${id}/decline`, "POST", { message: "Too far" }, "aldriva_courier_session=courier-token"), { params: Promise.resolve({ orderId: id }) });
  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls[0], { name: "decline_business_courier_offer", params: { p_order_id: id, p_worker_id: "courier-1", p_message: "Too far" } });
});

test("mocked: delivered requires cash confirmation and uses the shared transition core", async () => {
  const id = "00000000-0000-4000-8000-000000000004";
  const order = { id, organizer_id: "organizer-a", business_id: "business-a", order_number: "A-4", status: "out_for_delivery", courier_worker_id: "courier-1", payment_method: "on_fulfilment", payment_status: "unpaid", provider: null, provider_reference: null, customer_email: null, customer_name: "Ada", fulfilment_type: "delivery", currency: "XOF", total_amount: 500, tracking_token: "tracking", website_id: null, status_history: [], estimated_ready_at: null, rider_name: "Courier", rider_phone: "5551234" };
  reset({ business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, full_name: "Courier One" }], orders: [order] });
  const route = load("app/api/courier/orders/[orderId]/delivered/route.ts");
  const missingConfirmation = await route.POST(request(`http://local/api/courier/orders/${id}/delivered`, "POST", {}, "aldriva_courier_session=courier-token"), { params: Promise.resolve({ orderId: id }) });
  assert.equal(missingConfirmation.status, 400);
  assert.equal(coreCalls.length, 0);

  const confirmed = await route.POST(request(`http://local/api/courier/orders/${id}/delivered`, "POST", { cashCollectedConfirmed: true }, "aldriva_courier_session=courier-token"), { params: Promise.resolve({ orderId: id }) });
  assert.equal(confirmed.status, 200);
  assert.equal(coreCalls.length, 1);
  assert.equal(coreCalls[0][0].nextStatus, "delivered");
  assert.equal(coreCalls[0][0].markPaymentCollected, true);
  assert.match(coreCalls[0][0].historyNote, /cash collected/i);
  assert.deepEqual(coreCalls[0][6], { workerId: "courier-1", workerName: "Courier One" });
});

test("mocked: courier cannot mark an unpaid online payment as collected", async () => {
  const id = "00000000-0000-4000-8000-000000000005";
  const order = { id, organizer_id: "organizer-a", business_id: "business-a", status: "out_for_delivery", courier_worker_id: "courier-1", payment_method: "online", payment_status: "unpaid", payment_expires_at: null, provider: "stripe", provider_reference: null, customer_email: null, customer_name: "Ada", order_number: "A-5", fulfilment_type: "delivery", currency: "XOF", total_amount: 500, tracking_token: "tracking", website_id: null, status_history: [], estimated_ready_at: null, rider_name: "Courier", rider_phone: "5551234" };
  coreResult = { success: false, error: "online_payment_cannot_be_manually_marked_paid", message: "Unpaid online orders cannot be manually marked as paid." };
  reset({ business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, full_name: "Courier One" }], orders: [order] });
  coreResult = { success: false, error: "online_payment_cannot_be_manually_marked_paid", message: "Unpaid online orders cannot be manually marked as paid." };
  const route = load("app/api/courier/orders/[orderId]/delivered/route.ts");
  const response = await route.POST(request(`http://local/api/courier/orders/${id}/delivered`, "POST", { cashCollectedConfirmed: true }, "aldriva_courier_session=courier-token"), { params: Promise.resolve({ orderId: id }) });
  assert.equal(response.status, 400);
  assert.equal(coreCalls[0][0].markPaymentCollected, false);
});

test("mocked: courier availability update is scoped and derives active-order state", async () => {
  reset({
    business_workers: [{ id: "courier-1", business_id: "business-a", role: "courier", is_active: true, deactivated_at: null, is_available: false }],
    orders: [{ id: "active", business_id: "business-a", courier_worker_id: "courier-1", status: "out_for_delivery" }],
  });
  const route = load("app/api/courier/availability/route.ts");
  const response = await route.PATCH(request("http://local/api/courier/availability", "PATCH", { isAvailable: true }, "aldriva_courier_session=courier-token"));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.state, "On delivery");
  const write = db.writes.find((entry) => entry.table === "business_workers");
  assert.ok(write.filters.some(([key, value]) => key === "id" && value === "courier-1"));
  assert.ok(write.filters.some(([key, value]) => key === "business_id" && value === "business-a"));
  assert.ok(write.filters.some(([key, value]) => key === "role" && value === "courier"));
});

test("mocked: bootstrap and accept use separate courier cookies and role-checked consume", async () => {
  const invite = "a".repeat(64);
  reset({
    business_worker_invitations: [{ id: "invite-row", worker_id: "courier-1", token_hash: crypto.createHash("sha256").update(invite).digest("hex"), expires_at: "2999-01-01T00:00:00Z", token_consumed_at: null, revoked_at: null }],
    business_workers: [{ id: "courier-1", role: "courier", is_active: true, deactivated_at: null }],
  });
  const bootstrap = load("app/api/courier/accept/bootstrap/route.ts");
  const bootstrapResponse = await bootstrap.POST(request("http://local/api/courier/accept/bootstrap", "POST", { token: invite }));
  assert.equal(bootstrapResponse.status, 200);
  assert.match(bootstrapResponse.headers.get("set-cookie"), /aldriva_courier_invite=/);

  const accept = load("app/api/courier/accept/route.ts");
  const response = await accept.POST(request("http://local/api/courier/accept", "POST", { phoneLast4: "1234" }, `aldriva_courier_invite=${invite}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /aldriva_courier_session=/);
  assert.match(response.headers.get("set-cookie"), /aldriva_courier_invite=; Path=\/api\/courier\/accept; Max-Age=0/);
});

test("mocked: courier logout revokes only the courier session and carries privacy headers", async () => {
  reset();
  const route = load("app/api/courier/logout/route.ts");
  const response = await route.POST(request("http://local/api/courier/logout", "POST", undefined, "aldriva_courier_session=courier-token"));
  assert.equal(response.status, 200);
  assert.deepEqual(revokeCalls, ["courier-token"]);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
});

test("mocked: courier management creates offline courier records and returns a one-time link", async () => {
  reset({ businesses: [{ id: "business-a", organizer_id: "organizer-a", name: "Cafe" }] });
  const action = load("lib/actions/courier-management.ts");
  const result = await action.createCourier({ organizerId: "organizer-a", businessId: "business-a", fullName: "Courier One", phone: "+233 555 1234", whatsappNumber: "+233 555 1234" });
  assert.equal(result.ok, true);
  assert.equal(result.path, "/courier/accept");
  assert.equal(db.tables.business_workers[0].role, "courier");
  assert.equal(db.tables.business_workers[0].is_available, false);
  assert.notEqual(db.tables.business_worker_invitations[0].token_hash, result.token);
  assert.equal(db.tables.business_worker_invitations[0].token_hash.length, 64);
});

test("mocked: courier management derives in-progress state even while the courier toggle is offline", async () => {
  reset({
    businesses: [{ id: "business-a", organizer_id: "organizer-a", name: "Cafe" }],
    business_workers: [{ id: "courier-1", business_id: "business-a", full_name: "Courier One", phone: "5551234", whatsapp_number: "5551234", role: "courier", is_active: true, deactivated_at: null, is_available: false }],
    business_worker_invitations: [{ worker_id: "courier-1", accepted_at: "2026-10-21T10:00:00Z", expires_at: "2999-01-01T00:00:00Z", revoked_at: null }],
    orders: [{ id: "active", courier_worker_id: "courier-1", status: "out_for_delivery" }],
  });
  const action = load("lib/actions/courier-management.ts");
  const result = await action.getCourierManagementData("organizer-a");
  assert.equal(result.ok, true);
  assert.equal(result.businesses[0].couriers[0].state, "Offline, delivery in progress");
  assert.equal(result.businesses[0].couriers[0].hasActiveOrder, true);
});

process.on("exit", () => {
  Module._resolveFilename = originalResolve;
  Module._load = originalLoad;
});
