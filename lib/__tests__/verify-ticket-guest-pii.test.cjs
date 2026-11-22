/**
 * lib/__tests__/verify-ticket-guest-pii.test.cjs
 *
 * Track G fix: verify-ticket POST echoed `ticketData.order` raw on every
 * response path (success, already-used, cancelled, refunded, wrong-event),
 * which carries buyer_email, phone, and total_amount - the exact fields
 * ScannerClient renders directly on the door scanner screen
 * (result.order.buyer_email / result.order.phone, see ScannerClient.tsx).
 * GET's hasFullManagerAccess gate already suppressed these for any
 * non-manager caller; POST never had an equivalent, account or guest.
 *
 * This file proves a GUEST actor now gets buyer_email -> null,
 * phone -> null, total_amount -> 0 on every order-echoing POST response
 * path, that none of the raw fixture PII values ever appear anywhere in
 * JSON.stringify(response body), and that GET already suppresses the same
 * fields for a guest (unauthenticated caller) with no code change needed.
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

// Deliberately distinctive raw values so a leak anywhere is unmistakable.
const RAW_EMAIL = "secret-buyer-9f3c@example.com";
const RAW_PHONE = "+15557778899";
const RAW_AMOUNT = 48877;

function ticketRow(overrides = {}) {
  return {
    id: "ticket-inst-1",
    order_id: "order-1",
    invitation_id: null,
    source: "purchase",
    event_id: EVENT_ID,
    ticket_id: null,
    seat_label: "A1",
    qr_code: "GUESTQR",
    status: "valid",
    checked_in_at: null,
    created_at: new Date().toISOString(),
    ticket_orders: { id: "order-1", buyer_name: "Jane Doe", buyer_email: RAW_EMAIL, total_amount: RAW_AMOUNT, quantity: 1 },
    event_invitations: null,
    events: { title: "Gala", event_date: null, venue: null, city: null, banner: null, ticket_template: null },
    ...overrides,
  };
}

// The legacy/invitation path carries phone separately (event_invitations.phone).
function invitationTicketRow(overrides = {}) {
  return ticketRow({
    source: "invitation",
    invitation_id: "invite-1",
    ticket_orders: null,
    event_invitations: {
      id: "invite-1",
      guest_name: "Jane Doe",
      guest_title: null,
      organization: null,
      email: RAW_EMAIL,
      phone: RAW_PHONE,
      image_url: null,
    },
    ...overrides,
  });
}

let ticketInstancesTable = [];
let rpcCalls = [];
let rpcResult = { error: null };
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
      recordRejectedTicketScan: async () => true,
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
    new NextRequest("http://localhost/api/verify-ticket", { method: "POST", headers, body: JSON.stringify(body) })
  );
}

function get(code) {
  return route.GET(new NextRequest(`http://localhost/api/verify-ticket?code=${code}`));
}

function guestCookie(eventId, token) {
  return `aldriva_event_staff_${eventId}=${token}`;
}

/** No raw PII value anywhere in the serialized response, and the expected redactions. */
function assertNoLeak(body) {
  const json = JSON.stringify(body);
  assert.ok(!json.includes(RAW_EMAIL), "raw buyer_email must never appear in the response");
  assert.ok(!json.includes(RAW_PHONE), "raw phone must never appear in the response");
  assert.ok(!json.includes(String(RAW_AMOUNT)), "raw total_amount must never appear in the response");
  if (body.order) {
    assert.equal(body.order.buyer_email, null);
    assert.equal(body.order.phone ?? null, null);
    assert.equal(body.order.total_amount, 0);
  }
}

beforeEach(() => {
  ticketInstancesTable = [ticketRow()];
  rpcCalls = [];
  rpcResult = { error: null };
  accountUser = null;
  guestFlagEnabled = true;
  guestSessionsByToken = {
    "valid-token": { eventId: EVENT_ID, staffMemberId: STAFF_MEMBER_ID, role: "ticket_scanner", entranceId: null },
  };
});

test("guest success: order has no PII and no raw fixture value leaks", async () => {
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID }, guestCookie(EVENT_ID, "valid-token"));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assertNoLeak(body);
});

test("guest already-used: order has no PII and no raw fixture value leaks", async () => {
  rpcResult = { error: { message: "ALREADY_CHECKED_IN" } };
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID }, guestCookie(EVENT_ID, "valid-token"));
  const body = await res.json();
  assert.equal(body.status, "used");
  assertNoLeak(body);
});

test("guest cancelled: order has no PII and no raw fixture value leaks", async () => {
  rpcResult = { error: { message: "TICKET_CANCELLED" } };
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID }, guestCookie(EVENT_ID, "valid-token"));
  const body = await res.json();
  assert.equal(body.status, "cancelled");
  assertNoLeak(body);
});

test("guest refunded: order has no PII and no raw fixture value leaks", async () => {
  rpcResult = { error: { message: "TICKET_REFUNDED" } };
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID }, guestCookie(EVENT_ID, "valid-token"));
  const body = await res.json();
  assert.equal(body.status, "refunded");
  assertNoLeak(body);
});

test("guest wrong-event: order has no PII and no raw fixture value leaks", async () => {
  ticketInstancesTable = [ticketRow({ event_id: OTHER_EVENT_ID })];
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID }, guestCookie(EVENT_ID, "valid-token"));
  const body = await res.json();
  assert.equal(body.status, "wrong_event");
  assertNoLeak(body);
});

test("guest unauthorized_entrance: the response carries no order field at all, so nothing to leak", async () => {
  guestSessionsByToken["entrance-token"] = {
    eventId: EVENT_ID, staffMemberId: STAFF_MEMBER_ID, role: "ticket_scanner", entranceId: "assigned-gate",
  };
  const res = await post(
    { code: "GUESTQR", action: "checkin", eventId: EVENT_ID, entrance: "some-other-gate" },
    guestCookie(EVENT_ID, "entrance-token")
  );
  const body = await res.json();
  assert.equal(body.status, "unauthorized_entrance");
  assert.equal(body.order, undefined);
  assertNoLeak(body);
});

test("guest success on the invitation/phone path: phone is also redacted and never leaks", async () => {
  ticketInstancesTable = [invitationTicketRow()];
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID }, guestCookie(EVENT_ID, "valid-token"));
  const body = await res.json();
  assert.equal(res.status, 200);
  assertNoLeak(body);
});

test("account path is byte-for-byte unchanged: an account still gets the raw order with PII", async () => {
  accountUser = { id: "account-user-1" };
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.order.buyer_email, RAW_EMAIL);
  assert.equal(body.order.total_amount, RAW_AMOUNT);
});

test("GET as a guest (no account, no Bearer): PII is already suppressed, exactly like any non-manager caller", async () => {
  const res = await get("GUESTQR");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.authenticated, false);
  assert.equal(body.can_check_in, false);
  assertNoLeak(body);
});

test("GET as an authorized account: PII is present (unchanged, pre-existing GET behavior)", async () => {
  accountUser = { id: "account-user-1" };
  const res = await get("GUESTQR");
  const body = await res.json();
  assert.equal(body.order.buyer_email, RAW_EMAIL);
});
