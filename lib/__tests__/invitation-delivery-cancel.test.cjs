/**
 * lib/__tests__/invitation-delivery-cancel.test.cjs
 *
 * F1 (Guest Scanner Fix Round): DELETE
 * /api/events/[id]/team/invitations/[inviteId] must stamp revoked_at
 * alongside status = 'revoked', so a cancelled invitation is
 * distinguishable in the audit trail from one that is merely 'pending'
 * with a stale read, and so the reissue RPC's "every session this
 * invitation ever minted" revoke logic has a timestamp to reason about.
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

function makeInvitationsQuery() {
  const filters = [];
  let updatePayload = null;
  const q = {
    select() { return q; },
    eq(f, v) { filters.push([f, v]); return q; },
    async maybeSingle() {
      const hit = invitationsTable.find((r) => filters.every(([f, v]) => r[f] === v));
      if (hit && updatePayload) Object.assign(hit, updatePayload);
      return { data: hit ?? null, error: null };
    },
    update(payload) {
      updatePayload = payload;
      return q;
    },
  };
  return q;
}

const fakeAdmin = {
  from(table) {
    if (table === "event_team_invitations") return makeInvitationsQuery();
    throw new Error(`unexpected table ${table}`);
  },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") {
    return { NextResponse: NextResponseShim };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "manager-1" } } }) },
      }),
    };
  }
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => fakeAdmin };
  }
  if (request === "@/lib/event-auth") {
    return { hasEventOrOrganizerAccess: async () => true };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/events/[id]/team/invitations/[inviteId]/route.ts");

function del(inviteId) {
  return route.DELETE(
    new Request(`http://localhost/api/events/evt1/team/invitations/${inviteId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: "evt1", inviteId }) }
  );
}

beforeEach(() => {
  invitationsTable = [
    {
      id: "inv-pending",
      event_id: "evt1",
      email: "staff@example.com",
      status: "pending",
      revoked_at: null,
    },
  ];
});

test("cancelling a pending invitation stamps both status='revoked' and revoked_at", async () => {
  const before = Date.now();
  const res = await del("inv-pending");
  assert.equal(res.status, 200);
  const row = invitationsTable.find((r) => r.id === "inv-pending");
  assert.equal(row.status, "revoked");
  assert.ok(row.revoked_at, "revoked_at must be set");
  assert.ok(new Date(row.revoked_at).getTime() >= before);
});

test("cancelling a non-pending invitation is a 404 and leaves the row untouched", async () => {
  invitationsTable[0].status = "accepted";
  const res = await del("inv-pending");
  assert.equal(res.status, 404);
  const row = invitationsTable.find((r) => r.id === "inv-pending");
  assert.equal(row.status, "accepted");
  assert.equal(row.revoked_at, null);
});
