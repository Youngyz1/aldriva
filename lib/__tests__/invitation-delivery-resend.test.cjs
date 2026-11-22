/**
 * lib/__tests__/invitation-delivery-resend.test.cjs
 *
 * Behavioral regression tests for POST
 * /api/events/[id]/team/invitations/[inviteId]/resend:
 *  - An account-less invite's resend link must use the hash-fragment
 *    redeem#token= URL (never accept?token=), and vice versa for account
 *    invites.
 *  - The WhatsApp text parameter percent-encodes the link so `#` survives
 *    as `%23` (WhatsApp truncates an un-encoded fragment).
 *  - The old token stops validating once a new one is minted (token_hash is
 *    replaced).
 *  - Resending a locked invite resets failed_attempts and flips status back
 *    to pending.
 *  - Accepted/revoked invitations are never resendable.
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
let resendResult = { error: null };
const sentEmails = [];
const reissueRpcCalls = [];
let reissueRpcError = null;
let reissueRpcForceEmpty = false;

// Mirrors db/migration_211_event_staff_invitation_reissue.sql's
// reissue_event_staff_invitation(): account-less only, any of the six
// statuses, returns zero rows on any mismatch, otherwise revives the row.
function fakeReissueRpc(args) {
  reissueRpcCalls.push(args);
  if (reissueRpcError) return { data: null, error: reissueRpcError };
  // Simulates the RPC's own server-side re-validation racing ahead of this
  // route's initial SELECT (e.g. revoked/moved between read and RPC call).
  if (reissueRpcForceEmpty) return { data: [], error: null };
  const inv = invitationsTable.find(
    (r) => r.id === args.p_invitation_id && r.event_id === args.p_event_id
  );
  if (!inv) return { data: [], error: null };
  const validStatuses = ["pending", "expired", "locked", "declined", "revoked", "accepted"];
  if (!inv.is_accountless || !validStatuses.includes(inv.status)) {
    return { data: [], error: null };
  }
  const outPreviousStatus = inv.status;
  Object.assign(inv, {
    token_hash: args.p_token_hash,
    status: "pending",
    failed_attempts: 0,
    expires_at: args.p_expires_at,
    token_consumed_at: null,
    accepted_at: null,
    revoked_at: null,
    reissue_count: (inv.reissue_count || 0) + 1,
    last_reissued_at: new Date().toISOString(),
  });
  return {
    data: [{ out_invitation_id: inv.id, out_previous_status: outPreviousStatus, out_new_expires_at: args.p_expires_at }],
    error: null,
  };
}

function makeInvitationsQuery() {
  const filters = [];
  let updatePayload = null;
  const q = {
    select() { return q; },
    eq(f, v) { filters.push([f, v]); return q; },
    async maybeSingle() {
      const hit = invitationsTable.find((r) => filters.every(([f, v]) => r[f] === v));
      return { data: hit ?? null, error: null };
    },
    update(payload) {
      updatePayload = payload;
      return q;
    },
    async then(resolve) {
      // `.update(...).eq(...).eq(...).select("id")` lands here: apply the
      // update only to rows matching every accumulated filter (mirrors a
      // real conditional UPDATE ... WHERE, so a status race leaves 0 rows).
      const matches = invitationsTable.filter((r) => filters.every(([f, v]) => r[f] === v));
      for (const row of matches) Object.assign(row, updatePayload);
      resolve({ data: matches.map((r) => ({ id: r.id })), error: null });
    },
  };
  return q;
}

const fakeAdmin = {
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
  async rpc(name, args) {
    if (name !== "reissue_event_staff_invitation") throw new Error(`unexpected rpc ${name}`);
    return fakeReissueRpc(args);
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

const route = require("@/app/api/events/[id]/team/invitations/[inviteId]/resend/route.ts");
const { hashInviteToken } = require("@/lib/staff/invite-tokens.ts");

function post(inviteId) {
  return route.POST(
    new Request(`http://localhost/api/events/evt1/team/invitations/${inviteId}/resend`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "evt1", inviteId }) }
  );
}

beforeEach(() => {
  invitationsTable = [
    {
      id: "inv-accountless",
      event_id: "evt1",
      email: "scanner@example.com",
      role: "ticket_scanner",
      entrance_id: null,
      status: "pending",
      phone: "+15551234567",
      is_accountless: true,
      token_hash: hashInviteToken("old-accountless-token"),
      failed_attempts: 0,
    },
    {
      id: "inv-account",
      event_id: "evt1",
      email: "manager@example.com",
      role: "event_manager",
      entrance_id: null,
      status: "pending",
      phone: null,
      is_accountless: false,
      token_hash: hashInviteToken("old-account-token"),
      failed_attempts: 0,
    },
    {
      id: "inv-locked",
      event_id: "evt1",
      email: "locked@example.com",
      role: "ticket_scanner",
      entrance_id: null,
      status: "locked",
      phone: "+15559876543",
      is_accountless: true,
      token_hash: hashInviteToken("old-locked-token"),
      failed_attempts: 5,
    },
    {
      // Account invitation (never account-less): accepted is a terminal
      // state and must stay unresendable, matching the unchanged guard.
      id: "inv-accepted",
      event_id: "evt1",
      email: "done@example.com",
      role: "event_manager",
      entrance_id: null,
      status: "accepted",
      phone: null,
      is_accountless: false,
      token_hash: hashInviteToken("old-accepted-token"),
      failed_attempts: 0,
    },
    {
      id: "inv-revoked",
      event_id: "evt1",
      email: "gone@example.com",
      role: "event_manager",
      entrance_id: null,
      status: "revoked",
      phone: null,
      is_accountless: false,
      token_hash: hashInviteToken("old-revoked-token"),
      failed_attempts: 0,
    },
    {
      // Account-less invitation revived from 'accepted' via the reissue RPC
      // (migration 211) — F1's new "Resend access link" path.
      id: "inv-accountless-accepted",
      event_id: "evt1",
      email: "accepted-accountless@example.com",
      role: "ticket_scanner",
      entrance_id: null,
      status: "accepted",
      phone: "+15552223333",
      is_accountless: true,
      token_hash: hashInviteToken("old-accountless-accepted-token"),
      failed_attempts: 0,
      reissue_count: 0,
    },
    {
      // Account-less invitation revived from 'revoked' via the reissue RPC
      // — F1's new "Re-invite" path.
      id: "inv-accountless-revoked",
      event_id: "evt1",
      email: "revoked-accountless@example.com",
      role: "ticket_scanner",
      entrance_id: null,
      status: "revoked",
      phone: "+15554445555",
      is_accountless: true,
      token_hash: hashInviteToken("old-accountless-revoked-token"),
      failed_attempts: 0,
      reissue_count: 1,
    },
  ];
  resendResult = { error: null };
  sentEmails.length = 0;
  reissueRpcCalls.length = 0;
  reissueRpcError = null;
  reissueRpcForceEmpty = false;
  process.env.RESEND_API_KEY = "test-resend-key";
});

test("account-less invite: resend builds a redeem#token= hash-fragment link, never accept?token=", async () => {
  const res = await post("inv-accountless");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.acceptUrl.includes("/events/team/redeem#token="), body.acceptUrl);
  assert.ok(!body.acceptUrl.includes("/events/team/accept?token="));
});

test("account invite: resend builds an accept?token= link, never redeem#token=", async () => {
  const res = await post("inv-account");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.acceptUrl.includes("/events/team/accept?token="), body.acceptUrl);
  assert.ok(!body.acceptUrl.includes("/events/team/redeem#token="));
});

test("account-less invite: whatsappUrl percent-encodes the # in the text param so WhatsApp never truncates the link", async () => {
  const res = await post("inv-accountless");
  const body = await res.json();
  assert.ok(body.whatsappUrl, "whatsappUrl must be built for a valid E.164 phone");
  assert.ok(body.acceptUrl.includes("#token="));
  // The raw text= value is itself the result of encodeURIComponent(message),
  // so the whole query string carries the link's '#' as a literal %23 — it
  // must never appear as a real '#' after the wa.me?text= separator.
  const encodedLink = encodeURIComponent(body.acceptUrl);
  assert.ok(body.whatsappUrl.includes(encodedLink), "the full accept link must appear percent-encoded in the text param");
  assert.ok(body.whatsappUrl.includes("%23token%3D"), body.whatsappUrl);
  const afterTextEquals = body.whatsappUrl.slice(body.whatsappUrl.indexOf("text=") + "text=".length);
  assert.ok(!afterTextEquals.includes("#"), "no literal '#' may survive in the text param — only %23");
});

test("old token is dead after resend: the previous plaintext no longer hashes to the stored token_hash", async () => {
  const before = invitationsTable.find((r) => r.id === "inv-accountless").token_hash;
  await post("inv-accountless");
  const after = invitationsTable.find((r) => r.id === "inv-accountless").token_hash;
  assert.notEqual(after, before, "token_hash must be replaced on resend");
  assert.notEqual(after, hashInviteToken("old-accountless-token"));
});

test("resending a locked invite resets failed_attempts and flips status back to pending", async () => {
  const res = await post("inv-locked");
  assert.equal(res.status, 200);
  const row = invitationsTable.find((r) => r.id === "inv-locked");
  assert.equal(row.status, "pending");
  assert.equal(row.failed_attempts, 0);
});

test("F1: an accepted ACCOUNT invitation can never be resent (guard unchanged)", async () => {
  const res = await post("inv-accepted");
  assert.equal(res.status, 400);
  const row = invitationsTable.find((r) => r.id === "inv-accepted");
  assert.equal(row.status, "accepted", "row must be untouched");
  assert.equal(sentEmails.length, 0);
  assert.equal(reissueRpcCalls.length, 0, "an account invitation must never call the reissue RPC");
});

test("F1: a revoked ACCOUNT invitation can never be resent (guard unchanged)", async () => {
  const res = await post("inv-revoked");
  assert.equal(res.status, 400);
  const row = invitationsTable.find((r) => r.id === "inv-revoked");
  assert.equal(row.status, "revoked", "row must be untouched");
  assert.equal(sentEmails.length, 0);
  assert.equal(reissueRpcCalls.length, 0, "an account invitation must never call the reissue RPC");
});

test("F1: resend calls the reissue RPC for an account-less invite and never for an account invite", async () => {
  await post("inv-accountless");
  assert.equal(reissueRpcCalls.length, 1, "pending account-less invite must call the RPC");
  reissueRpcCalls.length = 0;

  await post("inv-account");
  assert.equal(reissueRpcCalls.length, 0, "pending account invite must use the direct-update path, never the RPC");
});

test("F1: an accepted account-less invitation IS revived by resend (Re-invite / Resend access link)", async () => {
  const res = await post("inv-accountless-accepted");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(reissueRpcCalls.length, 1);
  assert.equal(reissueRpcCalls[0].p_invitation_id, "inv-accountless-accepted");
  const row = invitationsTable.find((r) => r.id === "inv-accountless-accepted");
  assert.equal(row.status, "pending");
  assert.equal(row.accepted_at, null);
  assert.equal(row.reissue_count, 1);
  assert.ok(body.acceptUrl.includes("/events/team/redeem#token="));
});

test("F1: a revoked account-less invitation IS revived by resend (Re-invite)", async () => {
  const res = await post("inv-accountless-revoked");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(reissueRpcCalls.length, 1);
  const row = invitationsTable.find((r) => r.id === "inv-accountless-revoked");
  assert.equal(row.status, "pending");
  assert.equal(row.revoked_at, null);
  assert.equal(row.reissue_count, 2);
  assert.ok(body.acceptUrl.includes("/events/team/redeem#token="));
});

test("F1: the RPC returning no rows for an account-less invite is a clear error, not a silent 200", async () => {
  reissueRpcForceEmpty = true;
  const res = await post("inv-accountless-accepted");
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.ok(body.error);
  const row = invitationsTable.find((r) => r.id === "inv-accountless-accepted");
  assert.equal(row.status, "accepted", "row must be untouched when the RPC reports no rows");
});

test("F1: an RPC error for an account-less invite is logged and returns a clear 500, never a silent success", async () => {
  reissueRpcError = { message: "db unavailable" };
  const res = await post("inv-accountless");
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.ok(body.error);
});

test("emailError and acceptUrl/whatsappUrl are still returned when Resend fails", async () => {
  resendResult = { error: { name: "internal_server_error", message: "down" } };
  const res = await post("inv-accountless");
  const body = await res.json();
  assert.equal(body.emailed, false);
  assert.equal(body.emailError, "provider_error");
  assert.ok(body.acceptUrl);
  assert.ok(body.whatsappUrl);
});

test("account-less resend: reminder email and WhatsApp message both get the extra browser-warning sentence", async () => {
  const res = await post("inv-accountless");
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

test("account resend (is_accountless false): reminder email never gets the account-less browser warning", async () => {
  const res = await post("inv-account");
  const body = await res.json();
  assert.equal(body.emailed, true);
  assert.equal(sentEmails.length, 1);
  assert.ok(!sentEmails[0].html.includes("Open it in your normal browser"));
});
