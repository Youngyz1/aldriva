/**
 * lib/__tests__/verify-ticket-guest-path.test.cjs
 *
 * POST /api/verify-ticket previously had no concept of a guest (account-less)
 * staff session at all: getCurrentUserId only ever resolved a Bearer JWT or
 * the Supabase cookie, so a guest scanning online always hit the "Log in as
 * authorized door staff..." 401, and the 11-argument check_in_ticket RPC
 * (migration 196) had no caller.
 *
 * These tests prove:
 *  - A valid guest cookie (scoped to the event in the request body) is used
 *    instead of the account lookup, calling the 11-arg RPC with all eleven
 *    named params present.
 *  - A ticket from a different event than the guest's own session is
 *    rejected wrong_event and logged with staffMemberId.
 *  - An invalid/expired/revoked session cookie gets a distinct 401
 *    (code: "staff_session_invalid"), never a silent fallback.
 *  - Entrance enforcement applies only when the guest session carries an
 *    assigned entrance.
 *  - A guest never gets manager-level PII (reuses the existing suppression).
 *  - The account path's 2-arg RPC call and behavior are unchanged.
 *  - The guest_scanner flag gates the guest cookie check entirely.
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";

const ROOT = path.resolve(__dirname, "../..");
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
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_EVENT_ID = "22222222-2222-2222-2222-222222222222";
const STAFF_MEMBER_ID = "33333333-3333-3333-3333-333333333333";
const ENTRANCE_ID = "44444444-4444-4444-4444-444444444444";
const OTHER_ENTRANCE_ID = "55555555-5555-5555-5555-555555555555";

function ticketRow(overrides = {}) {
  return {
    id: "ticket-inst-1",
    order_id: "order-1",
    invitation_id: null,
    source: "purchase",
    event_id: EVENT_ID,
    ticket_id: null,
    seat_label: null,
    qr_code: "GUESTQR",
    status: "valid",
    checked_in_at: null,
    created_at: new Date().toISOString(),
    ticket_orders: { id: "order-1", buyer_name: "Jane Doe", buyer_email: "jane@example.com", total_amount: 100, quantity: 1 },
    event_invitations: null,
    events: { title: "Gala", event_date: null, venue: null, city: null, banner: null, ticket_template: null },
    ...overrides,
  };
}

let ticketInstancesTable = [];
let rpcCalls = [];
let rpcResult = { error: null };
let recordedRejections = [];
let recordRejectedResult = true;
let accountUser = null;
let guestFlagEnabled = true;
let guestSessionsByToken = {};

function makeSingleRowTable(rows, matchKey) {
  return () => {
    let filterValue;
    const builder = {
      select() { return builder; },
      eq(_field, v) { filterValue = v; return builder; },
      async maybeSingle() {
        const hit = rows.find((r) => r[matchKey] === filterValue);
        return { data: hit ?? null, error: null };
      },
    };
    return builder;
  };
}

const fakeAdmin = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from(table) {
    if (table === "ticket_instances") return makeSingleRowTable(ticketInstancesTable, "qr_code")();
    if (table === "ticket_orders") return makeSingleRowTable([], "qr_code")();
    if (table === "tickets") return makeSingleRowTable([], "id")();
    throw new Error(`unexpected table ${table}`);
  },
  rpc(name, params) {
    rpcCalls.push({ name, params });
    return Promise.resolve(rpcResult);
  },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@supabase/supabase-js") {
    return { createClient: () => fakeAdmin };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: accountUser } }) },
      }),
    };
  }
  if (request === "@/lib/event-auth") {
    return {
      hasEventOrOrganizerAccess: async () => true,
      EVENT_SCAN_ENTITY_ROLES: ["owner", "admin", "manager"],
      EVENT_TEAM_ROLES_SCANNER: ["event_manager", "ticket_scanner"],
    };
  }
  if (request === "@/lib/memories/tokens") {
    return {
      isMemoryQrScan: () => false,
      MEMORY_QR_SCANNER_MESSAGE: "Memory QR codes are not admission tickets.",
    };
  }
  if (request === "@/lib/staff/scan-attempts") {
    return {
      TICKET_SCAN_REJECTION_REASONS: [
        "already_checked_in", "ticket_not_found", "wrong_event", "ticket_cancelled",
        "ticket_refunded", "ticket_not_valid", "ticket_ineligible", "unauthorized_entrance",
        "verification_error", "unsupported_code", "offline_conflict", "invalid_scan",
        "invalid_timestamp", "scan_id_reused", "unknown_status",
      ],
      recordRejectedTicketScan: async (_admin, attempt, requestId) => {
        recordedRejections.push({ ...attempt, requestId });
        return recordRejectedResult;
      },
    };
  }
  if (request === "@/lib/staff/guest-session") {
    return {
      eventStaffSessionCookieName: (eventId) => `aldriva_event_staff_${eventId}`,
      hashEventStaffSessionToken: (token) => `hash:${token}`,
      validateEventStaffSession: async (eventId, token) => {
        const session = guestSessionsByToken[token];
        if (!session || session.eventId !== eventId) return null;
        return { staffMemberId: session.staffMemberId, role: session.role, entranceId: session.entranceId, expiresAt: "2099-01-01T00:00:00.000Z" };
      },
    };
  }
  if (request === "@/lib/staff/guest-scanner-flag") {
    return { isGuestScannerEnabled: () => guestFlagEnabled };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/verify-ticket/route.ts");
const { NextRequest } = require("next/server");

function post(body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return route.POST(
    new NextRequest("http://localhost/api/verify-ticket", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
}

function guestCookie(eventId, token) {
  return `aldriva_event_staff_${eventId}=${token}`;
}

beforeEach(() => {
  ticketInstancesTable = [ticketRow()];
  rpcCalls = [];
  rpcResult = { error: null };
  recordedRejections = [];
  recordRejectedResult = true;
  accountUser = null;
  guestFlagEnabled = true;
  guestSessionsByToken = {
    "valid-token": { eventId: EVENT_ID, staffMemberId: STAFF_MEMBER_ID, role: "ticket_scanner", entranceId: null },
  };
});

test("valid guest session: calls the 11-arg RPC with every named param, succeeds", async () => {
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID },
    guestCookie(EVENT_ID, "valid-token")
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);

  assert.equal(rpcCalls.length, 1);
  const { name, params } = rpcCalls[0];
  assert.equal(name, "check_in_ticket");
  assert.deepEqual(
    Object.keys(params).sort(),
    [
      "p_delegating_user_id", "p_device_id", "p_entrance_id", "p_event_id",
      "p_offline_scan_id", "p_scan_source", "p_scanned_at", "p_scanned_by_user_id",
      "p_session_token_hash", "p_staff_member_id", "p_ticket_instance_id",
    ].sort(),
    "all eleven named params must be present, including the ones that are null"
  );
  assert.equal(params.p_ticket_instance_id, "ticket-inst-1");
  assert.equal(params.p_event_id, EVENT_ID);
  assert.equal(params.p_scanned_by_user_id, null);
  assert.equal(params.p_delegating_user_id, null);
  assert.equal(params.p_staff_member_id, STAFF_MEMBER_ID);
  assert.equal(params.p_session_token_hash, "hash:valid-token");
  assert.equal(params.p_scan_source, "online");
  assert.equal(params.p_offline_scan_id, null);
  assert.equal(params.p_scanned_at, null);
  assert.equal(params.p_device_id, null);
  assert.equal(params.p_entrance_id, null);
});

test("guest of event A scanning a ticket of event B is rejected wrong_event and logged with staffMemberId", async () => {
  ticketInstancesTable = [ticketRow({ event_id: OTHER_EVENT_ID })];
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID },
    guestCookie(EVENT_ID, "valid-token")
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.status, "wrong_event");
  assert.equal(rpcCalls.length, 0, "the RPC must never be called for a wrong-event ticket");

  assert.equal(recordedRejections.length, 1);
  assert.equal(recordedRejections[0].reason, "wrong_event");
  assert.equal(recordedRejections[0].staffMemberId, STAFF_MEMBER_ID);
  assert.equal(recordedRejections[0].scannedByUserId, null);
});

test("expired/revoked guest session: distinct 401 with code staff_session_invalid, never falls back", async () => {
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID },
    guestCookie(EVENT_ID, "an-expired-token")
  );
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.code, "staff_session_invalid");
  assert.equal(rpcCalls.length, 0);
  assert.equal(recordedRejections.length, 0, "no account/guest identity resolved yet, so nothing is attributable");
});

test("entrance enforcement: guest with an assigned entrance scanning at the wrong gate is rejected and logged", async () => {
  guestSessionsByToken["entrance-token"] = {
    eventId: EVENT_ID, staffMemberId: STAFF_MEMBER_ID, role: "ticket_scanner", entranceId: ENTRANCE_ID,
  };
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID, entrance: OTHER_ENTRANCE_ID },
    guestCookie(EVENT_ID, "entrance-token")
  );
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.status, "unauthorized_entrance");
  assert.equal(rpcCalls.length, 0);
  assert.equal(recordedRejections[0].reason, "unauthorized_entrance");
  assert.equal(recordedRejections[0].staffMemberId, STAFF_MEMBER_ID);
});

test("entrance enforcement: guest with an assigned entrance scanning at the right gate succeeds", async () => {
  guestSessionsByToken["entrance-token"] = {
    eventId: EVENT_ID, staffMemberId: STAFF_MEMBER_ID, role: "ticket_scanner", entranceId: ENTRANCE_ID,
  };
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID, entrance: ENTRANCE_ID },
    guestCookie(EVENT_ID, "entrance-token")
  );
  assert.equal(res.status, 200);
  assert.equal(rpcCalls[0].params.p_entrance_id, ENTRANCE_ID);
});

test("entrance enforcement: a guest with NO assigned entrance is never blocked by entrance (unchanged, like the account path)", async () => {
  // guestSessionsByToken["valid-token"] has entranceId: null
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID, entrance: "some-free-text-gate" },
    guestCookie(EVENT_ID, "valid-token")
  );
  assert.equal(res.status, 200);
});

test("a guest gets the same POST response SHAPE as a ticket_scanner account, but with PII redacted (see verify-ticket-guest-pii.test.cjs)", async () => {
  const guestRes = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID },
    guestCookie(EVENT_ID, "valid-token")
  );
  const guestBody = await guestRes.json();

  ticketInstancesTable = [ticketRow()];
  rpcCalls = [];
  accountUser = { id: "account-user-1" };
  const accountRes = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID });
  const accountBody = await accountRes.json();

  // Same field set either way (no new/missing keys for a guest) - but a
  // guest's own PII fields are redacted (buyer_email/phone/total_amount),
  // same as GET's existing non-manager suppression. The full redaction
  // behavior (every response path, no raw-value leaks) is covered in
  // verify-ticket-guest-pii.test.cjs.
  assert.deepEqual(Object.keys(guestBody.order).sort(), Object.keys(accountBody.order).sort());
  assert.equal(guestBody.order.buyer_email, null);
  assert.notEqual(accountBody.order.buyer_email, null);
});

test("no guest cookie and no account: the existing generic 401 message is unchanged", async () => {
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID }, undefined);
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.message, "Log in as authorized door staff or event organizer to check in guests.");
  assert.equal(body.code, undefined);
});

test("guest scanner flag off: the guest cookie is never consulted, falls back to the generic 401", async () => {
  guestFlagEnabled = false;
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID },
    guestCookie(EVENT_ID, "valid-token")
  );
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.code, undefined, "flag off must never surface the guest-specific code");
  assert.equal(rpcCalls.length, 0);
});

test("account path is unchanged: still calls the 2-arg RPC with only p_ticket_instance_id/p_scanned_by_user_id", async () => {
  accountUser = { id: "account-user-1" };
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(Object.keys(rpcCalls[0].params).sort(), ["p_scanned_by_user_id", "p_ticket_instance_id"]);
  assert.equal(rpcCalls[0].params.p_scanned_by_user_id, "account-user-1");
});
