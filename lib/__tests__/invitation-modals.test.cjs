/**
 * lib/__tests__/invitation-modals.test.cjs
 *
 * Round 3 COMMIT 5: invitation modal audit. Every destructive or
 * state-changing dialog in the events surfaces is kind-correct:
 * - Delete speaks tickets for public events, page/share-link/guests
 *   for invitations (which can never take payments).
 * - Convert explains removal-from-discovery and the sold-tickets block.
 * - Template switch, share-link regenerate and bulk confirms keep
 *   their guards on both kinds.
 * - Event deletion cascades invitation rows at the database level.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("delete dialog is kind-aware", () => {
  const CLIENT = "app/dashboard/events/EventsClient.tsx";

  test("invitation targets get invitation copy", () => {
    const s = src(CLIENT);
    assert.ok(s.includes('"Delete Invitation"'), "invitation title");
    assert.ok(s.includes("share link"), "mentions the share link");
    assert.ok(s.includes("guest list"), "mentions guests");
    assert.ok(s.includes("never take payments"), "no payment scare for invitations");
  });

  test("public targets keep the payment-history block", () => {
    const s = src(CLIENT);
    assert.ok(s.includes('"Delete Event"'), "public title kept");
    assert.ok(s.includes("preserve payment history"), "payment block kept");
  });

  test("dialog branches on the row kind", () => {
    const s = src(CLIENT);
    assert.ok(s.includes('deleteTarget?.kind === "invitation"'), "kind branch present");
  });
});

describe("convert dialog explains the removal", () => {
  test("copy covers discovery removal and the sold block", () => {
    const s = src("app/dashboard/events/EventsClient.tsx");
    assert.ok(s.includes("Convert to invitation event"), "convert title");
    assert.ok(s.includes("public discovery"), "removal explained");
    assert.ok(s.includes("ticket sales stop"), "consequence stated");
    assert.ok(s.includes("Blocked when tickets were sold"), "sold block stated");
  });
});

describe("other invitation dialogs keep their guards", () => {
  test("builder template switch asks before discarding", () => {
    const s = src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
    assert.ok(s.includes("Switch template?"), "confirm dialog present");
  });

  test("share-link regenerate confirms inline with a link warning", () => {
    const s = src("components/invitation/ShareLinkPanel.tsx");
    assert.ok(s.includes("Regenerate"), "regenerate action present");
    assert.ok(s.includes("anyone with"), "link exposure stated");
  });

  test("bulk confirm stays kind-neutral", () => {
    const s = src("app/dashboard/events/EventsClient.tsx");
    assert.ok(s.includes("Apply this action"), "generic bulk copy");
  });
});

describe("event deletion cascades invitation rows", () => {
  test("invitation tables cascade on event delete", () => {
    const pages = src("db/migration_154_invitation_pages.sql");
    assert.ok(
      pages.includes("REFERENCES public.events(id) ON DELETE CASCADE"),
      "pages and preview tokens cascade"
    );
    const invites = src("db/migration_92_event_invitations_and_ticket_instances.sql");
    assert.ok(
      invites.includes("REFERENCES events(id) ON DELETE CASCADE"),
      "guest invitations cascade"
    );
  });
});
