/**
 * H3 regression tests: GET /api/crypto/status.
 *
 * Previous exploit: knowing an `orderId` returned the ticket `qrCode`
 * (a bearer entry credential) with no authorization. Fixed: public order
 * status stays visible, but `qrCode` is disclosed only to the buyer — via a
 * matching `?email=` proof or the authenticated session email.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.NOWPAYMENTS_API_KEY ??= "test-nowpayments-key";

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const TICKET_ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DONE_ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

const tables = {
  donations: [],
  ticket_orders: [
    {
      id: TICKET_ORDER_ID,
      status: "pending",
      event_id: "e1",
      qr_code: "SECRET-QR-1",
      stripe_payment_intent_id: "np_1",
      buyer_email: "Buyer@Example.com",
      event: { slug: "show" },
    },
    {
      id: DONE_ORDER_ID,
      status: "valid",
      event_id: "e1",
      qr_code: "SECRET-QR-2",
      stripe_payment_intent_id: "np_2",
      buyer_email: "buyer2@example.com",
      event: { slug: "show" },
    },
  ],
  product_orders: [],
};

function makeQuery(table) {
  const rows = tables[table] ?? [];
  const filters = [];
  const q = {
    select() { return q; },
    eq(field, value) { filters.push([field, value]); return q; },
    async maybeSingle() {
      const hit = rows.find((r) => filters.every(([f, v]) => r[f] === v));
      return { data: hit ?? null, error: null };
    },
  };
  return q;
}

const fakeAdmin = { from: (table) => makeQuery(table) };
let currentUser = null;

// NOWPayments stub: always "waiting" so DB status decides.
const realFetch = global.fetch;
global.fetch = async () => ({
  ok: true,
  json: async () => ({ payment_status: "waiting" }),
});

class NextResponseShim extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") {
    return { NextResponse: NextResponseShim };
  }
  if (request === "@supabase/supabase-js") {
    return { createClient: () => fakeAdmin };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: currentUser } }) },
      }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/crypto/status/route");

function get(orderId, { email, user } = {}) {
  currentUser = user ?? null;
  const url =
    `http://localhost/api/crypto/status?orderId=${orderId}` +
    (email ? `&email=${encodeURIComponent(email)}` : "");
  const req = new Request(url);
  req.nextUrl = new URL(url);
  return route.GET(req);
}

test("H3: unauthenticated status has no QR (exploit closed)", async () => {
  const res = await get(TICKET_ORDER_ID);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "waiting");
  assert.equal(body.qrCode, null);
});

test("H3: wrong email gets status but no QR", async () => {
  const res = await get(TICKET_ORDER_ID, { email: "attacker@example.com" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.qrCode, null);
});

test("H3: buyer email proof reveals the QR", async () => {
  const res = await get(TICKET_ORDER_ID, { email: "buyer@example.com" });
  const body = await res.json();
  assert.equal(body.qrCode, "SECRET-QR-1");
});

test("H3: buyer session reveals the QR without a param", async () => {
  const res = await get(TICKET_ORDER_ID, {
    user: { id: "u1", email: "BUYER@example.com" },
  });
  const body = await res.json();
  assert.equal(body.qrCode, "SECRET-QR-1");
});

test("H3: stranger session gets no QR", async () => {
  const res = await get(TICKET_ORDER_ID, {
    user: { id: "u9", email: "stranger@example.com" },
  });
  const body = await res.json();
  assert.equal(body.qrCode, null);
});

test("H3: early-return confirmed path is gated too", async () => {
  const anon = await (await get(DONE_ORDER_ID)).json();
  assert.equal(anon.status, "confirmed");
  assert.equal(anon.qrCode, null);
  const owner = await (
    await get(DONE_ORDER_ID, { email: "buyer2@example.com" })
  ).json();
  assert.equal(owner.qrCode, "SECRET-QR-2");
});

test("H3: unknown order id reveals nothing", async () => {
  const body = await (await get(UNKNOWN_ID)).json();
  assert.equal(body.status, "waiting");
  assert.equal(body.qrCode, null);
  assert.equal(body.recordId, null);
});

test("teardown fetch", () => {
  global.fetch = realFetch;
});
