const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const originalTs = require.extensions[".ts"];

{
  Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(this, path.resolve(ROOT, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  Module._load = function skipServerOnly(request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  require.extensions[".ts"] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

after(() => {
  Module._resolveFilename = originalResolveFilename;
  Module._load = originalLoad;
  if (originalTs) require.extensions[".ts"] = originalTs;
  else delete require.extensions[".ts"];
});

const phone = require("../staff/phone.ts");
const { checkEventStaffRedemptionLimits } = require("../staff/redemption-limits.ts");
const { trustedEventStaffClientIp } = require("../staff/trusted-client-ip.ts");
const { signScannerToken, verifyScannerToken } = require("../offline-scanner-token.ts");

describe("account-less event staff primitives", () => {
  it("normalizes separator characters but rejects non-E.164 phone numbers", () => {
    assert.equal(phone.normalizeE164Phone(" +234 (801) 234-5678 "), "+2348012345678");
    assert.equal(phone.normalizeE164Phone("08012345678"), null);
    assert.equal(phone.normalizeE164Phone("+0123456789"), null);
    assert.equal(phone.normalizeE164Phone("+1234567890123456"), null);
  });

  it("invokes the invitation and IP buckets on every attempt and requires both to allow", async () => {
    const calls = [];
    const result = await checkEventStaffRedemptionLimits(async (name, identifier) => {
      calls.push({ name, identifier });
      return { allowed: name === "invitationRedemption", remaining: 0, retryAfter: 30 };
    }, "invite:stable-hash", "ip:stable-hash");

    assert.deepEqual(calls.sort((a, b) => a.name.localeCompare(b.name)), [
      { name: "invitationRedemption", identifier: "invite:stable-hash" },
      { name: "ipInvitationRedemption", identifier: "ip:stable-hash" },
    ]);
    assert.deepEqual(result, { allowed: false, reason: "limited", retryAfter: 30 });
  });

  it("fails closed when either limiter backend is unavailable", async () => {
    let calls = 0;
    const result = await checkEventStaffRedemptionLimits(async (name) => {
      calls++;
      return name === "ipInvitationRedemption"
        ? { allowed: false, remaining: 0, retryAfter: 60, unavailable: true }
        : { allowed: true, remaining: 4, retryAfter: 0 };
    }, "invite:hash", "ip:hash");
    assert.equal(calls, 2);
    assert.deepEqual(result, { allowed: false, reason: "unavailable", retryAfter: 60 });
  });

  it("uses only the Vercel edge client-IP header and rejects spoofable or malformed addresses", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.18, 10.0.0.2",
      "x-forwarded-for": "198.51.100.44",
      "x-real-ip": "198.51.100.44",
    });
    assert.equal(trustedEventStaffClientIp(headers, true), "203.0.113.18");
    assert.equal(trustedEventStaffClientIp(headers, false), null);
    assert.equal(trustedEventStaffClientIp(new Headers({ "x-vercel-forwarded-for": "not-an-ip" }), true), null);
    assert.equal(trustedEventStaffClientIp(headers, false, true), "127.0.0.1", "development uses a shared server-mode bucket, not spoofable headers");
    assert.equal(trustedEventStaffClientIp(new Headers({ "x-forwarded-for": "198.51.100.99" }), false, true), "127.0.0.1");
    assert.equal(trustedEventStaffClientIp(new Headers({ "x-vercel-forwarded-for": "not-an-ip" }), false, true), "127.0.0.1");
    assert.equal(trustedEventStaffClientIp(headers, false, false), null, "non-Vercel production remains fail-closed");
  });

  it("wires both fail-closed buckets to the real redemption route and keeps tokens out of queries", () => {
    const route = fs.readFileSync(path.resolve(ROOT, "app/api/events/team/redeem/route.ts"), "utf8");
    assert.match(route, /checkEventStaffRedemptionLimits\(\s*async \(name, identifier\) => \{[\s\S]*?checkRateLimitFailClosed\(name, identifier/);
    assert.match(route, /trustedEventStaffClientIp\(request\.headers, isVercel, isLocalDevelopment\)/);
    assert.match(route, /p_invitation_token_hash: hashInviteToken\(token\)/);
    assert.match(route, /p_session_token_hash: hashEventStaffSessionToken\(sessionToken\)/);
    assert.match(route, /out_session_hard_expires_at/);
    assert.match(route, /const maxAge = Math\.floor\(\(hardExpiresAt - Date\.now\(\)\) \/ 1000\)/);
    assert.match(route, /path: "\/",\s*maxAge,/);
    assert.match(route, /httpOnly: true[\s\S]*sameSite: "strict"[\s\S]*path: "\/"/);
    assert.match(route, /X-Request-ID/);
    assert.ok(route.includes("logStage(requestId, `rate_limit.${name}`"));
    assert.doesNotMatch(route, /console\.(?:log|info|error|warn)\([^\n]*\b(?:token|phoneLast4|sessionToken)\b/i);
    assert.doesNotMatch(route, /searchParams\.get\("token"\)/);
  });

  it("requires a configured strong secret and rejects invalid signatures and expired tokens", () => {
    const names = ["SCANNER_TOKEN_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "NEXTAUTH_SECRET"];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
      for (const name of names) delete process.env[name];
      assert.throws(() => signScannerToken({ userId: "u1", eventId: "e1", role: "ticket_scanner" }), /at least 32 bytes/);

      process.env.SCANNER_TOKEN_SECRET = "s".repeat(32);
      const valid = signScannerToken({ userId: "u1", eventId: "e1", role: "ticket_scanner" });
      assert.equal(verifyScannerToken(valid.token, "e1").valid, true);
      assert.equal(verifyScannerToken(valid.token, "e2").valid, false);
      assert.equal(verifyScannerToken(`${valid.token}x`).valid, false);

      const expired = signScannerToken({ userId: "u1", eventId: "e1", role: "ticket_scanner", durationHours: -1 });
      assert.equal(verifyScannerToken(expired.token).valid, false);
    } finally {
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
    }
  });

  it("signs a guest scanner credential without inventing an auth user id", () => {
    const prior = process.env.SCANNER_TOKEN_SECRET;
    process.env.SCANNER_TOKEN_SECRET = "g".repeat(32);
    try {
      const signed = signScannerToken({
        staffMemberId: "member-1",
        sessionHash: "a".repeat(64),
        eventId: "event-1",
        role: "ticket_scanner",
      });
      const verified = verifyScannerToken(signed.token, "event-1");
      assert.equal(verified.valid, true);
      assert.equal(verified.payload.staffMemberId, "member-1");
      assert.equal(verified.payload.sessionHash, "a".repeat(64));
      assert.equal(verified.payload.userId, undefined);
    } finally {
      if (prior === undefined) delete process.env.SCANNER_TOKEN_SECRET;
      else process.env.SCANNER_TOKEN_SECRET = prior;
    }
  });
});
