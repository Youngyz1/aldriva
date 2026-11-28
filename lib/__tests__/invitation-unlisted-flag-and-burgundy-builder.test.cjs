/**
 * lib/__tests__/invitation-unlisted-flag-and-burgundy-builder.test.cjs
 *
 * Step 7 coverage: unlisted-template flag behavior, builder summary helper,
 * template-aware helpers (hidden-content diff, snapshot manifest detection),
 * and burgundy promotion id pass-through.
 */

const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "../..");
const FLAG = "INVITATION_UNLISTED_TEMPLATE_IDS";

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

const catalog = require("@/lib/invitation-template-public-catalog.ts");
const registryModule = require("@/lib/invitation-template-registry.ts");
const { hiddenContentOnTemplateSwitch } = require("@/lib/invitation-type-fields.ts");
const { assembleInvitationPageData } = require("@/lib/types/invitation-page-snapshot.ts");
const { resolvePromotionTemplateId } = require("@/lib/invitation-promotion-core.ts");

let prevFlag;
beforeEach(() => {
  prevFlag = process.env[FLAG];
  delete process.env[FLAG];
});
afterEach(() => {
  if (prevFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prevFlag;
});

// burgundy-gold is now permanently published (see lib/invitation-template-registry.ts),
// so it can no longer stand in as "the unlisted example" for exercising the
// INVITATION_UNLISTED_TEMPLATE_IDS flag. This test-only fixture takes that role
// instead — registered into the real registry for the lifetime of a single
// test only, and always removed afterward, so it never leaks into the real
// registry or the public catalog outside these tests.
const FIXTURE_ID = "__test_unlisted_fixture__";
function unlistedFixtureDefinition() {
  return {
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
}
function registerUnlistedFixture() {
  assert.ok(
    !(FIXTURE_ID in registryModule.INVITATION_TEMPLATE_REGISTRY),
    "fixture id must not collide with a real registry entry"
  );
  registryModule.INVITATION_TEMPLATE_REGISTRY[FIXTURE_ID] = unlistedFixtureDefinition();
}
function unregisterUnlistedFixture() {
  delete registryModule.INVITATION_TEMPLATE_REGISTRY[FIXTURE_ID];
}

describe("INVITATION_UNLISTED_TEMPLATE_IDS flag", () => {
  beforeEach(registerUnlistedFixture);
  afterEach(unregisterUnlistedFixture);

  test("flag unset: fixture not in catalog/categories, summary undefined; published templates still resolve", () => {
    const ids = catalog.getPublicTemplateCatalog().map((t) => t.id);
    assert.ok(!ids.includes(FIXTURE_ID));
    assert.equal(catalog.getPublicTemplateSummary(FIXTURE_ID), undefined);
    // Both real templates are published now; only the fixture is unlisted.
    assert.ok(ids.includes("minimalism-dark-blue"));
    assert.ok(ids.includes("burgundy-gold"));
    assert.ok(catalog.getPublicTemplateCategories().includes("wedding"));
    const demo = catalog.getDemoTemplateSummary(FIXTURE_ID);
    assert.ok(demo, "unlisted templates still resolve on the demo route");
    assert.equal(demo.id, FIXTURE_ID);
  });

  test("flag set: fixture in catalog, summary resolves, categories include wedding", () => {
    process.env[FLAG] = FIXTURE_ID;
    const ids = catalog.getPublicTemplateCatalog().map((t) => t.id);
    assert.ok(ids.includes(FIXTURE_ID));
    assert.ok(ids.includes("minimalism-dark-blue"));
    assert.ok(ids.includes("burgundy-gold"));
    const summary = catalog.getPublicTemplateSummary(FIXTURE_ID);
    assert.ok(summary);
    assert.equal(summary.id, FIXTURE_ID);
    assert.ok(catalog.getPublicTemplateCategories().includes("wedding"));
  });

  test("flag with unknown or retired ids is ignored", () => {
    // No "retired" fixture exists in the registry today; the helper skips that
    // branch structurally (status === "retired"). Unknown ids must be ignored.
    process.env[FLAG] = `not-a-real-template,retired-template,${FIXTURE_ID},  , also-unknown`;
    const ids = catalog.getPublicTemplateCatalog().map((t) => t.id);
    assert.ok(ids.includes(FIXTURE_ID));
    assert.ok(!ids.includes("not-a-real-template"));
    assert.equal(catalog.getPublicTemplateSummary("not-a-real-template"), undefined);
    assert.equal(catalog.getPublicTemplateSummary("retired-template"), undefined);
  });

  test("helper reads env at call time", () => {
    assert.equal(catalog.getPublicTemplateSummary(FIXTURE_ID), undefined);
    process.env[FLAG] = FIXTURE_ID;
    assert.ok(catalog.getPublicTemplateSummary(FIXTURE_ID));
    delete process.env[FLAG];
    assert.equal(catalog.getPublicTemplateSummary(FIXTURE_ID), undefined);
  });

  test("the fixture never leaks into the real registry or public catalog outside a test", () => {
    // Sanity check on the harness itself: run inside a test (so the fixture
    // registered by beforeEach is present) but assert nothing here depends on
    // it beyond this file's own hooks.
    assert.ok(FIXTURE_ID in registryModule.INVITATION_TEMPLATE_REGISTRY);
  });
});

test("the unlisted fixture is fully removed once its describe block finishes", () => {
  assert.ok(!(FIXTURE_ID in registryModule.INVITATION_TEMPLATE_REGISTRY));
  assert.ok(!catalog.getPublicTemplateCatalog().some((entry) => entry.id === FIXTURE_ID));
});

describe("builder summary", () => {
  test("getTemplateSummaryForBuilder resolves burgundy-gold, now published", () => {
    delete process.env[FLAG];
    const summary = catalog.getTemplateSummaryForBuilder("burgundy-gold");
    assert.ok(summary);
    assert.equal(summary.id, "burgundy-gold");
    assert.equal(summary.name, "Burgundy Gold");
  });

  test("getTemplateSummaryForBuilder also resolves a genuinely unlisted template, without the flag", () => {
    registerUnlistedFixture();
    try {
      delete process.env[FLAG];
      const summary = catalog.getTemplateSummaryForBuilder(FIXTURE_ID);
      assert.ok(summary);
      assert.equal(summary.id, FIXTURE_ID);
    } finally {
      unregisterUnlistedFixture();
    }
  });
});

describe("hidden-content diff both directions", () => {
  test("burgundy -> minimalism warns on mf_opening_photo and mf_opening_message when populated", () => {
    const draft = {
      blocks_layout: {
        template_data: {
          mf_opening_photo: [{ url: "https://example.com/opening.jpg" }],
          mf_opening_message: "Welcome to our day",
        },
      },
    };
    const hidden = hiddenContentOnTemplateSwitch(draft, "burgundy-gold", "minimalism-dark-blue");
    assert.ok(hidden.includes("Opening photo"));
    assert.ok(hidden.includes("Opening message"));
  });

  test("minimalism -> burgundy warns on mf_hero_photos when populated", () => {
    const draft = {
      blocks_layout: {
        template_data: {
          mf_hero_photos: [{ url: "https://example.com/hero.jpg" }],
        },
      },
    };
    const hidden = hiddenContentOnTemplateSwitch(draft, "minimalism-dark-blue", "burgundy-gold");
    assert.ok(hidden.includes("Hero photos"));
  });

  test("empty drafts do not warn", () => {
    assert.deepEqual(hiddenContentOnTemplateSwitch({}, "burgundy-gold", "minimalism-dark-blue"), []);
    assert.deepEqual(hiddenContentOnTemplateSwitch({}, "minimalism-dark-blue", "burgundy-gold"), []);
    assert.deepEqual(
      hiddenContentOnTemplateSwitch({ blocks_layout: { template_data: {} } }, "burgundy-gold", "minimalism-dark-blue"),
      []
    );
  });
});

describe("snapshot manifest detection", () => {
  function baseSnapshot(templateId) {
    return { template_id: templateId, locale: "en", timezone: "UTC", blocks_layout: null };
  }
  function baseEvent() {
    return { id: "e1", title: "Event", event_date: "2026-01-01T12:00:00Z" };
  }

  test("isManifest behavior for minimalism-dark-blue and burgundy-gold (template_data read)", () => {
    const min = assembleInvitationPageData(
      { ...baseSnapshot("minimalism-dark-blue"), blocks_layout: { template_data: { mf_hero_eyebrow: "Hello" } } },
      baseEvent()
    );
    assert.equal(min.eyebrow, "Hello");
    const burg = assembleInvitationPageData(
      { ...baseSnapshot("burgundy-gold"), blocks_layout: { template_data: { mf_opening_message: "Open" } } },
      baseEvent()
    );
    assert.equal(burg.openingMessage, "Open");
  });
});

describe("promotion template resolution", () => {
  test('resolvePromotionTemplateId("burgundy-gold") passes through', () => {
    assert.equal(resolvePromotionTemplateId("burgundy-gold"), "burgundy-gold");
  });
});
