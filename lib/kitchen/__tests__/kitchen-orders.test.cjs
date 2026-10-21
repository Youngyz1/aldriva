const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let db;
let sessionCalls;
let displayCalls;
let coreCalls;
let sessions;
let displayScopes;
let cookieValues;
let cookieWrites;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

class FakeQuery {
  constructor(owner, table) {
    this.owner = owner;
    this.table = table;
    this.filters = [];
    this.selected = "";
    this.rowLimit = null;
    this.mode = "select";
    this.patch = null;
    this.one = false;
  }
  select(columns) { this.selected = columns; return this; }
  eq(key, value) { this.filters.push([key, value, "eq"]); return this; }
  is(key, value) { this.filters.push([key, value, "is"]); return this; }
  not(key, operator, value) { this.filters.push([key, value, `not:${operator}`]); return this; }
  in(key, values) { this.filters.push([key, values, "in"]); return this; }
  order() { return this; }
  limit(value) { this.rowLimit = value; return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  update(patch) { this.mode = "update"; this.patch = patch; return this; }
  matches(row) {
    return this.filters.every(([key, value, operator]) => {
      if (operator === "eq") return row[key] === value;
      if (operator === "is") return value === null ? row[key] == null : row[key] === value;
      if (operator === "in") return value.includes(row[key]);
      if (operator === "not:is") return value === null ? row[key] != null : row[key] !== value;
      return false;
    });
  }
  execute() {
    const rows = this.owner.tables[this.table] ?? (this.owner.tables[this.table] = []);
    this.owner.queries.push({ table: this.table, mode: this.mode, filters: this.filters, selected: this.selected, rowLimit: this.rowLimit });
    let matched = rows.filter((row) => this.matches(row));
    if (this.mode === "update") {
      for (const row of matched) Object.assign(row, this.patch);
      this.owner.writes.push({ table: this.table, patch: this.patch, filters: this.filters });
    }
    if (this.rowLimit !== null) matched = matched.slice(0, this.rowLimit);
    return this.one ? matched[0] ?? null : matched;
  }
  then(resolve, reject) {
    try { resolve({ data: this.execute(), error: null }); }
    catch (error) { reject(error); }
  }
}

function makeDb(tables = {}) {
  return {
    tables: structuredClone(tables),
    queries: [],
    writes: [],
    from(table) { return new FakeQuery(this, table); },
  };
}

class NextResponseShim extends Response {
  constructor(body, init) {
    super(body, init);
    this.cookies = {
      set: (name, value, options) => {
        const attributes = [`${name}=${value}`, `Path=${options.path}`];
        if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`);
        if (options.httpOnly) attributes.push("HttpOnly");
        if (options.secure) attributes.push("Secure");
        if (options.sameSite) attributes.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
        this.headers.append("Set-Cookie", attributes.join("; "));
      },
    };
  }
  static json(value, init = {}) {
    return new NextResponseShim(JSON.stringify(value), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  }
}

const mockModules = {
  "next/headers": () => ({ cookies: async () => ({
    get: (name) => cookieValues[name] ? { value: cookieValues[name] } : undefined,
    set: (name, value, options) => cookieWrites.push({ name, value, options }),
  }) }),
  "next/server": () => ({ NextResponse: NextResponseShim }),
  "@/lib/supabase-admin": () => ({ createSupabaseAdmin: () => db }),
  "@/lib/kitchen/worker-session": () => ({
    KITCHEN_SESSION_COOKIE: "aldriva_kitchen_session",
    KITCHEN_DISPLAY_COOKIE: "aldriva_kitchen_display",
    readRequestCookie: (request, name) => {
      const part = (request.headers.get("cookie") ?? "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
      return part ? part.slice(name.length + 1) : null;
    },
    validateAndRenewWorkerSession: async (token, expectedRole) => {
      sessionCalls++;
      const session = sessions[token] ?? null;
      return session?.role === expectedRole ? session : null;
    },
    validateKitchenDisplayToken: async (token) => { displayCalls++; return displayScopes[token] ?? null; },
  }),
  "@/lib/kitchen/http": () => ({
    kitchenJson: (body, status = 200) => NextResponseShim.json(body, {
      status,
      headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
    }),
    setSessionCookie: (response, token, expiresAt) => response.cookies.set("aldriva_kitchen_session", token, {
      path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: Math.floor((Date.parse(expiresAt) - Date.now()) / 1000),
    }),
  }),
  "@/lib/orders/transition-core": () => ({
    executeOrderStatusTransitionCore: async (...args) => {
      coreCalls.push(args);
      return { success: true, nextStatus: args[0].nextStatus, paymentStatus: "unpaid" };
    },
  }),
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "server-only") return {};
  if (mockModules[request]) return mockModules[request]();
  return originalLoad.call(this, request, parent, isMain);
};

function load(rel) {
  const filename = path.join(ROOT, rel);
  delete require.cache[filename];
  return require(filename);
}

function reset(tables = {}) {
  db = makeDb(tables);
  sessionCalls = 0;
  displayCalls = 0;
  coreCalls = [];
  sessions = {};
  displayScopes = {};
  cookieValues = {};
  cookieWrites = [];
}

function orderRow(overrides = {}) {
  const now = Date.now();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    business_id: "business-a",
    organizer_id: "organizer-a",
    order_number: "ORD-20261020-1234",
    status: "accepted",
    fulfilment_type: "pickup",
    customer_name: "Ama Mensah",
    customer_phone: "+233555000123",
    customer_email: "ama@example.test",
    delivery_address: "12 Private Road",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    total_amount: 9900,
    items: [{ name: "Chimchim", quantity: 2, line_total: 500, chosen_options: [{ name: "Extra spice", qty: 1 }] }],
    customer_note: "No pepper",
    created_at: new Date(now - 2 * 60_000).toISOString(),
    updated_at: new Date(now - 1 * 60_000).toISOString(),
    status_history: [{ status: "accepted", at: new Date(now - 1 * 60_000).toISOString() }],
    estimated_ready_at: new Date(now + 15 * 60_000).toISOString(),
    ...overrides,
  };
}

function sessionFixture(overrides = {}) {
  return {
    workerId: "cook-a",
    businessId: "business-a",
    kitchenId: "kitchen-a",
    role: "cook",
    expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60_000).toISOString(),
    ...overrides,
  };
}

function apiRequest(cookie) {
  return new Request("http://local/api/kitchen/orders", { headers: { Cookie: cookie } });
}

test("mocked: cook action validates every session and passes a cook-only scoped transition", async () => {
  reset({
    business_workers: [{ id: "cook-a", business_id: "business-a", kitchen_id: "kitchen-a", role: "cook", is_active: true, deactivated_at: null, full_name: "Ama Cook" }],
    orders: [orderRow()],
  });
  sessions.session = sessionFixture();
  cookieValues.aldriva_kitchen_session = "session";

  const action = load("lib/actions/kitchen-orders.ts");
  const result = await action.transitionKitchenOrder("00000000-0000-4000-8000-000000000001", "accepted", "preparing");
  assert.deepEqual(result, { success: true, nextStatus: "preparing" });
  assert.equal(sessionCalls, 1);
  assert.equal(coreCalls.length, 1);
  const [input, , userId, , supports174, supports175, attribution, paths, expectedBusinessId] = coreCalls[0];
  assert.equal(input.expectedCurrentStatus, "accepted");
  assert.equal(input.nextStatus, "preparing");
  assert.equal(userId, null);
  assert.equal(supports174, true);
  assert.equal(supports175, false);
  assert.deepEqual(attribution, { workerId: "cook-a", workerName: "Ama Cook" });
  assert.deepEqual(paths, ["/kitchen"]);
  assert.equal(expectedBusinessId, "business-a");
  assert.ok(db.queries.some((query) => query.table === "orders" && query.filters.some(([key, value, op]) => key === "business_id" && value === "business-a" && op === "eq")));
  assert.equal(cookieWrites.length, 1);
  assert.equal(cookieWrites[0].options.httpOnly, true);
  assert.equal(cookieWrites[0].options.secure, true);
  assert.equal(cookieWrites[0].options.sameSite, "lax");

  db.tables.orders[0].status = "preparing";
  const readyResult = await action.transitionKitchenOrder("00000000-0000-4000-8000-000000000001", "preparing", "ready");
  assert.deepEqual(readyResult, { success: true, nextStatus: "ready" });
  assert.equal(sessionCalls, 2);
  assert.equal(coreCalls.length, 2);
  assert.equal(coreCalls[1][0].expectedCurrentStatus, "preparing");
  assert.equal(coreCalls[1][0].nextStatus, "ready");
});

test("mocked: cook action rejects forbidden transitions and null-business orders before the shared core", async () => {
  reset({
    business_workers: [{ id: "cook-a", business_id: "business-a", kitchen_id: "kitchen-a", role: "cook", is_active: true, deactivated_at: null, full_name: "Ama Cook" }],
    orders: [orderRow({ business_id: null })],
  });
  sessions.session = sessionFixture();
  cookieValues.aldriva_kitchen_session = "session";
  const action = load("lib/actions/kitchen-orders.ts");

  assert.deepEqual(
    await action.transitionKitchenOrder("00000000-0000-4000-8000-000000000001", "accepted", "ready"),
    { success: false, error: "invalid_transition" }
  );
  assert.equal(sessionCalls, 1);
  assert.equal(coreCalls.length, 0);

  assert.deepEqual(
    await action.transitionKitchenOrder("00000000-0000-4000-8000-000000000001", "accepted", "preparing"),
    { success: false, error: "not_found" }
  );
  assert.equal(sessionCalls, 2);
  assert.equal(coreCalls.length, 0);

  sessions.session = sessionFixture({ role: "courier" });
  assert.deepEqual(
    await action.transitionKitchenOrder("00000000-0000-4000-8000-000000000001", "accepted", "preparing"),
    { success: false, error: "unauthorized" }
  );
  assert.equal(sessionCalls, 3);
  assert.equal(coreCalls.length, 0);
});

test("mocked: transition action rejects a display-cookie-only request", async () => {
  reset();
  cookieValues.aldriva_kitchen_display = "display-only";
  const action = load("lib/actions/kitchen-orders.ts");

  assert.deepEqual(
    await action.transitionKitchenOrder("00000000-0000-4000-8000-000000000001", "accepted", "preparing"),
    { success: false, error: "unauthorized" }
  );
  assert.equal(sessionCalls, 0);
  assert.equal(displayCalls, 0);
  assert.equal(coreCalls.length, 0);
});

test("mocked: orders API validates cook session and returns only kitchen-safe fields", async () => {
  const now = Date.now();
  reset({
    orders: [
      orderRow(),
      orderRow({ id: "preparing-id", order_number: "ORD-20261020-2345", status: "preparing", fulfilment_type: "delivery", customer_name: "Bola Private", customer_note: "Call me", status_history: [{ status: "accepted", at: new Date(now - 20 * 60_000).toISOString() }, { status: "preparing", at: new Date(now - 10 * 60_000).toISOString() }] }),
      orderRow({ id: "ready-recent", order_number: "ORD-20261020-3456", status: "ready", status_history: [{ status: "accepted", at: new Date(now - 2 * 60 * 60_000).toISOString() }, { status: "ready", at: new Date(now - 30 * 60_000).toISOString() }] }),
      orderRow({ id: "ready-old", order_number: "ORD-20261020-4567", status: "ready", status_history: [{ status: "ready", at: new Date(now - 7 * 60 * 60_000).toISOString() }] }),
      orderRow({ id: "pending-id", status: "pending" }),
      orderRow({ id: "null-business", business_id: null }),
    ],
  });
  sessions.session = sessionFixture();
  const route = load("app/api/kitchen/orders/route.ts");
  const response = await route.GET(apiRequest("aldriva_kitchen_session=session"));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(sessionCalls, 1);
  assert.equal(payload.viewer, "cook");
  assert.equal(payload.rowLimit, 100);
  assert.deepEqual(payload.orders.map((order) => order.id).sort(), ["00000000-0000-4000-8000-000000000001", "preparing-id", "ready-recent"].sort());
  const pickup = payload.orders.find((order) => order.id === "00000000-0000-4000-8000-000000000001");
  assert.equal(pickup.shortCode, "1234");
  assert.equal(pickup.orderNumber, "ORD-20261020-1234");
  assert.equal(pickup.fulfilmentType, "PICKUP");
  assert.equal(pickup.customerFirstName, "Ama");
  assert.equal(pickup.isNew, true);
  assert.deepEqual(pickup.items, [{ name: "Chimchim", quantity: 2, options: [{ name: "Extra spice", quantity: 1 }] }]);
  assert.equal(pickup.customerNote, "No pepper");
  assert.equal(payload.orders.find((order) => order.id === "preparing-id").customerFirstName, null);
  assert.equal(payload.orders.find((order) => order.id === "ready-recent").readyAt, new Date(now - 30 * 60_000).toISOString());
  assert.deepEqual(Object.keys(pickup).sort(), ["id", "status", "shortCode", "orderNumber", "fulfilmentType", "customerFirstName", "items", "customerNote", "createdAt", "updatedAt", "acceptedAt", "estimatedReadyAt", "readyAt", "isNew"].sort());
  const serialized = JSON.stringify(payload);
  for (const privateValue of ["+233555000123", "ama@example.test", "12 Private Road", "Bola Private", "payment_status", "total_amount", "unpaid"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  const orderQueries = db.queries.filter((query) => query.table === "orders");
  assert.deepEqual(orderQueries.map((query) => query.rowLimit), [50, 50]);
  assert.ok(orderQueries.every((query) => query.filters.some(([key, value]) => key === "business_id" && value === "business-a")));
  assert.ok(orderQueries.every((query) => query.filters.some(([key, value, operator]) => key === "business_id" && value === null && operator === "not:is")));
  assert.ok(orderQueries.every((query) => !/customer_phone|customer_email|delivery_address|payment_|total_amount/.test(query.selected)));
});

test("mocked: cook session wins when both cook and display cookies are present", async () => {
  reset({
    orders: [
      orderRow({ id: "cook-business-order", business_id: "business-a" }),
      orderRow({ id: "display-business-order", business_id: "business-b" }),
    ],
  });
  sessions.cookSession = sessionFixture({ businessId: "business-a" });
  displayScopes.displayToken = { businessId: "business-b", kitchenId: "kitchen-b" };

  const route = load("app/api/kitchen/orders/route.ts");
  const response = await route.GET(apiRequest(
    "aldriva_kitchen_session=cookSession; aldriva_kitchen_display=displayToken"
  ));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.viewer, "cook");
  assert.equal(sessionCalls, 1);
  assert.equal(displayCalls, 0);
  assert.deepEqual(payload.orders.map((order) => order.id), ["cook-business-order"]);
});

test("mocked: display link scopes the orders API to its stored business", async () => {
  reset({ orders: [orderRow({ id: "biz-a-order", business_id: "business-a" }), orderRow({ id: "biz-b-order", business_id: "business-b" })] });
  displayScopes.display = { businessId: "business-b", kitchenId: "kitchen-b" };
  const route = load("app/api/kitchen/orders/route.ts");
  const response = await route.GET(apiRequest("aldriva_kitchen_display=display"));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(displayCalls, 1);
  assert.equal(payload.viewer, "display");
  assert.deepEqual(payload.orders.map((order) => order.id), ["biz-b-order"]);
  assert.deepEqual(Object.keys(payload.orders[0]).sort(), ["id", "status", "shortCode", "orderNumber", "fulfilmentType", "customerFirstName", "items", "customerNote", "createdAt", "updatedAt", "acceptedAt", "estimatedReadyAt", "readyAt", "isNew"].sort());
  const serialized = JSON.stringify(payload);
  for (const privateValue of ["+233555000123", "ama@example.test", "12 Private Road", "payment_status", "total_amount", "unpaid"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("mocked: board polls only while visible, displays NEW, and has no sound trigger", () => {
  const board = fs.readFileSync(path.join(ROOT, "components/dashboard/kitchen/KitchenBoard.tsx"), "utf8");
  const card = fs.readFileSync(path.join(ROOT, "components/dashboard/kitchen/KitchenOrderCard.tsx"), "utf8");
  assert.match(board, /POLL_INTERVAL_MS\s*=\s*30_000/);
  assert.match(board, /document\.visibilityState\s*!==\s*"visible"/);
  assert.match(board, /visibilitychange/);
  assert.match(card, />NEW<\/span>/);
  assert.doesNotMatch(`${board}\n${card}`, /new Audio|\.play\(/i);
});

test("mocked: display mode receives server viewer state and renders no transition actions", () => {
  const board = fs.readFileSync(path.join(ROOT, "components/dashboard/kitchen/KitchenBoard.tsx"), "utf8");
  assert.match(board, /setViewer\(payload\.viewer\)/);
  assert.match(board, /canUpdate=\{viewer === "cook"\}/);

  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { KitchenOrderCard } = load("components/dashboard/kitchen/KitchenOrderCard.tsx");
  const order = {
    id: "order-1", status: "accepted", shortCode: "1234", orderNumber: "ORD-1234",
    fulfilmentType: "PICKUP", customerFirstName: "Ama", items: [], customerNote: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), acceptedAt: null,
    estimatedReadyAt: null, readyAt: null, isNew: true,
  };
  const displayMarkup = renderToStaticMarkup(React.createElement(KitchenOrderCard, {
    order, canUpdate: false, busy: false, onTransition() {},
  }));
  assert.doesNotMatch(displayMarkup, /Start preparing|Mark ready/);
  const cookMarkup = renderToStaticMarkup(React.createElement(KitchenOrderCard, {
    order, canUpdate: true, busy: false, onTransition() {},
  }));
  assert.match(cookMarkup, /Start preparing/);
});

test("mocked: board starts non-updatable before its first API response", () => {
  const board = fs.readFileSync(path.join(ROOT, "components/dashboard/kitchen/KitchenBoard.tsx"), "utf8");
  assert.match(board, /useState<"cook" \| "display" \| null>\(null\)/);
  assert.match(board, /canUpdate=\{viewer === "cook"\}/);

  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const KitchenBoard = load("components/dashboard/kitchen/KitchenBoard.tsx").default;
  const markup = renderToStaticMarkup(React.createElement(KitchenBoard));
  assert.match(markup, /Loading kitchen orders/);
  assert.doesNotMatch(markup, /Start preparing|Mark ready/);
});

test.after(() => {
  Module._load = originalLoad;
  Module._resolveFilename = originalResolve;
});
