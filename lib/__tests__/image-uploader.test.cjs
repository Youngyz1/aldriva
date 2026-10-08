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

describe("shared uploader sizing and encoding overrides", () => {  test("custom long-edge ceilings apply per flow", () => {
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

describe("minimum-size guard", () => {
  test("small sources are rejected with actionable copy", () => {
    const msg = shared.checkMinDimensions(800, 200, 1200, 300);
    assert.ok(msg.includes("too small"), "names the problem");
    assert.ok(msg.includes("800x200px"), "quotes actual size");
    assert.ok(msg.includes("1200x300px"), "quotes the floor");
  });

  test("sources at or above the floor pass, unreadable fails open", () => {
    assert.equal(shared.checkMinDimensions(1200, 300, 1200, 300), null);
    assert.equal(shared.checkMinDimensions(4000, 3000, 1200, 300), null);
    assert.equal(shared.checkMinDimensions(0, 0, 1200, 300), null);
    assert.equal(shared.checkMinDimensions(4000, 3000), null);
  });
});

describe("shared uploader component contract (source level)", () => {
  test("ImageUploader exposes the generic props and retry handling", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/shared/ImageUploader.tsx"), "utf8");
    assert.ok(src.includes("bucket?: string"), "bucket prop (optional in defer mode)");
    assert.ok(src.includes('aspect?: "free" | number'), "aspect prop required");
    assert.ok(src.includes("maxLongEdge?"), "maxLongEdge prop required");
    assert.ok(src.includes("outputType?"), "outputType prop required");
    assert.ok(src.includes("resolveCropAspect"), "frame must derive from the aspect prop");
    assert.ok(src.includes("Retry"), "error retry required");
    assert.ok(src.includes("uploadImage(file, bucket"), "shared upload pipeline required");
  });

  test("ImageUploader supports defer mode and toolbar embedding", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/shared/ImageUploader.tsx"), "utf8");
    assert.ok(src.includes("onCropped?"), "defer callback required");
    assert.ok(src.includes("hideTrigger?"), "hidden-trigger prop required");
    assert.ok(src.includes("ImageUploaderHandle"), "imperative handle required");
    assert.ok(src.includes("forwardRef"), "ref forwarding required for open()");
    assert.ok(src.includes("pass either onCropped"), "missing-target invariant required");
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

  test("events family migrated: create defers, edit uploads immediate", () => {
    for (const f of ["app/create-event/CreateEventForm.tsx", "app/events/edit/[id]/page.tsx"]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!src.includes("ImageUploadWithCrop"), `${f} must not use the legacy uploader`);
      assert.ok(
        src.includes('from "@/components/shared/ImageUploader"'),
        `${f} must use the shared uploader`
      );
    }
    const create = fs.readFileSync(path.join(ROOT, "app/create-event/CreateEventForm.tsx"), "utf8");
    assert.ok(create.includes("onCropped={"), "create-event keeps deferring until submit");
    assert.ok(
      create.includes('uploadImage(bannerFile, "event-banners", createdEvent.id)'),
      "create-event still uploads to event-banners/<new-id> at submit"
    );
    const edit = fs.readFileSync(path.join(ROOT, "app/events/edit/[id]/page.tsx"), "utf8");
    assert.ok(edit.includes('bucket="event-banners"'), "edit keeps its bucket");
    assert.ok(edit.includes("folder={eventId}"), "edit keeps its folder");
  });

  test("organizers family migrated: banners free with floor, logos square", () => {
    const files = [
      "app/create-organizer/page.tsx",
      "app/dashboard/org/[id]/settings/page.tsx",
      "app/dashboard/organizations/[slug]/settings/page.tsx",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!src.includes("ImageUploadWithCrop"), `${f} must not use the legacy uploader`);
      assert.ok(
        src.includes('from "@/components/shared/ImageUploader"'),
        `${f} must use the shared uploader`
      );
      assert.ok(src.includes("minWidth={MIN_BANNER_WIDTH}"), `${f} keeps the banner floor`);
      assert.ok(src.includes("minHeight={MIN_BANNER_HEIGHT}"), `${f} keeps the banner floor`);
      assert.ok(src.includes("aspect={1}"), `${f} keeps the logo square`);
      assert.ok(src.includes("onCropped={handleCroppedBanner}"), `${f} still defers the banner`);
      assert.ok(src.includes("onCropped={handleCroppedPhoto}"), `${f} still defers the logo`);
    }
  });

  test("fundraisers family migrated: photos free, beneficiary avatars square", () => {
    const immediate = [
      ["app/create-fundraiser/page.tsx", "fundraiser-media", "fundraiser-photos"],
      ["app/fundraisers/edit/[id]/page.tsx", "fundraiser-media", "fundraiser-photos"],
      [
        "app/dashboard/beneficiary/BeneficiaryProfileForm.tsx",
        "fundraiser-media",
        "beneficiary-photos",
      ],
      ["components/fundraisers/BeneficiarySelector.tsx", "fundraiser-media", "beneficiary-photos"],
    ];
    for (const [f, bucket, folder] of immediate) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!src.includes("ImageUploadWithCrop"), `${f} must not use the legacy uploader`);
      assert.ok(
        src.includes('from "@/components/shared/ImageUploader"'),
        `${f} must use the shared uploader`
      );
      assert.ok(src.includes(`bucket="${bucket}"`), `${f} keeps its bucket`);
      assert.ok(src.includes(`folder="${folder}"`), `${f} keeps its folder`);
    }
    for (const f of ["app/create-fundraiser/page.tsx", "app/fundraisers/edit/[id]/page.tsx"]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!src.includes("FUNDRAISER_PHOTO_ASPECT_RATIO"), `${f} no forced 4/5 frame`);
    }
    for (const f of [
      "app/dashboard/beneficiary/BeneficiaryProfileForm.tsx",
      "components/fundraisers/BeneficiarySelector.tsx",
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(src.includes("aspect={1}"), `${f} keeps the avatar square`);
    }
  });

  test("content family migrated: articles, products, editor on shared", () => {
    const immediate = [
      ["app/dashboard/articles/new/NewArticleClient.tsx", "fundraiser-media", "article-covers"],
      ["app/dashboard/articles/[id]/edit/EditArticleClient.tsx", "fundraiser-media", "article-covers"],
      ["app/dashboard/products/new/NewProductFormClient.tsx", "fundraiser-media", "product-images"],
      [
        "app/dashboard/products/[id]/edit/EditProductFormClient.tsx",
        "fundraiser-media",
        "product-images",
      ],
      ["components/products/DigitalProductFields.tsx", "fundraiser-media", "product-covers"],
      ["components/editor/RichTextEditor.tsx", "fundraiser-media", "editor-images"],
    ];
    for (const [f, bucket, folder] of immediate) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!src.includes("ImageUploadWithCrop"), `${f} must not use the legacy uploader`);
      assert.ok(
        src.includes("shared/ImageUploader"),
        `${f} must use the shared uploader`
      );
      assert.ok(src.includes(`bucket="${bucket}"`), `${f} keeps its bucket`);
      assert.ok(src.includes(`folder="${folder}"`), `${f} keeps its folder`);
    }
    for (const f of [
      "app/dashboard/articles/new/NewArticleClient.tsx",
      "app/dashboard/articles/[id]/edit/EditArticleClient.tsx",
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!src.includes("ARTICLE_COVER_ASPECT"), `${f} no forced 16/9 frame`);
    }
    const editor = fs.readFileSync(path.join(ROOT, "components/editor/RichTextEditor.tsx"), "utf8");
    assert.ok(editor.includes("hideTrigger"), "editor keeps its hidden trigger");
    assert.ok(editor.includes("ImageUploaderHandle"), "editor keeps its open() handle");
    assert.ok(
      editor.includes("editor.chain().focus().setImage({ src: url })"),
      "editor still inserts the uploaded image"
    );
  });
});

