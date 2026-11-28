/**
 * lib/__tests__/scanner-sync-guest-attribution.test.cjs
 *
 * A guest (account-less) scanner principal has no auth.users id: its scanner
 * identity comes solely from the server-resolved scanner-token principal
 * (staffMemberId + sessionHash, no userId - see lib/offline-scanner-token.ts's
 * guestIdentity branch), never from the client-supplied current_user_id /
 * delegating_user_id fields on a queued scan.
 *
 * These tests prove:
 *  - A successful guest check-in writes scanned_by_staff_member_id and
 *    leaves scanned_by_user_id / delegating_user_id null, even when the
 *    client lies about current_user_id / delegating_user_id.
 *  - The same holds for the offline_scan_conflicts row on an
 *    already-checked-in / cancelled / refunded conflict.
 *  - The account path's attribution (scanner-sync-revert.test.cjs,
 *    scanner-sync-validation.test.cjs) is untouched (regression covered
 *    there, re-run alongside this file).
 *  - A guest write that hits a schema-mismatch error is never silently
 *    retried by stripping scanned_by_staff_member_id: it is reported
 *    "failed" (retryable) and logged with the request id, while the
 *    account path's column-fallback retries keep working exactly as before.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");
const crypto = require("crypto");

const { ROOT, installTsLoader, makeFakeAdmin, freshDb } = require("./scanner-sync-test-utils.cjs");

process.env.SCANNER_TOKEN_SECRET = "scanner-sync-guest-attribution-test-secret-0123456789";

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

const EVENT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const TICKET_INSTANCE_ID = "aaaaaaaa-0000-0000-0000-000000000002";
const STAFF_MEMBER_ID = "aaaaaaaa-0000-0000-0000-000000000099";
const SESSION_HASH = crypto.createHash("sha256").update("guest-session-token").digest("hex");

function guestToken(overrides = {}) {
  return signScannerToken({
    staffMemberId: STAFF_MEMBER_ID,
    sessionHash: SESSION_HASH,
    eventId: EVENT_ID,
    role: "ticket_scanner",
    ...overrides,
  }).token;
}

function accountToken() {
  return signScannerToken({ userId: "account-user-1", eventId: EVENT_ID, role: "ticket_scanner" }).token;
}

function syncReq(token, scans) {
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}/scanner-sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ scans }),
  });
}

function syncParams() {
  return { params: Promise.resolve({ id: EVENT_ID }) };
}

function freshTicket(status = "valid") {
  return { id: TICKET_INSTANCE_ID, event_id: EVENT_ID, order_id: "order-1", status, checked_in_at: null };
}

// A hostile/buggy client claiming to be a different account entirely - the
// server must never trust this for a guest principal.
function lyingScan(overrides = {}) {
  return {
    scan_id: "aaaaaaaa-0000-0000-0000-000000000003",
    ticket_instance_id: TICKET_INSTANCE_ID,
    qr_code: "GUESTQR",
    scanned_at: new Date().toISOString(),
    entrance_id: null,
    current_user_id: "forged-account-id",
    delegating_user_id: "forged-delegate-id",
    ...overrides,
  };
}

beforeEach(() => {
  currentDb = freshDb({ ticket_instances: [freshTicket()] });
  writeLog = [];
  consoleErrorCalls = [];
  console.error = (...args) => {
    consoleErrorCalls.push(args);
  };
});

process.on("exit", () => {
  console.error = originalConsoleError;
});

describe("guest scan attribution: success path", () => {
  it("writes scanned_by_staff_member_id and nulls both user columns, ignoring the client's forged ids", async () => {
    const res = await syncPOST(syncReq(guestToken(), [lyingScan()]), syncParams());
    const body = await res.json();
    assert.equal(body.results[0].status, "synced");

    const row = currentDb.ticket_checkins[0];
    assert.equal(row.scanned_by_staff_member_id, STAFF_MEMBER_ID);
    assert.equal(row.scanned_by_user_id, null);
    assert.equal(row.delegating_user_id, null);
  });

  it("account path is unaffected: scanned_by_staff_member_id stays null and the pre-existing client-trusting formula is untouched", async () => {
    const res = await syncPOST(syncReq(accountToken(), [lyingScan({ scan_id: "aaaaaaaa-0000-0000-0000-000000000004" })]), syncParams());
    const body = await res.json();
    assert.equal(body.results[0].status, "synced");

    const row = currentDb.ticket_checkins[0];
    // Account path never writes a staff-member attribution.
    assert.equal(row.scanned_by_staff_member_id, null);
    // Byte-for-byte unchanged formula: `scan.delegating_user_id || delegatingUserId`
    // - the account path has always preferred the client-supplied value here,
    // and that pre-existing behaviour is explicitly out of scope to change.
    assert.equal(row.delegating_user_id, "forged-delegate-id");
    assert.equal(row.scanned_by_user_id, "forged-account-id");
  });
});

describe("guest scan attribution: conflict path", () => {
  it("already-checked-in conflict row carries scanned_by_staff_member_id, not the client's forged ids", async () => {
    // First scan (by the account) claims the ticket.
    await syncPOST(syncReq(accountToken(), [lyingScan()]), syncParams());
    // Second scan (by the guest, different scan_id so it isn't idempotent) conflicts.
    const res = await syncPOST(
      syncReq(guestToken(), [lyingScan({ scan_id: "aaaaaaaa-0000-0000-0000-000000000005" })]),
      syncParams()
    );
    const body = await res.json();
    assert.equal(body.results[0].status, "conflict");

    const conflictRow = currentDb.offline_scan_conflicts[0];
    assert.equal(conflictRow.scanned_by_staff_member_id, STAFF_MEMBER_ID);
    assert.equal(conflictRow.scanned_by_user_id, null);
    assert.equal(conflictRow.delegating_user_id, null);
  });

  it("cancelled-ticket conflict row carries scanned_by_staff_member_id for a guest", async () => {
    currentDb.ticket_instances[0].status = "cancelled";
    const res = await syncPOST(syncReq(guestToken(), [lyingScan()]), syncParams());
    const body = await res.json();
    assert.equal(body.results[0].status, "conflict");
    assert.equal(body.results[0].reason, "CANCELLED");

    const conflictRow = currentDb.offline_scan_conflicts[0];
    assert.equal(conflictRow.scanned_by_staff_member_id, STAFF_MEMBER_ID);
    assert.equal(conflictRow.scanned_by_user_id, null);
  });

  it("logs a conflict-insert failure with the request id instead of swallowing it silently", async () => {
    currentDb.insertFailures.offline_scan_conflicts = { code: "23502", message: "boom" };
    await syncPOST(syncReq(accountToken(), [lyingScan()]), syncParams());
    const res2 = await syncPOST(
      syncReq(guestToken(), [lyingScan({ scan_id: "aaaaaaaa-0000-0000-0000-000000000006" })]),
      syncParams()
    );
    const body2 = await res2.json();
    assert.equal(body2.results[0].status, "conflict", "the response still reports the conflict");

    const failLog = consoleErrorCalls.find((args) => args[0] === "[scanner-sync:conflict-insert-failed]");
    assert.ok(failLog, "expected a [scanner-sync:conflict-insert-failed] log line");
    assert.ok(failLog[1].requestId);
    assert.equal(failLog[1].errorCode, "23502");
  });
});

describe("guest scan attribution: schema-mismatch never strips staff attribution", () => {
  it("a guest insert error never retries by stripping columns - it is reported failed and reverted", async () => {
    currentDb.insertFailures.ticket_checkins = { message: "column delegating_user_id does not exist" };

    const res = await syncPOST(syncReq(guestToken(), [lyingScan()]), syncParams());
    const body = await res.json();

    assert.equal(body.results[0].status, "failed");
    assert.equal(body.results[0].error, "CHECKIN_WRITE_FAILED");

    // Exactly one insert attempt - no column-fallback retry for a guest.
    const checkinInserts = writeLog.filter((w) => w.type === "insert" && w.table === "ticket_checkins");
    assert.equal(checkinInserts.length, 1, "a guest write must never be retried with columns stripped");

    // Reverted back to valid (nothing landed) and still retryable (queued).
    assert.equal(currentDb.ticket_instances[0].status, "valid");
    assert.equal(currentDb.ticket_checkins.length, 0);

    const halfAppliedLog = consoleErrorCalls.find((args) => args[0] === "[scanner-sync:half-applied]");
    assert.ok(halfAppliedLog, "expected the failure to be logged with the request id");
    assert.ok(halfAppliedLog[1].requestId);
  });

  it("the account path's column-fallback retry is untouched: it still retries and succeeds", async () => {
    let insertAttempts = 0;
    currentDb.insertFailures.ticket_checkins = () => {
      insertAttempts += 1;
      if (insertAttempts === 1) return { message: "column delegating_user_id does not exist" };
      return null;
    };

    const res = await syncPOST(syncReq(accountToken(), [lyingScan()]), syncParams());
    const body = await res.json();

    assert.equal(insertAttempts, 2, "account path must still retry once on the known fallback case");
    assert.equal(body.results[0].status, "synced");
  });
});
