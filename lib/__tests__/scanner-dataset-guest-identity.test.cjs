/**
 * lib/__tests__/scanner-dataset-guest-identity.test.cjs
 *
 * GET /api/events/[id]/scanner-dataset must never disguise a guest's staff
 * member id as `user_id` - that field is fed straight into the offline
 * dataset cache and from there into ScannerClient's `delegatingUserId`,
 * which is a column with an auth.users foreign key. A guest principal gets
 * `user_id: null` and a separate `staff_member_id` field instead; the
 * account path (`user_id` carrying a real auth.users id) is unchanged.
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

let resolvedPrincipal = null;

function makeTableStub(rows) {
  return {
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    async single() { return { data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }; },
    async maybeSingle() { return { data: rows[0] ?? null, error: null }; },
    then(resolve) { resolve({ data: rows, error: null }); },
  };
}

const fakeAdmin = {
  from(table) {
    if (table === "events") {
      return makeTableStub([{ id: "evt1", title: "Gala", event_date: null, venue: null, city: null }]);
    }
    if (table === "ticket_instances") {
      return makeTableStub([]);
    }
    if (table === "tickets") {
      return makeTableStub([]);
    }
    throw new Error(`unexpected table ${table}`);
  },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") {
    return { NextResponse: { json: (body, init) => Response.json(body, init) } };
  }
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => fakeAdmin };
  }
  if (request === "@/lib/event-auth") {
    return {
      hasEventOrOrganizerAccess: async () => false,
      EVENT_SCAN_ENTITY_ROLES: ["owner", "admin", "manager"],
    };
  }
  if (request === "@/lib/scanner/resolve-principal") {
    return {
      resolveScannerPrincipal: async () => ({ ok: true, principal: resolvedPrincipal }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/events/[id]/scanner-dataset/route.ts");

function get() {
  return route.GET(
    new Request("http://localhost/api/events/evt1/scanner-dataset"),
    { params: Promise.resolve({ id: "evt1" }) }
  );
}

beforeEach(() => {
  resolvedPrincipal = null;
});

test("guest principal: user_id is null, staff_member_id carries the staff id", async () => {
  resolvedPrincipal = {
    version: 1,
    userId: null,
    staffMemberId: "staff-guest-1",
    eventId: "evt1",
    role: "ticket_scanner",
    codeType: ["ticket"],
    actions: ["check_in"],
  };
  const res = await get();
  const body = await res.json();
  assert.equal(body.user_id, null, "user_id must never carry a staff member id");
  assert.equal(body.staff_member_id, "staff-guest-1");
});

test("account principal: user_id carries the account id, staff_member_id is null", async () => {
  resolvedPrincipal = {
    version: 1,
    userId: "account-user-1",
    staffMemberId: null,
    eventId: "evt1",
    role: "signed_in",
    codeType: ["ticket"],
    actions: ["check_in"],
  };
  const res = await get();
  const body = await res.json();
  assert.equal(body.user_id, "account-user-1");
  assert.equal(body.staff_member_id, null);
});
