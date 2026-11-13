/**
 * lib/__tests__/invitation-delivery-team-invite.test.cjs
 *
 * Behavioral regression tests for the invitation-delivery fix:
 * POST /api/events/[id]/team/invite must check the Resend result's `error`
 * field (the SDK returns `{error}` rather than throwing) and must always
 * return `acceptUrl` so the dashboard can show a copyable link even when
 * no email went out.
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

// ── Controllable fixtures ──────────────────────────────────────────────────
let invitationsTable = [];
let eventsTable = [{ id: "evt1", title: "Summer Gala" }];
let nextInviteId = 1;
let resendResult = { error: null };
const sentEmails = [];
const warnLogs = [];

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
    update(payload) {
      return {
        eq: async (f, v) => {
          const row = invitationsTable.find((r) => r[f] === v);
          if (row) Object.assign(row, payload);
          return { error: null };
        },
      };
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
    if (table === "event_team_invitations") {
      return makeInvitationsQuery();
    }
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
    return {
      hasEventOrOrganizerAccess: async () => true,
      EventTeamRole: {},
    };
  }
  if (request === "@/lib/site-url") {
    return { getSiteUrl: () => "https://aldriva.test" };
  }
  if (request === "@/config/branding") {
    return { BRAND: { name: "Aldriva", contactEmail: "events@aldriva.test" } };
  }
  if (request === "resend") {
    return {
      Resend: class {
        emails = {
          send: async (args) => {
            sentEmails.push(args);
            return resendResult;
          },
        };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const originalWarn = console.warn;
console.warn = (...args) => {
  warnLogs.push(args);
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

const accountlessBody = {
  email: "scanner@example.com",
  role: "ticket_scanner",
  isAccountless: true,
  phone: "+15551234567",
  staffName: "Jo Scanner",
};

beforeEach(() => {
  invitationsTable = [];
  nextInviteId = 1;
  resendResult = { error: null };
  sentEmails.length = 0;
  warnLogs.length = 0;
  process.env.RESEND_API_KEY = "test-resend-key";
});

test("missing RESEND_API_KEY: emailed false, emailError not_configured, acceptUrl present", async () => {
  delete process.env.RESEND_API_KEY;
  const res = await post(accountlessBody);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.emailed, false);
  assert.equal(body.emailError, "not_configured");
  assert.ok(body.acceptUrl, "acceptUrl must be present");
  assert.equal(sentEmails.length, 0);
});

test("Resend returns {error}: emailed false, emailError set, acceptUrl still present, no secrets logged", async () => {
  resendResult = { error: { name: "validation_error", message: "Invalid `to` field" } };
  const res = await post(accountlessBody);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.emailed, false);
  assert.equal(body.emailError, "invalid_recipient");
  assert.ok(body.acceptUrl, "acceptUrl must be present even when the send failed");
  assert.equal(sentEmails.length, 1, "send was attempted");

  // No warn call should contain the accept link or the API key.
  for (const args of warnLogs) {
    const joined = JSON.stringify(args);
    assert.ok(!joined.includes("test-resend-key"), "API key must never be logged");
    assert.ok(!joined.includes(body.acceptUrl), "accept link must never be logged");
  }
});

test("Resend provider error (non-validation) maps to provider_error", async () => {
  resendResult = { error: { name: "internal_server_error", message: "Resend is down" } };
  const res = await post(accountlessBody);
  const body = await res.json();
  assert.equal(body.emailed, false);
  assert.equal(body.emailError, "provider_error");
  assert.ok(body.acceptUrl);
});

test("success: emailed true, acceptUrl present, whatsappUrl built for valid E.164 phone", async () => {
  const res = await post(accountlessBody);
  const body = await res.json();
  assert.equal(body.emailed, true);
  assert.equal(body.emailError, undefined);
  assert.ok(body.acceptUrl);
  assert.ok(body.whatsappUrl, "whatsappUrl should be built for a valid E.164 phone");
  assert.ok(body.whatsappUrl.startsWith("https://wa.me/15551234567?text="));
  assert.equal(sentEmails.length, 1);
});

test("whatsappUrl absent without a phone number", async () => {
  const res = await post({
    email: "manager@example.com",
    role: "event_manager",
  });
  const body = await res.json();
  assert.equal(body.whatsappUrl, undefined);
});

test("malformed phone number is rejected before any email is sent (account-less invite requires valid E.164)", async () => {
  const res = await post({
    ...accountlessBody,
    phone: "not-a-real-phone",
  });
  // normalizeE164Phone rejects it -> phone becomes null -> account-less
  // staff validation fails closed with a 400, so no whatsappUrl is ever built.
  assert.equal(res.status, 400);
  assert.equal(sentEmails.length, 0);
});

test("account-less invite: email and WhatsApp message both get the extra browser-warning sentence", async () => {
  const res = await post(accountlessBody);
  const body = await res.json();
  assert.equal(body.emailed, true);
  assert.equal(sentEmails.length, 1);
  assert.match(
    sentEmails[0].html,
    /Open it in your normal browser, not a private window, and save the page to your home screen\./
  );
  const decodedWhatsapp = decodeURIComponent(body.whatsappUrl.split("?text=")[1]);
  assert.ok(decodedWhatsapp.includes("Open it in your normal browser, not a private window"));
});

test("account invite (isAccountless false): email never gets the account-less browser warning", async () => {
  const res = await post({
    email: "manager@example.com",
    role: "event_manager",
  });
  const body = await res.json();
  assert.equal(body.emailed, true);
  assert.equal(sentEmails.length, 1);
  assert.ok(!sentEmails[0].html.includes("Open it in your normal browser"));
});

test.after(() => {
  console.warn = originalWarn;
});
