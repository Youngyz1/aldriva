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

describe("setUnified writes both columns behind the kind gate (via RPC)", () => {
  const ACTION = "lib/actions/unified-invitation-template.ts";

  test("action exists with access + kind gates and dual writes", () => {
    assert.ok(fs.existsSync(path.join(ROOT, ACTION)), "action file exists");
    const s = src(ACTION);
    assert.ok(s.includes("checkInvitationPageAccess"), "manager access bar");
    assert.ok(s.includes("assertInvitationKindEvent"), "single-source kind gate");
    assert.ok(s.includes("invitation_template_id"), "card column referenced");
    assert.ok(s.includes("template_id"), "page column referenced");
    assert.ok(s.includes('rpc("set_unified_invitation_template"'), "atomic RPC (no split writes)");
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

describe("Round 5 step 2: atomic RPC + unified picker", () => {
  test("migration 163 wraps both writes in one function with a kind guard", () => {
    const s = src("db/migration_163_unified_template_rpc.sql");
    assert.ok(s.includes("CREATE OR REPLACE FUNCTION public.set_unified_invitation_template"), "RPC exists");
    assert.ok(s.includes("SECURITY DEFINER"), "definer context");
    assert.ok(s.includes("RAISE EXCEPTION 'NOT_INVITATION_KIND'"), "DB-level kind guard");
    assert.ok(s.includes("UPDATE public.events"), "card write inside the function");
    assert.ok(s.includes('ON CONFLICT (event_id) DO UPDATE'), "page upsert inside the function");
    assert.ok(s.includes("GRANT EXECUTE") && s.includes("TO service_role"), "service-role only");
    assert.ok(s.includes("REVOKE ALL ON FUNCTION"), "public revoked");
    const rollback = src("db/migration_163_unified_template_rpc_rollback.sql");
    assert.ok(rollback.includes("DROP FUNCTION IF EXISTS public.set_unified_invitation_template"), "rollback drops it");
    const mirror = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261009000001_migration_163_unified_template_rpc.sql"), "utf8");
    assert.equal(mirror, s, "mirror byte-identical");
  });

  test("setUnified calls the RPC and reports publish lag with fixed strings", () => {
    const s = src("lib/actions/unified-invitation-template.ts");
    assert.ok(s.includes('rpc("set_unified_invitation_template"'), "single atomic call");
    assert.ok(!s.includes("ON CONFLICT"), "upsert lives in the RPC, not the action");
    assert.ok(s.includes("needsPublish"), "publish-lag signal");
    assert.ok(s.includes("published_snapshot"), "snapshot comparison source");
    assert.ok(!s.includes("${rpcError.message}") && !s.includes("${err.message}"), "no raw DB text in responses");
  });

  test("builder template section renders the unified picker (complete pairs only)", () => {
    const builder = src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
    assert.ok(builder.includes("UnifiedTemplatePicker"), "picker wired in");
    assert.ok(!builder.includes("InvitationTemplateSelect"), "old dropdown gone");
    assert.ok(builder.includes("cardSlug={cardSlug}"), "card slug threaded");
    assert.ok(builder.includes("onJumpToPublish"), "publish jump wired");
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes("UNIFIED_INVITATION_TEMPLATES.map"), "grid renders registry pairs");
    assert.ok(picker.includes('role="radiogroup"'), "native keyboard group");
    assert.ok(picker.includes('role="group"'), "preview tab group");
    assert.ok(picker.includes("aria-pressed"), "tab pressed state");
    assert.ok(picker.includes("setUnifiedInvitationTemplate"), "apply path");
    assert.ok(picker.includes("role=\"alert\"") || picker.includes("role='alert'"), "error/confirm announcements");
    assert.ok(picker.includes("needsPublish"), "publish notice");
    assert.ok(picker.includes("requestUnify"), "one-click unify");
    assert.ok(!picker.includes("autoApply") && !picker.includes("applyOnSelect"), "never auto-rewrites");
  });

  test("custom state, tabs, and states are pinned", () => {
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes("unifiedCustomTitle"), "custom banner copy key");
    assert.ok(picker.includes("unifiedCardTab") && picker.includes("unifiedPageTab"), "Card | Page tabs");
    assert.ok(picker.includes("unifiedCurrent"), "saved badge copy key");
    assert.ok(picker.includes("unifiedApplying") && picker.includes("unifiedApplyFailed"), "busy + error states");
    assert.ok(picker.includes("focus-within:ring") || picker.includes("focus-visible"), "focus rings");
  });

  test("unified Events keys exist identically in en and fr", () => {
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    const keys = Object.keys(en).filter((k) => k.startsWith("unified"));
    assert.ok(keys.length >= 20, `unified key set present (${keys.length})`);
    for (const k of keys) {
      assert.ok(k in fr, `fr missing ${k}`);
      assert.ok(typeof fr[k] === "string" && fr[k].length > 0, `fr ${k} non-empty`);
    }
    assert.notEqual(fr.unifiedApply, en.unifiedApply, "French actually translated");
  });
});
