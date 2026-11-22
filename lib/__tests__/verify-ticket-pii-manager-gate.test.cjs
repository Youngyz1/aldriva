/**
 * lib/__tests__/verify-ticket-pii-manager-gate.test.cjs
 *
 * F5 (Guest Scanner Fix Round): verify-ticket's PII gate must be
 * manager-level (owner/admin/manager entity roles, or event_manager event
 * role) on BOTH GET and POST, not "any authenticated caller" (which let a
 * ticket_scanner account or an entity editor read buyer_email/phone/
 * total_amount). This file models a configurable actor role via a fake
 * hasEventOrOrganizerAccess that actually inspects the minEventRoles/
 * minEntityRoles arguments it's called with - lib/__tests__/
 * verify-ticket-guest-pii.test.cjs's fake always returns true regardless
 * of args, so it cannot distinguish editor/ticket_scanner from manager.
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
const RAW_EMAIL = "secret-buyer-9f3c@example.com";
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

let ticketInstancesTable = [];
let accountUser = null;
// Configurable actor role for the current account user, inspected by the
// fake below so each test can model a different RBAC position.
let actorEntityRole = null; // 'owner' | 'admin' | 'manager' | 'editor' | null
let actorEventRole = null; // 'event_manager' | 'ticket_scanner' | null

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
  rpc: async () => ({ error: null }),
};

/** Mirrors the REAL hasEventOrOrganizerAccess's role-gating semantics for
 * a single configurable actor, instead of always returning true. */
async function fakeHasEventOrOrganizerAccess(
  userId,
  _eventId,
  minEventRoles = ["event_manager", "ticket_scanner"],
  minEntityRoles = ["owner", "admin", "manager", "editor"]
) {
  if (!userId) return false;
  if (actorEntityRole && minEntityRoles.includes(actorEntityRole)) return true;
  if (actorEventRole && minEventRoles.includes(actorEventRole)) return true;
  return false;
}

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
      hasEventOrOrganizerAccess: fakeHasEventOrOrganizerAccess,
      EVENT_SCAN_ENTITY_ROLES: ["owner", "admin", "manager"],
      EVENT_TEAM_ROLES_SCANNER: ["event_manager", "ticket_scanner"],
    };
  }
  if (request === "@/lib/memories/tokens") {
    return { isMemoryQrScan: () => false, MEMORY_QR_SCANNER_MESSAGE: "not an admission ticket" };
  }
  if (request === "@/lib/staff/scan-attempts") {
    return {
      TICKET_SCAN_REJECTION_REASONS: ["ticket_ineligible", "verification_error"],
      recordRejectedTicketScan: async () => true,
    };
  }
  if (request === "@/lib/staff/guest-session") {
    return {
      eventStaffSessionCookieName: (eventId) => `aldriva_event_staff_${eventId}`,
      hashEventStaffSessionToken: (token) => `hash:${token}`,
      validateEventStaffSession: async () => null,
    };
  }
  if (request === "@/lib/staff/guest-scanner-flag") {
    return { isGuestScannerEnabled: () => false };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/verify-ticket/route.ts");
const { NextRequest } = require("next/server");

function post(body) {
  return route.POST(
    new NextRequest("http://localhost/api/verify-ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function get(code) {
  return route.GET(new NextRequest(`http://localhost/api/verify-ticket?code=${code}`));
}

function assertRedacted(order) {
  assert.equal(order.buyer_email, null);
  assert.equal(order.phone ?? null, null);
  assert.equal(order.total_amount, 0);
}

function assertFullPii(order) {
  assert.equal(order.buyer_email, RAW_EMAIL);
  assert.equal(order.total_amount, RAW_AMOUNT);
}

beforeEach(() => {
  ticketInstancesTable = [ticketRow()];
  accountUser = { id: "actor-1" };
  actorEntityRole = null;
  actorEventRole = null;
});

test("GET: an entity editor gets no PII (editor is excluded from EVENT_SCAN_ENTITY_ROLES)", async () => {
  actorEntityRole = "editor";
  const res = await get("GUESTQR");
  const body = await res.json();
  assertRedacted(body.order);
});

test("GET: a ticket_scanner ACCOUNT gets no PII (only event_manager/owner/admin/manager do)", async () => {
  actorEventRole = "ticket_scanner";
  const res = await get("GUESTQR");
  const body = await res.json();
  assertRedacted(body.order);
});

test("GET: an event_manager gets full PII", async () => {
  actorEventRole = "event_manager";
  const res = await get("GUESTQR");
  const body = await res.json();
  assertFullPii(body.order);
});

test("GET: an entity owner gets full PII", async () => {
  actorEntityRole = "owner";
  const res = await get("GUESTQR");
  const body = await res.json();
  assertFullPii(body.order);
});

test("POST (checkin): an entity editor gets no PII on the success response", async () => {
  actorEntityRole = "editor";
  actorEventRole = "ticket_scanner"; // editors can still scan if also a team member; PII must stay redacted either way
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID });
  const body = await res.json();
  assert.equal(body.success, true);
  assertRedacted(body.order);
});

test("POST (checkin): a ticket_scanner ACCOUNT gets no PII on the success response", async () => {
  actorEventRole = "ticket_scanner";
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID });
  const body = await res.json();
  assert.equal(body.success, true);
  assertRedacted(body.order);
});

test("POST (checkin): a manager gets full PII on the success response", async () => {
  actorEntityRole = "manager";
  actorEventRole = "ticket_scanner";
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: EVENT_ID });
  const body = await res.json();
  assert.equal(body.success, true);
  assertFullPii(body.order);
});

test("POST (wrong_event response path): a ticket_scanner account still gets no PII", async () => {
  actorEventRole = "ticket_scanner";
  const res = await post({ code: "GUESTQR", action: "checkin", eventId: "22222222-2222-2222-2222-222222222222" });
  const body = await res.json();
  assert.equal(body.status, "wrong_event");
  assertRedacted(body.order);
});
