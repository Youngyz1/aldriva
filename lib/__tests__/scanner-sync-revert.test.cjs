const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const { ROOT, installTsLoader, makeFakeAdmin, freshDb } = require("./scanner-sync-test-utils.cjs");

process.env.SCANNER_TOKEN_SECRET = "scanner-sync-revert-test-secret-0123456789abcdef";

installTsLoader();

let currentDb = freshDb();
let writeLog = [];
let consoleErrorCalls = [];
const originalConsoleError = console.error;

const originalLoad = Module._load;
Module._load = function loadWithStubs(request) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => makeFakeAdmin(currentDb, writeLog) };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};

const { signScannerToken } = require("../offline-scanner-token");
const { NextRequest } = require("next/server");
const { POST: syncPOST } = require(path.join(ROOT, "app/api/events/[id]/scanner-sync/route"));

const EVENT_ID = "66666666-6666-6666-6666-666666666666";
const TICKET_INSTANCE_ID = "77777777-7777-7777-7777-777777777777";

function syncReq(scans) {
  const { token } = signScannerToken({ userId: "scanner-user", eventId: EVENT_ID, role: "ticket_scanner" });
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}/scanner-sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ scans }),
  });
}

function syncParams() {
  return { params: Promise.resolve({ id: EVENT_ID }) };
}

function scan(overrides = {}) {
  return {
    scan_id: "88888888-8888-8888-8888-888888888888",
    ticket_instance_id: TICKET_INSTANCE_ID,
    qr_code: "REVERTQR",
    scanned_at: new Date().toISOString(),
    entrance_id: null,
    ...overrides,
  };
}

function freshTicket(status = "valid") {
  return { id: TICKET_INSTANCE_ID, event_id: EVENT_ID, order_id: "order-1", status, checked_in_at: null };
}

beforeEach(() => {
  currentDb = freshDb({ ticket_instances: [freshTicket()] });
  writeLog = [];
  consoleErrorCalls = [];
  console.error = (...args) => {
    consoleErrorCalls.push(args);
  };
});

