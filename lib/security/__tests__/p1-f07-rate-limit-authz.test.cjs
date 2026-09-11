/**
 * P1 F-07 regression tests: rate-limit coverage + sync-stripe admin gate.
 *
 * Previous exposure:
 *  (a) checkout/product, checkout/business, both crypto variants,
 *      crypto/create-payment, receipts/*, geocode/*, eventbrite/gofundme
 *      syncs and the Growth Studio AI routes had no rate limiting, while
 *      create-payment-intent was IP-only (one authenticated abuser could
 *      hide behind a shared allowance).
 *  (b) POST /api/donations/sync-stripe required only *any* authenticated
 *      user, then performed 50+ billable Stripe API reads per call — a real
 *      authorization gap, not just a missing throttle.
 *
 * Fixed: every route above now calls the existing lib/rate-limit.ts helper
 * (paymentIntent tier for money-moving/sync-stripe, guestLookup for receipts,
 * importUrl for geocode/external syncs, articleAi for AI routes);
 * create-payment-intent enforces an IP bucket AND a per-user bucket;
 * sync-stripe requires isAdmin() (403 otherwise) on top of its limit.
 *
 * These tests load the real route modules with mocked infrastructure and
 * assert gate behavior end to end (allowed → through, denied → 429/403).
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";

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

// Controllable verdicts.
let rateAllowed = true;
let adminFlag = false;
let stripeListCalls = 0;

const fakeRpcAdmin = {
  rpc: async () => ({
    data: rateAllowed
      ? [{ allowed: true, remaining: 9, retry_after: 0 }]
      : [{ allowed: false, remaining: 0, retry_after: 60 }],
    error: null,
  }),
};

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
    return { createSupabaseAdmin: () => fakeRpcAdmin };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user-1", email: "u@example.com" } } }),
        },
      }),
    };
  }
  if (request === "@/lib/auth") {
    return { isAdmin: async () => adminFlag };
  }
  if (request === "@supabase/supabase-js") {
    return { createClient: () => ({}) };
  }
  if (request === "stripe") {
    return class {
      checkout = {
        sessions: {
          list: async () => {
            stripeListCalls += 1;
            return { data: [] };
          },
        },
      };
    };
  }
  if (request === "@/lib/donations") {
    return { recordDonationFromSession: async () => ({ inserted: false, reason: "exists" }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const syncStripe = require("@/app/api/donations/sync-stripe/route");
const checkoutProduct = require("@/app/api/checkout/product/route");

function post(route, url, body) {
  return route.POST(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

test("F-07B: sync-stripe rejects authenticated non-admins without touching Stripe", async () => {
  adminFlag = false;
  rateAllowed = true;
  stripeListCalls = 0;
  const res = await post(syncStripe, "http://localhost/api/donations/sync-stripe");
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "Forbidden");
  assert.equal(stripeListCalls, 0, "Stripe must not be contacted for non-admins");
});

test("F-07B: sync-stripe lets admins through when allowed", async () => {
  adminFlag = true;
  rateAllowed = true;
  stripeListCalls = 0;
  const res = await post(syncStripe, "http://localhost/api/donations/sync-stripe");
  assert.equal(res.status, 200);
  assert.equal(stripeListCalls, 1);
  const body = await res.json();
  assert.equal(body.inserted, 0);
});

test("F-07B: sync-stripe rate-limits even admins (429)", async () => {
  adminFlag = true;
  rateAllowed = false;
  stripeListCalls = 0;
  const res = await post(syncStripe, "http://localhost/api/donations/sync-stripe");
  assert.equal(res.status, 429);
  assert.equal(stripeListCalls, 0, "limited calls must not reach Stripe");
});

test("F-07A: newly-covered checkout/product returns 429 when limited", async () => {
  rateAllowed = false;
  const res = await post(checkoutProduct, "http://localhost/api/checkout/product", {
    productId: "p1",
  });
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.match(body.error, /Too many requests/);
});

test("F-07A: checkout/product passes through to validation when allowed", async () => {
  rateAllowed = true;
  const res = await post(checkoutProduct, "http://localhost/api/checkout/product", {});
  assert.equal(res.status, 400, "allowed requests must reach the handler body");
});
