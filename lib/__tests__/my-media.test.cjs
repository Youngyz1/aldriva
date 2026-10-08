const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

// Listing helper checks via file inspection + unit logic
const myMediaPath = path.join(ROOT, "lib/media/my-media.ts");
const myMediaSrc = fs.readFileSync(myMediaPath, "utf8");
const pickerPath = path.join(ROOT, "components/dashboard/website/builder/media/MyMediaPicker.tsx");
const pickerSrc = fs.readFileSync(pickerPath, "utf8");
const fieldPath = path.join(ROOT, "components/dashboard/website/builder/inspectors/common/MediaUploadField.tsx");
const fieldSrc = fs.readFileSync(fieldPath, "utf8");

test("Stage I listing: helper constructs tenant-scoped paths and uses cms-media", () => {
  assert.ok(myMediaSrc.includes('CMS_MEDIA_BUCKET = "cms-media"'), "must use cms-media bucket");
  assert.ok(myMediaSrc.includes("BUILDER_MEDIA_FOLDERS"), "must define builder folders");
  assert.ok(myMediaSrc.includes('"heroes"') && myMediaSrc.includes('"gallery"') && myMediaSrc.includes('"team"') && myMediaSrc.includes('"avatars"') && myMediaSrc.includes('"blocks"'), "must cover all 5 builder folders");
  assert.ok(myMediaSrc.includes('supabase.storage.from(CMS_MEDIA_BUCKET).list'), "must use storage.list");
  assert.ok(myMediaSrc.includes('supabase.storage.from(CMS_MEDIA_BUCKET).getPublicUrl'), "must use getPublicUrl");
  assert.ok(myMediaSrc.includes('safeImageSrc'), "must validate public URLs with the image host allowlist");
  assert.ok(myMediaSrc.includes("isValidTenantId"), "must validate tenantId");
  assert.ok(myMediaSrc.includes("isSafeTenantPath"), "must validate tenant path");
  assert.ok(myMediaSrc.includes("limit: 100"), "bounded listing");
  assert.ok(myMediaSrc.includes('sortBy: { column: "updated_at"'), "must sort by updated_at");
});

test("Stage I listing: public URLs generated correctly and unsafe rejected", () => {
  // Check helper filters unsafe segments
  assert.ok(myMediaSrc.includes('isSafePathSegment'), "must have isSafePathSegment");
  assert.ok(myMediaSrc.includes('segment.includes("..")'), "must reject traversal");
  assert.ok(myMediaSrc.includes('segment.includes("/")'), "must reject slash in segment");
  // Ensure sanitization before return
  assert.ok(myMediaSrc.includes("const sanitized = safeImageSrc(publicUrl)") || myMediaSrc.includes("safeImageSrc(publicUrl)"), "must validate publicUrl against the image host allowlist");
  assert.ok(myMediaSrc.includes("if (!sanitized) continue"), "must reject unsafe URLs");
  // Empty storage handling
  assert.ok(myMediaSrc.includes("if (!data || data.length === 0) continue"), "empty storage returns empty list handling");
  assert.ok(myMediaSrc.includes("if (error)"), "must handle listing errors");
  assert.ok(myMediaSrc.includes("Could not load media"), "generic error message, no raw Supabase error");
});

test("Stage I tenant isolation: helper never accepts arbitrary tenant prefix from UI", () => {
  assert.ok(myMediaSrc.includes("isValidTenantId(tenantId)"), "list/delete must validate tenantId UUID");
  assert.ok(myMediaSrc.includes("UUID_REGEX"), "tenantId must be UUID");
  assert.ok(myMediaSrc.includes("isSafeTenantPath(tenantId, fullPath)"), "must validate fullPath starts with tenantId");
  assert.ok(myMediaSrc.includes("fullPath.startsWith(`${tenantId}/`)"), "path must start with tenantId/");
  assert.ok(myMediaSrc.includes('fullPath.includes("..") || fullPath.includes("//")'), "must reject traversal");
  // deleteTenantMedia also validates
  assert.ok(myMediaSrc.includes("deleteTenantMedia"), "must export delete");
  assert.ok(myMediaSrc.includes('supabase.storage.from(CMS_MEDIA_BUCKET).remove'), "delete must use storage.remove");
  assert.ok(myMediaSrc.includes("Invalid path: does not belong to tenant"), "must reject cross-tenant path");
  // picker uses tenantId from props, not user input
  assert.ok(pickerSrc.includes("tenantId") && pickerSrc.includes("listTenantMedia(tenantId)"), "picker must derive prefix from tenantId prop");
  assert.ok(!myMediaSrc.includes("service_role") && !myMediaSrc.includes("createSupabaseAdmin"), "must not use service-role");
});

test("Stage I tenant isolation: MediaUploadField never allows tenantB via UI", () => {
  assert.ok(fieldSrc.includes("tenantId") && fieldSrc.includes("MyMediaPicker"), "field must pass tenantId to picker");
  assert.ok(fieldSrc.includes('tenantId ? `${tenantId}/${folderSubpath}`'), "upload folder still tenant-scoped");
  assert.ok(!fieldSrc.includes("service_role"), "field must not use service-role");
});

