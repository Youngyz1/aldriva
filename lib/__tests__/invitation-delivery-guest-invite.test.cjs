/**
 * lib/__tests__/invitation-delivery-guest-invite.test.cjs
 *
 * Behavioral regression tests for sendInvitationEmail (lib/invitations.ts):
 * must check the Resend result's `error` field and must never discard the
 * already-computed invitationUrl by throwing — callers (the guests route)
 * need the link even when the send failed.
 */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ROOT = path.resolve(__dirname, "..", "..");
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

let invitationRow = null;
let resendResult = { error: null };
const sentEmails = [];
const warnLogs = [];

const fakeAdmin = {
  from(table) {
    if (table === "event_invitations") {
      const filters = [];
      const q = {
        select() { return q; },
        eq(f, v) { filters.push([f, v]); return q; },
        async single() {
          const match = invitationRow && filters.every(([f, v]) => invitationRow[f] === v);
          return match ? { data: invitationRow, error: null } : { data: null, error: { message: "not found" } };
        },
        update(payload) {
          return {
            eq: async (f, v) => {
              if (invitationRow && invitationRow[f] === v) Object.assign(invitationRow, payload);
              return { error: null };
            },
          };
        },
      };
      return q;
    }
    if (table === "ticket_instances") {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => fakeAdmin };
  }
  if (request === "@/lib/actions/invitation-page") {
    return { getPublishedInvitationPage: async () => null };
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

const { sendInvitationEmail } = require("@/lib/invitations.ts");

function freshInvitation(overrides = {}) {
  return {
    id: "inv-1",
    event_id: "evt1",
    guest_name: "Jane Doe",
    guest_title: null,
    organization: null,
    email: "guest@example.com",
    phone: "+15551234567",
    token: "abc123tok",
    invitation_status: "draft",
    events: {
      id: "evt1",
      title: "Summer Gala",
      event_date: null,
      venue: null,
      city: null,
      invitation_template_id: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  invitationRow = freshInvitation();
  resendResult = { error: null };
  sentEmails.length = 0;
  warnLogs.length = 0;
  process.env.RESEND_API_KEY = "test-resend-key";
});

test("missing RESEND_API_KEY: emailed false, emailError not_configured, invitationUrl present", async () => {
  delete process.env.RESEND_API_KEY;
  const result = await sendInvitationEmail({ eventId: "evt1", invitationId: "inv-1" });
  assert.equal(result.ok, true);
  assert.equal(result.emailed, false);
  assert.equal(result.emailError, "not_configured");
  assert.ok(result.invitationUrl, "invitationUrl must be present");
  assert.equal(sentEmails.length, 0);
});

test("Resend returns {error}: never throws, emailed false, emailError set, invitationUrl preserved", async () => {
  resendResult = { error: { name: "validation_error", message: "Invalid `to` field" } };
  const result = await sendInvitationEmail({ eventId: "evt1", invitationId: "inv-1" });
  assert.equal(result.ok, true);
  assert.equal(result.emailed, false);
  assert.equal(result.emailError, "invalid_recipient");
  assert.ok(result.invitationUrl, "invitationUrl must survive a Resend error");
  assert.equal(sentEmails.length, 1);

  for (const args of warnLogs) {
    const joined = JSON.stringify(args);
    assert.ok(!joined.includes("test-resend-key"), "API key must never be logged");
    assert.ok(!joined.includes(result.invitationUrl), "invitation link must never be logged");
  }
});

test("success: emailed true, invitationUrl present, whatsappUrl built from stored phone", async () => {
  const result = await sendInvitationEmail({ eventId: "evt1", invitationId: "inv-1" });
  assert.equal(result.emailed, true);
  assert.equal(result.emailError, undefined);
  assert.ok(result.invitationUrl);
  assert.ok(result.whatsappUrl, "whatsappUrl should be built for a valid E.164 phone");
  assert.ok(result.whatsappUrl.startsWith("https://wa.me/15551234567?text="));
});

test("whatsappUrl absent when the guest has no phone on file", async () => {
  invitationRow = freshInvitation({ phone: null });
  const result = await sendInvitationEmail({ eventId: "evt1", invitationId: "inv-1" });
  assert.equal(result.whatsappUrl, undefined);
});

test("whatsappUrl absent for a malformed stored phone", async () => {
  invitationRow = freshInvitation({ phone: "555-0100" });
  const result = await sendInvitationEmail({ eventId: "evt1", invitationId: "inv-1" });
  assert.equal(result.whatsappUrl, undefined);
});

test("still throws for genuine validation errors unrelated to delivery (cancelled invitation)", async () => {
  invitationRow = freshInvitation({ invitation_status: "cancelled" });
  await assert.rejects(
    () => sendInvitationEmail({ eventId: "evt1", invitationId: "inv-1" }),
    /Cannot send email for a cancelled invitation/
  );
  assert.equal(sentEmails.length, 0);
});

test.after(() => {
  console.warn = originalWarn;
});
