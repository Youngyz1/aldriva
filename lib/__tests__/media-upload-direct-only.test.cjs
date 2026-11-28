const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const fieldSrc = read(
  "components/dashboard/website/builder/inspectors/common/MediaUploadField.tsx"
);
const cmsSrc = read("app/admin/homepage/HomepageCmsTabs.tsx");
const editorSrc = read("components/editor/RichTextEditor.tsx");

test("MediaUploadField is direct-upload only: no My Media, no Direct URL", () => {
  assert.ok(!fieldSrc.includes("My Media"), "no My Media tab");
  assert.ok(!fieldSrc.includes("Direct URL"), "no Direct URL tab");
  assert.ok(!fieldSrc.includes("MyMediaPicker"), "no media picker render/import");
  assert.ok(!fieldSrc.includes('type="url"'), "no URL entry input");
  assert.ok(!fieldSrc.includes("safeImageSrc"), "no manual URL sanitizing path");
  assert.ok(!fieldSrc.includes("setMode"), "no mode toggle state");
});

test("MediaUploadField keeps upload, tenant folder and Clear Image", () => {
  assert.ok(fieldSrc.includes("ImageUploader"), "upload control present");
  assert.ok(fieldSrc.includes('bucket="cms-media"'), "keeps cms-media bucket");
  assert.ok(
    fieldSrc.includes("uploadFolder = tenantId ? `${tenantId}/${folderSubpath}`"),
    "tenant-scoped folder kept"
  );
  assert.ok(fieldSrc.includes("Clear Image"), "Clear action kept");
  assert.ok(fieldSrc.includes("handleClear"), "clear handler kept");
  assert.ok(fieldSrc.includes("onUploaded"), "upload success wiring kept");
});

test("HomepageCmsTabs CmsImageField drops URL entry, keeps upload/progress/errors/remove", () => {
  assert.ok(!cmsSrc.includes("{/* URL Input */}"), "URL input block removed");
  assert.ok(
    !cmsSrc.includes('placeholder="https://\u2026 or /…"'),
    "URL placeholder removed from image fields"
  );
  assert.ok(
    cmsSrc.includes('uploadPublicMedia(file, "cms", {}, onProgress)'),
    "upload kept"
  );
  assert.ok(cmsSrc.includes("Uploading"), "progress kept");
  assert.ok(cmsSrc.includes("uploadError"), "error handling kept");
  assert.ok(cmsSrc.includes("Remove"), "remove action present");
});

test("RichTextEditor drops Insert Image URL, keeps image upload and video/link URL", () => {
  assert.ok(!editorSrc.includes("Insert Image URL"), "no image URL insert");
  assert.ok(!editorSrc.includes("handleImageUrlSubmit"), "no image URL submit handler");
  assert.ok(!editorSrc.includes("validateImageUrl"), "no image URL validator");
  assert.ok(editorSrc.includes('title="Upload Image"'), "image upload button kept");
  assert.ok(
    editorSrc.includes("editor.chain().focus().setImage({ src: url })"),
    "uploaded image still inserted"
  );
  assert.ok(editorSrc.includes("Insert Video URL"), "video URL insert untouched");
  assert.ok(editorSrc.includes("Insert Link"), "link insert untouched");
});
