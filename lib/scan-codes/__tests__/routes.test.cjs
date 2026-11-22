const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SERVER_ONLY_STUB = path.join(ROOT, "scripts", "server-only.stub.cjs");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(mod, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  mod._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request === "server-only") return SERVER_ONLY_STUB;
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

let flagEnabled = true;
let orderRow = null;
let reservationRow = null;
let issueResult = { code: "O1-23456789ABCDEFG", codeType: "order", status: "active", created: true };
let issueCalls = [];
let rateLimitAllowed = true;
let rateLimitCalls = [];
let trustedIp = "203.0.113.5";

const fakeAdmin = {
  from(table) {
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      maybeSingle() {
        if (table === "orders") return Promise.resolve({ data: orderRow, error: null });
        if (table === "reservations") return Promise.resolve({ data: reservationRow, error: null });
        return Promise.resolve({ data: null, error: null });
      },
    };
    return builder;
  },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => fakeAdmin };
  }
  if (request === "@/lib/scan-codes/flag") {
    return { isScanCodesEnabled: () => flagEnabled };
  }
  if (request === "@/lib/scan-codes/issue") {
    return {
      issueScanCode: async (_admin, codeType, subjectId) => {
        issueCalls.push({ codeType, subjectId });
        return issueResult;
      },
    };
  }
  if (request === "@/lib/rate-limit") {
    return {
      checkRateLimitFailClosed: async (name, identifier) => {
        rateLimitCalls.push({ name, identifier });
        return rateLimitAllowed
          ? { allowed: true, remaining: 5, retryAfter: 0 }
          : { allowed: false, remaining: 0, retryAfter: 42 };
      },
    };
  }
  if (request === "@/lib/staff/trusted-client-ip") {
    return { trustedEventStaffClientIp: () => trustedIp };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const orderRoute = require("@/app/api/scan-codes/order/route.ts");
const reservationRoute = require("@/app/api/scan-codes/reservation/route.ts");
const { NextRequest } = require("next/server");

function postOrder(body, { origin = "http://localhost", raw } = {}) {
  const headers = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  return orderRoute.POST(
    new NextRequest("http://localhost/api/scan-codes/order", {
      method: "POST",
      headers,
      body: raw !== undefined ? raw : JSON.stringify(body),
    })
  );
}

function postReservation(body, { origin = "http://localhost", raw } = {}) {
  const headers = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  return reservationRoute.POST(
    new NextRequest("http://localhost/api/scan-codes/reservation", {
      method: "POST",
      headers,
      body: raw !== undefined ? raw : JSON.stringify(body),
    })
  );
}

const VALID_TRACKING_TOKEN = "a".repeat(48);
const VALID_LOOKUP_TOKEN = "b".repeat(48);

let consoleCalls = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

beforeEach(() => {
  flagEnabled = true;
  orderRow = { id: "order-1" };
  reservationRow = { id: "reservation-1" };
  issueResult = { code: "O1-23456789ABCDEFG", codeType: "order", status: "active", created: true };
  issueCalls = [];
  rateLimitAllowed = true;
  rateLimitCalls = [];
  trustedIp = "203.0.113.5";
  consoleCalls = [];
  console.log = (...args) => consoleCalls.push(args);
  console.warn = (...args) => consoleCalls.push(args);
  console.error = (...args) => consoleCalls.push(args);
});

function restoreConsole() {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
}

test("order: 404 not_found when the flag is off, body never inspected", async () => {
  flagEnabled = false;
  const res = await postOrder({ trackingToken: VALID_TRACKING_TOKEN });
  restoreConsole();
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
});

test("reservation: 404 not_found when the flag is off", async () => {
  flagEnabled = false;
  const res = await postReservation({ lookupToken: VALID_LOOKUP_TOKEN });
  restoreConsole();
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
});

test("order: bad body (missing field) is 400 invalid_request", async () => {
  const res = await postOrder({});
  restoreConsole();
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid_request" });
});

test("order: bad body (wrong type) is 400 invalid_request", async () => {
  const res = await postOrder({ trackingToken: 12345 });
  restoreConsole();
  assert.equal(res.status, 400);
});

test("order: bad body (too short) is 400 invalid_request", async () => {
  const res = await postOrder({ trackingToken: "short" });
  restoreConsole();
  assert.equal(res.status, 400);
});

test("order: malformed JSON body is 400 invalid_request", async () => {
  const res = await postOrder(null, { raw: "{not json" });
  restoreConsole();
  assert.equal(res.status, 400);
});

test("order: origin mismatch is 400 invalid_request", async () => {
  const res = await postOrder({ trackingToken: VALID_TRACKING_TOKEN }, { origin: "http://evil.test" });
  restoreConsole();
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid_request" });
});

test("order: missing origin header is 400 invalid_request", async () => {
  const res = await postOrder({ trackingToken: VALID_TRACKING_TOKEN }, { origin: null });
  restoreConsole();
  assert.equal(res.status, 400);
});

test("order: an unknown token and a differently-unknown token return an identical 404 body", async () => {
  orderRow = null;
  const res1 = await postOrder({ trackingToken: VALID_TRACKING_TOKEN });
  const body1 = await res1.json();
  const res2 = await postOrder({ trackingToken: "c".repeat(48) });
  const body2 = await res2.json();
  restoreConsole();
  assert.equal(res1.status, 404);
  assert.equal(res2.status, 404);
  assert.deepEqual(body1, { error: "not_found" });
  assert.deepEqual(body1, body2);
});

test("order: success shape and no-store header", async () => {
  const res = await postOrder({ trackingToken: VALID_TRACKING_TOKEN });
  restoreConsole();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.deepEqual(body, { ok: true, code: issueResult.code, codeType: issueResult.codeType });
  assert.equal(issueCalls.length, 1);
  assert.deepEqual(issueCalls[0], { codeType: "order", subjectId: "order-1" });
});

test("reservation: success shape calls issueScanCode with codeType reservation", async () => {
  issueResult = { code: "R1-23456789ABCDEFG", codeType: "reservation", status: "active", created: true };
  const res = await postReservation({ lookupToken: VALID_LOOKUP_TOKEN });
  restoreConsole();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, code: issueResult.code, codeType: "reservation" });
  assert.deepEqual(issueCalls[0], { codeType: "reservation", subjectId: "reservation-1" });
});

