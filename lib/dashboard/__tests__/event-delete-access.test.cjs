const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

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

const { decideDashboardEventAccess } = require(
  path.resolve(__dirname, "../../dashboard-event-access.ts")
);
const {
  getEventDeleteBlockMessage,
  isEventDeleteBlockingOrder,
} = require(path.resolve(__dirname, "../../dashboard-event-delete-guard.ts"));

const MANAGE_ROLES = ["owner", "admin", "manager"];

function decide(event, overrides = {}) {
  return decideDashboardEventAccess(event, {
    userId: "user-1",
    organizerIds: [],
    organizerRoles: {},
    requiredRoles: MANAGE_ROLES,
    allowPersonalOwner: true,
    ...overrides,
  });
}

test("personal event owner is allowed", () => {
  assert.equal(
    decide({ id: "e1", organizer_id: null, user_id: "user-1" }),
    "allowed"
  );
});

test("non-owner of a personal event is denied as not found", () => {
  assert.equal(
    decide({ id: "e1", organizer_id: null, user_id: "user-2" }),
    "not_found"
  );
});

test("organizer member with delete role is allowed", () => {
  assert.equal(
    decide(
      { id: "e1", organizer_id: "org-1", user_id: "user-2" },
      {
        organizerIds: ["org-1"],
        organizerRoles: { "org-1": "manager" },
      }
    ),
    "allowed"
  );
});

test("organizer member without delete role is forbidden", () => {
  assert.equal(
    decide(
      { id: "e1", organizer_id: "org-1", user_id: "user-1" },
      {
        organizerIds: ["org-1"],
        organizerRoles: { "org-1": "editor" },
      }
    ),
    "forbidden"
  );
});

test("outsider is denied as not found", () => {
  assert.equal(
    decide(
      { id: "e1", organizer_id: "org-1", user_id: "user-2" },
      {
        organizerIds: ["org-2"],
        organizerRoles: { "org-2": "owner" },
      }
    ),
    "not_found"
  );
});

test("empty organizerIds with personal user_id match is allowed", () => {
  assert.equal(
    decide(
      { id: "e1", organizer_id: null, user_id: "user-1" },
      { organizerIds: [], organizerRoles: {} }
    ),
    "allowed"
  );
});

test("matching user_id cannot bypass the organizer role tier", () => {
  assert.equal(
    decide(
      { id: "e1", organizer_id: "org-1", user_id: "user-1" },
      {
        organizerIds: ["org-1"],
        organizerRoles: { "org-1": "viewer" },
      }
    ),
    "forbidden"
  );
});

test("event with a sold ticket/order is blocked", () => {
  const soldOrder = {
    status: "valid",
    total_amount: 25,
    stripe_session_id: "cs_test_123",
  };
  assert.equal(isEventDeleteBlockingOrder(soldOrder), true);
  const message = getEventDeleteBlockMessage([soldOrder]);
  assert.match(message, /paid, pending, or refunded ticket orders/);
});

test("free order without payment records is not blocked", () => {
  assert.equal(
    isEventDeleteBlockingOrder({
      status: "valid",
      total_amount: 0,
      stripe_session_id: null,
      stripe_payment_intent_id: null,
    }),
    false
  );
  assert.equal(getEventDeleteBlockMessage([]), null);
});