describe("legacy uploader is gone", () => {
  test("old component and its exclusive helpers stay deleted", () => {
    for (const f of [
      "components/ImageUploadWithCrop.tsx",
      "lib/getCroppedImg.ts",
      "lib/imageFit.ts",
      "lib/__tests__/image-fit.test.cjs",
    ]) {
      assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} must stay deleted`);
    }
  });
});

describe("shared uploader component contract (6f flows)", () => {
  test("last flows migrated: profile avatar square, website media mapped", () => {
    const profile = fs.readFileSync(
      path.join(ROOT, "app/dashboard/settings/profile/ProfileClient.tsx"),
      "utf8"
    );
    assert.ok(!profile.includes("ImageUploadWithCrop"), "profile must not use the legacy uploader");
    assert.ok(profile.includes("shared/ImageUploader"), "profile must use the shared uploader");
    assert.ok(profile.includes("aspect={1}"), "avatar stays square");
    assert.ok(profile.includes("onCropped={handleCroppedPhoto}"), "profile still defers to save");
    assert.ok(
      profile.includes('"profile-images", userId'),
      "profile still uploads to profile-images/<user> at save"
    );

    const field = fs.readFileSync(
      path.join(
        ROOT,
        "components/dashboard/website/builder/inspectors/common/MediaUploadField.tsx"
      ),
      "utf8"
    );
    assert.ok(!field.includes("ImageUploadWithCrop"), "media field must not use legacy");
    assert.ok(field.includes("shared/ImageUploader"), "media field must use shared");
    assert.ok(field.includes('bucket="cms-media"'), "media field keeps its bucket");
    assert.ok(
      field.includes('aspect={cropShape === "round" ? 1 : "free"}'),
      "round maps to square, everything else goes free"
    );
    assert.ok(!field.includes("aspectRatio={"), "dead ratio prop is removed");
    assert.ok(!field.includes("aspectRatio?:"), "dead ratio prop is removed");
    for (const f of [
      "components/dashboard/website/builder/inspectors/AboutInspector.tsx",
      "components/dashboard/website/builder/inspectors/GalleryInspector.tsx",
      "components/dashboard/website/builder/inspectors/HeroInspector.tsx",
      "components/dashboard/website/builder/inspectors/TestimonialsInspector.tsx",
      "app/dashboard/businesses/[id]/edit/EditBusinessFormClient.tsx",
      "app/dashboard/businesses/new/NewBusinessFormClient.tsx",
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.ok(!src.includes("aspectRatio="), `${f} no forced frame`);
    }
  });
});
