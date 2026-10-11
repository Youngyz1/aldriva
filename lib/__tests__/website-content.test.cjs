/**
 * lib/__tests__/website-content.test.cjs
 *
 * Pure unit tests for lib/website-content.ts (Stage S2 shared content store).
 * No DB, no network. Samples/placeholders must never be representable here.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
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

const originalResolveFilename = Module._resolveFilename;
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

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

const {
  normalizeContent,
  isKnownContentKey,
  SHARED_CONTENT_KEYS,
  OPTIONAL_CONTENT_KEYS,
  MAX_TEMPLATE_EXTRAS,
  MAX_CONTENT_DOC_CHARS,
} = require("@/lib/website-content");

test("registries cover the specified shared and optional keys", () => {
  for (const key of ["business_name", "logo_url", "hero_headline", "hours", "socials", "nav_labels"]) {
    assert.ok(
      SHARED_CONTENT_KEYS.includes(key),
      `shared keys must include ${key}`
    );
  }
  for (const key of ["stats", "highlights", "trust", "steps", "addons", "locations", "featured", "template_extras"]) {
    assert.ok(
      OPTIONAL_CONTENT_KEYS.includes(key),
      `optional keys must include ${key}`
    );
  }
  assert.ok(isKnownContentKey("business_name"));
  assert.ok(!isKnownContentKey("isSample"));
  assert.ok(!isKnownContentKey("sampleFields"));
});

test("normalizeContent keeps shared text fields within BLOCK_LIMITS", () => {
  const doc = normalizeContent({
    business_name: "  Table & Flame  ",
    hero_headline: "A".repeat(500),
    primary_cta_label: "B".repeat(500),
    about_text: "C".repeat(9000),
  });
  assert.equal(doc.business_name, "Table & Flame");
  assert.equal(doc.hero_headline.length, 200);
  assert.equal(doc.primary_cta_label.length, 60);
  assert.equal(doc.about_text.length, 2000);
});

test("normalizeContent drops unknown top-level keys", () => {
  const doc = normalizeContent({
    business_name: "Acme",
    block_paths: [{ blockId: "x", path: "heading" }],
    isSample: true,
    layout: "grid",
  });
  assert.equal(doc.business_name, "Acme");
  assert.ok(!("block_paths" in doc));
  assert.ok(!("isSample" in doc));
  assert.ok(!("layout" in doc));
});

test("normalizeContent rejects __proto__/constructor/prototype keys everywhere", () => {
  const payload = {
    business_name: "Acme",
    nav_labels: { home: "Home", __proto__: "polluted" },
    template_extras: { ok: "yes", constructor: "evil", nested: "fine" },
  };
  const doc = normalizeContent(payload);
  assert.equal(doc.business_name, "Acme");
  assert.ok(!("polluted" in {}), "sanity: baseline object is clean");
  assert.ok(!Object.prototype.hasOwnProperty.call(doc.nav_labels || {}, "__proto__"));
  assert.ok(!Object.prototype.hasOwnProperty.call(doc.template_extras || {}, "constructor"));
  assert.equal(doc.template_extras.ok, "yes");
  assert.equal(doc.template_extras.nested, "fine");
  assert.equal({}.polluted, undefined);
});

test("normalizeContent caps template_extras at MAX_TEMPLATE_EXTRAS keys", () => {
  const extras = {};
  for (let i = 0; i < MAX_TEMPLATE_EXTRAS + 5; i++) extras[`k${i}`] = `v${i}`;
  const doc = normalizeContent({ template_extras: extras });
  assert.equal(Object.keys(doc.template_extras).length, MAX_TEMPLATE_EXTRAS);
});

test("normalizeContent sanitizes URLs and images via the shared layer", () => {
  // NOTE (verified lib/image-url.ts:65-87): safeImageSrc allows same-origin
  // paths + Supabase/media hosts only; example.com is rejected by design.
  const doc = normalizeContent({
    logo_url: "javascript:alert(1)",
    hero_image: "/uploads/hero.jpg",
    about_image: "https://xyz.supabase.co/about.jpg",
    socials: { instagram: "javascript:evil()", facebook: "https://facebook.com/acme" },
    directions_url: "//evil.com/maps",
  });
  assert.ok(!("logo_url" in doc), "dangerous logo scheme must be dropped");
  assert.equal(doc.hero_image, "/uploads/hero.jpg");
  assert.equal(doc.about_image, "https://xyz.supabase.co/about.jpg");
  assert.ok(!("instagram" in (doc.socials || {})), "dangerous social scheme must be dropped");
  assert.equal(doc.socials.facebook, "https://facebook.com/acme");
  assert.ok(!("directions_url" in doc), "protocol-relative URL must be dropped");
});

test("normalizeContent bounds gallery, testimonials, faq, and featured ids", () => {
  const gallery = Array.from({ length: 10 }, (_, i) => `/uploads/${i}.jpg`);
  const testimonials = Array.from({ length: 15 }, (_, i) => ({
    quote: `Quote ${i}`,
    author: `Author ${i}`,
  }));
  const doc = normalizeContent({
    gallery_images: gallery,
    testimonials,
    faq: [
      { question: "Q", answer: "" },
      { question: "Deposit?", answer: "Yes" },
    ],
    featured: {
      menu_item_ids: Array.from({ length: 20 }, (_, i) => `dish-${i}`),
    },
  });
  assert.equal(doc.gallery_images.length, 6);
  assert.equal(doc.testimonials.length, 12);
  assert.equal(doc.faq.length, 1);
  assert.equal(doc.featured.menu_item_ids.length, 12);
});

test("normalizeContent returns {} for non-object input and never throws", () => {
  assert.deepEqual(normalizeContent(null), {});
  assert.deepEqual(normalizeContent("nope"), {});
  assert.deepEqual(normalizeContent([1, 2, 3]), {});
  assert.deepEqual(normalizeContent(42), {});
});

test("MAX_CONTENT_DOC_CHARS is a positive guard constant", () => {
  assert.ok(MAX_CONTENT_DOC_CHARS > 10000);
});
