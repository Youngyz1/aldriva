const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(root, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const { EVERGREEN_PHOTO_PLACEHOLDER, EVERGREEN_PHOTO_SLOTS, resolveEvergreenPhoto } = require("../evergreen-photo-resolution.ts");
const { mergeInvitationTemplatePreviewData } = require("../invitation-template-preview-data.ts");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("each Evergreen photo slot prefers its own upload over hero, gallery, and other slots", () => {
  const ownFields = {
    envelope_photo_url: "envelopePhoto",
    envelope_photo_two_url: "envelopePhotoTwo",
    cover_photo_url: "coverPhoto",
    polaroid_photo_one_url: "polaroidPhotoOne",
    polaroid_photo_two_url: "polaroidPhotoTwo",
    story_photo_one_url: "storyPhotoOne",
    story_photo_two_url: "storyPhotoTwo",
    closing_photo_url: "closingPhoto",
    rsvp_photo_url: "rsvpPhoto",
  };
  for (const slot of EVERGREEN_PHOTO_SLOTS) {
    const field = ownFields[slot];
    const result = resolveEvergreenPhoto({
      title: "A & B",
      eventDate: "2027-04-24T16:00:00+01:00",
      [field]: `https://storage.example/${slot}`,
      heroImage: "https://storage.example/hero",
      gallery: [{ url: "https://storage.example/gallery-1" }],
    }, slot);
    assert.equal(result, `https://storage.example/${slot}`, `${slot} uses its dedicated upload`);
  }
});

test("Evergreen fallback order is hero, gallery in order, first dedicated/story upload, then neutral art", () => {
  const base = { title: "A & B", eventDate: "2027-04-24T16:00:00+01:00" };
  const slot = "cover_photo_url";
  assert.equal(resolveEvergreenPhoto({ ...base, heroImage: "hero" , gallery: [{ url: "gallery-1" }] }, slot), "hero");
  assert.equal(resolveEvergreenPhoto({ ...base, gallery: [{ url: "gallery-1" }, { url: "gallery-2" }], storyPhotoOne: "story" }, slot), "gallery-1");
  assert.equal(resolveEvergreenPhoto({ ...base, polaroidPhotoTwo: "dedicated", storyImage: "story" }, slot), "dedicated");
  assert.equal(resolveEvergreenPhoto({ ...base, storyImage: "story" }, slot), "story");
  assert.equal(resolveEvergreenPhoto(base, slot), EVERGREEN_PHOTO_PLACEHOLDER);
});

test("one organizer photo suppresses every sample photo while empty previews use only local fixture art", () => {
  const noUpload = mergeInvitationTemplatePreviewData("evergreen-envelope", {
    title: "A & B", eventDate: "2027-04-24T16:00:00+01:00", locale: "en",
  });
  assert.ok(noUpload.sampleFields.includes("envelopePhoto"));
  assert.ok(noUpload.sampleFields.includes("gallery"));
  assert.ok(noUpload.data.envelopePhoto.startsWith("/images/"));

  const oneUpload = mergeInvitationTemplatePreviewData("evergreen-envelope", {
    title: "A & B", eventDate: "2027-04-24T16:00:00+01:00", locale: "en",
    heroImage: "https://storage.example/hero",
  });
  assert.equal(oneUpload.data.heroImage, "https://storage.example/hero");
  assert.equal(oneUpload.data.envelopePhoto, undefined);
  assert.equal(oneUpload.data.gallery, undefined);
  assert.equal(oneUpload.data.polaroidPhotoOne, undefined);
  assert.equal(oneUpload.sampleFields.some((field) => ["heroImage", "storyImage", "gallery", "weddingStory", "envelopePhoto", "coverPhoto", "polaroidPhotoOne", "polaroidPhotoTwo", "storyPhotoOne", "storyPhotoTwo", "closingPhoto", "rsvpPhoto"].includes(field)), false);
});

test("sample media is centralized on local public assets and gallery output uses the shared lightbox", () => {
  const sampleData = read("components/invitation/templates/invitation-sample-data.ts");
  const mediaFixture = read("components/invitation/templates/invitation-sample-media.ts");
  assert.doesNotMatch(sampleData, /images\.unsplash\.com/);
  assert.match(sampleData, /INVITATION_SAMPLE_MEDIA/);
  for (const match of mediaFixture.matchAll(/"(\/images\/[^\"]+)"/g)) {
    assert.equal(fs.existsSync(path.join(root, "public", match[1].replace(/^\//, ""))), true, `${match[1]} exists locally`);
  }
  const page = read("components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate.tsx");
  const galleryBlock = read("components/invitation/blocks/InvitationPresentationBlocks.tsx");
  const grid = read("components/invitation/InvitationGalleryGrid.tsx");
  assert.match(page, /blocks\("gallery"\)/);
  assert.match(galleryBlock, /<InvitationGalleryGrid/);
  assert.match(grid, /role="dialog"/);
  assert.match(grid, /invitationGalleryClose/);
});

