const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
const TOKEN = "c".repeat(64);
const PHONE_LAST4 = "4321";
const SESSION_TOKEN = "session-credential-for-test-only";
const GENERIC_REJECTION = "This invitation could not be redeemed. Check the details or request a new invitation.";

function compileRoute(mocks) {
  const filename = path.join(ROOT, "app/api/events/team/redeem/route.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const mockedRequire = (request) => {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return require(request);
  };
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, mockedRequire);
  return compiledModule.exports;
}

function compileRateLimiter(createAdmin) {
  const filename = path.join(ROOT, "lib/rate-limit.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const mockedRequire = (request) => {
    if (request === "next/server") return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
    if (request === "@/lib/supabase-admin") return { createSupabaseAdmin: createAdmin };
    return require(request);
  };
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, mockedRequire);
  return compiledModule.exports;
}

function routeHarness({ rpc, limit = { allowed: true }, cookies = [], logs = [] }) {
  const rateCalls = [];
  const rpcCalls = [];
  const route = compileRoute({
    "server-only": {},
    "next/server": {
      NextResponse: {
        json(body, init) {
          const response = new Response(JSON.stringify(body), init);
          response.cookies = { set(cookie) { cookies.push(cookie); } };
          return response;
        },
      },
    },
    "@/lib/supabase-admin": {
      createSupabaseAdmin: () => ({
        async rpc(name, args) {
          rpcCalls.push({ name, args });
          return rpc();
        },
      }),
    },
    "@/lib/staff/invite-tokens": {
      hashInviteToken(value) { return require("node:crypto").createHash("sha256").update(value).digest("hex"); },
    },
    "@/lib/staff/guest-session": {
      eventStaffSessionCookieName: (eventId) => `event_staff_session_${eventId}`,
      generateEventStaffSessionToken: () => SESSION_TOKEN,
      hashEventStaffSessionToken: (value) => require("node:crypto").createHash("sha256").update(value).digest("hex"),
    },
    "@/lib/rate-limit": {
      async checkRateLimitFailClosed(name, identifier, onUnavailable) {
        rateCalls.push({ name, identifier });
        if (limit.unavailable) {
          onUnavailable?.(limit.failure || { reason: "rpc_error", errorCode: "PGRST202" });
          return { allowed: false, remaining: 0, retryAfter: 60, unavailable: true };
        }
        return { allowed: limit.allowed, remaining: limit.allowed ? 4 : 0, retryAfter: limit.allowed ? 0 : 60 };
      },
    },
    "@/lib/staff/redemption-limits": {
      async checkEventStaffRedemptionLimits(check, invitationIdentifier, ipIdentifier) {
        const results = await Promise.all([
          check("invitationRedemption", invitationIdentifier),
          check("ipInvitationRedemption", ipIdentifier),
        ]);
        const retryAfter = Math.max(...results.map((result) => result.retryAfter));
        if (results.some((result) => result.unavailable)) return { allowed: false, reason: "unavailable", retryAfter };
        if (results.some((result) => !result.allowed)) return { allowed: false, reason: "limited", retryAfter };
        return { allowed: true };
      },
    },
    "@/lib/staff/trusted-client-ip": {
      trustedEventStaffClientIp: (_headers, isVercel, isLocalDevelopment) => isVercel ? "203.0.113.12" : isLocalDevelopment ? "127.0.0.1" : null,
    },
  });

  return { POST: route.POST, rateCalls, rpcCalls, cookies, logs };
}

async function post(harness, { token = TOKEN, phoneLast4 = PHONE_LAST4 } = {}) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercel = process.env.VERCEL;
  const previousInfo = console.info;
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL;
  console.info = (message) => harness.logs.push(String(message));
  try {
    const request = new Request("http://localhost:3000/api/events/team/redeem", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ token, phoneLast4 }),
    });
    Object.defineProperty(request, "nextUrl", { value: new URL(request.url) });
    return await harness.POST(request);
  } finally {
    console.info = previousInfo;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
}

function validRow() {
  const now = Date.now();
  return {
    out_member_id: "member-test",
    out_event_id: "event-test",
    out_role: "ticket_scanner",
    out_entrance_id: null,
    out_session_expires_at: new Date(now + 30 * 86400000).toISOString(),
    out_session_hard_expires_at: new Date(now + 90 * 86400000).toISOString(),
  };
}

test("successful redemption runs both buckets, passes hashed token and phone to RPC, and issues a scoped session cookie", async () => {
  const harness = routeHarness({ rpc: async () => ({ data: [validRow()], error: null }) });
  const response = await post(harness);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(harness.rateCalls.map((call) => call.name).sort(), ["invitationRedemption", "ipInvitationRedemption"]);
  assert.equal(harness.rpcCalls[0].name, "consume_event_invitation_atomic");
  assert.equal(harness.rpcCalls[0].args.p_invitation_token_hash, require("node:crypto").createHash("sha256").update(TOKEN).digest("hex"));
  assert.equal(harness.rpcCalls[0].args.p_phone_last4, PHONE_LAST4);
  assert.equal(harness.cookies.length, 1);
  assert.equal(harness.cookies[0].name, "event_staff_session_event-test");
  assert.equal(harness.cookies[0].value, SESSION_TOKEN);
  assert.equal(harness.cookies[0].httpOnly, true);
  assert.equal(harness.cookies[0].sameSite, "strict");
  assert.equal(harness.cookies[0].path, "/");
  assert.equal(body.workspaceUrl, "/events/event-test/staff-scanner");
  assert.ok(response.headers.get("x-request-id"));
  assert.ok(harness.logs.some((line) => line.includes('"stage":"session_cookie","outcome":"issued"')));
});

