const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const { ROOT, installTsLoader, makeFakeAdmin, freshDb } = require("./scanner-sync-test-utils.cjs");

process.env.SCANNER_TOKEN_SECRET = "scanner-sync-validation-test-secret-0123456789ab";

installTsLoader();

let currentDb = freshDb();
let writeLog = [];

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

const EVENT_ID = "33333333-3333-3333-3333-333333333333";
const VALID_TICKET_INSTANCE_ID = "44444444-4444-4444-4444-444444444444";
const VALID_SCAN_ID = "55555555-5555-5555-5555-555555555555";

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

function validScan(overrides = {}) {
  return {
    scan_id: VALID_SCAN_ID,
    ticket_instance_id: VALID_TICKET_INSTANCE_ID,
    qr_code: "VALIDQR",
    scanned_at: new Date().toISOString(),
    entrance_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  currentDb = freshDb({
    ticket_instances: [
      { id: VALID_TICKET_INSTANCE_ID, event_id: EVENT_ID, order_id: "order-1", status: "valid", checked_in_at: null },
    ],
  });
  writeLog = [];
});

describe("S2: scanner-sync validates before any write", () => {
  it("rejects a non-UUID scan_id with zero writes and status invalid", async () => {
    const res = await syncPOST(syncReq([{ ...validScan(), scan_id: "not-a-uuid" }]), syncParams());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.results.length, 1);
    assert.deepEqual(body.results[0], { scan_id: "not-a-uuid", status: "invalid", error: "INVALID_SCAN" });
    assert.equal(writeLog.length, 0, "no update/insert should have been attempted");
  });

  it("rejects a non-UUID ticket_instance_id with zero writes and status invalid", async () => {
    const res = await syncPOST(syncReq([{ ...validScan(), ticket_instance_id: "not-a-uuid" }]), syncParams());
    const body = await res.json();
    assert.equal(body.results[0].status, "invalid");
    assert.equal(body.results[0].error, "INVALID_SCAN");
    assert.equal(writeLog.length, 0);
  });

  it("allows an absent ticket_instance_id (qr_code fallback is unaffected)", async () => {
    const res = await syncPOST(
      syncReq([{ ...validScan(), ticket_instance_id: "", qr_code: "VALIDQR" }]),
      syncParams()
    );
    const body = await res.json();
    // Falls through to the qr_code lookup path; not rejected as invalid.
    assert.notEqual(body.results[0].status, "invalid");
  });

  for (const [label, scannedAt] of [
    ["unparseable", "not-a-timestamp"],
    ["too far in the future", new Date(Date.now() + 10 * 60 * 1000).toISOString()],
    ["too old", new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()],
  ]) {
    it(`rejects a scanned_at that is ${label} with zero writes and status invalid`, async () => {
      const res = await syncPOST(syncReq([{ ...validScan(), scanned_at: scannedAt }]), syncParams());
      const body = await res.json();
      assert.equal(body.results[0].status, "invalid");
      assert.equal(body.results[0].error, "INVALID_SCAN");
      assert.equal(writeLog.length, 0);
    });
  }

  it("an invalid scan does not stop the rest of the batch from being processed", async () => {
    const res = await syncPOST(
      syncReq([
        { ...validScan(), scan_id: "not-a-uuid" },
        validScan(),
      ]),
      syncParams()
    );
    const body = await res.json();
    assert.equal(body.processed, 2);
    const invalidResult = body.results.find((r) => r.scan_id === "not-a-uuid");
    const validResult = body.results.find((r) => r.scan_id === VALID_SCAN_ID);
    assert.equal(invalidResult.status, "invalid");
    assert.equal(validResult.status, "synced");
    // Exactly one update + one insert, both from the valid scan - none from the invalid one.
    assert.equal(writeLog.filter((w) => w.type === "update").length, 1);
    assert.equal(writeLog.filter((w) => w.type === "insert").length, 1);
  });

  it("a fully valid scan still succeeds unchanged (regression)", async () => {
    const res = await syncPOST(syncReq([validScan()]), syncParams());
    const body = await res.json();
    assert.deepEqual(body.results[0], { scan_id: VALID_SCAN_ID, status: "synced", action: "accepted" });
    assert.equal(currentDb.ticket_instances[0].status, "used");
  });
});

describe("S2: client-side terminal handling for \"invalid\" (source assertions)", () => {
  // lib/offline-scanner-db.ts drives IndexedDB (idb) and only runs in a
  // browser; there is no fake-indexeddb dependency in this repo and adding
  // one is out of scope for this task. These assertions read the compiled
  // source and prove the three properties that matter for retry behaviour,
  // without needing a real or fake IndexedDB:
  //   1. a dedicated branch maps status "invalid" to a local syncStatus of
  //      "invalid" (so it is NOT coerced into "failed" by the generic else),
  //   2. the retry filters (getPendingScans / getPendingScanCountStrict)
  //      only ever match "pending" or "failed" - "invalid" is excluded by
  //      construction, with no separate change needed there,
  //   3. nothing in the file ever deletes a row from the scan queue store,
  //      so an "invalid" record is never discarded, only marked.
  const src = fs.readFileSync(path.join(ROOT, "lib/offline-scanner-db.ts"), "utf8");

  it('syncOfflineScans maps a server "invalid" result to a terminal local "invalid" status', () => {
    assert.match(
      src,
      /r\.status === "invalid"[\s\S]{0,400}updateScanStatus\(r\.scan_id, "invalid"/
    );
  });

  it('getPendingScans and getPendingScanCountStrict only retry "pending" or "failed"', () => {
    const filterPattern = /syncStatus === "pending" \|\| s(?:can)?\.syncStatus === "failed"/g;
    const matches = src.match(filterPattern) || [];
    assert.equal(matches.length, 2, "expected exactly the two known retry filters, unchanged");
    assert.doesNotMatch(src, /syncStatus === "invalid"[\s\S]{0,40}syncStatus === "pending"/);
  });

  it("the scan queue store (scan_queue_v1) is never deleted from, only CACHE_STORE is", () => {
    const deleteCalls = src.match(/db\.delete\([^)]*\)/g) || [];
    assert.ok(deleteCalls.length > 0, "expected at least the known CACHE_STORE deletes");
    for (const call of deleteCalls) {
      assert.match(call, /CACHE_STORE/, `unexpected delete call not targeting CACHE_STORE: ${call}`);
    }
  });
});
