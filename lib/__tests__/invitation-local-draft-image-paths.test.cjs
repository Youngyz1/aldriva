/**
 * lib/__tests__/invitation-local-draft-image-paths.test.cjs
 *
 * Regression test for the hero-photo persistence bug: mf_hero_photos[i].url
 * (minimalism-dark-blue's only manifest photo field, an array under
 * blocks_layout.template_data) was invisible to listLocalDraftImageFields /
 * setLocalDraftImageField, so a hero photo uploaded in local mode was never
 * captured for IndexedDB persistence and never restored on reload. Covers
 * the full get/set round trip for both mf_hero_photos[i].url and the
 * pre-existing gallery[i].url path, to prove the fix didn't regress gallery.
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
  listLocalDraftImageFields,
  setLocalDraftImageField,
} = require("@/lib/invitation-local-draft.ts");

describe("mf_hero_photos[i].url get/set path resolution", () => {
  test("listLocalDraftImageFields enumerates both hero photo slots with their current blob: values", () => {
    const draft = {
      blocks_layout: {
        template_data: {
          mf_hero_photos: [
            { url: "blob:http://localhost/aaa" },
            { url: "blob:http://localhost/bbb" },
          ],
        },
      },
    };
    const fields = listLocalDraftImageFields(draft);
    const hero0 = fields.find((f) => f.key === "mf_hero_photos_0");
    const hero1 = fields.find((f) => f.key === "mf_hero_photos_1");
    assert.ok(hero0, "mf_hero_photos_0 must be enumerated");
    assert.ok(hero1, "mf_hero_photos_1 must be enumerated");
    assert.strictEqual(hero0.value, "blob:http://localhost/aaa");
    assert.strictEqual(hero1.value, "blob:http://localhost/bbb");
  });

  test("setLocalDraftImageField writes a fresh URL into mf_hero_photos[i].url, preserving the other slot and other draft content", () => {
    const draft = {
      display_title: "Keep me",
      blocks_layout: {
        template_data: {
          mf_hero_photos: [
            { url: "blob:stale-0" },
            { url: "blob:stale-1" },
          ],
          mf_hero_eyebrow: "Keep me too",
        },
      },
    };
    const next = setLocalDraftImageField(draft, "mf_hero_photos_0", "https://real.example/cms-media/hero-0.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[0].url, "https://real.example/cms-media/hero-0.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[1].url, "blob:stale-1", "untouched slot must survive");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_eyebrow, "Keep me too", "sibling template_data field must survive");
    assert.strictEqual(next.display_title, "Keep me", "top-level draft content must survive");
    // Immutable: the original draft object must not have been mutated.
    assert.strictEqual(draft.blocks_layout.template_data.mf_hero_photos[0].url, "blob:stale-0");
  });

  test("an out-of-range or missing mf_hero_photos index is still handled (array extends with the new slot)", () => {
    const draft = { blocks_layout: { template_data: {} } };
    const next = setLocalDraftImageField(draft, "mf_hero_photos_0", "https://real.example/cms-media/hero-0.jpg");
    assert.strictEqual(next.blocks_layout.template_data.mf_hero_photos[0].url, "https://real.example/cms-media/hero-0.jpg");
  });
});

describe("gallery[i].url get/set path resolution (pre-existing, must not regress)", () => {
  test("listLocalDraftImageFields still enumerates gallery items by index", () => {
    const draft = { gallery: [{ url: "blob:http://localhost/g0" }, { url: "blob:http://localhost/g1" }] };
    const fields = listLocalDraftImageFields(draft);
    assert.strictEqual(fields.find((f) => f.key === "gallery_0")?.value, "blob:http://localhost/g0");
    assert.strictEqual(fields.find((f) => f.key === "gallery_1")?.value, "blob:http://localhost/g1");
  });

  test("setLocalDraftImageField writes a fresh URL into gallery[i].url, preserving the other item", () => {
    const draft = { gallery: [{ url: "blob:stale-g0", alt: "first" }, { url: "blob:stale-g1", alt: "second" }] };
    const next = setLocalDraftImageField(draft, "gallery_1", "https://real.example/cms-media/gallery-1.jpg");
    assert.strictEqual(next.gallery[1].url, "https://real.example/cms-media/gallery-1.jpg");
    assert.strictEqual(next.gallery[1].alt, "second", "sibling field on the same item must survive");
    assert.strictEqual(next.gallery[0].url, "blob:stale-g0", "untouched item must survive");
  });
});
