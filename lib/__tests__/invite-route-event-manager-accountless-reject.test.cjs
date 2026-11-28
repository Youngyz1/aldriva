/**
 * lib/__tests__/invite-route-event-manager-accountless-reject.test.cjs
 *
 * F6 (Guest Scanner Fix Round): POST /api/events/[id]/team/invite must
 * reject isAccountless=true combined with role='event_manager' - an
 * account-less session (migration 196) is scoped to door-staff
 * permissions and must never be minted for the full-access manager role.
 * A normal account-less ticket_scanner invite must still succeed.
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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

class NextResponseShim extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}

let invitationsTable = [];
let eventsTable = [{ id: "evt1", title: "Summer Gala" }];
let nextInviteId = 1;
const sentEmails = [];

function makeInvitationsQuery() {
  const filters = [];
  const q = {
    select() { return q; },
    eq(f, v) { filters.push([f, v]); return q; },
    ilike(f, v) { filters.push([f, v]); return q; },
    async maybeSingle() {
      const hit = invitationsTable.find((r) => filters.every(([f, v]) => r[f] === v));
      return { data: hit ?? null, error: null };
    },
    insert(payload) {
      return {
        select() {
          return {
            async single() {
              const row = { id: `inv-${nextInviteId++}`, ...payload };
              invitationsTable.push(row);
              return { data: row, error: null };
            },
          };
        },
      };
    },
  };
  return q;
}

const fakeAdmin = {
  rpc: async () => ({ data: null, error: null }),
  from(table) {
    if (table === "events") {
      return {
        select() { return this; },
        eq() { return this; },
        async single() {
          return { data: eventsTable[0] ?? null, error: eventsTable[0] ? null : { message: "not found" } };
        },
      };
    }
    if (table === "event_team_invitations") return makeInvitationsQuery();
    throw new Error(`unexpected table ${table}`);
  },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") return { NextResponse: NextResponseShim };
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "manager-1" } } }) },
      }),
    };
  }
  if (request === "@/lib/supabase-admin") return { createSupabaseAdmin: () => fakeAdmin };
  if (request === "@/lib/event-auth") return { hasEventOrOrganizerAccess: async () => true, EventTeamRole: {} };
  if (request === "@/lib/site-url") return { getSiteUrl: () => "https://aldriva.test" };
  if (request === "@/config/branding") return { BRAND: { name: "Aldriva", contactEmail: "events@aldriva.test" } };
  if (request === "resend") {
    return {
      Resend: class {
        emails = { send: async (args) => { sentEmails.push(args); return { error: null }; } };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/events/[id]/team/invite/route.ts");

function post(body) {
  return route.POST(
    new Request("http://localhost/api/events/evt1/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "evt1" }) }
  );
}

beforeEach(() => {
  invitationsTable = [];
  nextInviteId = 1;
  sentEmails.length = 0;
  process.env.RESEND_API_KEY = "test-resend-key";
});

test("account-less + event_manager is rejected with a 400 and no row/email is created", async () => {
  const res = await post({
    email: "manager@example.com",
    role: "event_manager",
    isAccountless: true,
    phone: "+15551234567",
    staffName: "Jo Manager",
  });
  assert.equal(res.status, 400);
  assert.equal(invitationsTable.length, 0);
  assert.equal(sentEmails.length, 0);
});

test("account-less + ticket_scanner still succeeds (unaffected by the new guard)", async () => {
  const res = await post({
    email: "scanner@example.com",
    role: "ticket_scanner",
    isAccountless: true,
    phone: "+15551234567",
    staffName: "Jo Scanner",
  });
  assert.equal(res.status, 200);
  assert.equal(invitationsTable.length, 1);
});

test("account (non-account-less) event_manager still succeeds (unaffected by the new guard)", async () => {
  const res = await post({
    email: "manager@example.com",
    role: "event_manager",
    isAccountless: false,
  });
  assert.equal(res.status, 200);
  assert.equal(invitationsTable.length, 1);
});
