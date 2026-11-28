/**
 * lib/__tests__/minimalism-dark-blue-stage7a.test.cjs
 *
 * Stage 7a behaviour proof:
 * 1. minimalism-dark-blue is listed by the public "Invitation templates"
 *    catalog (getPublicTemplateCatalog / getPublicTemplateSummary), and the
 *    published registry list includes it.
 * 2. getTemplateById never returns undefined or throws, even when the
 *    published list did not contain the requested id.
 * 3. A saved invitation whose template id no longer exists resolves to
 *    minimalism-dark-blue: it gets that page's real renderer and a non-empty
 *    block layout instead of a blank page.
 * 4. The template stays page-only: its unified pair has no card (cardSlug
 *    null), the picker renders no card inset for page-only pairs, the page
 *    folder imports no card renderer, and the page's own click-to-open cover
 *    gate is still present.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test, describe } = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  INVITATION_TEMPLATES,
  BUILDER_INVITATION_TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
} = require(path.join(ROOT, "components/invitation/templates/registry.ts"));
const {
  getPublicTemplateCatalog,
  getPublicTemplateSummary,
} = require(path.join(ROOT, "lib/invitation-template-public-catalog.ts"));
const {
  DEFAULT_INVITATION_TEMPLATE_ID,
  getInvitationTemplateDefinition,
  resolveInvitationTemplateId,
} = require(path.join(ROOT, "lib/invitation-template-registry.ts"));
const {
  legacyInvitationTemplateToLayout,
  legacyInvitationSnapshotToLayout,
} = require(path.join(ROOT, "lib/invitation-page-layout.ts"));
const { UNIFIED_INVITATION_TEMPLATES } = require(path.join(ROOT, "lib/unified-invitation-templates.ts"));

const ID = "minimalism-dark-blue";

describe("Invitation templates catalog", () => {
  test("lists minimalism-dark-blue for the public gallery", () => {
    const catalog = getPublicTemplateCatalog();
    const entry = catalog.find((template) => template.id === ID);
    assert.ok(entry, "catalog must include minimalism-dark-blue");
    assert.equal(entry.name, "Minimalism Dark Blue");
    assert.equal(entry.category, "wedding");
    assert.equal(entry.preview.kind, "rendered-sample");
    assert.deepEqual(getPublicTemplateSummary(ID), entry);
  });

  test("published registry list used by the picker includes it", () => {
    assert.ok(INVITATION_TEMPLATES.some((template) => template.id === ID));
    assert.ok(BUILDER_INVITATION_TEMPLATES.some((template) => template.id === ID));
    assert.ok(getTemplatesByCategory("wedding").some((template) => template.id === ID));
  });
});

describe("getTemplateById fallback safety", () => {
  test("known id resolves", () => {
    assert.equal(getTemplateById(ID).id, ID);
  });

  test("unknown and empty ids return a complete catalog entry, never undefined", () => {
    for (const id of ["removed-legacy-template", "", "gala-editorial-retired"]) {
      const entry = getTemplateById(id);
      assert.ok(entry, `getTemplateById(${JSON.stringify(id)}) must not return undefined`);
      assert.equal(typeof entry.id, "string");
      assert.ok(entry.id.length > 0);
      assert.equal(typeof entry.name, "string");
      assert.equal(typeof entry.category, "string");
      assert.equal(typeof entry.categoryLabel, "string");
      assert.equal(typeof entry.description, "string");
    }
  });
});

describe("legacy template_id falls back to minimalism-dark-blue", () => {
  test("unknown saved ids resolve to the default page template", () => {
    assert.equal(resolveInvitationTemplateId("legacy-wedding-classic"), DEFAULT_INVITATION_TEMPLATE_ID);
    assert.equal(resolveInvitationTemplateId("removed-template-id"), "minimalism-dark-blue");
    assert.equal(getInvitationTemplateDefinition("removed-template-id"), undefined, "fixture: id is not registered");
  });

  test("registered templates keep their own id", () => {
    assert.equal(resolveInvitationTemplateId(ID), ID);
    assert.equal(resolveInvitationTemplateId("evergreen-envelope"), "evergreen-envelope");
  });

  test("a legacy snapshot renders the minimalism page, not a blank page", () => {
    const fallbackLayout = legacyInvitationTemplateToLayout("legacy-wedding-classic");
    const freshLayout = legacyInvitationTemplateToLayout(ID);
    assert.ok(fallbackLayout.layout_blocks.length > 0, "fallback layout must contain real blocks");
    assert.deepEqual(
      fallbackLayout.layout_blocks.map((block) => block.type),
      freshLayout.layout_blocks.map((block) => block.type),
      "fallback layout is the minimalism page composition"
    );
    assert.ok(
      fallbackLayout.layout_blocks.some((block) => block.type === "interactive_envelope"),
      "the fallback keeps the page's own opening screen"
    );

    const definition = getInvitationTemplateDefinition(resolveInvitationTemplateId("legacy-wedding-classic"));
    assert.deepEqual(definition.pageRenderer, { kind: "custom", componentId: ID });

    const publishedSnapshotFallback = legacyInvitationSnapshotToLayout({
      template_id: "legacy-wedding-classic",
      blocks_layout: null,
    });
    assert.ok(publishedSnapshotFallback.layout_blocks.length > 0);
  });
});

describe("page-only: no separate card or envelope", () => {
  test("the unified pair has no card slug", () => {
    const pair = UNIFIED_INVITATION_TEMPLATES.find((template) => template.pageId === ID);
    assert.ok(pair, "unified pair registered");
    assert.equal(pair.cardSlug, null, "page-only pair must not point at a card template");
  });

  test("the picker renders the card inset only when a card exists", () => {
    const picker = src("components/invitation/UnifiedTemplatePicker.tsx");
    assert.ok(picker.includes("{card ? ("), "card inset is conditional on a real card");
    assert.ok(!picker.includes("{pageReady && card ? ("), "page-only tiles no longer render an empty card frame");
    assert.ok(picker.includes("selectedCard ? ([\"page\", \"card\"] as const)"), "card tab only appears for paired cards");
  });

  test("the template folder imports no card renderer", () => {
    const folder = path.join(ROOT, "components/invitation/templates/minimalism-dark-blue");
    for (const file of fs.readdirSync(folder)) {
      const text = fs.readFileSync(path.join(folder, file), "utf8");
      assert.ok(!text.includes("InvitationCardRenderer"), `${file} must not reference the invitation card renderer`);
      assert.ok(!/from ["'][^"']*envelope/i.test(text), `${file} must not import a separate envelope component`);
    }
  });

  test("the page's own click-to-open opening screen is still present", () => {
    const page = src("components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx");
    assert.ok(page.includes("const handleOpenClick"), "open handler kept");
    assert.ok(page.includes('t("minimalismOpenButton")'), "Open button kept");
    assert.ok(page.includes('block.type === "interactive_envelope"'), "page reads its own gate block");
    assert.ok(page.includes("data-minimalism-page"), "page marker kept");
  });
});
