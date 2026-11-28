const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
process.env.SCANNER_TOKEN_SECRET =
  "scanner-phase-0-test-secret-0123456789abcdef";

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
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
require.extensions[".tsx"] = require.extensions[".ts"];

// `server-only` is a Next.js build-time marker with no runtime package here.
const originalLoad = Module._load;
Module._load = function loadWithServerOnlyStub(request) {
  if (request === "server-only") return {};
  return originalLoad.apply(this, arguments);
};

function legacyToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto
    .createHmac("sha256", process.env.SCANNER_TOKEN_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${hmac}`;
}

describe("Scanner Phase 0", () => {
  describe("entrance normalisation", () => {
    const { normalizeEntrance, isMissingEntranceLabelError } = require("../staff/entrance");

    it("keeps a free-text gate label out of the uuid column", () => {
      const result = normalizeEntrance("Main Gate");
      assert.equal(result.id, null, "a label must never become entrance_id");
      assert.equal(result.label, "Main Gate");
    });

    it("accepts a real uuid as an id and stores no label", () => {
      const uuid = "3f0c0a52-1b3e-4c4e-9f0e-1a2b3c4d5e6f";
      const result = normalizeEntrance(uuid);
      assert.equal(result.id, uuid);
      assert.equal(result.label, null);
    });

    it("trims, ignores blank values and caps the label at 120 characters", () => {
      assert.deepEqual(normalizeEntrance("   "), { id: null, label: null });
      assert.deepEqual(normalizeEntrance(null), { id: null, label: null });
      const long = "G".repeat(300);
      assert.equal(normalizeEntrance(long).label.length, 120);
    });

    it("recognises the missing-column error so writes can retry before migration 208", () => {
      assert.equal(
        isMissingEntranceLabelError({ code: "42703", message: "column ticket_checkins.entrance_label does not exist" }),
        true,
      );
      assert.equal(isMissingEntranceLabelError({ code: "23505", message: "duplicate key" }), false);
    });
  });

  describe("scanner token jti rollout", () => {
    const { signScannerToken, verifyScannerToken } = require("../offline-scanner-token");

    it("mints a token with a jti", () => {
      const { token } = signScannerToken({ userId: "user-1", eventId: "event-1", role: "ticket_scanner" });
      const verified = verifyScannerToken(token, "event-1");
      assert.equal(verified.valid, true);
      assert.match(verified.payload.jti, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("accepts a pre-Phase-0 token that has no jti", () => {
      const now = Date.now();
      const token = legacyToken({
        userId: "user-1",
        eventId: "event-1",
        role: "ticket_scanner",
        entranceId: null,
        issuedAt: now,
        expiresAt: now + 3600 * 1000,
      });
      const verified = verifyScannerToken(token, "event-1");
      assert.equal(verified.valid, true, "legacy tokens must keep working during rollout");
      assert.equal(verified.payload.jti, undefined);
    });

    it("rejects a malformed jti", () => {
      const now = Date.now();
      const token = legacyToken({
        userId: "user-1",
        eventId: "event-1",
        role: "ticket_scanner",
        jti: "not-a-uuid",
        issuedAt: now,
        expiresAt: now + 3600 * 1000,
      });
      const verified = verifyScannerToken(token, "event-1");
      assert.equal(verified.valid, false);
      assert.equal(verified.error, "Invalid token id");
    });
  });

  describe("migration 208", () => {
    const forward = fs.readFileSync(path.join(ROOT, "db/migration_208_scanner_hardening.sql"), "utf8");
    const rollback = fs.readFileSync(path.join(ROOT, "db/migration_208_scanner_hardening_rollback.sql"), "utf8");
    const mirrorPath = path.join(ROOT, "supabase/migrations/20261030140000_migration_208_scanner_hardening.sql");

    it("adds entrance_label to both scan tables", () => {
      assert.match(forward, /ALTER TABLE public\.ticket_checkins\s+ADD COLUMN IF NOT EXISTS entrance_label text;/);
      assert.match(forward, /ALTER TABLE public\.event_ticket_scan_attempts\s+ADD COLUMN IF NOT EXISTS entrance_label text;/);
    });

    it("creates a service-role-only revocation list", () => {
      assert.match(forward, /CREATE TABLE IF NOT EXISTS public\.scanner_token_revocations/);
      assert.match(forward, /ENABLE ROW LEVEL SECURITY/);
      assert.match(
        forward,
        /REVOKE ALL ON TABLE public\.scanner_token_revocations FROM PUBLIC, anon, authenticated;/,
      );
      assert.match(forward, /GRANT SELECT, INSERT, DELETE ON TABLE public\.scanner_token_revocations TO service_role;/);
    });

    it("has a byte-identical Supabase mirror", () => {
      assert.ok(fs.existsSync(mirrorPath), "mirror file must exist");
      assert.equal(fs.readFileSync(mirrorPath, "utf8"), forward);
    });

    it("rolls back fail-closed while revocations are live", () => {
      assert.match(rollback, /RAISE EXCEPTION 'MIGRATION_208_ROLLBACK_BLOCKED/);
      assert.match(rollback, /DROP TABLE IF EXISTS public\.scanner_token_revocations;/);
    });
  });

  describe("subject revocation is time-bounded and fails open", () => {
    const { isScannerTokenRevoked } = require("../staff/scanner-revocations");

    function fakeAdmin({ jtiRow = null, subjectRows = [], error = null } = {}) {
      return {
        from() {
          const ctx = { filters: {} };
          const builder = {
            select() { return builder; },
            eq(key, value) { ctx.filters[key] = value; return builder; },
            is(key, value) { ctx.filters[key] = value; return builder; },
            or() { return builder; },
            limit() { return builder; },
            maybeSingle() {
              if (error) return Promise.resolve({ data: null, error });
              const isJtiQuery = "jti" in ctx.filters && ctx.filters.jti !== null;
              return Promise.resolve({ data: isJtiQuery ? jtiRow : null, error: null });
            },
            then(resolve, reject) {
              if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
              return Promise.resolve({ data: subjectRows, error: null }).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    }

    const issuedAt = Date.parse("2026-10-30T10:00:00.000Z");
    const base = {
      eventId: "event-1",
      jti: "3f0c0a52-1b3e-4c4e-9f0e-1a2b3c4d5e6f",
      userId: "user-1",
      staffMemberId: undefined,
      issuedAt,
    };

    it("rejects a token whose jti was revoked", async () => {
      const admin = fakeAdmin({ jtiRow: { reason: "manual" } });
      const result = await isScannerTokenRevoked(admin, base, "req-1");
      assert.deepEqual(result, { revoked: true, reason: "manual" });
    });

    it("rejects a token issued before the member was removed", async () => {
      const admin = fakeAdmin({
        subjectRows: [{ reason: "removed_from_team", revoked_at: "2026-10-30T10:05:00.000Z" }],
      });
      const result = await isScannerTokenRevoked(admin, base, "req-2");
      assert.equal(result.revoked, true);
    });

    it("accepts a new token for a re-added member", async () => {
      const admin = fakeAdmin({
        subjectRows: [{ reason: "removed_from_team", revoked_at: "2026-10-30T09:00:00.000Z" }],
      });
      const result = await isScannerTokenRevoked(admin, base, "req-3");
      assert.deepEqual(result, { revoked: false });
    });

    it("rejects when any of several removals predates the token", async () => {
      const admin = fakeAdmin({
        subjectRows: [
          { reason: "removed_from_team", revoked_at: "2026-10-30T09:00:00.000Z" },
          { reason: "removed_from_team", revoked_at: "2026-10-30T10:30:00.000Z" },
        ],
      });
      const result = await isScannerTokenRevoked(admin, base, "req-4");
      assert.equal(result.revoked, true);
    });

    it("fails open with a logged error when the table or query is unavailable", async () => {
      const originalError = console.error;
      const logged = [];
      console.error = (...args) => logged.push(args);
      try {
        const admin = fakeAdmin({ error: { code: "PGRST205", message: "Could not find the table" } });
        const result = await isScannerTokenRevoked(admin, base, "req-5");
        assert.deepEqual(result, { revoked: false });
        assert.equal(logged.length, 1);
        assert.equal(logged[0][0], "[scanner-token-revocations]");
        assert.equal(logged[0][1].errorCode, "PGRST205");
      } finally {
        console.error = originalError;
      }
    });
  });

  describe("guest scanner gate", () => {
    const redeem = fs.readFileSync(path.join(ROOT, "app/api/events/team/redeem/route.ts"), "utf8");
    const flag = fs.readFileSync(path.join(ROOT, "lib/staff/guest-scanner-flag.ts"), "utf8");

    it("defaults to off unless the env var is exactly true", () => {
      assert.match(flag, /process\.env\[GUEST_SCANNER_FLAG_ENV\] === "true"/);
    });

    it("does not hand out a scanner URL while the flag is off", () => {
      assert.match(redeem, /workspaceUrl: guestScanningEnabled/);
      assert.match(redeem, /: null,/);
    });

    it("keeps a non-404 landing route for invited guests", () => {
      const page = fs.readFileSync(path.join(ROOT, "app/events/[slug]/staff-scanner/page.tsx"), "utf8");
      assert.match(page, /isGuestScannerEnabled/);
      assert.match(page, /Guest scanning is not available yet/);
    });
  });
});


describe("verify-ticket entrance label", () => {
  const fsr = require("fs");
  const pathr = require("path");
  it("passes raw entrance through to recordRejectedTicketScan", () => {
    const src = fsr.readFileSync(pathr.join(process.cwd(), "app/api/verify-ticket/route.ts"), "utf8");
    const a = require("node:assert/strict");
    a.match(src, /entranceId:\s*attempt\.entrance \?\? null/);
  });
});