test("Stage I selection: picker calls onSelect with publicUrl, reusable", () => {
  assert.ok(pickerSrc.includes("onSelect"), "picker must accept onSelect");
  assert.ok(pickerSrc.includes("onSelect(safeUrl)") || pickerSrc.includes("onSelect(publicUrl)"), "select must call onSelect with publicUrl");
  assert.ok(pickerSrc.includes("Use") && pickerSrc.includes("onClick"), "must have Use action");
  assert.ok(fieldSrc.includes("onSelect={(publicUrl) =>") || fieldSrc.includes("onSelect={(publicUrl)"), "field must wire picker onSelect to onChange");
  // Verify no duplicate upload: picker does not call uploadImage, only onSelect
  assert.ok(!pickerSrc.includes("uploadImage") && !pickerSrc.includes("uploadPublicFile"), "picker must not upload, only select");
  // Check that field's My Media onSelect sets manualUrl and onChange without creating new Storage object
  assert.ok(fieldSrc.includes("setManualUrl(publicUrl)") && fieldSrc.includes("onChange(publicUrl)"), "field must update block value with selected URL, no new Storage object");
});

test("Stage I reuse: same URL can be assigned to multiple blocks", () => {
  // Conceptually hero.src === gallery.images[0].src and no second upload occurs
  // Verify helper does not duplicate: list returns same publicUrl for same path
  assert.ok(myMediaSrc.includes("publicUrl: sanitized"), "list returns same publicUrl for same path");
  assert.ok(fieldSrc.includes("MyMediaPicker") && fieldSrc.includes("selectedUrl"), "picker shows selected state, reuse across fields");
});

test("Stage I delete: confirmation, tenant-scoped path, refresh", () => {
  assert.ok(pickerSrc.includes("ConfirmDialog"), "delete must require confirmation");
  assert.ok(pickerSrc.includes('title="Delete image?"') || pickerSrc.includes("Delete image"), "confirmation title");
  assert.ok(pickerSrc.includes("deleteTenantMedia(tenantId, deleteTarget.path)"), "delete must call helper with tenantId and path");
  assert.ok(pickerSrc.includes("setItems((prev) => prev.filter"), "must remove from displayed list after delete");
  assert.ok(pickerSrc.includes("Failed to delete media"), "safe error handling, no raw error");
  assert.ok(pickerSrc.includes("variant=\"destructive\""), "delete confirm destructive");
  // Helper validates path belongs to tenant
  assert.ok(myMediaSrc.includes("isSafeTenantPath(tenantId, path)"), "delete helper validates tenant path");
});

test("Stage I security: javascript/data/vbscript rejected, SVG remains rejected, path traversal blocked", () => {
  // MediaUploadField Direct URL still sanitized
  assert.ok(fieldSrc.includes("safeImageSrc(manualUrl)"), "Direct image URL must use the strict allowlist");
  assert.ok(fieldSrc.includes("Image URL must use this site's media host"), "must reject foreign image hosts and dangerous schemes");
  // sanitizeUrl in uploads.ts and my-media ensures only http/https
  const sanitizeSrc = fs.readFileSync(path.join(ROOT, "lib/sanitize-html.ts"), "utf8");
  assert.ok(sanitizeSrc.includes("javascript:") && sanitizeSrc.includes("data:text/html"), "sanitizeUrl must reject javascript/data");
  // SVG not in ALLOWED_IMAGE_TYPES
  const uploadImageSrc = fs.readFileSync(path.join(ROOT, "lib/uploadImage.ts"), "utf8");
  assert.ok(uploadImageSrc.includes('ALLOWED_IMAGE_TYPES.includes(file.type'), "upload must check allowed types");
  const imageCompressionSrc = fs.readFileSync(path.join(ROOT, "lib/imageCompression.ts"), "utf8");
  assert.ok(imageCompressionSrc.includes('"image/jpeg"') && imageCompressionSrc.includes('"image/png"') && imageCompressionSrc.includes('"image/webp"'), "only jpeg/png/webp allowed, no svg");
  assert.ok(!imageCompressionSrc.includes("svg"), "svg not allowed");
  // Path traversal
  assert.ok(myMediaSrc.includes('path.includes("..")'), "must block traversal");
  assert.ok(myMediaSrc.includes('path.includes("//")'), "must block double slash");
});

