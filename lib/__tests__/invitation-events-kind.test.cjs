/**
 * lib/__tests__/invitation-events-kind.test.cjs
 *
 * Round 3 COMMIT 1: first-class invitation events.
 * - Creation without a prior event, idempotent via draft key.
 * - Invitation tooling (builder, guests, RSVP, seating) works on BOTH
 *   kinds — never gated on kind=invitation.
 * - Invitation events never appear in public queries; ticket purchase
 *   rejects them; placeholders never reach guest pages.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    module._compile(
      ts.transpileModule(source, {
        compilerOptions: {
          esModuleInterop: true,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
        fileName: filename,
      }).outputText,
      filename
    );
  };
}

const kindLib = require("../invitation-events.ts");

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("kind helpers (unit)", () => {
  test("draft slug is deterministic per key (idempotency anchor)", () => {
    const a = kindLib.buildInvitationDraftSlug("550e8400-e29b-41d4-a716-446655440000");
    const b = kindLib.buildInvitationDraftSlug("550e8400-e29b-41d4-a716-446655440000");
    assert.equal(a, b);
    assert.ok(a.startsWith("invitation-"));
    assert.notEqual(
      a,
      kindLib.buildInvitationDraftSlug("123e4567-e89b-12d3-a456-426614174000")
    );
  });

  test("untouched draft detection", () => {
    assert.equal(
      kindLib.isUntouchedInvitationDraft({
        kind: "invitation",
        title: "Untitled invitation",
        has_invitation_page: false,
      }),
      true
    );
    assert.equal(
      kindLib.isUntouchedInvitationDraft({
        kind: "invitation",
        title: "Untitled invitation",
        has_invitation_page: true,
      }),
      false,
      "a saved page means touched"
    );
    assert.equal(
      kindLib.isUntouchedInvitationDraft({
        kind: "invitation",
        title: "Amara & Kwame",
        has_invitation_page: false,
      }),
      false,
      "a real title means touched"
    );
    assert.equal(
      kindLib.isUntouchedInvitationDraft({ kind: "public", title: "Gala", has_invitation_page: false }),
      false
    );
  });

  test("public-listable predicate mirrors the query filter", () => {
    assert.equal(kindLib.isPubliclyListableEvent({ visibility: "public", kind: "public" }), true);
    assert.equal(kindLib.isPubliclyListableEvent({ visibility: "public", kind: "invitation" }), false);
    assert.equal(kindLib.isPubliclyListableEvent({ visibility: "private", kind: "public" }), false);
  });

  test("shared filter applies visibility + kind", () => {
    const calls = [];
    const mock = { eq: (c, v) => (calls.push([c, v]), mock) };
    kindLib.applyPublicListableFilter(mock);
    assert.deepEqual(calls, [
      ["visibility", "public"],
      ["kind", "public"],
    ]);
  });
});

describe("creation without a prior event", () => {
  test("draft action inserts invitation-kind rows only, no tickets", () => {
    const s = src("lib/actions/invitation-events.ts");
    assert.ok(s.includes('kind: EVENT_KIND_INVITATION'), "kind set server-side");
    assert.ok(s.includes('visibility: "private"'), "forced private");
    assert.ok(s.includes('status: "draft"'), "draft status");
    assert.ok(s.includes("INVITATION_DRAFT_TITLE"), "placeholder title from constant");
    assert.ok(!s.includes('from("tickets")'), "no ticket tiers created");
    assert.ok(!s.includes("venue_layouts"), "no venue layout created");
  });

  test("double submit resolves to the existing row (no duplicate drafts)", () => {
    const s = src("lib/actions/invitation-events.ts");
    assert.ok(s.includes("buildInvitationDraftSlug(draftKey)"), "slug derives from the key");
    assert.ok(s.includes("isUniqueViolation(error)"), "shared unique-violation check (23505 lives in lib/event-slug.ts)");
    assert.ok(s.includes('.eq("slug", slug)'), "existing row is fetched by slug");
    assert.ok(s.includes("existing.user_id === user.id"), "reuse is ownership-checked");
    assert.ok(s.includes("existing.kind === EVENT_KIND_INVITATION"), "reuse is kind-checked");
  });

  test("entry points exist next to every dashboard Create event surface", () => {
    assert.ok(src("components/events/CreateInvitationButton.tsx").includes("createInvitationDraft"));
    assert.ok(src("components/events/CreateInvitationCard.tsx").includes("createInvitationDraft"));
    assert.ok(src("app/dashboard/events/new/page.tsx").includes("CreateInvitationCard"));
    assert.ok(src("app/dashboard/events/EventsClient.tsx").includes("CreateInvitationButton"));
    assert.ok(
      src("app/dashboard/org/[id]/overview/page.tsx").includes("CreateInvitationButton"),
      "org overview"
    );
    assert.ok(
      src("app/dashboard/org/[id]/events/page.tsx").includes("CreateInvitationButton"),
      "org events"
    );
    assert.ok(
      src("app/dashboard/organizations/[slug]/overview/page.tsx").includes("CreateInvitationButton"),
      "organizations overview"
    );
    assert.ok(
      src("app/dashboard/organizations/[slug]/events/page.tsx").includes("CreateInvitationButton"),
      "organizations events"
    );
    // Public ticket-first flow is untouched (form now lives in CreateEventForm;
    // page.tsx is the choice guard).
    assert.ok(src("app/create-event/CreateEventForm.tsx").includes("Publish Event"));
  });
});

describe("Round 4 Rule 1: invitation tooling serves invitation-kind events only", () => {
  test("page mutations and guest routes carry the single-source kind gate", () => {
    for (const f of [
      "lib/actions/invitation-page.ts",
      "app/api/events/[id]/guests/route.ts",
      "app/api/events/[id]/guests/batch/route.ts",
    ]) {
      const s = src(f);
      assert.ok(
        s.includes("assertInvitationKindEvent") || s.includes("isInvitationEvent"),
        `${f} gates on event kind`
      );
    }
    const gated = src("lib/actions/invitation-page.ts");
    assert.ok(gated.includes("Invitation pages are available only for invitation events"), "clear mutation error");
    assert.ok(!gated.includes("EVENT_KIND"), "no second kind helper in the gate");
  });

  test("Round 5: card-only PATCH is 410 Gone and writes nothing", () => {
    const s = src("app/api/events/[id]/invitation-design/route.ts");
    assert.ok(s.includes("410"), "gone status");
    assert.ok(!s.includes(".update("), "no writes of any kind");
    assert.ok(!s.includes("assertInvitationKindEvent"), "no gate needed on a dead endpoint");
  });

  test("personal guest links and conversion stay ungated (kind is enforced at the tooling boundary)", () => {
    const s = src("lib/invitations.ts");
    assert.ok(!s.includes("isInvitationEvent"), "personal links work wherever a guest row exists");
    const convert = src("lib/actions/invitation-events.ts");
    assert.ok(convert.includes("convertToInvitationEvent"), "public→invitation conversion path kept");
  });

  test("public event home shows no invitation card, builder, or guest links", () => {
    const s = src("app/dashboard/events/[id]/overview/page.tsx");
    assert.ok(!s.includes("Invite special guests"), "legacy invite entry gone");
    assert.ok(s.includes("isInvitationEvent"), "single-source kind gate present");
    assert.ok(!s.includes("invitation-page/builder"), "no stale builder-suffix link");
  });

  test("dashboard layout hides invitation tabs on public-kind events, keeps Memories", () => {
    const layout = src("app/dashboard/events/[id]/layout.tsx");
    assert.ok(layout.includes("isInvitationKind"), "kind passed to tab builder");
    const nav = src("lib/event-dashboard-navigation.ts");
    assert.ok(nav.includes("showInvitationTabs"), "invitation tabs kind-conditional");
    assert.ok(nav.includes('id: "memories"'), "Memories tab registered");
  });

  test("builder collects event fields for invitation-kind drafts", () => {
    const s = src(
      "app/dashboard/events/[id]/invitation-page/builder/sections/BasicsSection.tsx"
    );
    assert.ok(s.includes('event.kind === "invitation"'), "kind-scoped block");
    assert.ok(s.includes("updateInvitationEventFields"), "explicit event save");
    assert.ok(!s.includes("notFound()"), "never blocks the builder on kind");
  });
});

describe("invitation events never appear in public queries", () => {
  test("discovery, sitemap and cities route through the shared filter", () => {
    for (const f of ["lib/event-data.ts", "app/sitemap.ts", "lib/event-cities.ts"]) {
      assert.ok(src(f).includes("applyPublicListableFilter"), `${f} uses the shared filter`);
    }
  });

  test("embeds and related-event queries carry an explicit kind predicate", () => {
    assert.ok(src("lib/website-embeds.ts").includes('.eq("kind", "public")'));
    const slug = src("app/events/[slug]/page.tsx");
    assert.ok(slug.includes('.eq("kind", "public")'), "related queries exclude invitation kind");
  });

  test("ticket purchase rejects invitation events", () => {
    const s = src("lib/ticket-pricing.ts");
    assert.ok(s.includes('kind === "invitation"') || s.includes('kind==="invitation"'));
    assert.ok(s.includes("not available for ticket sales"));
  });
});

describe("placeholders never reach guest pages", () => {
  test("publish validation rejects the placeholder title", () => {
    const s = src("lib/invitation-page-schema.ts");
    assert.ok(s.includes("INVITATION_DRAFT_TITLE"), "placeholder is rejected at publish");
  });
});

describe("dashboard list: kind routing", () => {
  test("kind column, filter and badges are wired end to end", () => {
    assert.ok(src("types/dashboard-management.ts").includes("has_invitation_page"));
    assert.ok(src("lib/dashboard-data.ts").includes("has_invitation_page"));
    assert.ok(src("app/api/dashboard/events/route.ts").includes("kind: sp.get('kind')"));
    const client = src("app/dashboard/events/EventsClient.tsx");
    assert.ok(client.includes('"Draft invitation"'), "untouched drafts are labelled");
    assert.ok(client.includes("Convert to invitation"), "convert action present");
    assert.ok(client.includes("setDeleteTarget"), "delete action kept");
  });

  test("convert is blocked when tickets were sold, atomic otherwise", () => {
    const s = src("lib/actions/invitation-events.ts");
    assert.ok(s.includes('eq("status", "valid")'), "sold = valid orders");
    assert.ok(s.includes("Conversion is blocked"), "loud block");
    assert.ok(s.includes('kind: EVENT_KIND_INVITATION, visibility: "private"'), "atomic switch");
  });
});
