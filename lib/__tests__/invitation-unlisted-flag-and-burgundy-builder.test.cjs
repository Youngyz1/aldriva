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

describe("INVITATION_UNLISTED_TEMPLATE_IDS flag", () => {
  test("flag unset: burgundy not in catalog/categories, summary undefined, demo still resolves", () => {
    const ids = catalog.getPublicTemplateCatalog().map((t) => t.id);
    assert.ok(!ids.includes("burgundy-gold"));
    assert.equal(catalog.getPublicTemplateSummary("burgundy-gold"), undefined);
    // Only published templates are browsable; burgundy-gold is unlisted today.
    assert.deepEqual(ids, ["minimalism-dark-blue"]);
    assert.deepEqual(catalog.getPublicTemplateCategories(), ["wedding"]);
    const demo = catalog.getDemoTemplateSummary("burgundy-gold");
    assert.ok(demo);
    assert.equal(demo.id, "burgundy-gold");
  });

  test("flag set: burgundy in catalog, summary resolves, categories include wedding", () => {
    process.env[FLAG] = "burgundy-gold";
    const ids = catalog.getPublicTemplateCatalog().map((t) => t.id);
    assert.ok(ids.includes("burgundy-gold"));
    assert.ok(ids.includes("minimalism-dark-blue"));
    const summary = catalog.getPublicTemplateSummary("burgundy-gold");
    assert.ok(summary);
    assert.equal(summary.id, "burgundy-gold");
    assert.ok(catalog.getPublicTemplateCategories().includes("wedding"));
  });

  test("flag with unknown or retired ids is ignored", () => {
    // No "retired" fixture exists in the registry today; the helper skips that
    // branch structurally (status === "retired"). Unknown ids must be ignored.
    process.env[FLAG] = "not-a-real-template,retired-template,burgundy-gold,  , also-unknown";
    const ids = catalog.getPublicTemplateCatalog().map((t) => t.id);
    assert.ok(ids.includes("burgundy-gold"));
    assert.ok(!ids.includes("not-a-real-template"));
    assert.equal(catalog.getPublicTemplateSummary("not-a-real-template"), undefined);
    assert.equal(catalog.getPublicTemplateSummary("retired-template"), undefined);
  });

  test("helper reads env at call time", () => {
    assert.equal(catalog.getPublicTemplateSummary("burgundy-gold"), undefined);
    process.env[FLAG] = "burgundy-gold";
    assert.ok(catalog.getPublicTemplateSummary("burgundy-gold"));
    delete process.env[FLAG];
    assert.equal(catalog.getPublicTemplateSummary("burgundy-gold"), undefined);
  });
});

describe("builder summary", () => {
  test("getTemplateSummaryForBuilder resolves burgundy (unlisted) without flag", () => {
    delete process.env[FLAG];
    const summary = catalog.getTemplateSummaryForBuilder("burgundy-gold");
    assert.ok(summary);
    assert.equal(summary.id, "burgundy-gold");
    assert.equal(summary.name, "Burgundy Gold");
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
