/**
 * lib/__tests__/image-uploader.test.cjs
 *
 * Tests for the generic shared uploader (lib/image-upload.ts +
 * components/shared/ImageUploader): free vs fixed aspect modes, custom
 * long-edge ceilings, forced output encodings, and the invitation
 * back-compat re-export.
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
    const output = ts.transpileModule(source, {
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

const shared = require("../image-upload.ts");
const compat = require("../invitation-images.ts");

describe("shared uploader aspect modes", () => {
  test("free mode follows the natural ratio (full original, no forced frame)", () => {
    assert.equal(shared.resolveCropAspect({ width: 4000, height: 3000 }, "free"), 4000 / 3000);
    assert.equal(shared.resolveCropAspect({ width: 1080, height: 1920 }, "free"), 1080 / 1920);
    assert.equal(shared.resolveCropAspect({ width: 500, height: 500 }), 1);
  });

  test("fixed aspect wins for avatars and logos", () => {
    assert.equal(shared.resolveCropAspect({ width: 4000, height: 3000 }, 1), 1);
    assert.equal(shared.resolveCropAspect({ width: 4000, height: 3000 }, 16 / 9), 16 / 9);
  });

  test("invalid aspects and degenerate images fail closed", () => {
    assert.equal(shared.resolveCropAspect({ width: 4000, height: 3000 }, 0), 4000 / 3000);
    assert.equal(shared.resolveCropAspect({ width: 4000, height: 3000 }, -2), 4000 / 3000);
    assert.equal(shared.resolveCropAspect({ width: 4000, height: 3000 }, NaN), 4000 / 3000);
    assert.equal(shared.resolveCropAspect({ width: 0, height: 0 }, "free"), 1);
  });
});

describe("shared uploader sizing and encoding overrides", () => {
  test("custom long-edge ceilings apply per flow", () => {
    assert.deepEqual(shared.computeResizeTarget({ width: 4000, height: 3000 }, 800), {
      width: 800,
      height: 600,
    });
    assert.deepEqual(shared.computeResizeTarget({ width: 400, height: 300 }, 800), {
      width: 400,
      height: 300,
    });
  });

  test("forced output encodings override the auto rule", () => {
    assert.equal(shared.resolveOutputMime("image/png", "jpeg"), "image/jpeg");
    assert.equal(shared.resolveOutputExtension("image/png", "jpeg"), "jpg");
    assert.equal(shared.resolveOutputMime("image/jpeg", "webp"), "image/webp");
    assert.equal(shared.resolveOutputExtension("image/jpeg", "webp"), "webp");
    assert.equal(shared.resolveOutputMime("image/jpeg", "auto"), "image/jpeg");
    assert.equal(shared.resolveOutputMime("image/png", "auto"), "image/webp");
  });
});

describe("invitation back-compat re-export", () => {
  test("invitation aliases preserve behaviour", () => {
    assert.equal(compat.INVITATION_MAX_LONG_EDGE_PX, 1600);
    assert.equal(compat.INVITATION_GALLERY_MAX, 12);
    assert.equal(compat.invitationOutputMime("image/jpeg"), "image/jpeg");
    assert.equal(compat.invitationOutputMime("image/png"), "image/webp");
    assert.equal(compat.invitationOutputExtension("image/png"), "webp");
  });

  test("generic helpers are reachable through the invitation module", () => {
    for (const name of [
      "computeResizeTarget",
      "resolveCropAspect",
      "exifSwapsDimensions",
      "orientedDimensions",
      "exifToCanvasTransform",
      "readExifOrientation",
      "normalizeFocalPoint",
      "focalToObjectPosition",
      "pointerToFocalPoint",
      "canAddGalleryItem",
      "moveGalleryItem",
      "formatImageBytes",
      "resolveOutputMime",
      "resolveOutputExtension",
    ]) {
      assert.equal(typeof compat[name], "function", `${name} must be re-exported`);
    }
  });
});

describe("shared uploader component contract (source level)", () => {
  test("ImageUploader exposes the generic props and retry handling", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/shared/ImageUploader.tsx"), "utf8");
    assert.ok(src.includes("bucket: string"), "bucket prop required");
    assert.ok(src.includes('aspect?: "free" | number'), "aspect prop required");
    assert.ok(src.includes("maxLongEdge?"), "maxLongEdge prop required");
    assert.ok(src.includes("outputType?"), "outputType prop required");
    assert.ok(src.includes("resolveCropAspect"), "frame must derive from the aspect prop");
    assert.ok(src.includes("Retry"), "error retry required");
    assert.ok(src.includes("uploadImage(file, bucket, folder"), "shared upload pipeline required");
  });

  test("invitation wrapper fixes cms-media and keeps identical behaviour", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/InvitationImageUploadField.tsx"),
      "utf8"
    );
    assert.ok(src.includes('bucket="cms-media"'), "invitation uploads stay on cms-media");
    assert.ok(src.includes('confirmLabel="Use original"'), "invitation confirm label preserved");
    assert.ok(src.includes("from \"@/components/shared/ImageUploader\""), "must delegate to shared");
  });
});
