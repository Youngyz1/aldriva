/**
 * lib/__tests__/invitation-promotion-core.test.cjs
 *
 * Unit tests for the pure Phase 6 promotion helpers in
 * lib/invitation-promotion-core.ts — shared by promoteLocalInvitationDraftServer
 * (lib/actions/invitation-events.ts) and the client orchestrator
 * (lib/invitation-local-draft-promotion.ts). No server-only or
 * browser-only imports in the module under test, so this runs directly
 * under node --test.
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  shouldSkipPromotion,
  resolvePromotionTemplateId,
  applyImageUrls,
  isPromotableTitle,
  promotedMarkerKey,
  promotedImagesCacheKey,
} = require("@/lib/invitation-promotion-core.ts");

describe("shouldSkipPromotion", () => {
  test("no row at all -> do not skip", () => {
    assert.strictEqual(shouldSkipPromotion(null), false);
    assert.strictEqual(shouldSkipPromotion(undefined), false);
  });

  test("row with empty/blank/missing template_id -> do not skip", () => {
    assert.strictEqual(shouldSkipPromotion({}), false);
    assert.strictEqual(shouldSkipPromotion({ template_id: "" }), false);
    assert.strictEqual(shouldSkipPromotion({ template_id: "   " }), false);
    assert.strictEqual(shouldSkipPromotion({ template_id: null }), false);
  });

  test("row with a real template_id -> skip", () => {
    assert.strictEqual(shouldSkipPromotion({ template_id: "minimalism-dark-blue" }), true);
  });
});

describe("resolvePromotionTemplateId — client value is never trusted verbatim", () => {
  test("a garbage/unknown id falls back to minimalism-dark-blue", () => {
    assert.strictEqual(resolvePromotionTemplateId("not-a-real-template"), "minimalism-dark-blue");
    assert.strictEqual(resolvePromotionTemplateId(""), "minimalism-dark-blue");
    assert.strictEqual(resolvePromotionTemplateId(null), "minimalism-dark-blue");
    assert.strictEqual(resolvePromotionTemplateId(undefined), "minimalism-dark-blue");
  });

  test("the one real registered template id passes through", () => {
    assert.strictEqual(resolvePromotionTemplateId("minimalism-dark-blue"), "minimalism-dark-blue");
  });
});

describe("applyImageUrls", () => {
  test("writes resolved URLs into mf_hero_photos[i].url without disturbing other content", () => {
    const draft = {
      display_title: "Keep me",
      blocks_layout: {
        template_data: {
          mf_hero_photos: [{ url: "blob:a" }, { url: "blob:b" }],
          mf_hero_eyebrow: "Keep me too",
        },
      },
    };
    const next = applyImageUrls(draft, {
      mf_hero_photos_0: "https://real.example/cms-media/hero-0.jpg",
      mf_hero_photos_1: "https://real.example/cms-media/hero-1.jpg",
    });
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[0].url, "https://real.example/cms-media/hero-0.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[1].url, "https://real.example/cms-media/hero-1.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_eyebrow, "Keep me too");
    assert.strictEqual(next.display_title, "Keep me");
  });

  test("writes resolved URLs into gallery[i].url without disturbing other items", () => {
    const draft = { gallery: [{ url: "blob:g0", alt: "first" }, { url: "blob:g1", alt: "second" }] };
    const next = applyImageUrls(draft, { gallery_1: "https://real.example/cms-media/gallery-1.jpg" });
    assert.strictEqual(next.gallery[1].url, "https://real.example/cms-media/gallery-1.jpg");
    assert.strictEqual(next.gallery[1].alt, "second");
    assert.strictEqual(next.gallery[0].url, "blob:g0");
  });

  test("an empty url map is a no-op (same content, immutably)", () => {
    const draft = { gallery: [{ url: "blob:g0" }] };
    const next = applyImageUrls(draft, {});
    assert.deepEqual(next, draft);
  });
});

describe("isPromotableTitle", () => {
  test("blank, whitespace-only, or non-string titles are not promotable", () => {
    assert.strictEqual(isPromotableTitle(""), false);
    assert.strictEqual(isPromotableTitle("   "), false);
    assert.strictEqual(isPromotableTitle(null), false);
    assert.strictEqual(isPromotableTitle(undefined), false);
  });

  test("the placeholder draft title is not promotable", () => {
    assert.strictEqual(isPromotableTitle("Untitled invitation"), false);
  });

  test("a real title is promotable", () => {
    assert.strictEqual(isPromotableTitle("Amara & Kwame's Wedding"), true);
  });
});

describe("marker/cache key format is user-scoped", () => {
  test("promotedMarkerKey includes both userId and draftId, in that order", () => {
    assert.strictEqual(promotedMarkerKey("user-1", "draft-1"), "aldriva-promoted:user-1:draft-1");
  });

  test("promotedImagesCacheKey includes both userId and draftId, in that order", () => {
    assert.strictEqual(promotedImagesCacheKey("user-1", "draft-1"), "aldriva-promoted-images:user-1:draft-1");
  });

  test("different users never collide on the same draftId", () => {
    assert.notStrictEqual(promotedMarkerKey("user-1", "draft-1"), promotedMarkerKey("user-2", "draft-1"));
    assert.notStrictEqual(promotedImagesCacheKey("user-1", "draft-1"), promotedImagesCacheKey("user-2", "draft-1"));
  });
});
