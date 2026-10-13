/**
 * lib/__tests__/phase2a2-diagnostics-and-sections.test.cjs
 *
 * Hermetic unit test suite for Phase 2a.2:
 * 1. Save diagnostics (error codes, sanitized logs, stale autosave rejection)
 * 2. Live-link base URL matrix (dev, env, preview, prod fallback) & SEO invariant
 * 3. Public route honest view (no sample content for any viewer)
 * 4. Empty block omission on published output
 * 5. Optional sections resolution order (explicit toggle, defaultOff, live slots)
 * 6. ContentDoc enabled_sections normalizer (valid, junk, >20 keys, legacy doc)
 * 7. Dictionary parity (EN/FR saveFailed reasons, showOnSite, optionalSection)
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

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
  FLAGSHIP_TEMPLATES,
  RESTAURANT_TABLE_FLAME,
  RENTAL_DRIVELINE,
} = require("@/lib/website-template-v2");

const {
  resolveTemplateContent,
  hasBlockContent,
  isSectionEnabled,
} = require("@/lib/website-template-resolver");

const {
  normalizeContent,
  normalizeEnabledSections,
} = require("@/lib/website-content");

const {
  getTenantSiteBaseUrl,
  getTenantSiteBuilderLiveUrl,
} = require("@/lib/website-structured-data");

const { getSiteUrl } = require("@/lib/site-url");

// ============================================================================
// PART 1: Save-failed diagnostics & error codes
// ============================================================================

test("PART 1: saveContentDraft source contains stable error codes and sanitized server logging", () => {
  const code = fs.readFileSync(path.join(ROOT, "lib/actions/website-content.ts"), "utf8");

  // Verified stable error codes
  assert.ok(code.includes('code: "unauthorized"'), "unauthorized error code present");
  assert.ok(code.includes('code: "forbidden"'), "forbidden error code present");
  assert.ok(code.includes('code: "not_found"'), "not_found error code present");
  assert.ok(code.includes('code: "not_v2"'), "not_v2 error code present");
  assert.ok(code.includes('code: "too_large"'), "too_large error code present");
  assert.ok(code.includes('code: "db_error"'), "db_error error code present");
  assert.ok(code.includes('code: "unexpected"'), "unexpected error code present");
  assert.ok(code.includes('code: "STALE_DRAFT"'), "STALE_DRAFT error code present");

  // Server logging must never include content draft payload
  assert.ok(
    code.includes("console.error(`[saveContentDraft]"),
    "sanitized server log prefix exists"
  );
  assert.ok(
    !code.includes("console.error(websiteId, contentDraft)"),
    "server logs never print content draft payload"
  );
});

test("PART 1.3: autosave with expectedVersion > 0 after publish deletes draft row rejects with STALE_DRAFT", () => {
  const code = fs.readFileSync(path.join(ROOT, "lib/actions/website-content.ts"), "utf8");

  // Verify that expectedVersion is checked against existing?.version ?? 0
  assert.ok(
    code.includes('const currentVersion = typeof existing?.version === "number" ? existing.version : 0;'),
    "checks currentVersion with fallback to 0"
  );
  assert.ok(
    code.includes("expectedVersion !== currentVersion"),
    "guards against expectedVersion mismatch"
  );
  assert.ok(
    code.includes('code: "STALE_DRAFT"'),
    "returns STALE_DRAFT when versions do not match"
  );
});

// ============================================================================
// PART 2: Live-link base URL & SEO invariant
// ============================================================================

test("PART 2: getTenantSiteBaseUrl (SEO) stays strictly on production app URL and is unaffected by dev/preview", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const oldSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  try {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "development";

    // When NEXT_PUBLIC_APP_URL is empty, SEO canonical URL must fall back to https://aldriva.com
    const url = getTenantSiteBaseUrl("ams-bidjan");
    assert.strictEqual(url, "https://aldriva.com/site/ams-bidjan");

    process.env.NEXT_PUBLIC_APP_URL = "https://custom.aldriva.com";
    const customUrl = getTenantSiteBaseUrl("ams-bidjan");
    assert.strictEqual(customUrl, "https://custom.aldriva.com/site/ams-bidjan");
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    if (oldAppUrl) process.env.NEXT_PUBLIC_APP_URL = oldAppUrl;
    else delete process.env.NEXT_PUBLIC_APP_URL;
    if (oldSiteUrl) process.env.NEXT_PUBLIC_SITE_URL = oldSiteUrl;
    else delete process.env.NEXT_PUBLIC_SITE_URL;
  }
});

test("PART 2: getTenantSiteBuilderLiveUrl uses getSiteUrl cascade", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const oldSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const oldVercelEnv = process.env.VERCEL_ENV;
  const oldVercelUrl = process.env.VERCEL_URL;

  try {
    // 1. Development with no env vars -> http://localhost:3000/site/{slug}
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.SITE_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    process.env.NODE_ENV = "development";

    const devLiveUrl = getTenantSiteBuilderLiveUrl("my-bistro");
    assert.strictEqual(devLiveUrl, "http://localhost:3000/site/my-bistro");

    // 2. Env set -> uses configured URL
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.aldriva.com";
    const stagingLiveUrl = getTenantSiteBuilderLiveUrl("my-bistro");
    assert.strictEqual(stagingLiveUrl, "https://staging.aldriva.com/site/my-bistro");
    delete process.env.NEXT_PUBLIC_SITE_URL;

    // 3. Vercel preview
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "preview-deploy.vercel.app";
    const previewLiveUrl = getTenantSiteBuilderLiveUrl("my-bistro");
    assert.strictEqual(previewLiveUrl, "https://preview-deploy.vercel.app/site/my-bistro");
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;

    // 4. Production fallback domain
    process.env.NODE_ENV = "production";
    const prodLiveUrl = getTenantSiteBuilderLiveUrl("my-bistro");
    assert.strictEqual(prodLiveUrl, "https://aldriva.com/site/my-bistro");
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
    if (oldAppUrl) process.env.NEXT_PUBLIC_APP_URL = oldAppUrl;
    else delete process.env.NEXT_PUBLIC_APP_URL;
    if (oldSiteUrl) process.env.NEXT_PUBLIC_SITE_URL = oldSiteUrl;
    else delete process.env.NEXT_PUBLIC_SITE_URL;
    if (oldVercelEnv) process.env.VERCEL_ENV = oldVercelEnv;
    else delete process.env.VERCEL_ENV;
    if (oldVercelUrl) process.env.VERCEL_URL = oldVercelUrl;
    else delete process.env.VERCEL_URL;
  }
});

test("PART 2: lib/actions/website-v2.ts wires publicUrl to getTenantSiteBuilderLiveUrl", () => {
  const code = fs.readFileSync(path.join(ROOT, "lib/actions/website-v2.ts"), "utf8");
  assert.ok(
    code.includes('import { getTenantSiteBuilderLiveUrl } from "@/lib/website-structured-data";'),
    "imports getTenantSiteBuilderLiveUrl"
  );
  assert.ok(
    code.includes("publicUrl: getTenantSiteBuilderLiveUrl(data.websiteSlug),"),
    "sets publicUrl via getTenantSiteBuilderLiveUrl"
  );
});

// ============================================================================
// PART 3: Public route shows what visitors see (never samples)
// ============================================================================

test("PART 3: app/site/[slug]/[[...page]]/page.tsx forces includeSamples: false and includeSourceMap: false", () => {
  const code = fs.readFileSync(path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"), "utf8");
  assert.ok(
    code.includes("includeSamples: false"),
    "public route sets includeSamples: false unconditionally"
  );
  assert.ok(
    code.includes("includeSourceMap: false"),
    "public route sets includeSourceMap: false unconditionally"
  );
  assert.ok(
    !code.includes("includeSamples: isTeamMember"),
    "isTeamMember is no longer passed as includeSamples"
  );
});

test("PART 3: team-member render of published site produces zero sample content", () => {
  const content = {
    site_title: "Chez Marie",
    hero_headline: "Authentic French Dining",
    hero_image: "/media/hero.jpg",
  };

  // Published site resolution uses includeSamples: false
  const resolved = resolveTemplateContent(
    RESTAURANT_TABLE_FLAME.id,
    RESTAURANT_TABLE_FLAME.version,
    content,
    { includeSamples: false }
  );

  // sampleFields must be empty
  assert.strictEqual(resolved.sampleFields.length, 0, "sampleFields must be empty when includeSamples: false");

  // Every block must carry sampled: false
  for (const page of resolved.pages) {
    for (const block of page.blocks) {
      assert.strictEqual(Boolean(block.sampled), false, `Block ${block.type} on ${page.slug} has sampled: false`);
    }
  }
});

// ============================================================================
// PART 4: Empty blocks & optional sections
// ============================================================================

test("PART 4.1: hasBlockContent omits empty content on published output but preserves populated blocks", () => {
  // Empty blocks
  assert.strictEqual(hasBlockContent({ id: "1", type: "gallery", sampled: false, images: [] }), false);
  assert.strictEqual(hasBlockContent({ id: "2", type: "features", sampled: false, items: [] }), false);
  assert.strictEqual(hasBlockContent({ id: "3", type: "testimonials", sampled: false, items: [] }), false);
  assert.strictEqual(hasBlockContent({ id: "4", type: "faq", sampled: false, items: [] }), false);
  assert.strictEqual(hasBlockContent({ id: "5", type: "about", sampled: false, story: "", founderImage: "", highlights: [] }), false);

  // Populated blocks
  assert.strictEqual(hasBlockContent({ id: "1", type: "gallery", sampled: false, images: [{ src: "/media/img1.jpg" }] }), true);
  assert.strictEqual(hasBlockContent({ id: "2", type: "features", sampled: false, items: [{ title: "Dine-in" }] }), true);
  assert.strictEqual(hasBlockContent({ id: "3", type: "testimonials", sampled: false, items: [{ quote: "Great" }] }), true);
  assert.strictEqual(hasBlockContent({ id: "4", type: "faq", sampled: false, items: [{ question: "Hours?" }] }), true);

  // Unknown block type kept
  assert.strictEqual(hasBlockContent({ id: "6", type: "custom_third_party", sampled: false }), true);
});

test("PART 4.2 & 4.4: Table & Flame gallery is optional + defaultOff; DriveLine has no optional sections", () => {
  const tableFlameGallery = RESTAURANT_TABLE_FLAME.sections.find((s) => s.id === "gallery");
  assert.ok(tableFlameGallery, "Table & Flame has gallery section");
  assert.strictEqual(tableFlameGallery.optional, true, "Table & Flame gallery is optional");
  assert.strictEqual(tableFlameGallery.defaultOff, true, "Table & Flame gallery is defaultOff");

  const drivelineOptional = RENTAL_DRIVELINE.sections.filter((s) => s.optional);
  assert.strictEqual(drivelineOptional.length, 0, "DriveLine has 0 optional sections");
});

test("PART 4.3: isSectionEnabled resolution order", () => {
  const optionalSection = {
    id: "gallery",
    page: "home",
    block: "gallery",
    slots: ["gallery.photos"],
    optional: true,
    defaultOff: true,
  };

  const nonOptionalSection = {
    id: "hero",
    page: "home",
    block: "hero",
    slots: ["hero.headline"],
  };

  // 1. Non-optional section is always enabled
  assert.strictEqual(isSectionEnabled(nonOptionalSection, {}), true);
  assert.strictEqual(isSectionEnabled(nonOptionalSection, { enabled_sections: { hero: false } }), true);

  // 2. Explicit false hides optional section even if it has uploaded photos
  assert.strictEqual(
    isSectionEnabled(optionalSection, {
      gallery_images: ["/media/img1.jpg", "/media/img2.jpg"],
      enabled_sections: { gallery: false },
    }, RESTAURANT_TABLE_FLAME),
    false,
    "explicit false hides optional section even with images"
  );

  // 3. Explicit true enables optional section even if empty (empty block omission applies downstream)
  assert.strictEqual(
    isSectionEnabled(optionalSection, {
      enabled_sections: { gallery: true },
    }, RESTAURANT_TABLE_FLAME),
    true,
    "explicit true enables optional section"
  );

  // 4. Unset toggle + defaultOff: enabled if live slot content exists
  assert.strictEqual(
    isSectionEnabled(optionalSection, {
      gallery_images: ["/media/uploaded-dish.jpg"],
    }, RESTAURANT_TABLE_FLAME),
    true,
    "unset toggle + defaultOff is on when slot content exists"
  );

  // 5. Unset toggle + defaultOff: disabled if no slot content
  assert.strictEqual(
    isSectionEnabled(optionalSection, {}, RESTAURANT_TABLE_FLAME),
    false,
    "unset toggle + defaultOff is off when slot content is empty"
  );
  assert.strictEqual(
    isSectionEnabled(optionalSection, { gallery_images: [] }, RESTAURANT_TABLE_FLAME),
    false,
    "unset toggle + defaultOff is off when slot content array is empty"
  );
});

test("PART 4.3: resolution in resolveTemplateContent respects toggle and empty omission", () => {
  const baseContent = {
    site_title: "Table & Flame",
    hero_headline: "Steaks & Wine",
  };

  // Case A: Unset toggle, no photos -> gallery is skipped
  const resA = resolveTemplateContent(
    RESTAURANT_TABLE_FLAME.id,
    RESTAURANT_TABLE_FLAME.version,
    baseContent,
    { includeSamples: false }
  );
  const homeBlocksA = resA.pages.find((p) => p.isHome)?.blocks ?? [];
  assert.ok(!homeBlocksA.some((b) => b.type === "gallery"), "gallery omitted when unset and no photos");

  // Case B: Unset toggle, 1+ photos uploaded -> gallery is included
  const resB = resolveTemplateContent(
    RESTAURANT_TABLE_FLAME.id,
    RESTAURANT_TABLE_FLAME.version,
    { ...baseContent, gallery_images: ["/media/p1.jpg"] },
    { includeSamples: false }
  );
  const homeBlocksB = resB.pages.find((p) => p.isHome)?.blocks ?? [];
  assert.ok(homeBlocksB.some((b) => b.type === "gallery"), "gallery included when unset and photos exist");

  // Case C: Explicit false with photos -> gallery is skipped
  const resC = resolveTemplateContent(
    RESTAURANT_TABLE_FLAME.id,
    RESTAURANT_TABLE_FLAME.version,
    {
      ...baseContent,
      gallery_images: ["/media/p1.jpg"],
      enabled_sections: { gallery: false },
    },
    { includeSamples: false }
  );
  const homeBlocksC = resC.pages.find((p) => p.isHome)?.blocks ?? [];
  assert.ok(!homeBlocksC.some((b) => b.type === "gallery"), "gallery omitted when explicitly false");

  // Case D: Explicit true with zero photos on published output -> omitted by 4.1 empty block rule
  const resD = resolveTemplateContent(
    RESTAURANT_TABLE_FLAME.id,
    RESTAURANT_TABLE_FLAME.version,
    {
      ...baseContent,
      gallery_images: [],
      enabled_sections: { gallery: true },
    },
    { includeSamples: false }
  );
  const homeBlocksD = resD.pages.find((p) => p.isHome)?.blocks ?? [];
  assert.ok(!homeBlocksD.some((b) => b.type === "gallery"), "empty gallery omitted on published output even if explicit true");

  // Case E: Explicit true with zero photos in builder preview (includeSamples: true) -> sample photos shown
  const resE = resolveTemplateContent(
    RESTAURANT_TABLE_FLAME.id,
    RESTAURANT_TABLE_FLAME.version,
    {
      ...baseContent,
      enabled_sections: { gallery: true },
    },
    { includeSamples: true }
  );
  const homeBlocksE = resE.pages.find((p) => p.isHome)?.blocks ?? [];
  assert.ok(homeBlocksE.some((b) => b.type === "gallery"), "builder preview keeps gallery with samples when explicit true");
});

test("PART 4.2: normalizeEnabledSections cleans junk, caps at 20, drops non-booleans, never throws", () => {
  // Valid dictionary
  const valid = normalizeEnabledSections({
    gallery: true,
    testimonials: false,
    about_stats: true,
    "trust-steps": false,
  });
  assert.deepStrictEqual(valid, {
    gallery: true,
    testimonials: false,
    about_stats: true,
    "trust-steps": false,
  });

  // Junk input: dropped forbidden keys, strings, numbers, arrays, objects
  const junk = normalizeEnabledSections({
    gallery: true,
    "<script>": true,
    __proto__: true,
    constructor: true,
    UPPERCASE: true,
    bad_val_1: "true",
    bad_val_2: 1,
    bad_val_3: null,
    bad_val_4: {},
    bad_val_5: [],
  });
  assert.deepStrictEqual(junk, { gallery: true }, "drops invalid keys and non-boolean values");

  // Over 20 keys: capped at 20
  const over20 = {};
  for (let i = 0; i < 30; i++) {
    over20[`section_${i}`] = true;
  }
  const capped = normalizeEnabledSections(over20);
  assert.strictEqual(Object.keys(capped).length, 20, "capped at exactly 20 keys");

  // Invalid root input: undefined, null, non-object -> undefined
  assert.strictEqual(normalizeEnabledSections(undefined), undefined);
  assert.strictEqual(normalizeEnabledSections(null), undefined);
  assert.strictEqual(normalizeEnabledSections("invalid"), undefined);
  assert.strictEqual(normalizeEnabledSections([1, 2, 3]), undefined);

  // normalizeContent integration
  const normalizedDoc = normalizeContent({
    site_title: "My Site",
    enabled_sections: { gallery: true, junk: "not a bool" },
  });
  assert.deepStrictEqual(normalizedDoc.enabled_sections, { gallery: true });

  // Legacy doc without enabled_sections
  const legacyDoc = normalizeContent({ site_title: "Legacy Site" });
  assert.strictEqual(legacyDoc.enabled_sections, undefined);
});

test("PART 4.5: EN and FR dictionary strings are present and complete", () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

  const requiredCodes = [
    "unauthorized",
    "forbidden",
    "not_v2",
    "too_large",
    "db_error",
    "unexpected",
    "unknown",
  ];

  // EN
  assert.ok(en.Storefront, "en.Storefront exists");
  assert.ok(en.Storefront.saveFailed, "en.Storefront.saveFailed exists");
  assert.ok(en.Storefront.showOnSite, "en.Storefront.showOnSite exists");
  assert.ok(en.Storefront.optionalSection, "en.Storefront.optionalSection exists");
  assert.ok(en.Storefront.saveFailedReasons, "en.Storefront.saveFailedReasons exists");
  for (const code of requiredCodes) {
    assert.ok(en.Storefront.saveFailedReasons[code], `en.Storefront.saveFailedReasons.${code} exists`);
  }

  // FR
  assert.ok(fr.Storefront, "fr.Storefront exists");
  assert.ok(fr.Storefront.saveFailed, "fr.Storefront.saveFailed exists");
  assert.ok(fr.Storefront.showOnSite, "fr.Storefront.showOnSite exists");
  assert.ok(fr.Storefront.optionalSection, "fr.Storefront.optionalSection exists");
  assert.ok(fr.Storefront.saveFailedReasons, "fr.Storefront.saveFailedReasons exists");
  for (const code of requiredCodes) {
    assert.ok(fr.Storefront.saveFailedReasons[code], `fr.Storefront.saveFailedReasons.${code} exists`);
  }
});
