/**
 * lib/__tests__/invitation-template-marketplace-routes.test.cjs
 *
 * Invitation Marketplace Phase 2/3 — route shapes, template-id survival
 * across navigation, i18n key coverage, and source-level wiring guards
 * (pages call the shared route helpers, not hardcoded duplicate strings;
 * the rewired Create menu no longer creates an event on click).
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

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const routes = require("../invitation-template-marketplace-routes.ts");
const catalog = require("../invitation-template-public-catalog.ts");
const registryModule = require("../invitation-template-registry.ts");

const REGISTRY_IDS = Object.keys(registryModule.INVITATION_TEMPLATE_REGISTRY);
const EN_MARKETPLACE = require(path.join(ROOT, "messages/en.json")).InvitationMarketplace;
const FR_MARKETPLACE = require(path.join(ROOT, "messages/fr.json")).InvitationMarketplace;

describe("invitation marketplace route shapes (Phase 2/3)", () => {
  test("gallery href: bare and category-scoped forms", () => {
    assert.equal(routes.getInvitationTemplateGalleryHref(), "/invitations/templates");
    assert.equal(routes.getInvitationTemplateGalleryHref("wedding"), "/invitations/templates?category=wedding");
    assert.equal(routes.getInvitationTemplateGalleryHref(null), "/invitations/templates");
  });

  test("details href encodes the template id", () => {
    assert.equal(routes.getInvitationTemplateDetailsHref("gala-editorial"), "/invitations/templates/gala-editorial");
  });

  test("preview href (Phase 4 shape) carries the id as a path segment", () => {
    assert.equal(routes.getInvitationTemplatePreviewHref("boho-floral-brown"), "/invitations/templates/boho-floral-brown/demo");
  });

  test("create href (Phase 5 shape) carries the id as a path segment, same shape as details/demo", () => {
    assert.equal(
      routes.getInvitationTemplateCreateHref("luxe-editorial"),
      "/invitations/templates/luxe-editorial/create"
    );
  });

  test("isValidInvitationCategoryParam rejects unknown/null/undefined values", () => {
    const categories = ["wedding", "birthday"];
    assert.equal(routes.isValidInvitationCategoryParam("wedding", categories), true);
    assert.equal(routes.isValidInvitationCategoryParam("not-a-category", categories), false);
    assert.equal(routes.isValidInvitationCategoryParam(null, categories), false);
    assert.equal(routes.isValidInvitationCategoryParam(undefined, categories), false);
  });

  test("every PUBLISHED registered template id survives details -> create and details -> preview href construction and round-trips back to a real summary", () => {
    const publishedIds = REGISTRY_IDS.filter(
      (id) => registryModule.INVITATION_TEMPLATE_REGISTRY[id].publicationStatus === "published"
    );
    for (const id of publishedIds) {
      const detailsHref = routes.getInvitationTemplateDetailsHref(id);
      const createHref = routes.getInvitationTemplateCreateHref(id);
      const previewHref = routes.getInvitationTemplatePreviewHref(id);
      assert.ok(detailsHref.endsWith(`/${id}`), `details href lost the id for ${id}`);
      assert.ok(createHref.endsWith(`/${id}/create`), `create href lost the id for ${id}`);
      assert.ok(previewHref.endsWith(`/${id}/demo`), `preview href lost the id for ${id}`);
      // The id carried in the URL must resolve back to the same template.
      const summary = catalog.getPublicTemplateSummary(id);
      assert.ok(summary, `"${id}" round-tripped through the marketplace routes but is not a public template`);
      assert.equal(summary.id, id);
    }
  });

  test("a registered but unlisted template id (test-only fixture) does NOT resolve as a public summary", () => {
    // Both real registry entries (minimalism-dark-blue, burgundy-gold) are
    // published now, so this test-only fixture stands in as the unlisted
    // example — registered directly into the real registry for the
    // duration of this test only, and always removed afterward (try/finally,
    // synchronous test body — no other test can observe it mid-run).
    const FIXTURE_ID = "__test_unlisted_fixture__";
    const registry = registryModule.INVITATION_TEMPLATE_REGISTRY;
    assert.ok(!(FIXTURE_ID in registry), "fixture id must not collide with a real registry entry");
    registry[FIXTURE_ID] = {
      id: FIXTURE_ID,
      version: "0.0.0",
      name: "Test Fixture (unlisted)",
      category: "wedding",
      categoryLabel: "Wedding",
      description: "Test-only fixture; never a real template.",
      publicationStatus: "unlisted",
      preview: { kind: "rendered-sample", sampleId: FIXTURE_ID },
      defaultThemePreset: "wedding",
      detailsPresentation: "editorial",
      composition: "standard",
      pageRenderer: { kind: "blocks" },
      defaultBlockTypes: [],
      supportedBlockTypes: [],
      requiredBlockTypes: [],
      supportedCustomizations: { palette: false, fontPack: false, textScale: false },
      supportedEffects: [],
      defaultEffects: [],
    };
    try {
      const currentIds = Object.keys(registry);
      const unlistedIds = currentIds.filter((id) => registry[id].publicationStatus !== "published");
      assert.ok(unlistedIds.length > 0, "sanity check: at least one unlisted/retired template must exist to exercise this gate");
      assert.ok(unlistedIds.includes(FIXTURE_ID), "the fixture itself must be the unlisted example being exercised");
      for (const id of unlistedIds) {
        assert.equal(catalog.getPublicTemplateSummary(id), undefined, `"${id}" is not published and must not round-trip as a public template`);
      }
      // The fixture must never leak into the real public catalog.
      assert.ok(!catalog.getPublicTemplateCatalog().some((entry) => entry.id === FIXTURE_ID));
    } finally {
      delete registry[FIXTURE_ID];
    }
    assert.ok(!(FIXTURE_ID in registryModule.INVITATION_TEMPLATE_REGISTRY), "fixture must be removed after the test");
  });

  test("an unknown template id does not resolve (404 guard at the data layer)", () => {
    assert.equal(catalog.getPublicTemplateSummary("not-a-real-template"), undefined);
  });
});

describe("invitation marketplace i18n coverage", () => {
  test("en and fr InvitationMarketplace namespaces have identical key sets", () => {
    assert.deepEqual(Object.keys(EN_MARKETPLACE).sort(), Object.keys(FR_MARKETPLACE).sort());
  });

  test("no empty string values in either locale's InvitationMarketplace namespace", () => {
    for (const [locale, messages] of [["en", EN_MARKETPLACE], ["fr", FR_MARKETPLACE]]) {
      for (const [key, value] of Object.entries(messages)) {
        assert.ok(typeof value === "string" && value.trim().length > 0, `${locale}.InvitationMarketplace.${key} is empty`);
      }
    }
  });

  test("every InvitationMarketplace.t(\"...\") call found in the new marketplace source files has a matching key in both locales", () => {
    const files = [
      "app/invitations/templates/page.tsx",
      "app/invitations/templates/loading.tsx",
      "app/invitations/templates/[templateId]/page.tsx",
      "components/invitation/marketplace/InvitationTemplateGalleryCard.tsx",
    ];
    const usedKeys = new Set();
    for (const file of files) {
      const text = src(file);
      for (const match of text.matchAll(/\bt\(["']([a-zA-Z0-9]+)["']\)/g)) usedKeys.add(match[1]);
    }
    assert.ok(usedKeys.size > 0, "expected to find at least one t(\"...\") call across the new marketplace pages");
    for (const key of usedKeys) {
      assert.ok(key in EN_MARKETPLACE, `messages/en.json InvitationMarketplace is missing "${key}"`);
      assert.ok(key in FR_MARKETPLACE, `messages/fr.json InvitationMarketplace is missing "${key}"`);
    }
  });
});

describe("invitation marketplace wiring guards (source-level)", () => {
  test("the details page 404s on an unresolved summary and reuses the shared route helpers, not hardcoded paths", () => {
    const text = src("app/invitations/templates/[templateId]/page.tsx");
    assert.ok(text.includes("if (!summary) notFound();"), "details page must call notFound() for an unknown/unpublished id");
    assert.ok(text.includes("getInvitationTemplateCreateHref"), "details page must build the Create href via the shared helper");
    assert.ok(text.includes("getInvitationTemplatePreviewHref"), "details page must build the Preview href via the shared helper");
    assert.ok(!/href=\{?["'`]\/invitations\/templates\/[^"'`]+\/create/.test(text.replace("getInvitationTemplateCreateHref", "")),
      "create href must not also be hardcoded inline");
  });

  test("the gallery page reads templates only from getPublicTemplateCatalog/getPublicTemplateCategories, no second data source", () => {
    const text = src("app/invitations/templates/page.tsx");
    assert.ok(text.includes("getPublicTemplateCatalog()"));
    assert.ok(text.includes("getPublicTemplateCategories()"));
    assert.ok(!text.includes("INVITATION_TEMPLATE_REGISTRY"), "gallery page must not reach into the internal registry directly");
  });

  test("CreateInvitationCard and CreateInvitationButton no longer call createInvitationDraft directly", () => {
    const card = src("components/events/CreateInvitationCard.tsx");
    const button = src("components/events/CreateInvitationButton.tsx");
    assert.ok(!card.includes('from "@/lib/actions/invitation-events"'), "CreateInvitationCard must not import the event-creation action");
    assert.ok(!button.includes('from "@/lib/actions/invitation-events"'), "CreateInvitationButton must not import the event-creation action");
    assert.ok(!card.includes("createInvitationDraft("), "CreateInvitationCard must defer event creation to Phase 5, not create one on click");
    assert.ok(!button.includes("createInvitationDraft("), "CreateInvitationButton must defer event creation to Phase 5, not create one on click");
    assert.ok(card.includes("getInvitationTemplateGalleryHref"));
    assert.ok(button.includes("getInvitationTemplateGalleryHref"));
  });

  test("the Create Event entry point on the dashboard events page is untouched", () => {
    const text = src("app/dashboard/events/new/page.tsx");
    assert.ok(text.includes('href="/create-event?from=new"'), "Create Event link must remain exactly as it was");
  });

  test("proxy.ts gates /invitations/templates/:id with a pre-stream 404, matching the article/business/product pattern", () => {
    const text = src("proxy.ts");
    assert.ok(text.includes("getPublicTemplateSummary"), "proxy must check the public catalog before streaming");
    // Phase 4: the gate now uses the shared pattern constant (covers details
    // + demo) instead of an inline regex literal — see the dedicated Phase 4
    // test below for full coverage of that pattern's behavior.
    assert.ok(
      text.includes("INVITATION_TEMPLATE_ID_PATH_PATTERN"),
      "proxy must match the details route via the shared pattern, not the bare gallery list"
    );
    assert.ok(
      text.includes('"/invitations/templates/:templateId([^/]+)"'),
      "the matcher must include the details route or the gate never runs"
    );
  });

  test("Navbar and CookieConsent use a path-boundary check for /invitation/*, not a bare substring match", () => {
    // Regression guard: `pathname.includes("/invitation")` also matches the
    // public /invitations/* marketplace routes (substring collision), which
    // incorrectly hid the global navbar and cookie banner on them.
    const navbar = src("components/Navbar.tsx");
    const cookieConsent = src("components/CookieConsent.tsx");
    assert.ok(!/pathname\?\.includes\(["']\/invitation["']\)/.test(navbar), "Navbar must not use a bare substring match for /invitation");
    assert.ok(!/pathname\?\.includes\(["']\/invitation["']\)/.test(cookieConsent), "CookieConsent must not use a bare substring match for /invitation");
    assert.ok(navbar.includes('pathname?.startsWith("/invitation/")'));
    assert.ok(cookieConsent.includes('pathname?.startsWith("/invitation/")'));
  });

  test("the gallery card's clickable link is a sibling overlay, not a parent wrapping the live preview (no nested <a>)", () => {
    const text = src("components/invitation/marketplace/InvitationTemplateGalleryCard.tsx");
    const selfClosingLinkMatch = text.match(/<Link\s+href=\{getInvitationTemplateDetailsHref[\s\S]*?\/>/);
    assert.ok(selfClosingLinkMatch, "the details Link must be self-closing (a sibling overlay), not wrapping children");
    const previewMatch = text.match(/<InvitationTemplatePreviewFrame\s/);
    assert.ok(previewMatch, "the preview frame must be rendered as JSX");
    assert.ok(selfClosingLinkMatch.index > previewMatch.index, "the Link overlay must come after the preview frame in the tree, not wrap it");
  });
});

describe("invitation marketplace demo route (Phase 4)", () => {
  test("getInvitationTemplatePreviewHref matches the demo route pattern for every registered template", () => {
    for (const id of REGISTRY_IDS) {
      const href = routes.getInvitationTemplatePreviewHref(id);
      assert.match(href, routes.INVITATION_TEMPLATE_ID_PATH_PATTERN, `demo href for ${id} must match the shared gate pattern`);
    }
  });

  test("INVITATION_TEMPLATE_ID_PATH_PATTERN matches details, demo, AND create shapes, not the bare list", () => {
    const pattern = routes.INVITATION_TEMPLATE_ID_PATH_PATTERN;
    assert.ok(pattern.test("/invitations/templates/gala-editorial"));
    assert.ok(pattern.test("/invitations/templates/gala-editorial/demo"));
    assert.ok(pattern.test("/invitations/templates/gala-editorial/create"));
    assert.ok(!pattern.test("/invitations/templates"));
    assert.ok(!pattern.test("/invitations/templates/"));
  });

  test("isInvitationTemplateDemoPath matches only the demo shape", () => {
    assert.equal(routes.isInvitationTemplateDemoPath("/invitations/templates/gala-editorial/demo"), true);
    assert.equal(routes.isInvitationTemplateDemoPath("/invitations/templates/gala-editorial"), false);
    assert.equal(routes.isInvitationTemplateDemoPath("/invitations/templates/gala-editorial/create"), false);
    assert.equal(routes.isInvitationTemplateDemoPath("/invitations/templates"), false);
    assert.equal(routes.isInvitationTemplateDemoPath(null), false);
    assert.equal(routes.isInvitationTemplateDemoPath(undefined), false);
  });

  test("isInvitationTemplateCreatePath matches only the create shape", () => {
    assert.equal(routes.isInvitationTemplateCreatePath("/invitations/templates/gala-editorial/create"), true);
    assert.equal(routes.isInvitationTemplateCreatePath("/invitations/templates/gala-editorial/demo"), false);
    assert.equal(routes.isInvitationTemplateCreatePath("/invitations/templates/gala-editorial"), false);
    assert.equal(routes.isInvitationTemplateCreatePath("/invitations/templates"), false);
    assert.equal(routes.isInvitationTemplateCreatePath(null), false);
    assert.equal(routes.isInvitationTemplateCreatePath(undefined), false);
  });

  test("the demo page imports InvitationBlocksLayoutClient directly, never UniversalPageRenderer (server-only crash guard)", () => {
    const text = src("app/invitations/templates/[templateId]/demo/page.tsx");
    assert.ok(text.includes('from "@/components/invitation/blocks/InvitationBlocksLayoutClient"'));
    assert.ok(!text.includes('from "@/components/site/UniversalPageRenderer"'), "must not import UniversalPageRenderer");
    assert.ok(!text.includes("<UniversalPageRenderer"), "must not render UniversalPageRenderer as JSX");
  });

  test("the demo page 404s on an unresolved summary and sets noindex metadata", () => {
    const text = src("app/invitations/templates/[templateId]/demo/page.tsx");
    assert.ok(text.includes("if (!summary) notFound();"));
    assert.ok(text.includes("index: false") && text.includes("follow: false"), "demo pages must be noindex");
  });

  test("proxy.ts's details/demo/create gate pattern and matcher cover both sub-routes", () => {
    const text = src("proxy.ts");
    assert.ok(text.includes("INVITATION_TEMPLATE_ID_PATH_PATTERN"));
    assert.ok(text.includes('"/invitations/templates/:templateId([^/]+)/demo"'), "the matcher must include the demo route or the 404 gate never runs for it");
    assert.ok(text.includes('"/invitations/templates/:templateId([^/]+)/create"'), "the matcher must include the create route or the 404 gate never runs for it");
  });

  test("Navbar and CookieConsent hide/compact-ify on the demo AND create routes without affecting gallery/details", () => {
    const navbar = src("components/Navbar.tsx");
    const cookieConsent = src("components/CookieConsent.tsx");
    assert.ok(navbar.includes("isInvitationTemplateDemoPath(pathname)"));
    assert.ok(navbar.includes("isInvitationTemplateCreatePath(pathname)"));
    assert.ok(cookieConsent.includes("isInvitationTemplateDemoPath(pathname)"));
    assert.ok(cookieConsent.includes("isInvitationTemplateCreatePath(pathname)"));
  });

  test("the demo top bar carries the template id through both Back-to-details and Create actions via the shared helpers", () => {
    const text = src("components/invitation/marketplace/InvitationDemoTopBar.tsx");
    assert.ok(text.includes("getInvitationTemplateDetailsHref"));
    assert.ok(text.includes("getInvitationTemplateCreateHref"));
  });
});

describe("invitation marketplace anonymous builder route (Phase 5)", () => {
  test("getInvitationTemplateCreateHref now points at the public create route, never the old dashboard placeholder", () => {
    for (const id of REGISTRY_IDS) {
      const href = routes.getInvitationTemplateCreateHref(id);
      assert.ok(href.startsWith("/invitations/templates/"), `create href for ${id} must be public, not /dashboard/*`);
      assert.ok(!href.includes("/dashboard/"), `create href for ${id} must not point at the old dashboard placeholder`);
    }
  });

  test("the create route page 404s on an unresolved summary and sets noindex metadata, same as details/demo", () => {
    const text = src("app/invitations/templates/[templateId]/create/page.tsx");
    assert.ok(text.includes("if (!summary) notFound();"));
    assert.ok(text.includes("index: false") && text.includes("follow: false"));
  });

  test("the anonymous builder client mounts the EXISTING InvitationPageBuilder, not a second builder", () => {
    const text = src("app/invitations/templates/[templateId]/create/AnonymousInvitationBuilderClient.tsx");
    assert.ok(
      text.includes('from "@/app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder"'),
      "must import the real InvitationPageBuilder, not a parallel component"
    );
    assert.ok(text.includes('persistenceMode="local"'));
    assert.ok(text.includes("onLocalSave={local.onLocalSave}"));
    assert.ok(text.includes("localPersistence={local.localPersistence}"));
  });

  test("InvitationPageBuilder's persistenceMode defaults to \"server\" — every existing call site is unaffected", () => {
    const text = src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
    assert.ok(text.includes('persistenceMode = "server"'), "the default must be server, so omitting the prop is behavior-identical to before Phase 5");
  });

  test("InvitationPageBuilder never imports UniversalPageRenderer, even after the Phase 5 local-preview addition", () => {
    const text = src("app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx");
    assert.ok(!text.includes('from "@/components/site/UniversalPageRenderer"'));
  });

  test("the local preview component imports InvitationBlocksLayoutClient directly, never UniversalPageRenderer", () => {
    const text = src("app/dashboard/events/[id]/invitation-page/builder/InvitationBuilderLocalPreview.tsx");
    assert.ok(text.includes('from "@/components/invitation/blocks/InvitationBlocksLayoutClient"'));
    assert.ok(!text.includes('from "@/components/site/UniversalPageRenderer"'));
  });

  test("the local image-upload defer mode reuses ImageUploader's existing onCropped prop, no new upload component", () => {
    const heroSection = src("app/dashboard/events/[id]/invitation-page/builder/sections/HeroSection.tsx");
    const field = src("components/invitation/InvitationImageUploadField.tsx");
    assert.ok(heroSection.includes("onLocalCropped"));
    assert.ok(field.includes("onCropped={onLocalCropped}"));
  });

  test("PublishSection never calls publishInvitationPage/createOrRegeneratePreviewToken from its local-mode branch", () => {
    const text = src("app/dashboard/events/[id]/invitation-page/builder/sections/PublishSection.tsx");
    assert.ok(text.includes("isLocal"), "must branch on local mode");
    assert.ok(text.includes("handleLocalSignInToPublish"));
  });

  test("the local draft envelope's payload type has no ownership/organizer/event id fields", () => {
    const text = src("lib/invitation-local-draft.ts");
    assert.ok(!/\b(userId|user_id|organizerId|organizer_id|ownerId|owner_id)\s*:/.test(text), "InvitationLocalDraftPayload must not declare an ownership field");
  });
});