test("wrong, expired, or consumed invitations return the same generic rejection without a session", async (t) => {
  for (const scenario of ["wrong phone digits", "expired invitation", "consumed invitation"]) {
    await t.test(scenario, async () => {
      const harness = routeHarness({ rpc: async () => ({ data: [], error: null }) });
      const response = await post(harness, { phoneLast4: scenario === "wrong phone digits" ? "0000" : PHONE_LAST4 });
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.error, GENERIC_REJECTION);
      assert.equal(body.code, "invitation_invalid");
      assert.equal(harness.cookies.length, 0);
    });
  }
});

test("rate-limit backend failure is diagnosed by safe stage and remains fail-closed", async () => {
  const harness = routeHarness({ rpc: async () => ({ data: [validRow()], error: null }), limit: { unavailable: true } });
  const response = await post(harness);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.code, "redemption_unavailable");
  assert.equal(harness.rateCalls.length, 2, "both buckets are checked even when unavailable");
  assert.equal(harness.rpcCalls.length, 0, "database redemption is never attempted after limiter failure");
  assert.equal(harness.cookies.length, 0);
  assert.ok(harness.logs.some((line) => line.includes('"reason":"rpc_error"')));
  assert.ok(harness.logs.every((line) => !line.includes(TOKEN) && !line.includes(PHONE_LAST4) && !line.includes(SESSION_TOKEN)));
});

test("missing Supabase configuration is distinguished from an invitation rejection", async () => {
  const harness = routeHarness({
    rpc: async () => ({ data: [validRow()], error: null }),
    limit: { unavailable: true, failure: { reason: "missing_configuration" } },
  });
  const response = await post(harness);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.code, "redemption_misconfigured");
  assert.equal(body.error, "Staff invitation redemption is not configured on this server. Please contact the event organizer.");
  assert.equal(harness.rpcCalls.length, 0);
  assert.equal(harness.cookies.length, 0);
});

test("rate-limit rejection is a 429 with Retry-After and does not call the redemption RPC", async () => {
  const harness = routeHarness({ rpc: async () => ({ data: [validRow()], error: null }), limit: { allowed: false } });
  const response = await post(harness);
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(body.code, "rate_limited");
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(harness.rpcCalls.length, 0);
  assert.equal(harness.cookies.length, 0);
});

test("database RPC errors return a safe dependency response and never issue a session", async () => {
  const harness = routeHarness({ rpc: async () => ({ data: null, error: { code: "PGRST202", status: 404, message: `failed for ${TOKEN} ${PHONE_LAST4}` } }) });
  const response = await post(harness);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.code, "redemption_unavailable");
  assert.equal(harness.cookies.length, 0);
  assert.ok(harness.logs.some((line) => line.includes('"stage":"invitation_rpc","outcome":"unavailable","errorCode":"PGRST202"')));
  assert.ok(harness.logs.every((line) => !line.includes(TOKEN) && !line.includes(PHONE_LAST4) && !line.includes(SESSION_TOKEN)));
});

test("fail-closed rate limiter reports safe diagnostics and allows only valid RPC results", async (t) => {
  await t.test("RPC error", async () => {
    const diagnostics = [];
    const limiter = compileRateLimiter(() => ({ rpc: async () => ({ data: null, error: { code: "PGRST202", status: 404, message: "private details" } }) }));
    const result = await limiter.checkRateLimitFailClosed("invitationRedemption", "invite:hash", (failure) => diagnostics.push(failure));
    assert.equal(result.unavailable, true);
    assert.deepEqual(diagnostics, [{ reason: "rpc_error", errorCode: "PGRST202", httpStatus: 404 }]);
  });

  await t.test("malformed result", async () => {
    const diagnostics = [];
    const limiter = compileRateLimiter(() => ({ rpc: async () => ({ data: null, error: null }) }));
    const result = await limiter.checkRateLimitFailClosed("ipInvitationRedemption", "ip:hash", (failure) => diagnostics.push(failure));
    assert.equal(result.unavailable, true);
    assert.deepEqual(diagnostics, [{ reason: "invalid_rpc_response" }]);
  });

  await t.test("missing service-role configuration", async () => {
    const diagnostics = [];
    const limiter = compileRateLimiter(() => { throw new Error("Supabase service role is not configured."); });
    const result = await limiter.checkRateLimitFailClosed("invitationRedemption", "invite:hash", (failure) => diagnostics.push(failure));
    assert.equal(result.unavailable, true);
    assert.equal(diagnostics[0].reason, "missing_configuration");
  });

  await t.test("allowed result", async () => {
    const limiter = compileRateLimiter(() => ({ rpc: async () => ({ data: { allowed: true, remaining: 4, retry_after: 0 }, error: null }) }));
    const result = await limiter.checkRateLimitFailClosed("invitationRedemption", "invite:hash");
    assert.deepEqual(result, { allowed: true, remaining: 4, retryAfter: 0 });
  });
});
