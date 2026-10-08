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
    assert.ok(s.includes("23505"), "unique violation is caught");
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

describe("invitation tooling works on both kinds (never kind-gated)", () => {
  test("page actions, guests and seating carry no kind gate", () => {
    for (const f of [
      "lib/actions/invitation-page.ts",
      "app/api/events/[id]/guests/batch/route.ts",
      "lib/invitations.ts",
    ]) {
      const s = src(f);
      assert.ok(!s.includes("EVENT_KIND"), `${f} must not branch on event kind`);
      assert.ok(!s.includes("!== 'invitation'"), `${f} must not exclude by kind`);
      assert.ok(!s.includes('=== "invitation"'), `${f} must not require invitation kind`);
    }
  });

  test("public event home links builder and guests", () => {
    const s = src("app/dashboard/events/[id]/overview/page.tsx");
    assert.ok(s.includes("Invite special guests"), "entry present");
    assert.ok(s.includes("invitation-page/builder"), "builder linked");
    assert.ok(s.includes("/guests"), "guests linked");
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
