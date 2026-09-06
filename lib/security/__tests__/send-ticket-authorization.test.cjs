/**
 * H2 regression tests: POST /api/send-ticket.
 *
 * Previous exploit: no auth/rate-limit; any `qrCode` + arbitrary `buyerEmail`
 * re-mailed full ticket QRs (relay + exfiltration), fabricated a "valid"
 * ticket for unknown codes, and returned QR credentials in the response.
 * Fixed: guest-lookup rate limit, order must exist (404), supplied email must
 * match the order's buyer email (403), recipient is server-derived, and
 * responses never contain QR codes.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.RESEND_API_KEY ??= "test-resend-key";

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

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER_QR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const tables = {
  ticket_orders: [
    {
      id: ORDER_ID,
      stripe_payment_intent_id: "pi_test_1",
      ticket_id: "t1",
      seat_label: null,
      buyer_name: "Buyer B",
      buyer_email: "Buyer@Example.com",
      event_id: "e1",
    },
  ],
  ticket_instances: [
    { id: "i1", qr_code: ORDER_QR, status: "valid", order_id: ORDER_ID, ticket_id: "t1", created_at: "2026-01-01" },
  ],
  tickets: [{ id: "t1", name: "General Admission" }],
  events: [{ title: "Show", slug: "show" }],
};

function makeQuery(table) {
  const rows = tables[table] ?? [];
  const filters = [];
  const q = {
    select() { return q; },
    eq(field, value) { filters.push([field, value]); return q; },
    in(field, values) {
      filters.push([field, values, "in"]);
      return q;
    },
    order() { return q; },
    async maybeSingle() {
      const hit = rows.find((r) =>
        filters.every(([f, v, op]) => (op === "in" ? v.includes(r[f]) : r[f] === v))
      );
      return { data: hit ?? null, error: null };
    },
    then(resolve) {
      const data = rows.filter((r) =>
        filters.every(([f, v, op]) => (op === "in" ? v.includes(r[f]) : r[f] === v))
      );
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return q;
}

// Controllable rate-limit verdict.
let rateAllowed = true;

const fakeAdmin = {
  from: (table) => makeQuery(table),
  rpc: async () => ({
    data: rateAllowed
      ? [{ allowed: true, remaining: 9, retry_after: 0 }]
      : [{ allowed: false, remaining: 0, retry_after: 60 }],
    error: null,
  }),
};

const sentEmails = [];

class NextResponseShim extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") {
    return { NextResponse: NextResponseShim };
  }
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => fakeAdmin };
  }
  if (request === "resend") {
    return {
      Resend: class {
        emails = {
          send: async (args) => {
            sentEmails.push(args);
            return { error: null };
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/send-ticket/route");

function post(body) {
  rateAllowed = true;
  sentEmails.length = 0;
  return route.POST(
    new Request("http://localhost/api/send-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const legitBody = {
  buyerEmail: "buyer@example.com",
  buyerName: "Buyer B",
  qrCode: ORDER_ID,
};

test("H2: matching buyer email resends without leaking QRs", async () => {
  const res = await post(legitBody);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.count, 1);
  assert.ok(!("instances" in body), "response must not contain ticket instances");
  assert.ok(!("qrCode" in body), "response must not contain QR codes");
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "Buyer@Example.com");
});

test("H2: wrong email is denied (no relay)", async () => {
  const res = await post({ ...legitBody, buyerEmail: "attacker@example.com" });
  assert.equal(res.status, 403);
  assert.equal(sentEmails.length, 0);
});

test("H2: unknown QR code is 404 (no fabrication)", async () => {
  const res = await post({
    ...legitBody,
    qrCode: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });
  assert.equal(res.status, 404);
  assert.equal(sentEmails.length, 0);
});

test("H2: missing fields are 400", async () => {
  const res = await post({ qrCode: ORDER_ID });
  assert.equal(res.status, 400);
});

test("H2: rate-limited callers get 429", async () => {
  rateAllowed = false;
  sentEmails.length = 0;
  const res = await route.POST(
    new Request("http://localhost/api/send-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(legitBody),
    })
  );
  assert.equal(res.status, 429);
  assert.equal(sentEmails.length, 0);
});
