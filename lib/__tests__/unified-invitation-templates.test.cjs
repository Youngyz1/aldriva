/**
 * lib/__tests__/unified-invitation-templates.test.cjs
 *
 * Round 5, step 1: one selection writes card + page together.
 * - Pure units: registry pairs, occasion defaults, exact/base lookup,
 *   derivation without rewrites (exact > card > page > null).
 * - Static pins: setUnified writes BOTH columns behind the kind gate;
 *   design tab gone; design page redirects (kind-gated); PATCH is 410 and
 *   never writes the card column alone; card pipeline retained; builder
 *   opens for card-only drafts and reclassified events.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const unified = require("../unified-invitation-templates.ts");

describe("unified registry: one selection, card + page", () => {
  test("the four existing pairs map card slug to page id", () => {
    const pairs = Object.fromEntries(
      unified.UNIFIED_INVITATION_TEMPLATES.map((t) => [t.baseId, t.pageId])
    );
    assert.deepEqual(pairs, {
      "royal-elegance": "wedding-romantic",
      "festive-gold-noir": "birthday-bold",
      "grand-gala-noir": "black-tie",
      "modern-executive": "gala-editorial",
    });
  });

  test("occasion defaults resolve to registry ids", () => {
    assert.equal(unified.DEFAULT_UNIFIED_FOR_OCCASION.wedding, "royal-elegance@1.0.0");
    assert.equal(unified.DEFAULT_UNIFIED_FOR_OCCASION.birthday, "festive-gold-noir@1.0.0");
    assert.equal(unified.DEFAULT_UNIFIED_FOR_OCCASION.gala, "grand-gala-noir@1.0.0");
    assert.equal(unified.DEFAULT_UNIFIED_FOR_OCCASION.other, "modern-executive@1.0.0");
    for (const id of Object.values(unified.DEFAULT_UNIFIED_FOR_OCCASION)) {
      assert.ok(unified.getUnifiedTemplate(id), `${id} resolves`);
    }
  });

  test("lookup is exact-first, base-id fallback, undefined otherwise", () => {
    assert.equal(unified.getUnifiedTemplate("royal-elegance@1.0.0").baseId, "royal-elegance");
    assert.equal(unified.getUnifiedTemplate("royal-elegance").id, "royal-elegance@1.0.0");
    assert.equal(unified.getUnifiedTemplate("nope"), undefined);
    assert.equal(unified.getUnifiedTemplate(null), undefined);
  });
});

describe("derivation never rewrites: exact > card > page > null", () => {
  test("exact pair reported exact", () => {
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: "royal-elegance", pageId: "wedding-romantic" }),
      { unifiedId: "royal-elegance@1.0.0", isExact: true }
    );
  });

  test("card-only draft (older drafts, no page row) resolves card-dominant", () => {
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: "grand-gala-noir", pageId: null }),
      { unifiedId: "grand-gala-noir@1.0.0", isExact: false }
    );
  });

  test("page-only resolves page-dominant without inventing a card", () => {
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: null, pageId: "birthday-bold" }),
      { unifiedId: "festive-gold-noir@1.0.0", isExact: false }
    );
  });

  test("mismatched pairs stay custom (never normalized)", () => {
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: "royal-elegance", pageId: "black-tie" }),
      { unifiedId: "royal-elegance@1.0.0", isExact: false }
    );
  });

  test("unknown variants resolve to null", () => {
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: "nope", pageId: "nope" }),
      { unifiedId: null, isExact: false }
    );
    assert.deepEqual(unified.resolveUnifiedPair({}), { unifiedId: null, isExact: false });
  });
});

describe("setUnified writes both columns behind the kind gate", () => {
  const ACTION = "lib/actions/unified-invitation-template.ts";

  test("action exists with access + kind gates and dual writes", () => {
    assert.ok(fs.existsSync(path.join(ROOT, ACTION)), "action file exists");
    const s = src(ACTION);
    assert.ok(s.includes("checkInvitationPageAccess"), "manager access bar");
    assert.ok(s.includes("assertInvitationKindEvent"), "single-source kind gate");
    assert.ok(s.includes("invitation_template_id"), "card column written");
    assert.ok(s.includes("template_id"), "page column written");
    assert.ok(s.includes('onConflict: "event_id"'), "page upsert creates missing rows");
    assert.ok(s.includes('eq("slug", pair.cardSlug)'), "card UUID resolved from slug");
    assert.ok(!s.includes(".delete("), "action never deletes");
  });
});

describe("design tab removed; design route redirects kind-gated", () => {
  test("no invitation-design tab, icon, or href remains in nav", () => {
    const nav = src("lib/event-dashboard-navigation.ts");
    assert.ok(!nav.includes("invitation-design"), "tab gone from navigation");
    const subNav = src("components/dashboard/EventSubNav.tsx");
    assert.ok(!subNav.includes("invitation-design"), "tab gone from sub-nav icons");
    const layout = src("app/dashboard/events/[id]/layout.tsx");
    assert.ok(!layout.includes("invitation-design"), "tab gone from layout icons");
  });

  test("design page redirects to the builder, kind-gated, never 404s invitation events", () => {
    const page = src("app/dashboard/events/[id]/invitation-design/page.tsx");
    assert.ok(page.includes("redirect(`/dashboard/events/${eventId}/invitation-page`)"), "redirects to builder");
    assert.ok(page.includes("assertInvitationKindEvent"), "kind gate kept");
    assert.ok(!page.includes("InvitationDesignClient"), "old client unwired");
    assert.ok(
      !fs.existsSync(path.join(ROOT, "app/dashboard/events/[id]/invitation-design/InvitationDesignClient.tsx")),
      "old client deleted"
    );
  });

  test("PATCH is 410 Gone and never writes the card column alone", () => {
    const route = src("app/api/events/[id]/invitation-design/route.ts");
    assert.ok(route.includes("410"), "gone status");
    assert.ok(!route.includes(".update("), "no writes of any kind");
    assert.ok(!route.includes("invitation_template_id"), "card column untouched");
  });

  test("card pipeline retained: renderer, card.png, table, fallback, email art", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "components/invitation/InvitationCardRenderer.tsx")), "renderer kept");
    assert.ok(fs.existsSync(path.join(ROOT, "app/api/invitation/[token]/card.png/route.tsx")), "card.png kept");
    assert.ok(src("db/migration_120_invitation_templates.sql").includes("CREATE TABLE"), "table untouched");
    const guest = src("app/invitation/[token]/page.tsx");
    assert.ok(guest.includes("getInvitationTemplateById"), "card fallback kept");
    const mail = src("lib/invitations.ts");
    assert.ok(mail.includes("/card.png"), "email header art kept");
  });
});

describe("builder opens for card-only drafts and reclassified events", () => {
  test("no page row synthesizes defaults instead of 404ing", () => {
    const actions = src("lib/actions/invitation-page.ts");
    assert.ok(actions.includes("effectiveDraft"), "synthesized draft exists");
    assert.ok(actions.includes('template_id: "gala-editorial"'), "synthesized default page template");
    const route = src("app/dashboard/events/[id]/invitation-page/page.tsx");
    assert.ok(route.includes('data.draft.id !== ""'), "missing row routes to the builder, not 404");
  });

  test("invitation-kind gate passes reclassified events (kind read live, not cached)", () => {
    const route = src("app/dashboard/events/[id]/invitation-page/page.tsx");
    assert.ok(route.includes("assertInvitationKindEvent(eventId)"), "live kind read per request");
  });
});