test("order: rate limited returns 429 with Retry-After and no-store", async () => {
  rateLimitAllowed = false;
  const res = await postOrder({ trackingToken: VALID_TRACKING_TOKEN });
  restoreConsole();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "42");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("order: untrusted client IP fails closed with 503, never reaching the rate limiter", async () => {
  trustedIp = null;
  const res = await postOrder({ trackingToken: VALID_TRACKING_TOKEN });
  restoreConsole();
  assert.equal(res.status, 503);
  assert.equal(rateLimitCalls.length, 0);
});

test("order: every response carries Cache-Control: no-store", async () => {
  for (const scenario of [
    async () => postOrder({ trackingToken: VALID_TRACKING_TOKEN }),
    async () => postOrder({}),
    async () => {
      flagEnabled = false;
      return postOrder({ trackingToken: VALID_TRACKING_TOKEN });
    },
  ]) {
    flagEnabled = true;
    const res = await scenario();
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
  restoreConsole();
});

test("order: the token and the issued code are never written to console", async () => {
  await postOrder({ trackingToken: VALID_TRACKING_TOKEN });
  restoreConsole();
  const serialized = JSON.stringify(consoleCalls);
  assert.ok(!serialized.includes(VALID_TRACKING_TOKEN), "the raw token must never be logged");
  assert.ok(!serialized.includes(issueResult.code), "the issued code must never be logged");
  assert.equal(consoleCalls.length, 0, "this route logs nothing at all on the success path");
});

test("reservation: the token and the issued code are never written to console", async () => {
  await postReservation({ lookupToken: VALID_LOOKUP_TOKEN });
  restoreConsole();
  const serialized = JSON.stringify(consoleCalls);
  assert.ok(!serialized.includes(VALID_LOOKUP_TOKEN), "the raw token must never be logged");
});
