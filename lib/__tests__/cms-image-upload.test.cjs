/**
 * Tests for CMS & SEO Image Upload and Validation pipeline.
 *
 * Verifies:
 * 1. Migration 117 + rollback exist in db/ and supabase/migrations/ with cms-media bucket and admin RLS.
 * 2. Uploaded URLs (Supabase storage, root-relative, external https) survive getHomepageSettings validation.
 * 3. Invalid URLs fall back to default safely without crashing.
 * 4. HomepageCmsTabs component wires CmsImageField across all 5 image fields with cms-media bucket.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

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

const { getHomepageSettings, DEFAULT_HOMEPAGE_SETTINGS } = require("../homepage-hero.ts");

test("migration 117 and rollback exist for cms-media bucket with admin RLS", () => {
  const canonical = fs.readFileSync(
    path.join(ROOT, "db/migration_117_cms_media_storage.sql"),
    "utf8"
  );
  const rollback = fs.readFileSync(
    path.join(ROOT, "db/migration_117_cms_media_storage_rollback.sql"),
    "utf8"
  );
  const mirror = fs.readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260913010000_migration_117_cms_media_storage.sql"
    ),
    "utf8"
  );

  assert.ok(canonical.includes("cms-media"), "canonical migration creates cms-media bucket");
  assert.ok(canonical.includes("profiles.role = 'admin'"), "canonical migration restricts write to admins");
  assert.ok(canonical.includes("CMS media is public for SELECT"), "canonical migration allows public select");
  assert.ok(rollback.includes("DROP POLICY"), "rollback drops policies");
  assert.ok(rollback.includes("DELETE FROM storage.buckets WHERE id = 'cms-media'"), "rollback deletes bucket");
  const body = (s) => s.slice(s.indexOf("BEGIN;")).trim();
  assert.equal(body(canonical), body(mirror), "supabase/ mirror matches db/ canonical body");
});

test("uploaded Supabase Storage URL survives getHomepageSettings validation", () => {
  const uploadedUrl =
    "https://example.supabase.co/storage/v1/object/public/cms-media/seo/1726189200-abc1234-og-card.png";
  const heroUrl =
    "https://example.supabase.co/storage/v1/object/public/cms-media/hero/1726189200-def5678-hero-bg.jpg";

  const settings = getHomepageSettings([
    { key: "homepage_seo_og_image_url", value: uploadedUrl },
    { key: "homepage_hero_image_url", value: heroUrl },
    { key: "events_hero_image_url", value: uploadedUrl },
    { key: "fundraisers_hero_image_url", value: uploadedUrl },
    { key: "organizers_hero_image_url", value: uploadedUrl },
  ]);

  assert.equal(settings.seoOgImageUrl, uploadedUrl);
  assert.equal(settings.imageUrl, heroUrl);
  assert.equal(settings.eventsHeroImageUrl, uploadedUrl);
  assert.equal(settings.fundraisersHeroImageUrl, uploadedUrl);
  assert.equal(settings.organizersHeroImageUrl, uploadedUrl);
});

test("root-relative and manual paste URLs survive getHomepageSettings validation", () => {
  const rootRelative = "/aldriva-og-image-v2.png";
  const externalHttps = "https://images.unsplash.com/photo-1501386761578-eac5c94b800a";

  const settings = getHomepageSettings([
    { key: "homepage_seo_og_image_url", value: rootRelative },
    { key: "homepage_hero_image_url", value: externalHttps },
  ]);

  assert.equal(settings.seoOgImageUrl, rootRelative);
  assert.equal(settings.imageUrl, externalHttps);
});

test("invalid URL gracefully falls back to default settings without crashing", () => {
  const settings = getHomepageSettings([
    { key: "homepage_seo_og_image_url", value: "javascript:alert(1)" },
    { key: "homepage_hero_image_url", value: "not-a-valid-url" },
  ]);

  assert.equal(settings.imageUrl, DEFAULT_HOMEPAGE_SETTINGS.imageUrl);
  assert.ok(
    settings.seoOgImageUrl.startsWith("http") || settings.seoOgImageUrl.startsWith("/"),
    "seoOgImageUrl falls back to a valid URL"
  );
});

test("HomepageCmsTabs wires CmsImageField across all 5 image fields with cms-media bucket", () => {
  const tabsSource = fs.readFileSync(
    path.join(ROOT, "app/admin/homepage/HomepageCmsTabs.tsx"),
    "utf8"
  );

  assert.ok(tabsSource.includes("CmsImageField"), "CmsImageField component is defined");
  assert.ok(tabsSource.includes('bucket = "cms-media"'), "cms-media is the default bucket");
  assert.ok(tabsSource.includes("useImageUpload"), "useImageUpload hook is used");
  assert.ok(tabsSource.includes("ALLOWED_IMAGE_TYPES"), "ALLOWED_IMAGE_TYPES is referenced");

  // All 5 fields use CmsImageField
  assert.ok(tabsSource.includes('folder="hero"'), "Hero image uses CmsImageField");
  assert.ok(tabsSource.includes('folder="events-landing"'), "Events landing image uses CmsImageField");
  assert.ok(tabsSource.includes('folder="fundraisers-landing"'), "Fundraisers landing image uses CmsImageField");
  assert.ok(tabsSource.includes('folder="organizers-landing"'), "Organizers landing image uses CmsImageField");
  assert.ok(tabsSource.includes('folder="seo"'), "SEO OG image uses CmsImageField");
  assert.ok(tabsSource.includes("aspectRatioCheck={true}"), "SEO OG image checks aspect ratio");
});
