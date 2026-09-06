/**
 * H1 regression tests: GET /api/certificates/[id].
 *
 * Previous exploit: `?paymentId=<donation.id>` (an ID exposed by the public
 * donor feed) authorized the certificate PDF on its own. That branch is
 * removed — only the unguessable payment credential, the donor's session
 * email, the organizer, or an admin authorizes.
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

const DONATION_ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

const tables = {
  donations: [
    {
      id: DONATION_ID,
      donor_name: "Donor D",
      donor_email: "donor@example.com",
      amount: 50,
      currency: "USD",
      created_at: "2026-01-01T00:00:00Z",
      payment_intent_id: "pi_test_secret_123",
      fundraiser_id: "22222222-2222-4222-8222-222222222222",
    },
  ],
  fundraisers: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Campaign",
      organizer_id: "33333333-3333-4333-8333-333333333333",
    },
  ],
  organizers: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      user_id: "owner-1",
      name: "Org",
      organization_name: "Org",
    },
  ],
  profiles: [{ id: "admin-1", role: "admin", status: "active" }],
};

function makeQuery(table) {
  const rows = tables[table] ?? [];
  const filters = [];
  const q = {
    select() { return q; },
    eq(field, value) { filters.push([field, value]); return q; },
    async single() {
      const hit = rows.find((r) => filters.every(([f, v]) => r[f] === v));
      return hit ? { data: hit, error: null } : { data: null, error: { message: "none" } };
    },
    async maybeSingle() {
      const hit = rows.find((r) => filters.every(([f, v]) => r[f] === v));
      return { data: hit ?? null, error: null };
    },
  };
  return q;
}

const fakeAdmin = { from: (table) => makeQuery(table) };

// Controllable session user per test.
let currentUser = null;

class NextResponseShim extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") {
    return { NextResponse: NextResponseShim };
  }
  if (request === "@supabase/supabase-js") {
    return { createClient: () => fakeAdmin };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: { getUser: async () => ({ data: { user: currentUser } }) },
      }),
    };
  }
  if (request === "@/lib/certificate") {
    return { generateCertificatePdf: async () => Buffer.from("PDF") };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const route = require("@/app/api/certificates/[id]/route");

function get(url, user) {
  currentUser = user ?? null;
  const req = new Request(url);
  req.nextUrl = new URL(url);
  const id = new URL(url).pathname.split("/").pop();
  return route.GET(req, { params: Promise.resolve({ id }) });
}

const donor = { id: "donor-1", email: "donor@example.com" };
const organizer = { id: "owner-1", email: "owner@example.com" };
const admin = { id: "admin-1", email: "admin@example.com" };
const stranger = { id: "stranger-1", email: "stranger@example.com" };

test("H1: donation.id as paymentId no longer authorizes (exploit closed)", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}?paymentId=${DONATION_ID}`);
  assert.equal(res.status, 403);
});

test("H1: unrelated paymentId is denied", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}?paymentId=${UNKNOWN_ID}`);
  assert.equal(res.status, 403);
});

test("H1: genuine payment credential still works for guests", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}?paymentId=pi_test_secret_123`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /pdf/);
});

test("H1: donor session is allowed", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}`, donor);
  assert.equal(res.status, 200);
});

test("H1: organizer session is allowed", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}`, organizer);
  assert.equal(res.status, 200);
});

test("H1: admin session is allowed", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}`, admin);
  assert.equal(res.status, 200);
});

test("H1: unrelated authenticated user is denied", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}`, stranger);
  assert.equal(res.status, 403);
});

test("H1: unauthenticated without proof is denied", async () => {
  const res = await get(`http://localhost/api/certificates/${DONATION_ID}`);
  assert.equal(res.status, 403);
});

test("H1: unknown donation id is 404", async () => {
  const res = await get(`http://localhost/api/certificates/${UNKNOWN_ID}?paymentId=pi_test_secret_123`);
  assert.equal(res.status, 404);
});