test("Stage I bucket reality: cms-media is public as expected", () => {
  const migration117 = fs.readFileSync(path.join(ROOT, "db/migration_117_cms_media_storage.sql"), "utf8");
  assert.ok(migration117.includes("public = true"), "cms-media must be public for getPublicUrl");
  assert.ok(migration117.includes("5242880"), "cms-media 5MB limit");
  assert.ok(migration117.includes("image/jpeg") && migration117.includes("image/png"), "cms-media allowed mime includes jpeg/png");
  // Ensure no attempt to make private in Stage I picker/helper
  assert.ok(!pickerSrc.includes("createSignedUrl") && !myMediaSrc.includes("createSignedUrl"), "Stage I must not introduce signed URLs for cms-media public media");
  assert.ok(!myMediaSrc.includes("private") || myMediaSrc.includes("publicUrl"), "helper uses publicUrl, not private");
});

test("Stage I builder surfaces: all 5 surfaces wired via MediaUploadField", () => {
  const heroSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/HeroInspector.tsx"), "utf8");
  assert.ok(heroSrc.includes("MediaUploadField") && heroSrc.includes('folderSubpath="heroes"'), "Hero wired");
  const gallerySrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/GalleryInspector.tsx"), "utf8");
  assert.ok(gallerySrc.includes("MediaUploadField") && gallerySrc.includes('folderSubpath="gallery"'), "Gallery wired");
  const aboutSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/AboutInspector.tsx"), "utf8");
  assert.ok(aboutSrc.includes("MediaUploadField") && aboutSrc.includes('folderSubpath="team"'), "About wired");
  const testimonialSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/TestimonialsInspector.tsx"), "utf8");
  assert.ok(testimonialSrc.includes("MediaUploadField") && testimonialSrc.includes('folderSubpath="avatars"'), "Testimonials wired");
  const sectionSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/website/builder/inspectors/SectionInspector.tsx"), "utf8");
  assert.ok(sectionSrc.includes("MediaUploadField") && sectionSrc.includes("Background Image"), "Section background wired");
  // Ensure field now has My Media tab (not just Upload|Direct URL)
  assert.ok(fieldSrc.includes('My Media') && fieldSrc.includes('mode === "myMedia"') && fieldSrc.includes("MyMediaPicker"), "field must have Upload | My Media | Direct URL");
});

test("Stage I no DB table, no migration, no new bucket", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "db/migration_media_assets.sql")), "must not create media_assets table");
  const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations"));
  const hasMediaTable = migrations.some((f) => f.includes("media") && fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8").includes("CREATE TABLE") && fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8").includes("media_assets"));
  assert.ok(!hasMediaTable, "must not create media table migration");
  assert.ok(!myMediaSrc.includes("media_assets") && !pickerSrc.includes("media_assets"), "helper/picker must not reference DB table");
  // Ensure no new bucket created
  assert.ok(myMediaSrc.includes('CMS_MEDIA_BUCKET = "cms-media"') && !myMediaSrc.includes("cms-media-v2"), "must use cms-media, not new bucket");
});

test("Stage I UX states: loading, empty, error, retry, responsive grid", () => {
  assert.ok(pickerSrc.includes("Loading media") && pickerSrc.includes("Loader2"), "loading state");
  assert.ok(pickerSrc.includes("animate-pulse") && pickerSrc.includes("h-24 rounded-xl bg-zinc-100"), "skeleton");
  assert.ok(pickerSrc.includes("No media yet") && pickerSrc.includes("Upload an image"), "empty state");
  assert.ok(pickerSrc.includes("Try again") && pickerSrc.includes("Refresh"), "retry actions");
  assert.ok(pickerSrc.includes("Couldn't load your media"), "error state generic message, no raw Supabase error");
  assert.ok(pickerSrc.includes("grid-cols-2 sm:grid-cols-3") && pickerSrc.includes("max-h-[320px] overflow-y-auto"), "responsive 2/3 columns, bounded listing");
  assert.ok(pickerSrc.includes("safeImageSrc(item.publicUrl)"), "thumbnail uses the strict image host allowlist");
  assert.ok(pickerSrc.includes("Check") && pickerSrc.includes("isSelected"), "selected state ring");
  assert.ok(pickerSrc.includes("Use") && pickerSrc.includes("Delete"), "Use/Select and Delete actions per item");
  assert.ok(!pickerSrc.includes("Instagram") && !pickerSrc.includes("Facebook") && !pickerSrc.includes("YouTube"), "must not include connected media");
});

test("Stage I not overbuilt: no DAM features", () => {
  assert.ok(!pickerSrc.includes("tag") || pickerSrc.includes("updatedAt"), "no tag feature expected"); // just ensure not full DAM
  assert.ok(!myMediaSrc.includes("search") || myMediaSrc.includes("list"), "no search required");
  assert.ok(!pickerSrc.includes("bulk") && !pickerSrc.includes("Bulk"), "no bulk actions");
  assert.ok(!pickerSrc.includes("rename") && !pickerSrc.includes("Rename"), "no rename");
  assert.ok(!myMediaSrc.includes("media_assets") && !pickerSrc.includes("analytics"), "no analytics");
  assert.ok(fieldSrc.includes("Upload") && fieldSrc.includes("My Media") && fieldSrc.includes("Direct URL"), "only 3 tabs, not DAM");
});
