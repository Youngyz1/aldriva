const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
process.env.SCANNER_TOKEN_SECRET =
  "scanner-phase-1-test-secret-0123456789abcdef";

// --- module plumbing (mirrors lib/__tests__/scanner-phase-0.test.cjs) ---

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
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

// --- fake Supabase admin/server clients, no network, no DB ---

let currentDb = freshDb();
let currentServerUser = null;

function freshDb() {
  return {
    events: [],
    organizers: [],
    entity_members: [],
    event_team_members: [],
    scanner_token_revocations: [],
    authUsers: {},
    rpcHandlers: {},
  };
}

function rowMatchesEq(row, filters) {
  return Object.entries(filters).every(([k, v]) => {
    if (v === null) return row[k] === null || row[k] === undefined;
    return row[k] === v;
  });
}

function rowMatchesOr(row, orExpr) {
  if (!orExpr) return true;
  return orExpr.split(",").some((clause) => {
    const [field, op, value] = clause.split(".");
    if (op !== "eq") return false;
    return String(row[field]) === String(value);
  });
}

function makeFakeAdmin(db) {
  return {
    auth: {
      getUser: async (token) => ({ data: { user: db.authUsers[token] || null } }),
    },
    rpc: async (fnName, params) => {
      const handler = db.rpcHandlers[fnName];
      return handler ? handler(params) : { data: null, error: null };
    },
    from(table) {
      const rows = db[table] || [];
      const eqFilters = {};
      const isFilters = {};
      let orExpr = null;
      let limitN = null;
      const builder = {
        select() { return builder; },
        eq(k, v) { eqFilters[k] = v; return builder; },
        is(k, v) { isFilters[k] = v; return builder; },
        or(expr) { orExpr = expr; return builder; },
        limit(n) { limitN = n; return builder; },
        maybeSingle() {
          let matches = rows.filter(
            (r) => rowMatchesEq(r, eqFilters) && rowMatchesEq(r, isFilters) && rowMatchesOr(r, orExpr)
          );
          if (limitN) matches = matches.slice(0, limitN);
          return Promise.resolve({ data: matches[0] ?? null, error: null });
        },
        then(resolve, reject) {
          const matches = rows.filter(
            (r) => rowMatchesEq(r, eqFilters) && rowMatchesEq(r, isFilters) && rowMatchesOr(r, orExpr)
          );
          return Promise.resolve({ data: matches, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const originalLoad = Module._load;
Module._load = function loadWithStubs(request) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => makeFakeAdmin(currentDb) };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: currentServerUser } }) },
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};

const { resolveScannerPrincipal } = require("../scanner/resolve-principal");
const { signScannerToken, signScannerTokenV2, verifyScannerToken } = require("../offline-scanner-token");
const {
  hashEventStaffSessionToken,
  generateEventStaffSessionToken,
  eventStaffSessionCookieName,
} = require("../staff/guest-session");
const { EVENT_SCAN_ENTITY_ROLES } = require("../event-auth");
const { ENTITY_ROLES_CONTENT_WRITE: ENTITY_ROLES_CONTENT_WRITE_FOR_TEST } = require("../entity-auth");
const { GUEST_SCANNER_FLAG_ENV } = require("../staff/guest-scanner-flag");

function withGuestScannerEnabled(fn) {
  const previous = process.env[GUEST_SCANNER_FLAG_ENV];
  process.env[GUEST_SCANNER_FLAG_ENV] = "true";
  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) delete process.env[GUEST_SCANNER_FLAG_ENV];
    else process.env[GUEST_SCANNER_FLAG_ENV] = previous;
  });
}

// --- test fixtures ---

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_EVENT_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "org-1";

function fakeReq({ authorization, cookie } = {}) {
  const headers = new Map();
  if (authorization) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);
  return { headers: { get: (name) => headers.get(name.toLowerCase()) ?? null } };
}

function signRaw(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", process.env.SCANNER_TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${hmac}`;
}

function v1Payload(overrides = {}) {
  const now = Date.now();
  return {
    userId: "scanner-user",
    eventId: EVENT_ID,
    role: "ticket_scanner",
    issuedAt: now,
    expiresAt: now + 3600 * 1000,
    ...overrides,
  };
}

