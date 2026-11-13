/**
 * lib/__tests__/checkins-export-manager-gate.test.cjs
 *
 * F5 (Guest Scanner Fix Round): app/api/events/[id]/checkins and
 * app/api/events/[id]/export now pass EVENT_SCAN_ENTITY_ROLES
 * (owner/admin/manager) as the 4th argument to hasEventOrOrganizerAccess,
 * narrowing the entity-role gate from the default ENTITY_ROLES_CONTENT_WRITE
 * (which includes 'editor'). Event-team roles (event_manager/ticket_scanner)
 * are unaffected - those still come through minEventRoles, the 3rd argument.
 *
 * Uses a fake hasEventOrOrganizerAccess that actually inspects its
 * arguments (an actor has either an entity role or an event-team role, not
 * both), so an editor and a manager produce different results.
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

let actorEntityRole = null; // 'owner' | 'admin' | 'manager' | 'editor' | null
let actorEventRole = null; // 'event_manager' | 'ticket_scanner' | null
let recordedAccessCalls = [];

// Deliberately distinctive raw values so a leak anywhere is unmistakable.
const RAW_EMAIL = "secret-buyer-f5c3@example.test";
const RAW_AMOUNT = 48877;
const TICKET_INSTANCE_ROW = {
  id: "inst-1",
  order_id: "order-1",
  ticket_id: null,
  seat_label: "A1",
  checked_in_at: "2024-01-01T00:00:00Z",
  qr_code: "QR1",
  status: "used",
  ticket_orders: { buyer_name: "Jane Doe", buyer_email: RAW_EMAIL, total_amount: RAW_AMOUNT },
};

async function fakeHasEventOrOrganizerAccess(
  userId,
  _eventId,
  minEventRoles = ["event_manager", "ticket_scanner"],
  minEntityRoles = ["owner", "admin", "manager", "editor"]
) {
  recordedAccessCalls.push({ minEventRoles, minEntityRoles });
  if (!userId) return false;
  if (actorEntityRole && minEntityRoles.includes(actorEntityRole)) return true;
  if (actorEventRole && minEventRoles.includes(actorEventRole)) return true;
  return false;
}

const fakeAdmin = {
  from(table) {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      order() { return builder; },
      not() { return builder; },
      range() {
        if (table === "ticket_instances") {
          return Promise.resolve({ data: [TICKET_INSTANCE_ROW], count: 1, error: null });
        }
        return Promise.resolve({ data: [], count: 0, error: null });
      },
      limit() { return Promise.resolve({ data: [], count: 0, error: null }); },
      then(resolve) { resolve({ data: [], count: 0, error: null }); },
    };
    return builder;
  },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => fakeAdmin };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "actor-1" } } }) },
      }),
    };
  }
  if (request === "@/lib/auth") {
    return { getCurrentUser: async () => ({ id: "actor-1" }) };
  }
  if (request === "@/lib/event-auth") {
    return {
      hasEventOrOrganizerAccess: fakeHasEventOrOrganizerAccess,
      EVENT_SCAN_ENTITY_ROLES: ["owner", "admin", "manager"],
    };
  }
  if (request === "@/lib/event-audit") {
    return { logEventAction: async () => undefined };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const checkinsRoute = require("@/app/api/events/[id]/checkins/route.ts");
const exportRoute = require("@/app/api/events/[id]/export/route.ts");
const { NextRequest } = require("next/server");

function getCheckins() {
  return checkinsRoute.GET(
    new NextRequest("http://localhost/api/events/evt1/checkins"),
    { params: Promise.resolve({ id: "evt1" }) }
  );
}

function getExport() {
  return exportRoute.GET(
    new NextRequest("http://localhost/api/events/evt1/export?type=guests"),
    { params: Promise.resolve({ id: "evt1" }) }
  );
}

beforeEach(() => {
  actorEntityRole = null;
  actorEventRole = null;
  recordedAccessCalls = [];
});

test("checkins: an entity editor is denied (403)", async () => {
  actorEntityRole = "editor";
  const res = await getCheckins();
  assert.equal(res.status, 403);
});

test("checkins: an entity manager is allowed (200)", async () => {
  actorEntityRole = "manager";
  const res = await getCheckins();
  assert.equal(res.status, 200);
});

test("checkins: an event-team ticket_scanner is still allowed (event-team roles are unaffected by the entity-role narrowing)", async () => {
  actorEventRole = "ticket_scanner";
  const res = await getCheckins();
  assert.equal(res.status, 200);
});

test("checkins: calls hasEventOrOrganizerAccess with EVENT_SCAN_ENTITY_ROLES as the 4th argument (both the access check and the PII gate)", async () => {
  actorEntityRole = "manager";
  await getCheckins();
  assert.ok(recordedAccessCalls.length >= 2, "expects the access gate AND the separate PII gate call");
  for (const call of recordedAccessCalls) {
    assert.deepEqual(call.minEntityRoles, ["owner", "admin", "manager"]);
  }
  assert.ok(
    recordedAccessCalls.some((c) => JSON.stringify(c.minEventRoles) === JSON.stringify(["event_manager", "ticket_scanner"])),
    "the access-check call must still allow ticket_scanner"
  );
  assert.ok(
    recordedAccessCalls.some((c) => JSON.stringify(c.minEventRoles) === JSON.stringify(["event_manager"])),
    "the PII gate call must be event_manager-only, same as verify-ticket's hasFullManagerAccess"
  );
});

test("checkins: a manager sees the raw buyer_email and total_amount", async () => {
  actorEntityRole = "manager";
  const res = await getCheckins();
  const body = await res.json();
  const row = body.history.items[0];
  assert.equal(row.buyer_email, RAW_EMAIL);
  assert.equal(row.total_amount, RAW_AMOUNT);
});

test("checkins: a ticket_scanner ACCOUNT gets the check-in list but none of the raw PII values anywhere in the response", async () => {
  actorEventRole = "ticket_scanner";
  const res = await getCheckins();
  assert.equal(res.status, 200, "the check-in list stays available to ticket_scanner");
  const body = await res.json();
  assert.equal(body.history.items.length, 1, "the row itself is still returned");
  const row = body.history.items[0];
  assert.equal(row.buyer_email, "");
  assert.equal(row.total_amount, 0);
  // Belt-and-suspenders: the raw fixture values must never appear anywhere
  // in the serialized response, not just in the two known fields.
  const json = JSON.stringify(body);
  assert.ok(!json.includes(RAW_EMAIL), "raw buyer_email must never leak anywhere in the response");
  assert.ok(!json.includes(String(RAW_AMOUNT)), "raw total_amount must never leak anywhere in the response");
  // What the check-in list still needs stays intact.
  assert.equal(row.buyer_name, "Jane Doe");
  assert.equal(row.seat_label, "A1");
  assert.equal(row.checked_in_at, "2024-01-01T00:00:00Z");
  assert.equal(row.qr_code, "QR1");
});

test("export: an entity editor is denied (403)", async () => {
  actorEntityRole = "editor";
  const res = await getExport();
  assert.equal(res.status, 403);
});

test("export: an entity manager is allowed (200)", async () => {
  actorEntityRole = "manager";
  const res = await getExport();
  assert.equal(res.status, 200);
});

test("export: calls hasEventOrOrganizerAccess with EVENT_SCAN_ENTITY_ROLES as the 4th argument (unchanged - a single gate, no separate PII check needed)", async () => {
  actorEntityRole = "manager";
  await getExport();
  assert.equal(recordedAccessCalls.length, 1, "export has only one access-check call - every role that can reach it already deserves full PII");
  assert.deepEqual(recordedAccessCalls[0].minEntityRoles, ["owner", "admin", "manager"]);
  assert.deepEqual(recordedAccessCalls[0].minEventRoles, ["event_manager"]);
});

test("export: a ticket_scanner ACCOUNT is denied entirely (403) - never reaches the export, so there is nothing to redact", async () => {
  actorEventRole = "ticket_scanner";
  const res = await getExport();
  assert.equal(res.status, 403);
});
