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

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

require.extensions[".ts"] = function compileTestTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8").replace(/^import ["']server-only["'];?\s*/m, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(compiled, filename);
};

require.extensions[".tsx"] = function compileTestTsx(module, filename) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(compiled, filename);
};

function loadCoverArtModule() {
  return require(path.join(ROOT, "lib/invitation-cover-art.ts"));
}

const unified = require("../unified-invitation-templates.ts");
const previewData = require("../invitation-template-preview-data.ts");

describe("unified registry: one selection, card + page", () => {
  test("the five pairs map card slug to page id (Round 5 Cover added)", () => {
    const pairs = Object.fromEntries(
      unified.UNIFIED_INVITATION_TEMPLATES.map((t) => [t.baseId, t.pageId])
    );
    assert.deepEqual(pairs, {
      "royal-elegance": "wedding-romantic",
      "festive-gold-noir": "birthday-bold",
      "grand-gala-noir": "black-tie",
      "modern-executive": "gala-editorial",
      cover: "cover",
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
    assert.ok(mail.includes("buildInvitationCardImageUrl("), "email header art uses the shared card.png URL");
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
    assert.ok(picker.includes("UNIFIED_INVITATION_TEMPLATES.filter"), "grid starts from registry pairs and filters incomplete entries");
    assert.ok(picker.includes("pageExists && Boolean(cardBySlug(cardTemplates, pair.cardSlug))"), "only pairs with a card and page are available");
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
    assert.ok(!picker.includes("unifiedCurrent"), "tiles keep the template name as their only text label");
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
    assert.ok("coverPhotoTitle" in fr && fr.coverPhotoTitle.length > 0, "fr cover empty-state title");
    assert.ok("coverPhotoBody" in fr && fr.coverPhotoBody.length > 0, "fr cover empty-state body");
    assert.notEqual(fr.coverPhotoTitle, en.coverPhotoTitle, "cover strings translated");
    const localizedKeys = Object.keys(en).filter((key) =>
      key.startsWith("invitationType") || key === "invitationPreviewSampleLabel" || key === "candidatePreviewFallbackNotice"
    );
    assert.ok(localizedKeys.length >= 13, "type and preview labels are registered");
    for (const key of localizedKeys) {
      assert.ok(typeof fr[key] === "string" && fr[key].length > 0, `French key ${key} is present`);
      if (key !== "invitationTypeGala") {
        assert.notEqual(fr[key], en[key], `${key} has a French translation`);
      }
    }
  });

  test("a custom saved card reference does not hide the complete template picker", () => {
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: "custom-card-that-is-not-in-the-registry", pageId: "wedding-romantic" }),
      { unifiedId: "royal-elegance@1.0.0", isExact: false }
    );
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes("const allPairs = availablePairs"), "picker availability is based on valid registry pairs, not saved-card resolution");
    assert.ok(picker.includes("!resolved.isExact"), "custom state is surfaced alongside the picker");
    assert.ok(picker.includes("{allPairs.length === 0 ?"), "only an empty set of complete pairs hides the options");
  });

  test("Cover tile preview keeps the palette fallback and real title when no hero is set", () => {
    const draft = {
      template_id: "cover",
      locale: "en",
      display_title: "Back to School",
      host_names: "School Council",
      hero_image_url: null,
      timezone: "",
    };
    const result = previewData.buildInvitationTemplatePreviewData("cover", draft, {
      title: "Back to School",
      event_date: "",
      venue: null,
    });
    assert.equal(result.data.title, "Back to School", "real event title wins over sample text");
    assert.equal(result.data.heroImage, undefined, "Cover preview does not inject the sample photo");
    assert.ok(result.sampleFields.length > 0, "sample fallback remains labelled for other empty content");
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    const cover = src("components/invitation/templates/InvitationTemplateCover.tsx");
    assert.ok(picker.includes('cover: { bg: "#101014"'), "tile frame uses the Cover palette while lazy mounting");
    assert.ok(picker.includes("data={data.data}"), "tile renders merged real/sample page data");
    assert.ok(cover.includes('className="absolute inset-0 bg-[#101014]"'), "page renderer paints its palette fallback without an image");
    assert.ok(cover.includes("{data.title}"), "palette fallback includes the real title");
    assert.ok(cover.includes('previewMode === "thumbnail" ? "min-h-[520px]" : "min-h-[92svh]"'), "the thumbnail viewport brings fallback title and photo into its crop");
  });

  test("sample fallback data is render-only and is never copied into a draft or publish snapshot", () => {
    const draft = {
      template_id: "wedding-romantic",
      locale: "en",
      display_title: "Our Celebration",
      partner1_name: "",
      partner2_name: "",
      hero_image_url: null,
      timezone: "",
    };
    const before = structuredClone(draft);
    const result = previewData.buildInvitationTemplatePreviewData("wedding-romantic", draft, {
      title: "Our Celebration",
      event_date: "",
      venue: null,
    });
    assert.deepEqual(draft, before, "render helper never mutates the source draft");
    assert.equal(result.data.partner1Name, "Elena Vance", "empty display fields receive preview-only samples");
    assert.ok(result.sampleFields.includes("partner1Name"), "sample origin is tracked");
    const publish = src("lib/actions/invitation-page.ts");
    assert.ok(!publish.includes("buildInvitationTemplatePreviewData"), "publish does not import preview sample merging");
    assert.ok(publish.includes("published_snapshot"), "publish snapshot remains sourced by its draft action");
  });

  test("candidate render errors use the saved page with a localized notice", () => {
    const frame = src("app/invitation/builder-preview/[eventId]/LivePreviewFrame.tsx");
    assert.ok(frame.includes("CandidatePreviewErrorBoundary"), "candidate render has an error boundary");
    assert.ok(frame.includes("templateId={pageData.savedTemplateId}"), "failure restores the saved page preview");
    assert.ok(frame.includes('t("candidatePreviewFallbackNotice")'), "fallback notice uses the localized string");
    for (const locale of ["en", "fr"]) {
      assert.ok(JSON.parse(src(`messages/${locale}.json`)).Events.candidatePreviewFallbackNotice);
    }
  });

  test("card previews pass host names through the dedicated host mapping", () => {
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes("hostNames: cardHostNames"), "selected card preview receives mapped hosts");
    assert.ok(picker.includes("hostNames: nonEmptyString(draft.host_names)"), "real host names take priority");
    assert.ok(picker.includes('guestName: ""'), "host names are not encoded in the guestName field");
  });

  test("card preview renders hostNames once in its own slot and omits guestName", () => {
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const { InvitationCardRenderer } = require("../../components/invitation/InvitationCardRenderer.tsx");
    const slot = { topPercent: 48, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 26, color: "#ffffff" };
    const template = {
      name: "Test card",
      background_image_url: "",
      layout_config: {
        slots: { eventTitle: { ...slot, topPercent: 27 }, guestName: slot, hostNames: slot, eventMeta: { ...slot, topPercent: 76 } },
        colorPalette: { background: "#09090b", primary: "#ffffff", accent: "#ffffff" },
        typography: { titleFont: "serif", bodyFont: "sans-serif", accentFont: "serif" },
      },
    };
    const markup = renderToStaticMarkup(React.createElement(InvitationCardRenderer, {
      template,
      scale: 0.28,
      data: {
        eventTitle: "Real event title",
        guestName: "Guest only must never appear",
        hostNames: "Host one and host two",
        eventDate: "2030-01-01T18:00:00.000Z",
        venue: "Main hall",
        city: "Lagos",
      },
    }));
    assert.equal((markup.match(/Host one and host two/g) || []).length, 1);
    assert.doesNotMatch(markup, /Guest only must never appear/);
    assert.equal((markup.match(/data-card-slot="host-names"/g) || []).length, 1);
    assert.equal((markup.match(/data-card-slot="event-title"/g) || []).length, 1);
    assert.equal((markup.match(/data-card-slot="event-meta"/g) || []).length, 1);
    assert.match(markup, /font-size:7\.28px/, "slot typography scales with the preview card dimensions");
  });
});

