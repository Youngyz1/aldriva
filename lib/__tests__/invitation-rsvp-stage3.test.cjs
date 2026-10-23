const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
let mockAdmin = null;
let routeRsvpStub = null;
let routeCalls = [];

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
require.extensions[".tsx"] = require.extensions[".ts"];

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/supabase-admin") {
    return { createSupabaseAdmin: () => mockAdmin };
  }
  if (request === "@/lib/actions/invitation-page") {
    return { getPublishedInvitationPage: async () => null };
  }
  if (request === "@/lib/invitation-card-url") {
    return { buildInvitationCardImageUrl: () => "" };
  }
  if (request === "@/lib/invitations" && routeRsvpStub) {
    return { rsvpInvitation: routeRsvpStub };
  }
  if (request === "@/lib/memories/guest-limits") {
    return {
      isRateLimited: async () => false,
      rateLimitedResponse: () => new Response("rate limited", { status: 429 }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  buildRsvpInvitationUpdate,
  normalizeRsvpDetails,
  RsvpValidationError,
  usesEvergreenRsvpForm,
} = require("../invitation-rsvp.ts");
const { buildRsvpSubmissionPayload } = require("../page-actions.ts");
const { rsvpInvitation } = require("../invitations.ts");

const TOKEN = "a".repeat(64);

function createMockAdmin({ guestAllowance = 4, ticketStatus = null } = {}) {
  const updates = [];
  const queries = [];
  const invitation = {
    id: "invite-stage3",
    event_id: "event-stage3",
    invitation_status: "sent",
    rsvp_status: "pending",
    rsvp_at: null,
    guest_allowance: guestAllowance,
  };

  return {
    updates,
    queries,
    admin: {
      from(table) {
        let operation = "";
        let updateValues;
        const query = {
          select(fields) {
            operation = "select";
            queries.push({ table, operation, fields });
            return query;
          },
          update(values) {
            operation = "update";
            updateValues = values;
            updates.push(values);
            return query;
          },
          eq() {
            if (operation === "update") return Promise.resolve({ error: null, data: updateValues });
            return query;
          },
          async maybeSingle() {
            if (table === "event_invitations") return { data: invitation, error: null };
            if (table === "ticket_instances") {
              return { data: ticketStatus ? { id: "ticket-stage3", status: ticketStatus } : null, error: null };
            }
            return { data: null, error: null };
          },
        };
        return query;
      },
    },
  };
}

test("legacy accept and decline succeed and clear RSVP detail columns", async () => {
  for (const response of ["accepted", "declined"]) {
    const mock = createMockAdmin();
    mockAdmin = mock.admin;
    const result = await rsvpInvitation({ token: TOKEN, response });
    assert.equal(result.success, true);
    assert.equal(result.rsvp_status, response);
    assert.equal(mock.updates.length, 1);
    assert.deepEqual(
      {
        rsvp_guest_count: mock.updates[0].rsvp_guest_count,
        rsvp_guest_names: mock.updates[0].rsvp_guest_names,
        rsvp_message: mock.updates[0].rsvp_message,
      },
      { rsvp_guest_count: null, rsvp_guest_names: null, rsvp_message: null },
    );
  }
});

test("an accepted RSVP stores a valid count and normalized optional text", async () => {
  const mock = createMockAdmin({ guestAllowance: 4 });
  mockAdmin = mock.admin;

  await rsvpInvitation({
    token: TOKEN,
    response: "accepted",
    guestCount: 3,
    guestNames: "  Ada\u0000  & Ben  ",
    message: "  Joy\u0007  ",
  });

  assert.equal(mock.updates[0].rsvp_guest_count, 3);
  assert.equal(mock.updates[0].rsvp_guest_names, "Ada  & Ben");
  assert.equal(mock.updates[0].rsvp_message, "Joy");
});

test("invalid accepted counts and counts above the saved allowance are rejected", async () => {
  for (const value of [null, 0, 1.5, 21, "2"]) {
    assert.throws(
      () => normalizeRsvpDetails("accepted", { guestCount: value }),
      RsvpValidationError,
      `expected ${String(value)} to be rejected`,
    );
  }

  const mock = createMockAdmin({ guestAllowance: 2 });
  mockAdmin = mock.admin;
  await assert.rejects(
    rsvpInvitation({ token: TOKEN, response: "accepted", guestCount: 3 }),
    RsvpValidationError,
  );
  assert.equal(mock.updates.length, 0, "an over-allowance response must not write");
});

test("RSVP text fields are type-checked, stripped, trimmed, and length-limited", () => {
  assert.deepEqual(
    normalizeRsvpDetails("accepted", {
      guestNames: "  Ada\u0000 \t & Ben  ",
      message: "  Joy\u0007\n  ",
    }),
    { guestCount: undefined, guestNames: "Ada  & Ben", message: "Joy" },
  );
  assert.throws(() => normalizeRsvpDetails("accepted", { guestNames: 4 }), RsvpValidationError);
  assert.throws(() => normalizeRsvpDetails("accepted", { message: false }), RsvpValidationError);
  assert.throws(() => normalizeRsvpDetails("accepted", { guestNames: "x".repeat(301) }), RsvpValidationError);
  assert.throws(() => normalizeRsvpDetails("accepted", { message: "x".repeat(501) }), RsvpValidationError);
});

test("a decline ignores any count or names and stores null for both", () => {
  const details = normalizeRsvpDetails("declined", {
    guestCount: "not a number",
    guestNames: { invalid: true },
    message: "  Sorry\u0000  ",
  });
  assert.deepEqual(details, { message: "Sorry" });
  assert.deepEqual(
    buildRsvpInvitationUpdate("declined", details, "2026-10-22T12:00:00.000Z"),
    {
      rsvp_status: "declined",
      rsvp_at: "2026-10-22T12:00:00.000Z",
      updated_at: "2026-10-22T12:00:00.000Z",
      rsvp_guest_count: null,
      rsvp_guest_names: null,
      rsvp_message: "Sorry",
    },
  );
});

test("existing templates retain the two-button RSVP UI and legacy payload shape", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { NextIntlClientProvider } = require("next-intl");
  const { ActionPortalBlock } = require("../../components/invitation/blocks/ActionPortalBlock.tsx");
  const messages = { Events: JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8")).Events };
  const markup = renderToStaticMarkup(React.createElement(NextIntlClientProvider, { locale: "en", messages },
    React.createElement(ActionPortalBlock, {
      actionType: "RSVP_SUBMISSION",
      theme: { classes: {}, text_scale: 1 },
      onAction: async () => undefined,
      currentResponse: "pending",
    }),
  ));

  assert.match(markup, /Accept Invitation/);
  assert.match(markup, /Unable to Attend/);
  assert.equal((markup.match(/<button\b/g) || []).length, 2);
  assert.doesNotMatch(markup, /<form\b|Full names of all guests|How many people will be attending/);
  assert.deepEqual(buildRsvpSubmissionPayload("accepted"), {
    actionType: "RSVP_SUBMISSION",
    response: "accepted",
  });
});

test("Evergreen uses the shared accept/decline RSVP flow", () => {
  assert.equal(usesEvergreenRsvpForm("evergreen-envelope"), false);
  for (const templateId of ["wedding-romantic", "romantic-envelope", "botanical-reverie", "gala-editorial"]) {
    assert.equal(usesEvergreenRsvpForm(templateId), false, `${templateId} must keep its existing RSVP UI`);
  }
  const registrySource = fs.readFileSync(
    path.join(ROOT, "components/invitation/blocks/InvitationBlockRegistry.tsx"),
    "utf8",
  );
  assert.ok(registrySource.includes("evergreenRsvp={usesEvergreenRsvpForm(templateId)}"));
});

test("RSVP API accepts legacy fields, forwards valid details, and returns 422 for bad counts", async () => {
  routeCalls = [];
  routeRsvpStub = async (params) => {
    routeCalls.push(params);
    return { success: true, rsvp_status: params.response, rsvp_at: "now", message: "ok" };
  };
  const { POST } = require("../../app/api/invitation/[token]/rsvp/route.ts");

  async function post(body) {
    return POST({ json: async () => body }, { params: Promise.resolve({ token: TOKEN }) });
  }

  const legacyAccept = await post({ response: "accepted" });
  assert.equal(legacyAccept.status, 200);
  assert.equal(routeCalls[0].guestCount, undefined);
  assert.equal(routeCalls[0].guestNames, undefined);
  assert.equal(routeCalls[0].message, undefined);

  const legacyDecline = await post({ response: "declined" });
  assert.equal(legacyDecline.status, 200);
  assert.equal(routeCalls[1].response, "declined");

  const valid = await post({ response: "accepted", guestCount: 2, guestNames: " Ada ", message: " Hello " });
  assert.equal(valid.status, 200);
  assert.equal(routeCalls[2].guestCount, 2);
  assert.equal(routeCalls[2].guestNames, "Ada");
  assert.equal(routeCalls[2].message, "Hello");

  const invalid = await post({ response: "accepted", guestCount: 21 });
  assert.equal(invalid.status, 422);
  assert.equal(routeCalls.length, 3, "invalid count must not reach the invitation writer");
});

test("RSVP detail columns stay out of OG and shared-link selections", () => {
  const invitations = fs.readFileSync(path.join(ROOT, "lib/invitations.ts"), "utf8");
  const tokenLookup = invitations.slice(
    invitations.indexOf("export async function getInvitationByToken"),
    invitations.indexOf("export async function getInvitationGuestAllowanceByToken"),
  );
  assert.doesNotMatch(tokenLookup, /rsvp_guest_count|rsvp_guest_names|rsvp_message/);

  const page = fs.readFileSync(path.join(ROOT, "app/invitation/[token]/page.tsx"), "utf8");
  assert.ok(page.includes('templateId === "evergreen-envelope"'));
  assert.ok(page.includes("getInvitationGuestAllowanceByToken(token)"));
  assert.doesNotMatch(page, /rsvp_guest_count|rsvp_guest_names|rsvp_message/);

  const shared = fs.readFileSync(path.join(ROOT, "app/invitation/shared/[token]/page.tsx"), "utf8");
  assert.doesNotMatch(shared, /guest_allowance|rsvp_guest_count|rsvp_guest_names|rsvp_message/);
  const og = fs.readFileSync(path.join(ROOT, "app/api/invitation/[token]/card.png/route.tsx"), "utf8");
  assert.doesNotMatch(og, /guest_allowance|rsvp_guest_count|rsvp_guest_names|rsvp_message/);
});