describe("S3: half-applied checkin insert is reverted and reported retryable", () => {
  it("insert failure after a successful status update reverts the status and reports failed+retryable", async () => {
    currentDb.insertFailures.ticket_checkins = { code: "23502", message: "null value in column x" };

    const res = await syncPOST(syncReq([scan()]), syncParams());
    const body = await res.json();

    assert.deepEqual(body.results[0], {
      scan_id: scan().scan_id,
      status: "failed",
      error: "CHECKIN_WRITE_FAILED",
    });
    assert.equal(body.failed, 1);
    assert.equal(body.synced, 0);
    assert.equal(body.conflicts, 0);

    // Reverted: back to valid, no checkins row, no conflicts row.
    assert.equal(currentDb.ticket_instances[0].status, "valid");
    assert.equal(currentDb.ticket_instances[0].checked_in_at, null);
    assert.equal(currentDb.ticket_checkins.length, 0);
    assert.equal(currentDb.offline_scan_conflicts.length, 0);

    // Logged with requestId and an error code, never a token.
    const halfAppliedLog = consoleErrorCalls.find((args) => args[0] === "[scanner-sync:half-applied]");
    assert.ok(halfAppliedLog, "expected a [scanner-sync:half-applied] log line");
    assert.ok(halfAppliedLog[1].requestId);
    assert.equal(halfAppliedLog[1].errorCode, "23502");
    const serialized = JSON.stringify(consoleErrorCalls);
    assert.doesNotMatch(serialized, /eyJ/); // no base64url-encoded token payload ever logged
  });

  it("the insert is retried for the known fallback cases before any revert is attempted", async () => {
    let insertAttempts = 0;
    currentDb.insertFailures.ticket_checkins = () => {
      insertAttempts += 1;
      if (insertAttempts === 1) return { message: "column delegating_user_id does not exist" };
      if (insertAttempts === 2) return { message: "column entrance_label does not exist", code: "42703" };
      return null; // third attempt (after both fallbacks) succeeds
    };

    const res = await syncPOST(syncReq([scan()]), syncParams());
    const body = await res.json();

    assert.equal(insertAttempts, 3, "expected both fallback retries before giving up");
    assert.equal(body.results[0].status, "synced", "should succeed on the second retry, no revert needed");
    assert.equal(currentDb.ticket_instances[0].status, "used");
  });

  it("revert is skipped when another check-in row already exists for the ticket (concurrent scanner won)", async () => {
    currentDb.ticket_checkins.push({
      id: "existing-checkin",
      ticket_instance_id: TICKET_INSTANCE_ID,
      offline_scan_id: "99999999-9999-9999-9999-999999999999",
    });
    currentDb.insertFailures.ticket_checkins = { code: "23502", message: "null value in column x" };

    const res = await syncPOST(syncReq([scan()]), syncParams());
    const body = await res.json();

    assert.equal(body.results[0].status, "failed");
    assert.equal(body.results[0].error, "CHECKIN_WRITE_FAILED");
    // NOT reverted: a real check-in already exists for this ticket, so the
    // status flip to 'used' must stand.
    assert.equal(currentDb.ticket_instances[0].status, "used");
    // No second write attempt touched ticket_instances with status: "valid".
    const revertAttempts = writeLog.filter(
      (w) => w.type === "update" && w.table === "ticket_instances" && w.payload.status === "valid"
    );
    assert.equal(revertAttempts.length, 0);
  });

  it("if the compensating revert itself fails, it is logged loudly and the scan is still reported failed (never synced)", async () => {
    currentDb.insertFailures.ticket_checkins = { code: "23502", message: "null value in column x" };
    currentDb.updateFailures = {
      ticket_instances: (payload) =>
        payload.status === "valid" ? { code: "40001", message: "serialization failure" } : null,
    };

    const res = await syncPOST(syncReq([scan()]), syncParams());
    const body = await res.json();

    assert.equal(body.results[0].status, "failed");
    assert.equal(body.results[0].error, "CHECKIN_WRITE_FAILED");
    assert.notEqual(body.results[0].status, "synced");
    // The revert update was attempted (status: "valid" in the write log)...
    const revertAttempts = writeLog.filter(
      (w) => w.type === "update" && w.table === "ticket_instances" && w.payload.status === "valid"
    );
    assert.equal(revertAttempts.length, 1);
    // ...but did not take effect, since it failed.
    assert.equal(currentDb.ticket_instances[0].status, "used");
    // And the failure was logged loudly.
    const revertFailedLog = consoleErrorCalls.find((args) => args[0] === "[scanner-sync:revert-failed]");
    assert.ok(revertFailedLog, "expected a [scanner-sync:revert-failed] log line");
    assert.equal(revertFailedLog[1].errorCode, "40001");
  });
});

describe("S3 regression: unchanged behaviour for success, replay, conflict, and Main Gate", () => {
  it("a fully valid scan still succeeds (unchanged)", async () => {
    const res = await syncPOST(syncReq([scan()]), syncParams());
    const body = await res.json();
    assert.deepEqual(body.results[0], { scan_id: scan().scan_id, status: "synced", action: "accepted" });
  });

  it("replaying the same scan_id is still idempotent (unchanged)", async () => {
    await syncPOST(syncReq([scan()]), syncParams());
    const before = currentDb.ticket_checkins.length;
    const res = await syncPOST(syncReq([scan()]), syncParams());
    const body = await res.json();
    assert.deepEqual(body.results[0], { scan_id: scan().scan_id, status: "synced", action: "idempotent_noop" });
    assert.equal(currentDb.ticket_checkins.length, before, "no duplicate row");
  });

  it("a genuine conflict (ticket already used by someone else) is still reported as a conflict (unchanged)", async () => {
    await syncPOST(syncReq([scan()]), syncParams());
    const res = await syncPOST(
      syncReq([scan({ scan_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" })]),
      syncParams()
    );
    const body = await res.json();
    assert.equal(body.results[0].status, "conflict");
    assert.equal(body.results[0].reason, "ALREADY_CHECKED_IN");
    assert.equal(currentDb.offline_scan_conflicts.length, 1);
  });

  it('a free-text "Main Gate" entrance still lands as entrance_label with a null entrance_id (unchanged)', async () => {
    await syncPOST(syncReq([scan({ entrance_id: "Main Gate" })]), syncParams());
    assert.equal(currentDb.ticket_checkins[0].entrance_label, "Main Gate");
    assert.equal(currentDb.ticket_checkins[0].entrance_id, null);
  });
});

process.on("exit", () => {
  console.error = originalConsoleError;
});