describe("Round 5 step 3: Cover pair, page, and guarded card art", () => {
  test("unified registry pairs cover card + cover page", () => {
    const pair = unified.getUnifiedTemplate("cover@1.0.0");
    assert.ok(pair, "cover pair registered");
    assert.equal(pair.cardSlug, "cover");
    assert.equal(pair.pageId, "cover");
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: "cover", pageId: "cover" }),
      { unifiedId: "cover@1.0.0", isExact: true }
    );
    assert.deepEqual(
      unified.resolveUnifiedPair({ cardSlug: "cover", pageId: null }),
      { unifiedId: "cover@1.0.0", isExact: false }
    );
  });

  test("page registry carries the universal cover template", () => {
    const s = src("components/invitation/templates/registry.ts");
    assert.ok(s.includes('"universal"'), "universal category");
    assert.ok(s.includes('id: "cover"'), "cover page entry");
    assert.ok(s.includes("InvitationTemplateCover"), "cover component wired");
    assert.ok(fs.existsSync(path.join(ROOT, "components/invitation/templates/InvitationTemplateCover.tsx")), "cover file exists");
  });

  test("cover page reuses anchors, shared mode, and the data contract", () => {
    const s = src("components/invitation/templates/InvitationTemplateCover.tsx");
    for (const anchor of ["inv-hero", "inv-story", "inv-details", "inv-schedule", "inv-gallery", "rsvp-section"]) {
      assert.ok(s.includes(`id="${anchor}"`), `anchor ${anchor}`);
    }
    assert.ok(s.includes("SharedNote"), "shared-mode neutral blocks");
    assert.ok(s.includes("InvitationPageData"), "same data contract");
    assert.ok(s.includes("heroImageFocus") || s.includes("heroFocus"), "focus honored");
    assert.ok(s.includes("brightness(0.72)"), "photo darkened without a gradient scrim");
    assert.ok(s.includes("line-clamp-4"), "long-title clamp");
    assert.ok(s.includes("truncate"), "single-line ellipsis for date/venue");
    assert.ok(!s.includes("next/font/google"), "client template does not invoke the Google font loader");
    assert.ok(s.includes('var(--font-sans)'), "uses the app's self-hosted global sans font");
  });

  test("cover hero comes from the PUBLISHED snapshot only (guests never see drafts)", () => {
    const route = src("app/api/invitation/[token]/card.png/route.tsx");
    assert.ok(route.includes("getPublishedInvitationPage"), "snapshot read");
    assert.ok(route.includes("published_snapshot.hero_image_url"), "hero from snapshot");
    assert.ok(route.includes("fetchCoverHeroDataUri"), "guarded fetch");
    assert.ok(!route.includes("draft.hero_image_url") && !route.includes("draft?.hero"), "no draft reads");
  });

  test("hero fetch guards: allowlist, 3s timeout, 5MB cap, palette fallback", () => {
    const s = src("lib/invitation-cover-art.ts");
    assert.ok(s.includes("AbortSignal.timeout(COVER_HERO_FETCH_TIMEOUT_MS)"), "3s budget wired");
    assert.ok(s.includes("total > COVER_HERO_MAX_BYTES"), "5MB cap enforced mid-stream");
    assert.ok(s.includes('startsWith("image/")'), "image content-type required");
    assert.ok(s.includes("redirect: \"manual\""), "redirects re-validated, not followed blindly");
  });

  test("hero allowlist permits project storage, rejects everything else", () => {
    const policy = require("../memories/cover-art-policy.ts");
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
      MEDIA_BASE_URL: "https://media.aldriva.com",
      NEXT_PUBLIC_BASE_URL: "https://aldriva.com",
    };
    const allow = (url) => policy.isAllowedCoverHeroUrl(url, env);
    assert.equal(
      allow("https://xyzcompany.supabase.co/storage/v1/object/public/cms-media/invitation-hero/x.jpg"),
      true
    );
    assert.equal(allow("https://media.aldriva.com/cover/x.jpg"), true);
    assert.equal(allow("https://media.aldriva.com:8443/cover/x.jpg"), false, "unexpected port is not the configured storage host");
    assert.equal(allow("https://aldriva.com/images/cover.jpg"), false, "site origin is not a storage host");
    assert.equal(allow("https://evil.com/x.jpg"), false, "foreign host");
    assert.equal(allow("http://xyzcompany.supabase.co/storage/v1/object/public/cms-media/x.jpg"), false, "http rejected");
    assert.equal(allow("https://xyzcompany.supabase.co/auth/v1/token"), false, "non-storage project path");
    assert.equal(allow("data:image/jpeg;base64,xx"), false, "data URI");
    assert.equal(allow(null), false, "non-string");
    assert.equal(policy.isAllowedCoverHeroUrl("https://xyzcompany.supabase.co/storage/v1/object/public/cms-media/x.jpg", {}), false, "empty env allows nothing");
    assert.equal(policy.COVER_HERO_FETCH_TIMEOUT_MS, 3000);
    assert.equal(policy.COVER_HERO_MAX_BYTES, 5 * 1024 * 1024);
  });

  test("Cover draft save rejects a non-storage host before upsert", () => {
    const action = src("lib/actions/invitation-page.ts");
    const saveAction = action.slice(
      action.indexOf("export async function saveInvitationPageDraft"),
      action.indexOf("export async function publishInvitationPage")
    );
    const guard = saveAction.indexOf("valid.template_id === \"cover\"");
    const upsert = saveAction.indexOf(".upsert(payload");
    assert.ok(guard >= 0 && guard < upsert, "Cover host guard runs before the draft write");
    assert.ok(saveAction.includes("!isAllowedCoverHeroUrl(valid.hero_image_url)"), "uses the fetch allowlist");
    assert.ok(saveAction.includes('error: "coverHeroStorageHostOnly"'), "returns a clear localized error code");

    const policy = require("../memories/cover-art-policy.ts");
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
      MEDIA_BASE_URL: "https://media.aldriva.com",
    };
    assert.equal(policy.isAllowedCoverHeroUrl("https://media.aldriva.com/cover/x.jpg", env), true);
    assert.equal(policy.isAllowedCoverHeroUrl("https://attacker.example/cover/x.jpg", env), false);
  });

  test("cover fetch rejects a disallowed host before making a request", async (t) => {
    const previousMediaBaseUrl = process.env.MEDIA_BASE_URL;
    const previousFetch = globalThis.fetch;
    t.after(() => {
      if (previousMediaBaseUrl === undefined) delete process.env.MEDIA_BASE_URL;
      else process.env.MEDIA_BASE_URL = previousMediaBaseUrl;
      globalThis.fetch = previousFetch;
    });
    process.env.MEDIA_BASE_URL = "https://media.aldriva.test";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("disallowed host reached fetch");
    };

    const { fetchCoverHeroDataUri } = loadCoverArtModule();
    assert.equal(await fetchCoverHeroDataUri("https://attacker.example/cover.jpg"), null);
    assert.equal(calls, 0);
  });

  test("cover fetch enforces timeout, image content type, streaming cap, and manual redirects", async (t) => {
    const previousMediaBaseUrl = process.env.MEDIA_BASE_URL;
    const previousFetch = globalThis.fetch;
    const previousAbortTimeout = AbortSignal.timeout;
    let requestedTimeoutMs = null;
    t.after(() => {
      if (previousMediaBaseUrl === undefined) delete process.env.MEDIA_BASE_URL;
      else process.env.MEDIA_BASE_URL = previousMediaBaseUrl;
      globalThis.fetch = previousFetch;
      AbortSignal.timeout = previousAbortTimeout;
    });
    AbortSignal.timeout = (milliseconds) => {
      requestedTimeoutMs = milliseconds;
      return previousAbortTimeout.call(AbortSignal, milliseconds);
    };
    process.env.MEDIA_BASE_URL = "https://media.aldriva.test";
    const { fetchCoverHeroDataUri } = loadCoverArtModule();
    const policy = require("../memories/cover-art-policy.ts");
    const allowedUrl = "https://media.aldriva.test/invitation-hero/event/cover.jpg";

    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal, "fetch receives a timeout signal");
      assert.equal(policy.COVER_HERO_FETCH_TIMEOUT_MS, 3000);
      throw new DOMException("timed out", "TimeoutError");
    };
    assert.equal(await fetchCoverHeroDataUri(allowedUrl), null, "timeout failure falls back");
    assert.equal(requestedTimeoutMs, 3000, "fetch uses AbortSignal.timeout(3000)");

    globalThis.fetch = async () => new Response("not an image", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    assert.equal(await fetchCoverHeroDataUri(allowedUrl), null, "non-image content type falls back");

    let streamCancelled = false;
    const oversizedBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(policy.COVER_HERO_MAX_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        streamCancelled = true;
      },
    });
    globalThis.fetch = async () => new Response(oversizedBody, {
      headers: { "content-type": "image/jpeg" },
    });
    assert.equal(await fetchCoverHeroDataUri(allowedUrl), null, "oversized stream falls back");
    assert.equal(streamCancelled, true, "oversized stream is cancelled before it is fully read");

    let redirectCalls = 0;
    let redirectMode = "";
    globalThis.fetch = async (_url, options) => {
      redirectCalls += 1;
      redirectMode = options.redirect;
      return new Response(null, {
        status: 302,
        headers: { location: "https://other-storage.aldriva.test/redirected.jpg" },
      });
    };
    assert.equal(await fetchCoverHeroDataUri(allowedUrl), null, "cross-host redirect is rejected");
    assert.equal(redirectMode, "manual", "the runtime never follows the redirect automatically");
    assert.equal(redirectCalls, 1, "redirect target is never fetched");
  });

  test("behavior: follows one allowlisted redirect, then logs palette fallback after a second redirect", async (t) => {
    const previousMediaBaseUrl = process.env.MEDIA_BASE_URL;
    const previousFetch = globalThis.fetch;
    const previousConsoleError = console.error;
    const previousModuleLoad = Module._load;
    const previousTsxLoader = require.extensions[".tsx"];
    const routePath = path.join(ROOT, "app/api/invitation/[token]/card.png/route.tsx");
    const previousRouteModule = require.cache[routePath];
    t.after(() => {
      if (previousMediaBaseUrl === undefined) delete process.env.MEDIA_BASE_URL;
      else process.env.MEDIA_BASE_URL = previousMediaBaseUrl;
      globalThis.fetch = previousFetch;
      console.error = previousConsoleError;
      Module._load = previousModuleLoad;
      if (previousTsxLoader) require.extensions[".tsx"] = previousTsxLoader;
      else delete require.extensions[".tsx"];
      delete require.cache[routePath];
      if (previousRouteModule) require.cache[routePath] = previousRouteModule;
    });

    require.extensions[".tsx"] = function compileTestTsx(module, filename) {
      const source = fs.readFileSync(filename, "utf8");
      const compiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText;
      module._compile(compiled, filename);
    };

    process.env.MEDIA_BASE_URL = "https://media.aldriva.test";
    const allowedUrl = "https://media.aldriva.test/invitation-hero/event/cover.jpg";
    const { fetchCoverHeroDataUri } = loadCoverArtModule();

    let successfulRedirectCalls = 0;
    globalThis.fetch = async (url, options) => {
      successfulRedirectCalls += 1;
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal instanceof AbortSignal);
      if (successfulRedirectCalls === 1) {
        assert.equal(String(url), allowedUrl);
        return new Response(null, {
          status: 302,
          headers: { location: "/invitation-hero/event/rotated.jpg" },
        });
      }
      assert.equal(String(url), "https://media.aldriva.test/invitation-hero/event/rotated.jpg");
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      });
    };

    assert.equal(
      await fetchCoverHeroDataUri(allowedUrl),
      "data:image/png;base64,AQID",
      "the redirected image is returned as a data URI"
    );
    assert.equal(successfulRedirectCalls, 2, "the allowlisted redirect is followed exactly once");

    let fallbackRedirectCalls = 0;
    globalThis.fetch = async (_url, options) => {
      fallbackRedirectCalls += 1;
      assert.equal(options.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { location: `/invitation-hero/event/hop-${fallbackRedirectCalls}.jpg` },
      });
    };

    const loggedErrors = [];
    console.error = (...args) => loggedErrors.push(args.join(" "));
    const routeMocks = new Map([
      ["next/server", { NextResponse: Response }],
      ["next/og", {
        ImageResponse: class extends Response {
          constructor(_element, options = {}) {
            const headers = new Headers(options.headers);
            headers.set("content-type", "image/png");
            super(new Uint8Array([1]), { headers });
          }
        },
      }],
      ["@/lib/invitations", {
        getInvitationByToken: async () => ({
          invitation: {
            events: { id: "event-id", invitation_template_id: "cover", title: "Event" },
            guest_name: "Guest",
            guest_title: null,
            organization: null,
          },
        }),
      }],
      ["@/lib/invitation-templates", {
        getInvitationTemplateById: async () => ({
          id: "cover",
          slug: "cover",
          name: "Cover Story",
          layout_config: {
            slots: {},
            colorPalette: { background: "#101014", primary: "#f5f0e6", accent: "#c2410c" },
            typography: { titleFont: "sans-serif", bodyFont: "sans-serif", accentFont: "sans-serif" },
          },
        }),
      }],
      ["@/lib/invitation-fonts", { loadInvitationFonts: async () => [] }],
      ["@/lib/actions/invitation-page", {
        getPublishedInvitationPage: async () => ({
          published_snapshot: { hero_image_url: allowedUrl },
        }),
      }],
      ["@/lib/invitation-card-utils", {
        formatEventDateTime: () => "Date",
        formatEventLocation: () => "Venue",
        formatGuestDisplayName: () => "Guest",
        getAdaptiveFontSize: () => 24,
        truncateText: (value) => value,
      }],
    ]);
    Module._load = function loadWithRouteStubs(request, parent, isMain) {
      if (routeMocks.has(request)) return routeMocks.get(request);
      return previousModuleLoad.call(this, request, parent, isMain);
    };

    const { GET } = require(routePath);
    const response = await GET(new Request("https://aldriva.test/card.png"), {
      params: Promise.resolve({ token: "a".repeat(64) }),
    });
    assert.equal(fallbackRedirectCalls, 2, "a redirect after the single allowed hop is never fetched");
    assert.equal(response.status, 200, "the card renders using the fallback palette");
    assert.ok(
      loggedErrors.includes("[invitation/card.png] Cover hero unavailable; rendering palette fallback."),
      "the card route logs its palette fallback"
    );
  });

  test("unreachable or disallowed heroes resolve to null (fallback path)", async () => {
    const policy = require("../memories/cover-art-policy.ts");
    // Disallowed hosts never reach the network layer (static pin on the
    // fetch module: the allowlist gate precedes any fetch call).
    assert.equal(policy.isAllowedCoverHeroUrl("https://evil.com/x.jpg", {}), false);
    assert.equal(policy.isAllowedCoverHeroUrl("not a url", {}), false);
    const fetchSrc = fs.readFileSync(path.join(ROOT, "lib/invitation-cover-art.ts"), "utf8");
    assert.ok(fetchSrc.includes("if (!isAllowedCoverHeroUrl(heroUrl)) return null"), "gate precedes fetch");
    assert.ok(fetchSrc.includes("catch {"), "never throws — null on any failure");
    assert.ok(fetchSrc.includes("return null"), "fallback path present");
  });

  test("cover hero uses the processed pipeline (no raw bypass)", () => {
    const hero = src("app/dashboard/events/[id]/invitation-page/builder/sections/HeroSection.tsx");
    assert.ok(hero.includes("InvitationImageUploadField"), "processed uploader only");
    assert.ok(hero.includes('template_id === "cover"'), "cover-scoped empty state");
    assert.ok(hero.includes("coverPhotoTitle"), "empty-state copy key");
    assert.ok(hero.includes('confirmLabel={isCover ? t("coverUseProcessedPhoto") : undefined}'), "Cover does not offer a raw-original action");
    const uploader = src("components/shared/ImageUploader.tsx");
    assert.ok(uploader.includes("normalizeImageFile(file, maxLongEdge)"), "every selection is normalized");
    assert.ok(uploader.includes("renderFinalImage("), "confirmation re-encodes the processed image");
    assert.ok(src("components/invitation/InvitationImageUploadField.tsx").includes("maxLongEdge={1600}"), "Cover upload stays capped at 1600px");
    const schema = src("lib/invitation-page-schema.ts");
    assert.ok(schema.includes("isValidStorageImageUrl"), "storage-URL allowlist enforced at save");
  });

  test("published cover republish changes the versioned card URL; templates share cache headers", () => {
    const { buildInvitationCardImageUrl } = require("../invitation-card-url.ts");
    const token = "a".repeat(64);
    const siteUrl = "https://aldriva.example/";
    const first = buildInvitationCardImageUrl(siteUrl, token, "card-uuid", "2026-10-09T10:00:00.000Z");
    const republished = buildInvitationCardImageUrl(siteUrl, token, "card-uuid", "2026-10-09T11:00:00.000Z");
    const changedCard = buildInvitationCardImageUrl(siteUrl, token, "other-card-uuid", "2026-10-09T10:00:00.000Z");
    assert.match(first, /\/api\/invitation\/a{64}\/card\.png\?v=/);
    assert.notEqual(first, republished, "new published_at creates a fresh cache key");
    assert.notEqual(first, changedCard, "a changed card template creates a fresh cache key");

    const email = src("lib/invitations.ts");
    const page = src("app/invitation/[token]/page.tsx");
    assert.ok(email.includes("buildInvitationCardImageUrl("), "email header uses the shared versioned URL");
    assert.ok(email.includes("publishedPage?.published_at"), "email version follows the published snapshot");
    assert.ok(page.includes("buildInvitationCardImageUrl("), "Open Graph and Twitter metadata use the shared URL");
    assert.ok(page.includes("publishedPage?.published_at"), "link preview version follows the published snapshot");

    const route = src("app/api/invitation/[token]/card.png/route.tsx");
    const cacheHeader = route.match(/"Cache-Control":\s*"([^"]+)"/);
    assert.ok(cacheHeader, "successful card response sets Cache-Control");
    assert.equal(cacheHeader[1], "public, s-maxage=604800, stale-while-revalidate=86400");
    assert.equal((route.match(/"Cache-Control":/g) || []).length, 1, "Cover and other templates share the same cache policy");
    assert.ok(route.includes('backgroundImage: isCoverTemplate\n            ? "none"'), "Cover without a hero uses only the solid palette background");
    assert.ok(route.includes('coverHero || template.background_image_url || ""'), "fetch failures render the solid palette fallback");
    assert.ok(route.includes("Cover hero unavailable; rendering palette fallback."), "Cover fallback failure is logged");
  });

  test("unified picker display names have English and French parity", () => {
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    assert.equal(en.unifiedCoverName, "Cover Story");
    assert.equal(fr.unifiedCoverName, "En couverture");
    assert.equal(en.unifiedRoyalEleganceName, "Aurora");
    assert.equal(fr.unifiedRoyalEleganceName, "Aurore");
    assert.equal(en.unifiedFestiveGoldNoirName, "Confetti");
    assert.equal(fr.unifiedFestiveGoldNoirName, "Confetti");
    assert.equal(en.unifiedGrandGalaNoirName, "Midnight");
    assert.equal(fr.unifiedGrandGalaNoirName, "Minuit");
    assert.equal(en.unifiedModernExecutiveName, "Atelier");
    assert.equal(fr.unifiedModernExecutiveName, "Atelier");
    assert.equal(en.unifiedPickerTitle, "Templates for this invitation type");
    assert.equal(fr.unifiedPickerTitle, "Modèles pour ce type d’invitation");
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes("getUnifiedTemplateNameKey"), "picker resolves localized names from stable ids");
    assert.ok(picker.includes('showAll ? t("unifiedShowMatching") : t("unifiedShowAll")'), "type filter has clear toggle names");
  });

  test("registry is the single source for display names and name keys", () => {
    const { UNIFIED_INVITATION_TEMPLATES, getUnifiedTemplateNameKey } = require(path.join(ROOT, "lib/unified-invitation-templates.ts"));
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    for (const item of UNIFIED_INVITATION_TEMPLATES) {
      assert.ok(item.nameKey, `item ${item.id} defines nameKey`);
      assert.ok(item.name, `item ${item.id} defines English fallback name`);
      assert.equal(getUnifiedTemplateNameKey(item.id), item.nameKey, "id resolves nameKey directly from registry");
      assert.equal(getUnifiedTemplateNameKey(item.baseId), item.nameKey, "baseId resolves nameKey directly from registry");
      assert.equal(getUnifiedTemplateNameKey(item.pageId), item.nameKey, "pageId resolves nameKey directly from registry");
      assert.equal(getUnifiedTemplateNameKey(item.cardSlug), item.nameKey, "cardSlug resolves nameKey directly from registry");
      assert.ok(en[item.nameKey], `EN message exists for ${item.nameKey}`);
      assert.ok(fr[item.nameKey], `FR message exists for ${item.nameKey}`);
    }
  });

  test("page-first picker tiles use a portrait render and one display-name label", () => {
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes('grid grid-cols-1 gap-3 sm:grid-cols-2'), "one column by default, two from sm");
    assert.ok(picker.includes('className="aspect-[3/4] rounded-none border-0"'), "page render is portrait and full width");
    assert.ok(picker.includes('className="flex min-w-0 items-end justify-between gap-2 p-2.5"'), "tile footer keeps the name and inset in separate areas");
    assert.ok(picker.includes('className="block min-w-0 flex-1 whitespace-normal break-words text-sm font-bold text-zinc-900"'), "tile text can use the available width");
    assert.ok(!picker.includes("break-all"), "long words are never split character by character");
    assert.ok(picker.includes("block min-w-0 flex-1 whitespace-normal break-words text-sm font-bold"), "template name wraps");
    assert.ok(!picker.includes("pairDescription"), "tile has no category or description line");
    assert.ok(!picker.includes("sampleLabel"), "sample label is not repeated on tiles");
    assert.equal((picker.match(/invitationPreviewSampleLabel/g) || []).length, 1, "sample label appears once on the selected preview panel");
    assert.ok(!picker.includes("savedLabel"), "name is the sole text label on each tile");
    assert.match(picker, /if \(typeof IntersectionObserver === "undefined"\) \{\s*setIsReady\(true\)/, "non-IO clients mount real renders");
    const cover = src("components/invitation/templates/InvitationTemplateCover.tsx");
    assert.ok(cover.includes('previewMode === "thumbnail" ? "min-h-[520px]" : "min-h-[92svh]"'), "Cover thumbnail fixes the hero viewport to reveal its title/photo");
  });

  test("tile card inset is a portrait crop of its own card template", () => {
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(
      picker.includes("relative aspect-[3/4] w-16 shrink-0") && picker.includes("sm:w-[72px]"),
      "card inset keeps a small standing 3:4 frame"
    );
    assert.ok(picker.includes("aspect-[3/4]"), "card inset uses the portrait aspect class aspect-[3/4]");
    assert.ok(picker.includes("InvitationCardRenderer template={card} data={cardData} scale={0.152}"), "the paired card template defines the inset");
    assert.ok(picker.includes("width: 1200 * 0.152, height: 630 * 0.152"), "the landscape card is center-cropped to fill the portrait frame");
    assert.ok(picker.includes("backgroundImageUrl: pair.baseId === \"cover\" ? nonEmptyString(draft.hero_image_url) : null"), "only Cover uses the event page hero; other cards keep their own artwork");
    assert.ok(picker.includes('className="flex min-w-0 items-end justify-between gap-2 p-2.5"'), "inset sits in the tile footer and cannot cover page date or venue text");
    assert.ok(picker.includes('aria-hidden="true"\n          inert'), "tile card art remains decorative and non-interactive");
  });

  test("custom combination banner uses a localized custom-card fallback when no catalog card resolves", () => {
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    assert.equal(en.unifiedCustomBodyNoCard, "Currently using a custom card with the {page} page.");
    assert.equal(fr.unifiedCustomBodyNoCard, "Utilise actuellement une carte personnalisée avec la page {page}.");
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes('customCardName\n              ? t("unifiedCustomBody"'), "resolved names keep the existing sentence");
    assert.ok(picker.includes(': t("unifiedCustomBodyNoCard", { page:'), "empty names use the custom-card sentence");
    assert.ok(!picker.includes("unifiedNoCard"), "the banner no longer interpolates 'no card'");
    const page = src("app/dashboard/events/[id]/invitation-page/page.tsx");
    assert.ok(page.includes("cardTemplates.find((t) => t.id === cardRowId || t.slug === cardRowId)?.slug ?? null"));
  });

  test("gallery and HEIC copy has English/French parity", () => {
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    const keys = Object.keys(en).filter((key) => key.startsWith("invitationGallery") || key === "invitationHeicUnsupported");
    assert.equal(keys.length, 11, "all new gallery and HEIC messages are present");
    for (const key of keys) {
      assert.equal(typeof fr[key], "string", `French translation exists for ${key}`);
      assert.ok(fr[key].length > 0, `French translation is non-empty for ${key}`);
    }
  });

  test("card text fit reuses truncate bounds; 60-char titles survive intact", () => {
    const utils = require("../invitation-card-utils.ts");
    const sixty = "A".repeat(60);
    assert.ok(utils.truncateText(sixty, 60).length <= 60, "60-char title not mangled");
    assert.ok(utils.truncateText("A".repeat(200), 60).length <= 63, "long titles ellipsized");
    const route = src("app/api/invitation/[token]/card.png/route.tsx");
    assert.ok(route.includes("truncateText(eventTitle, 60)"), "title bound reused");
    assert.ok(route.includes("getAdaptiveFontSize(eventTitle"), "adaptive sizing reused");
  });
});