function v2Payload(overrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    v: 2,
    typ: "scan",
    code_type: ["ticket"],
    scope: { event_id: EVENT_ID },
    actor: { user_id: "scanner-user", role: "ticket_scanner" },
    actions: ["check_in"],
    iat: nowSec,
    exp: nowSec + 3600,
    jti: crypto.randomUUID(),
    ...overrides,
  };
}

const REQUIRES_CHECK_IN = { codeType: "ticket", action: "check_in" };

function baseAuthorizedDb() {
  const db = freshDb();
  db.events.push({ id: EVENT_ID, user_id: null, organizer_id: ORG_ID });
  db.events.push({ id: OTHER_EVENT_ID, user_id: null, organizer_id: ORG_ID });
  db.organizers.push({ id: ORG_ID, user_id: "unrelated-owner" });
  db.event_team_members.push({ event_id: EVENT_ID, user_id: "scanner-user", role: "ticket_scanner", status: "active" });
  return db;
}

beforeEach(() => {
  currentDb = baseAuthorizedDb();
  currentServerUser = null;
  delete process.env[GUEST_SCANNER_FLAG_ENV];
});

describe("Scanner Phase 1: resolver auth parity and repair", () => {
  describe("Step 1 table parity (scanner-dataset / resolver)", () => {
    it("no credentials at all -> 401 not_signed_in", async () => {
      const result = await resolveScannerPrincipal(fakeReq(), { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r1" });
      assert.deepEqual(result, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("Authorization header without Bearer prefix is ignored, same as no credentials", async () => {
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: "Basic abc123" }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r2" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("garbage Bearer token (not scanner-token format, not a Supabase Auth token) -> 401 not_signed_in", async () => {
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: "Bearer not-a-real-token" }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r3" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("bad signature (tampered scanner token) falls through to a cookie session, like 496e1ccf8", async () => {
      const { token } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const tampered = token.slice(0, -2) + "zz";

      currentServerUser = { id: "scanner-user" };
      const withSession = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${tampered}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r4a" }
      );
      assert.equal(withSession.ok, true, "a valid cookie session must still authorise the request");

      currentServerUser = null;
      const withoutSession = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${tampered}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r4b" }
      );
      assert.deepEqual(withoutSession, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("expired scanner token falls through to a cookie session, like 496e1ccf8", async () => {
      const token = signRaw(v1Payload({ issuedAt: Date.now() - 2 * 3600 * 1000, expiresAt: Date.now() - 3600 * 1000 }));

      currentServerUser = { id: "scanner-user" };
      const withSession = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r5a" }
      );
      assert.equal(withSession.ok, true, "a valid cookie session must still authorise the request");

      currentServerUser = null;
      const withoutSession = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r5b" }
      );
      assert.deepEqual(withoutSession, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("token for a different event falls through to a cookie session, like 496e1ccf8", async () => {
      const { token } = signScannerToken({ userId: "scanner-user", eventId: OTHER_EVENT_ID, role: "ticket_scanner" });

      currentServerUser = { id: "scanner-user" };
      const withSession = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r6a" }
      );
      assert.equal(withSession.ok, true, "a valid cookie session must still authorise the request");

      currentServerUser = null;
      const withoutSession = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r6b" }
      );
      assert.deepEqual(withoutSession, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("revoked token by jti -> 401 scanner_token_revoked", async () => {
      const { token, expiresAt } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const verified = verifyScannerToken(token, EVENT_ID);
      currentDb.scanner_token_revocations.push({ event_id: EVENT_ID, jti: verified.principal.jti, reason: "manual" });
      void expiresAt;
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r7" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "scanner_token_revoked" });
    });

    it("revoked token by subject (userId) -> 401 scanner_token_revoked", async () => {
      const { token } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
      currentDb.scanner_token_revocations.push({
        event_id: EVENT_ID,
        jti: null,
        user_id: "scanner-user",
        reason: "removed_from_team",
        revoked_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r8" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "scanner_token_revoked" });
    });

    it("signed-in user without permission -> 403 no_permission", async () => {
      currentServerUser = { id: "stranger-user" };
      const result = await resolveScannerPrincipal(fakeReq(), { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r9" });
      assert.deepEqual(result, { ok: false, status: 403, code: "no_permission" });
    });

    it("guest session cookie, flag ON, valid session, authorised role -> ok", async () => {
      const rawToken = generateEventStaffSessionToken();
      const hash = hashEventStaffSessionToken(rawToken);
      currentDb.rpcHandlers.validate_and_renew_event_staff_session = (params) => {
        if (params.p_event_id === EVENT_ID && params.p_session_token_hash === hash) {
          return {
            data: [{
              out_staff_member_id: "staff-1",
              out_role: "ticket_scanner",
              out_entrance_id: null,
              out_session_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }],
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const cookieName = eventStaffSessionCookieName(EVENT_ID);
      await withGuestScannerEnabled(async () => {
        const result = await resolveScannerPrincipal(
          fakeReq({ cookie: `${cookieName}=${rawToken}` }),
          { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r10" }
        );
        assert.equal(result.ok, true);
        assert.equal(result.principal.staffMemberId, "staff-1");
        assert.equal(result.principal.userId, null);
      });
    });

    it("guest session cookie, flag OFF (default), a valid session must NOT authenticate", async () => {
      const rawToken = generateEventStaffSessionToken();
      const hash = hashEventStaffSessionToken(rawToken);
      currentDb.rpcHandlers.validate_and_renew_event_staff_session = (params) => {
        if (params.p_event_id === EVENT_ID && params.p_session_token_hash === hash) {
          return {
            data: [{
              out_staff_member_id: "staff-1",
              out_role: "ticket_scanner",
              out_entrance_id: null,
              out_session_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }],
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const cookieName = eventStaffSessionCookieName(EVENT_ID);
      // Flag is off by default (see beforeEach) - matches Phase 0 (496e1ccf8),
      // where guest auth did not exist on scanner-dataset or scanner-sync at all.
      const result = await resolveScannerPrincipal(
        fakeReq({ cookie: `${cookieName}=${rawToken}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r10b" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("guest session cookie, no session/expired -> 401 not_signed_in", async () => {
      const cookieName = eventStaffSessionCookieName(EVENT_ID);
      const result = await resolveScannerPrincipal(
        fakeReq({ cookie: `${cookieName}=not-a-real-session-token-of-the-right-length-xx` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r11" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "not_signed_in" });
    });
  });

  describe("v1 tokens", () => {
    it("valid v1 token -> ok", async () => {
      const { token } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r12" }
      );
      assert.equal(result.ok, true);
      assert.equal(result.principal.userId, "scanner-user");
      assert.equal(result.principal.version, 1);
    });

    it("v1 token without jti still works (pre-Phase-0 legacy token)", async () => {
      const token = signRaw(v1Payload());
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r13" }
      );
      assert.equal(result.ok, true);
    });
  });

  describe("v2 tokens", () => {
    it("valid v2 token -> ok, principal has version 2", async () => {
      const token = signRaw(v2Payload());
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r14" }
      );
      assert.equal(result.ok, true);
      assert.equal(result.principal.version, 2);
    });

    it("v2 token for the wrong event -> 401 not_signed_in", async () => {
      const token = signRaw(v2Payload({ scope: { event_id: OTHER_EVENT_ID } }));
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r15" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("v2 token missing the required capability -> 403 scanner_capability_denied", async () => {
      const token = signRaw(v2Payload({ code_type: ["order"], actions: ["pick_up"] }));
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r16" }
      );
      assert.deepEqual(result, { ok: false, status: 403, code: "scanner_capability_denied" });
    });

    it("unknown code_type is rejected", () => {
      const token = signRaw(v2Payload({ code_type: ["banana"] }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("unknown action is rejected", () => {
      const token = signRaw(v2Payload({ actions: ["fly"] }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("empty code_type array is rejected", () => {
      const token = signRaw(v2Payload({ code_type: [] }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("empty actions array is rejected", () => {
      const token = signRaw(v2Payload({ actions: [] }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("oversized code_type array is rejected", () => {
      const token = signRaw(v2Payload({ code_type: ["ticket", "order", "reservation", "ticket"] }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("oversized actions array is rejected", () => {
      const token = signRaw(v2Payload({ actions: ["check_in", "pick_up", "deliver", "refund", "seat", "no_show", "check_in"] }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("action not allowed for the code type is rejected", () => {
      // "seat" is only allowed for reservation, not ticket.
      const token = signRaw(v2Payload({ code_type: ["ticket"], actions: ["seat"] }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("missing jti is rejected", () => {
      const payload = v2Payload();
      delete payload.jti;
      const token = signRaw(payload);
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("version 3 is rejected", () => {
      const token = signRaw({ ...v1Payload(), v: 3 });
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("a v2-shaped payload relabelled v1 is rejected (downgrade protection)", () => {
      const payload = v2Payload();
      payload.v = 1;
      const token = signRaw(payload);
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("exp - iat over 12 hours is rejected", () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = signRaw(v2Payload({ iat: nowSec, exp: nowSec + 13 * 3600 }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });

    it("iat in the future is rejected", () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = signRaw(v2Payload({ iat: nowSec + 10 * 60, exp: nowSec + 10 * 60 + 3600 }));
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, false);
    });
  });

  describe("D5: v2 revocation uses the normalised principal (actor fields)", () => {
    it("revokes a v2 token by jti", async () => {
      const jti = crypto.randomUUID();
      const token = signRaw(v2Payload({ jti }));
      currentDb.scanner_token_revocations.push({ event_id: EVENT_ID, jti, reason: "manual" });
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r17" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "scanner_token_revoked" });
    });

    it("rejects an older v2 token issued before the staff member actor was removed", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = signRaw(v2Payload({
        actor: { staff_member_id: "staff-9", role: "ticket_scanner" },
        iat: nowSec - 3600,
        exp: nowSec + 3600,
      }));
      currentDb.scanner_token_revocations.push({
        event_id: EVENT_ID,
        jti: null,
        staff_member_id: "staff-9",
        reason: "removed_from_team",
        revoked_at: new Date(Date.now() - 1000).toISOString(),
      });
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r18" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "scanner_token_revoked" });
    });

    it("accepts a newer v2 token issued after the staff member actor was re-added", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = signRaw(v2Payload({
        actor: { staff_member_id: "staff-9", role: "ticket_scanner" },
        iat: nowSec,
        exp: nowSec + 3600,
      }));
      currentDb.scanner_token_revocations.push({
        event_id: EVENT_ID,
        jti: null,
        staff_member_id: "staff-9",
        reason: "removed_from_team",
        revoked_at: new Date((nowSec - 3600) * 1000).toISOString(),
      });
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r19" }
      );
      // staff-9 has no event_team_members/entity_members row at all; authorised
      // purely by actor.role from the verified token, per D3.
      assert.equal(result.ok, true);
      assert.equal(result.principal.staffMemberId, "staff-9");
    });

    it("a revoked token is rejected outright even when a valid cookie session exists (no fall-through)", async () => {
      const { token } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const verified = verifyScannerToken(token, EVENT_ID);
      currentDb.scanner_token_revocations.push({ event_id: EVENT_ID, jti: verified.principal.jti, reason: "manual" });
      currentServerUser = { id: "scanner-user" }; // would be authorised if reached
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r19b" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "scanner_token_revoked" });
    });
  });

  describe("R2: recheckMembership option (scanner-dataset vs scanner-sync Phase 0 parity)", () => {
    it("defaults to true: a token-derived principal with no live DB membership is denied (scanner-dataset behaviour)", async () => {
      const { token } = signScannerToken({ userId: "no-membership-user", eventId: EVENT_ID, role: "ticket_scanner" });
      // no-membership-user has zero rows anywhere in events/organizers/entity_members/event_team_members.
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r27" }
      );
      assert.deepEqual(result, { ok: false, status: 403, code: "no_permission" });
    });

    it("recheckMembership: false trusts the token's embedded role with no DB re-check (scanner-sync Phase 0 token-path behaviour)", async () => {
      const { token } = signScannerToken({ userId: "no-membership-user", eventId: EVENT_ID, role: "ticket_scanner" });
      // Same no-membership-user as above - the only difference is the option.
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r28", recheckMembership: false }
      );
      assert.equal(result.ok, true, "recheckMembership:false must trust the token without a live DB lookup");
      assert.equal(result.principal.userId, "no-membership-user");
    });

    it("recheckMembership: false does not affect a cookie-session-derived principal, which is always re-checked", async () => {
      currentServerUser = { id: "stranger-user" }; // no membership anywhere
      const result = await resolveScannerPrincipal(
        fakeReq(),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r29", recheckMembership: false }
      );
      assert.deepEqual(result, { ok: false, status: 403, code: "no_permission" });
    });
  });

  describe("D2: token-format dispatch", () => {
    it("never calls admin.auth.getUser for a well-formed scanner token", async () => {
      let called = false;
      currentDb.authUsers = new Proxy({}, { get() { called = true; return undefined; } });
      const { token } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const result = await resolveScannerPrincipal(
        fakeReq({ authorization: `Bearer ${token}` }),
        { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r21" }
      );
      assert.equal(result.ok, true);
      assert.equal(called, false, "admin.auth.getUser must not be called for our own scanner tokens");
    });
  });

  describe("D3: guest/staff-member principals are never checked as a user id", () => {
    it("a guest session is authorised by its own role, not a hasEventOrOrganizerAccess user lookup", async () => {
      // Poison row: if the resolver ever passed staffMemberId as userId into
      // event_team_members, this inactive row would also prove nothing was
      // matched by it (status mismatch) - the real assertion is that the
      // event/organizer/entity tables are left completely empty of this id.
      currentDb.event_team_members.push({ event_id: EVENT_ID, user_id: "staff-guest-1", role: "ticket_scanner", status: "removed" });

      const rawToken = generateEventStaffSessionToken();
      const hash = hashEventStaffSessionToken(rawToken);
      currentDb.rpcHandlers.validate_and_renew_event_staff_session = (params) => {
        if (params.p_event_id === EVENT_ID && params.p_session_token_hash === hash) {
          return {
            data: [{
              out_staff_member_id: "staff-guest-1",
              out_role: "event_manager",
              out_entrance_id: null,
              out_session_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }],
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const cookieName = eventStaffSessionCookieName(EVENT_ID);
      await withGuestScannerEnabled(async () => {
        const result = await resolveScannerPrincipal(
          fakeReq({ cookie: `${cookieName}=${rawToken}` }),
          { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r22" }
        );
        assert.equal(result.ok, true, "a guest with event_manager role must be authorised directly from the session");
      });
    });
  });

  describe("D7: cookie parsing", () => {
    it("does not attempt a guest session lookup when eventId is not a UUID", async () => {
      const result = await resolveScannerPrincipal(
        fakeReq({ cookie: "aldriva_event_staff_not-a-uuid=anything" }),
        { eventId: "not-a-uuid", requires: REQUIRES_CHECK_IN, requestId: "r23" }
      );
      assert.deepEqual(result, { ok: false, status: 401, code: "not_signed_in" });
    });

    it("parses a cookie header with multiple cookies and no regex built from eventId", async () => {
      const rawToken = generateEventStaffSessionToken();
      const hash = hashEventStaffSessionToken(rawToken);
      currentDb.rpcHandlers.validate_and_renew_event_staff_session = (params) => {
        if (params.p_event_id === EVENT_ID && params.p_session_token_hash === hash) {
          return {
            data: [{
              out_staff_member_id: "staff-2",
              out_role: "ticket_scanner",
              out_entrance_id: null,
              out_session_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }],
            error: null,
          };
        }
        return { data: null, error: null };
      };
      const cookieName = eventStaffSessionCookieName(EVENT_ID);
      const cookieHeader = `other_cookie=abc; ${cookieName}=${rawToken}; third=xyz`;
      await withGuestScannerEnabled(async () => {
        const result = await resolveScannerPrincipal(
          fakeReq({ cookie: cookieHeader }),
          { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r24" }
        );
        assert.equal(result.ok, true);
      });
    });
  });

  describe("D9: EVENT_SCAN_ENTITY_ROLES excludes editor", () => {
    beforeEach(() => {
      assert.deepEqual(EVENT_SCAN_ENTITY_ROLES.slice().sort(), ["admin", "manager", "owner"].sort());
    });

    it("an entity editor is denied scanning", async () => {
      currentDb.entity_members.push({ organizer_id: ORG_ID, user_id: "editor-user", role: "editor" });
      currentServerUser = { id: "editor-user" };
      const result = await resolveScannerPrincipal(fakeReq(), { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r25" });
      assert.deepEqual(result, { ok: false, status: 403, code: "no_permission" });
    });

    for (const role of ["manager", "admin", "owner"]) {
      it(`an entity ${role} is allowed to scan`, async () => {
        currentDb.entity_members.push({ organizer_id: ORG_ID, user_id: `${role}-user`, role });
        currentServerUser = { id: `${role}-user` };
        const result = await resolveScannerPrincipal(fakeReq(), { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "r26" });
        assert.equal(result.ok, true, `${role} should be allowed to scan`);
      });
    }
  });

  describe("D6: requestId is threaded through, not minted per call", () => {
    it("passes the caller's requestId into the capability-denied log", async () => {
      const originalError = console.error;
      const logs = [];
      console.error = (...args) => logs.push(args);
      try {
        const token = signRaw(v2Payload({ code_type: ["order"], actions: ["pick_up"] }));
        await resolveScannerPrincipal(
          fakeReq({ authorization: `Bearer ${token}` }),
          { eventId: EVENT_ID, requires: REQUIRES_CHECK_IN, requestId: "my-fixed-request-id" }
        );
      } finally {
        console.error = originalError;
      }
      assert.equal(logs.length, 1);
      assert.equal(logs[0][0], "[scanner-capability]");
      assert.equal(logs[0][1].requestId, "my-fixed-request-id");
    });
  });

  describe("Mint flag behaviour (lib/offline-scanner-token.ts)", () => {
    const mintRouteSrc = fs.readFileSync(
      path.join(ROOT, "app/api/events/[id]/scanner-token/route.ts"),
      "utf8"
    );

    it("route picks v1 vs v2 minting based on SCANNER_TOKEN_V2_MINT", () => {
      assert.match(mintRouteSrc, /process\.env\.SCANNER_TOKEN_V2_MINT === "1"/);
      assert.match(mintRouteSrc, /signScannerTokenV2\(/);
      assert.match(mintRouteSrc, /signScannerToken\(\{/);
    });

    it("the route hard-codes ticket/check_in for v2 minting - caller cannot request order/reservation capabilities", () => {
      assert.match(mintRouteSrc, /codeType:\s*\["ticket"\]/);
      assert.match(mintRouteSrc, /actions:\s*\["check_in"\]/);
    });

    it("signScannerToken (flag off) produces a v1 principal", () => {
      const { token } = signScannerToken({ userId: "u1", eventId: EVENT_ID, role: "ticket_scanner" });
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, true);
      assert.equal(verified.principal.version, 1);
    });

    it("signScannerTokenV2 (flag on) produces a v2 principal with only ticket/check_in", () => {
      const { token } = signScannerTokenV2({
        codeType: ["ticket"],
        scope: { event_id: EVENT_ID },
        actor: { user_id: "u1", role: "ticket_scanner" },
        actions: ["check_in"],
      });
      const verified = verifyScannerToken(token, EVENT_ID);
      assert.equal(verified.valid, true);
      assert.equal(verified.principal.version, 2);
      assert.deepEqual(verified.principal.codeType, ["ticket"]);
      assert.deepEqual(verified.principal.actions, ["check_in"]);
    });
  });

  describe("C1: scanner-sync wired to the resolver", () => {
    const { NextRequest } = require("next/server");
    const { POST: syncPOST } = require("../../app/api/events/[id]/scanner-sync/route");

    function syncReq({ authorization, cookie, body = { scans: [] } } = {}) {
      const headers = { "content-type": "application/json" };
      if (authorization) headers.authorization = authorization;
      if (cookie) headers.cookie = cookie;
      return new NextRequest(`http://localhost/api/events/${EVENT_ID}/scanner-sync`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    }

    function syncParams() {
      return { params: Promise.resolve({ id: EVENT_ID }) };
    }

    it("a valid token is trusted with no membership re-check (empty scans list)", async () => {
      const { token } = signScannerToken({ userId: "no-membership-sync-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const res = await syncPOST(syncReq({ authorization: `Bearer ${token}` }), syncParams());
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
    });

    it("a valid token via body.token (no Authorization header) is trusted the same way", async () => {
      const { token } = signScannerToken({ userId: "no-membership-sync-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const res = await syncPOST(syncReq({ body: { token, scans: [] } }), syncParams());
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
    });

    it("a revoked token returns 401 scanner_token_revoked", async () => {
      const { token } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
      const verified = verifyScannerToken(token, EVENT_ID);
      currentDb.scanner_token_revocations.push({ event_id: EVENT_ID, jti: verified.principal.jti, reason: "manual" });
      const res = await syncPOST(syncReq({ authorization: `Bearer ${token}` }), syncParams());
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.code, "scanner_token_revoked");
    });

    it("an invalid token falls through to a cookie session, which re-checks permission", async () => {
      const { token } = signScannerToken({ userId: "scanner-user", eventId: OTHER_EVENT_ID, role: "ticket_scanner" });
      currentDb.entity_members.push({ organizer_id: ORG_ID, user_id: "sync-manager-user", role: "manager" });
      currentServerUser = { id: "sync-manager-user" };
      const res = await syncPOST(syncReq({ authorization: `Bearer ${token}` }), syncParams());
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
    });

    for (const role of ["owner", "admin", "manager"]) {
      it(`C3: an entity ${role} can use sync's cookie fallback`, async () => {
        currentDb.entity_members.push({ organizer_id: ORG_ID, user_id: `sync-${role}-user`, role });
        currentServerUser = { id: `sync-${role}-user` };
        const res = await syncPOST(syncReq(), syncParams());
        assert.equal(res.status, 200, `${role} should be allowed via sync's cookie fallback`);
      });
    }

    it("C3: an entity editor cannot use sync's cookie fallback (finished editor wiring)", async () => {
      currentDb.entity_members.push({ organizer_id: ORG_ID, user_id: "sync-editor-user", role: "editor" });
      currentServerUser = { id: "sync-editor-user" };
      const res = await syncPOST(syncReq(), syncParams());
      // no_permission folds into sync's generic 401, same as no credentials.
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.deepEqual(body, { error: "Unauthorized. Valid scanner token or active session required." });
    });

    it("no credentials -> 401 with sync's own generic body", async () => {
      const res = await syncPOST(syncReq(), syncParams());
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.deepEqual(body, { error: "Unauthorized. Valid scanner token or active session required." });
    });

    it("a cookie session without permission folds into the same generic 401, not a 403", async () => {
      currentServerUser = { id: "stranger-sync-user" };
      const res = await syncPOST(syncReq(), syncParams());
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.deepEqual(body, { error: "Unauthorized. Valid scanner token or active session required." });
    });

    it("a valid token lacking the required capability returns 403 scanner_capability_denied (the only new failure)", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const token = signRaw({
        v: 2,
        typ: "scan",
        code_type: ["order"],
        scope: { event_id: EVENT_ID },
        actor: { user_id: "scanner-user", role: "ticket_scanner" },
        actions: ["pick_up"],
        iat: nowSec,
        exp: nowSec + 3600,
        jti: crypto.randomUUID(),
      });
      const res = await syncPOST(syncReq({ authorization: `Bearer ${token}` }), syncParams());
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.deepEqual(body, { error: "Scanner capability denied.", code: "scanner_capability_denied" });
    });
  });

  describe("C3: editor wiring across scanning gates", () => {
    const { NextRequest: MintNextRequest } = require("next/server");
    const { POST: mintPOST } = require("../../app/api/events/[id]/scanner-token/route");

    function mintReq({ authorization } = {}) {
      const headers = {};
      if (authorization) headers.authorization = authorization;
      return new MintNextRequest(`http://localhost/api/events/${EVENT_ID}/scanner-token`, {
        method: "POST",
        headers,
      });
    }

    function mintParams() {
      return { params: Promise.resolve({ id: EVENT_ID }) };
    }

    for (const role of ["owner", "admin", "manager"]) {
      it(`token mint: an entity ${role} can mint`, async () => {
        currentDb.entity_members.push({ organizer_id: ORG_ID, user_id: `mint-${role}-user`, role });
        currentServerUser = { id: `mint-${role}-user` };
        const res = await mintPOST(mintReq(), mintParams());
        assert.equal(res.status, 200, `${role} should be allowed to mint`);
      });
    }

    it("token mint: an entity editor cannot mint", async () => {
      currentDb.entity_members.push({ organizer_id: ORG_ID, user_id: "mint-editor-user", role: "editor" });
      currentServerUser = { id: "mint-editor-user" };
      const res = await mintPOST(mintReq(), mintParams());
      assert.equal(res.status, 403);
    });

    it("token mint: the event creator can still mint", async () => {
      currentDb.events.find((e) => e.id === EVENT_ID).user_id = "mint-creator-user";
      currentServerUser = { id: "mint-creator-user" };
      const res = await mintPOST(mintReq(), mintParams());
      assert.equal(res.status, 200);
    });

    it("token mint: the organizer owner can still mint", async () => {
      currentDb.organizers.find((o) => o.id === ORG_ID).user_id = "mint-organizer-owner-user";
      currentServerUser = { id: "mint-organizer-owner-user" };
      const res = await mintPOST(mintReq(), mintParams());
      assert.equal(res.status, 200);
    });

    it("token mint: an event_team_members ticket_scanner can still mint", async () => {
      currentServerUser = { id: "scanner-user" }; // seeded by baseAuthorizedDb as event_team_members ticket_scanner
      const res = await mintPOST(mintReq(), mintParams());
      assert.equal(res.status, 200);
    });

    it("token mint: an event_team_members event_manager can still mint", async () => {
      currentDb.event_team_members.push({ event_id: EVENT_ID, user_id: "mint-eventmanager-user", role: "event_manager", status: "active" });
      currentServerUser = { id: "mint-eventmanager-user" };
      const res = await mintPOST(mintReq(), mintParams());
      assert.equal(res.status, 200);
    });

    it("verify-ticket's check-in gate (canManageEvent) is wired to EVENT_SCAN_ENTITY_ROLES", () => {
      const src = fs.readFileSync(path.join(ROOT, "app/api/verify-ticket/route.ts"), "utf8");
      const start = src.indexOf("async function canManageEvent");
      const end = src.indexOf("\n}", start);
      const body = src.slice(start, end);
      assert.match(body, /EVENT_SCAN_ENTITY_ROLES/);
      assert.doesNotMatch(body, /ENTITY_ROLES_CONTENT_WRITE/);
    });

    it("verify-ticket's GET PII/manager-access check is now also wired to EVENT_SCAN_ENTITY_ROLES (F5: previously reported, now migrated)", () => {
      const src = fs.readFileSync(path.join(ROOT, "app/api/verify-ticket/route.ts"), "utf8");
      assert.match(
        src,
        /hasFullManagerAccess = userId\s*\n\s*\? await hasEventOrOrganizerAccess\(userId, ticketData\.eventId, \["event_manager"\], EVENT_SCAN_ENTITY_ROLES\)\s*\n\s*: false;/
      );
    });

    it("the scan page role gate is wired to EVENT_SCAN_ENTITY_ROLES", () => {
      const src = fs.readFileSync(path.join(ROOT, "app/dashboard/events/[id]/scan/page.tsx"), "utf8");
      assert.match(src, /hasEventOrOrganizerAccess\(ctx\.user\.id, eventId, \[\s*"event_manager",\s*"ticket_scanner",\s*\], EVENT_SCAN_ENTITY_ROLES\)/);
    });

    it("dashboard event-editing authorisation is untouched: ENTITY_ROLES_CONTENT_WRITE still includes editor", () => {
      assert.ok(ENTITY_ROLES_CONTENT_WRITE_FOR_TEST.includes("editor"));
      const teamPageSrc = fs.readFileSync(path.join(ROOT, "app/dashboard/events/[id]/team/page.tsx"), "utf8");
      assert.doesNotMatch(teamPageSrc, /EVENT_SCAN_ENTITY_ROLES/);
    });
  });
});
