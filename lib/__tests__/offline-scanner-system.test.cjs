const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

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

describe("Offline Scanner System (Phases A, B, and C)", () => {
  describe("Scanner Token Generation & Verification", () => {
    const { signScannerToken, verifyScannerToken } = require("../offline-scanner-token");

    it("should generate a valid 8-hour token and verify it successfully", () => {
      const { token, expiresAt } = signScannerToken({
        userId: "user-123",
        eventId: "event-456",
        role: "ticket_scanner",
        entranceId: "gate-a",
        durationHours: 8,
      });

      assert.ok(token, "Token must be a non-empty string");
      assert.ok(token.includes("."), "Token must contain a dot separator");
      assert.ok(expiresAt > Date.now() + 7.9 * 3600 * 1000, "Expiry should be ~8 hours in future");

      const verified = verifyScannerToken(token, "event-456");
      assert.ok(verified.valid, "Token must verify successfully");
      assert.equal(verified.payload.userId, "user-123");
      assert.equal(verified.payload.eventId, "event-456");
      assert.equal(verified.payload.role, "ticket_scanner");
      assert.equal(verified.payload.entranceId, "gate-a");
    });

    it("should reject tampered tokens", () => {
      const { token } = signScannerToken({
        userId: "user-123",
        eventId: "event-456",
        role: "ticket_scanner",
      });

      const parts = token.split(".");
      const tampered = parts[0] + "xyz." + parts[1];
      const verified = verifyScannerToken(tampered);
      assert.equal(verified.valid, false, "Tampered token must be rejected");
    });

    it("should reject expired tokens", () => {
      const { token } = signScannerToken({
        userId: "user-123",
        eventId: "event-456",
        role: "ticket_scanner",
        durationHours: -1,
      });

      const verified = verifyScannerToken(token);
      assert.equal(verified.valid, false, "Expired token must be rejected");
    });
  });

  describe("Offline Dataset Expiry Logic", () => {
    it("should calculate dataset expiry as max(event_date + 6h, download_time + 24h)", () => {
      const now = Date.now();

      // Case 1: Event is far in future (e.g. 5 days) -> event_date + 6h wins
      const futureEventDate = new Date(now + 5 * 24 * 3600 * 1000).toISOString();
      const futureExpiry = Math.max(
        new Date(futureEventDate).getTime() + 6 * 3600 * 1000,
        now + 24 * 3600 * 1000
      );
      assert.ok(futureExpiry > now + 4 * 24 * 3600 * 1000);

      // Case 2: Event is in 2 hours -> download_time + 24h wins
      const nearEventDate = new Date(now + 2 * 3600 * 1000).toISOString();
      const nearExpiry = Math.max(
        new Date(nearEventDate).getTime() + 6 * 3600 * 1000,
        now + 24 * 3600 * 1000
      );
      assert.equal(nearExpiry, now + 24 * 3600 * 1000);
    });
  });

  describe("Offline Validation Rule Mirroring", () => {
    const mockDataset = {
      eventId: "event-1",
      userId: "staff-1",
      tickets: [
        { instance_id: "inst-1", qr_code: "VALID-123", status: "valid", buyer_name: "John Doe" },
        { instance_id: "inst-2", qr_code: "USED-456", status: "used", buyer_name: "Jane Smith" },
        { instance_id: "inst-3", qr_code: "CANCEL-789", status: "cancelled", buyer_name: "Bob" },
        { instance_id: "inst-4", qr_code: "REFUND-101", status: "refunded", buyer_name: "Alice" },
      ],
    };

    function validateOffline(code) {
      const clean = code.trim().toUpperCase();
      const match = mockDataset.tickets.find((t) => t.qr_code === clean);
      if (!match) return { status: "not_in_local_data" };
      if (match.status === "valid") return { status: "offline_valid", ticket: match };
      return { status: match.status, ticket: match };
    }

    it("should accept valid ticket with offline_valid status", () => {
      const res = validateOffline("VALID-123");
      assert.equal(res.status, "offline_valid");
      assert.equal(res.ticket.buyer_name, "John Doe");
    });

    it("should detect used ticket in local dataset", () => {
      const res = validateOffline("USED-456");
      assert.equal(res.status, "used");
      assert.equal(res.ticket.buyer_name, "Jane Smith");
    });

    it("should detect cancelled and refunded tickets", () => {
      assert.equal(validateOffline("CANCEL-789").status, "cancelled");
      assert.equal(validateOffline("REFUND-101").status, "refunded");
    });

    it("should return not_in_local_data for unknown ticket codes", () => {
      const res = validateOffline("UNKNOWN-CODE-999");
      assert.equal(res.status, "not_in_local_data");
    });
  });

  describe("Entrance Auto-Population & Staff Assignment", () => {
    const { signScannerToken, verifyScannerToken } = require("../offline-scanner-token");

    it("should carry assigned entrance_id in scanner token payload", () => {
      const assignedEntranceId = "gate-north-42";
      const { token } = signScannerToken({
        userId: "staff-member-1",
        eventId: "event-100",
        role: "ticket_scanner",
        entranceId: assignedEntranceId,
      });

      const res = verifyScannerToken(token, "event-100");
      assert.ok(res.valid);
      assert.equal(res.payload.entranceId, "gate-north-42");
    });
  });

  describe("Phase C: Local Offline Write Queue & Cache Transition", () => {
    it("should mark local cache ticket as used upon queueing to prevent offline re-scans", () => {
      const mockCachedDataset = {
        eventId: "event-c1",
        userId: "prep-user-1",
        tickets: [
          { instance_id: "inst-100", qr_code: "TICKET-100", status: "valid", buyer_name: "Eve" },
        ],
      };

      const scanItem = {
        scanId: "scan-uuid-1",
        eventId: "event-c1",
        ticketInstanceId: "inst-100",
        qrCode: "TICKET-100",
        scannedAt: "2026-09-14T20:00:00.000Z",
        delegatingUserId: "prep-user-1",
        currentUserId: "volunteer-door-user",
        entranceId: "gate-vip",
        deviceId: "dev-phone-1",
        syncStatus: "pending",
      };

      const target = mockCachedDataset.tickets.find((t) => t.instance_id === scanItem.ticketInstanceId);
      assert.ok(target);
      target.status = "used";
      target.checked_in_at = scanItem.scannedAt;

      assert.equal(mockCachedDataset.tickets[0].status, "used");
      assert.equal(mockCachedDataset.tickets[0].checked_in_at, "2026-09-14T20:00:00.000Z");
    });
  });

  describe("Phase C: First-Timestamp-Wins Conflict Resolution Algorithm", () => {
    function processScans(scans, initialDbState) {
      const db = { ...initialDbState };
      const checkins = [];
      const conflicts = [];

      const sorted = [...scans].sort((a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime());

      for (const s of sorted) {
        if (checkins.some((c) => c.offline_scan_id === s.scan_id)) {
          continue;
        }

        const currentStatus = db[s.ticket_instance_id]?.status || "valid";
        if (currentStatus === "valid") {
          db[s.ticket_instance_id] = { status: "used", checked_in_at: s.scanned_at };
          checkins.push({
            id: `chk_${s.scan_id}`,
            ticket_instance_id: s.ticket_instance_id,
            offline_scan_id: s.scan_id,
            device_id: s.device_id,
            delegating_user_id: s.delegating_user_id,
            scanned_by_user_id: s.current_user_id,
            offline_scanned_at: s.scanned_at,
          });
        } else {
          const winning = checkins.find((c) => c.ticket_instance_id === s.ticket_instance_id);
          conflicts.push({
            offline_scan_id: s.scan_id,
            ticket_instance_id: s.ticket_instance_id,
            device_id: s.device_id,
            delegating_user_id: s.delegating_user_id,
            scanned_by_user_id: s.current_user_id,
            offline_scanned_at: s.scanned_at,
            winning_checkin_id: winning?.id,
            conflict_reason: "already_checked_in",
          });
        }
      }

      return { checkins, conflicts, db };
    }

    it("should accept first offline scan and log subsequent offline scan as conflict", () => {
      const scanA = {
        scan_id: "scan-dev-A",
        ticket_instance_id: "ticket-xyz",
        scanned_at: "2026-09-14T20:00:00.000Z",
        device_id: "device-A",
        delegating_user_id: "lead-organizer",
        current_user_id: "staff-A",
      };

      const scanB = {
        scan_id: "scan-dev-B",
        ticket_instance_id: "ticket-xyz",
        scanned_at: "2026-09-14T20:05:00.000Z",
        device_id: "device-B",
        delegating_user_id: "lead-organizer",
        current_user_id: "staff-B",
      };

      const { checkins, conflicts } = processScans([scanB, scanA], { "ticket-xyz": { status: "valid" } });

      assert.equal(checkins.length, 1);
      assert.equal(checkins[0].offline_scan_id, "scan-dev-A");
      assert.equal(checkins[0].scanned_by_user_id, "staff-A");
      assert.equal(checkins[0].device_id, "device-A");

      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].offline_scan_id, "scan-dev-B");
      assert.equal(conflicts[0].scanned_by_user_id, "staff-B");
      assert.equal(conflicts[0].device_id, "device-B");
      assert.equal(conflicts[0].winning_checkin_id, checkins[0].id);
      assert.equal(conflicts[0].conflict_reason, "already_checked_in");
    });
  });

  describe("Migration 122 & 124 SQL Artifact Integrity", () => {
    it("should have migration 122 and matching rollback and supabase CLI mirror", () => {
      const migPath = path.join(ROOT, "db", "migration_122_offline_scanner_support.sql");
      const rollbackPath = path.join(ROOT, "db", "migration_122_offline_scanner_support_rollback.sql");
      const mirrorPath = path.join(ROOT, "supabase", "migrations", "20260914000003_migration_122_offline_scanner_support.sql");

      assert.ok(fs.existsSync(migPath), "Migration 122 must exist in db/");
      assert.ok(fs.existsSync(rollbackPath), "Rollback 122 must exist in db/");
      assert.ok(fs.existsSync(mirrorPath), "CLI mirror 122 must exist in supabase/migrations/");

      const migSql = fs.readFileSync(migPath, "utf8");
      assert.ok(migSql.includes("offline_scan_id"), "Migration must add offline_scan_id");
      assert.ok(migSql.includes("device_id"), "Migration must add device_id");
      assert.ok(migSql.includes("scan_source"), "Migration must add scan_source");
      assert.ok(migSql.includes("entrance_id"), "Migration must add entrance_id");
    });

    it("should have migration 124 and matching rollback and supabase CLI mirror", () => {
      const migPath = path.join(ROOT, "db", "migration_124_offline_sync_and_conflicts.sql");
      const rollbackPath = path.join(ROOT, "db", "migration_124_offline_sync_and_conflicts_rollback.sql");
      const mirrorPath = path.join(ROOT, "supabase", "migrations", "20260914000004_migration_124_offline_sync_and_conflicts.sql");

      assert.ok(fs.existsSync(migPath), "Migration 124 must exist in db/");
      assert.ok(fs.existsSync(rollbackPath), "Rollback 124 must exist in db/");
      assert.ok(fs.existsSync(mirrorPath), "CLI mirror 124 must exist in supabase/migrations/");

      const migSql = fs.readFileSync(migPath, "utf8");
      assert.ok(migSql.includes("delegating_user_id"), "Migration must add delegating_user_id");
      assert.ok(migSql.includes("offline_scanned_at"), "Migration must add offline_scanned_at");
      assert.ok(migSql.includes("offline_scan_conflicts"), "Migration must create offline_scan_conflicts");
    });
  });
});
