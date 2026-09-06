/**
 * H8 regression tests: GET /api/fundraisers/[id]/donors.
 *
 * Previous exposure: the public donor wall returned each donor's `user_id`,
 * letting anyone enumerate donor identities per fundraiser. Fixed: the
 * response carries display fields + joined profile only; `user_id` never
 * leaves the server.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ROOT = path.resolve(__dirname, "../../..");
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
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const tables = {
  donations: [
    { id: "d1", donor_name: "Alice", amount: 25, created_at: "2026-01-01", user_id: "user-alice", fundraiser_id: "f1", status: "succeeded" },
    { id: "d2", donor_name: "Guest", amount: 10, created_at: "2026-01-02", user_id: null, fundraiser_id: "f1", status: "completed" },
  ],
  public_profiles: [{ id: "user-alice", display_name: "Alice A", avatar_url: null }],
};

function makeQuery(table) {
  const rows = tables[table] ?? [];
  const filters = [];
  const orderBys = [];
  let range = null;
  const q = {
    select() { return q; },
    eq(field, value) { filters.push([field, value]); return q; },
    in(field, values) {
      filters.push([field, values, "in"]);
      return q;
    },
    order(field, opts) { orderBys.push([field, opts]); return q; },
    range(from, to) { range = [from, to]; return q; },
    then(resolve) {
      let data = rows.filter((r) =>
        filters.every(([f, v, op]) => (op === "in" ? v.includes(r[f]) : r[f] === v))
      );
      if (range) data = data.slice(range[0], range[1] + 1);
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return q;
}

class NextResponseShim extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") {
    return { NextResponse: NextResponseShim };
  }
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => ({ from: (t) => makeQuery(t) }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/fundraisers/[id]/donors/route");

function get(fundraiserId) {
  const url = `http://localhost/api/fundraisers/${fundraiserId}/donors?offset=0`;
  const req = new Request(url);
  req.nextUrl = new URL(url);
  return route.GET(req, { params: Promise.resolve({ id: fundraiserId }) });
}

test("H8: donor rows expose no user_id", async () => {
  const res = await get("f1");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.donations.length, 2);
  for (const row of body.donations) {
    assert.ok(!("user_id" in row), "user_id must not leak");
    assert.deepEqual(
      Object.keys(row).sort(),
      ["amount", "created_at", "donor_name", "id", "profile"]
    );
  }
});

test("H8: display profile join still works", async () => {
  const body = await (await get("f1")).json();
  const alice = body.donations.find((r) => r.id === "d1");
  assert.equal(alice.profile?.display_name, "Alice A");
  const guest = body.donations.find((r) => r.id === "d2");
  assert.equal(guest.profile, null);
});

test("H8: no user_id key appears anywhere in the payload", async () => {
  // Note: a donor's *public profile id* is intentionally visible when they
  // have a customized public profile (it backs the wall's profile link).
  // What must never appear is the raw `user_id` owner key.
  const text = await (await get("f1")).text();
  assert.ok(!text.includes('"user_id"'), "owner key must not appear in JSON");
});
