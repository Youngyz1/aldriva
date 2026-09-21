/**
 * lib/__tests__/website-blocks.test.cjs
 *
 * Unit tests for Aldriva Website Design System Schema (Phase 3 Task 3.1 & 3.4).
 *
 * Verifies:
 *  1. URL safety via sanitizeUrl() integration:
 *     - Protocol-relative (//evil.com) URLs are REJECTED.
 *     - Dangerous schemes (javascript:, data:text/html, vbscript:) are REJECTED.
 *     - Safe absolute schemes (http:, https:, mailto:, tel:) and relative paths (/, #, ?, ./) are ACCEPTED.
 *  2. UUID validation on live embed blocks:
 *     - Valid UUIDs accepted.
 *     - Malformed/non-UUID strings rejected in validateBlock and filtered in parseBlock fallback.
 *  3. Embed limit clamping (1..12, default 6).
 *  4. String length bounds and array item limits (<= 12 items).
 *  5. Hero fallback preservation of videoUrl and badge.
 *  6. All 10 block types + 2 legacy types parse correctly.
 *  7. Theme token resolution and CSS variable dictionary generation.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

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

const {
  validateBlock,
  parseBlock,
  parseBlocks,
  resolveThemeTokens,
  themeTokensToStyle,
  KNOWN_BLOCK_TYPES,
  THEME_PALETTES,
} = require("../website-blocks.ts");

// ── 1. URL Validation & Sanitization Tests ────────────────────────────────────

test("rejects protocol-relative URLs (//evil.com)", () => {
  const payload = {
    type: "hero",
    heading: "Welcome",
    ctaHref: "//evil.com/phish",
  };

  const valResult = validateBlock(payload);
  assert.strictEqual(valResult.success, false, "validateBlock must reject protocol-relative URLs");
  assert.ok(
    valResult.issues.some((i) => i.path === "ctaHref" && i.message.includes("Invalid or disallowed")),
    "Must report issue on ctaHref"
  );

  const parsed = parseBlock(payload);
  assert.ok(parsed, "parseBlock should return a sanitized fallback object");
  assert.strictEqual(parsed.ctaHref, undefined, "parseBlock must strip protocol-relative ctaHref");
});

test("rejects dangerous URL schemes (javascript:, data:, vbscript:)", () => {
  const dangerous = [
    "javascript:alert('xss')",
    "JavaScript:void(0)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
  ];

  for (const url of dangerous) {
    const result = validateBlock({
      type: "cta_banner",
      heading: "Call to Action",
      ctaHref: url,
    });
    assert.strictEqual(result.success, false, `Must reject dangerous URL: ${url}`);

    const fallback = parseBlock({
      type: "cta_banner",
      heading: "Call to Action",
      ctaHref: url,
    });
    assert.strictEqual(fallback.ctaHref, undefined, `Must strip dangerous URL in fallback: ${url}`);
  }
});

test("accepts valid absolute and relative URLs (https, http, mailto, tel, /, #, ?)", () => {
  const validUrls = [
    "https://example.com/sub/page",
    "http://localhost:3000/events",
    "mailto:contact@aldriva.com",
    "tel:+1234567890",
    "/events",
    "/site/business/about",
    "#faq-pricing",
    "?category=tech&page=2",
    "./relative-path",
    "../parent-path",
  ];

  for (const url of validUrls) {
    const result = validateBlock({
      type: "hero",
      heading: "Valid URL Test",
      ctaHref: url,
    });
    assert.strictEqual(result.success, true, `Should accept valid URL: ${url}`);
    assert.strictEqual(result.data.ctaHref, url);
  }
});

// ── 2. UUID Validation on Live Embed Blocks ───────────────────────────────────

const validUuid1 = "123e4567-e89b-12d3-a456-426614174000";
const validUuid2 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const invalidUuid = "not-a-valid-uuid";

test("validateBlock accepts valid UUIDs and rejects invalid UUIDs for events_embed", () => {
  const validResult = validateBlock({
    type: "events_embed",
    heading: "Upcoming Events",
    selectedEventIds: [validUuid1, validUuid2],
  });
  assert.strictEqual(validResult.success, true);
  assert.deepStrictEqual(validResult.data.selectedEventIds, [validUuid1, validUuid2]);

  const invalidResult = validateBlock({
    type: "events_embed",
    selectedEventIds: [validUuid1, invalidUuid],
  });
  assert.strictEqual(invalidResult.success, false);
  assert.ok(
    invalidResult.issues.some((i) => i.path === "selectedEventIds[1]" && i.message.includes("UUID")),
    "Must flag invalid UUID at index 1"
  );
});

test("parseBlock filters out invalid UUIDs in fallback for all three embed types", () => {
  const eventsEmbed = parseBlock({
    type: "events_embed",
    selectedEventIds: [validUuid1, "garbage-id", validUuid2],
  });
  assert.deepStrictEqual(eventsEmbed.selectedEventIds, [validUuid1, validUuid2]);

  const productsEmbed = parseBlock({
    type: "products_embed",
    selectedProductIds: ["malformed-123", validUuid2],
  });
  assert.deepStrictEqual(productsEmbed.selectedProductIds, [validUuid2]);

  const fundraiserEmbed = parseBlock({
    type: "fundraiser_embed",
    selectedFundraiserIds: [validUuid1, "xyz", "123"],
  });
  assert.deepStrictEqual(fundraiserEmbed.selectedFundraiserIds, [validUuid1]);
});

// ── 3. Embed Limit Clamping & Array Bounds ─────────────────────────────────────

test("clamps embed limit strictly to 1..12 with default 6", () => {
  const defaultRes = validateBlock({ type: "events_embed" });
  assert.strictEqual(defaultRes.data.limit, 6);

  const minRes = validateBlock({ type: "products_embed", limit: -10 });
  assert.strictEqual(minRes.data.limit, 1);

  const maxRes = validateBlock({ type: "fundraiser_embed", limit: 99 });
  assert.strictEqual(maxRes.data.limit, 12);

  const fallback = parseBlock({ type: "events_embed", limit: "invalid" });
  assert.strictEqual(fallback.limit, 6);
});

test("enforces max 12 array items across all block types", () => {
  const thirteenItems = Array.from({ length: 13 }, (_, i) => ({
    title: `Feature ${i + 1}`,
    description: "Description",
  }));

  const result = validateBlock({
    type: "features",
    items: thirteenItems,
  });
  assert.strictEqual(result.success, false);
  assert.ok(result.issues.some((i) => i.path === "items" && i.message.includes("at most 12")));

  const fallback = parseBlock({
    type: "features",
    items: thirteenItems,
  });
  assert.strictEqual(fallback.items.length, 12, "Fallback parser must truncate to max 12 items");
});

// ── 4. Hero Fallback Fields ───────────────────────────────────────────────────

test("parseBlock preserves videoUrl and badge in fallback branch", () => {
  const hero = parseBlock({
    type: "hero",
    heading: "Hero Headline",
    videoUrl: "https://example.com/video.mp4",
    badge: "New Release",
    // Nested malformed property to force fallback parsing
    items: ["unexpected array"],
  });

  assert.ok(hero);
  assert.strictEqual(hero.type, "hero");
  assert.strictEqual(hero.heading, "Hero Headline");
  assert.strictEqual(hero.videoUrl, "https://example.com/video.mp4");
  assert.strictEqual(hero.badge, "New Release");
});

test("parseBlock strips dangerous videoUrl in fallback branch", () => {
  const hero = parseBlock({
    type: "hero",
    heading: "Hero Headline",
    videoUrl: "javascript:alert('pwn')",
  });

  assert.ok(hero);
  assert.strictEqual(hero.videoUrl, undefined, "Dangerous videoUrl must be stripped");
});

// ── 5. All 10 Block Types + Legacy Validation ─────────────────────────────────

test("validates and parses all 10 standard block types", () => {
  const testBlocks = [
    { type: "hero", heading: "Hero", variant: "split" },
    { type: "features", heading: "Features", items: [{ title: "F1" }] },
    { type: "about", heading: "About", story: "Our story...", highlights: [{ label: "Est.", value: "2024" }] },
    { type: "gallery", heading: "Gallery", images: [{ src: "https://example.com/img.jpg" }] },
    { type: "testimonials", heading: "Reviews", items: [{ quote: "Great!", author: "Alice", rating: 5 }] },
    { type: "contact", heading: "Contact Us", email: "info@example.com", phone: "+12345" },
    { type: "faq", heading: "FAQ", items: [{ question: "Q1?", answer: "A1" }] },
    { type: "events_embed", heading: "Events", limit: 4, layout: "grid" },
    { type: "products_embed", heading: "Store", limit: 8, layout: "list" },
    { type: "fundraiser_embed", heading: "Donate", limit: 1, layout: "banner" },
    { type: "rich_text", html: "<p>Hello world</p>" },
    { type: "cta_banner", heading: "Join Us", ctaLabel: "Sign Up", ctaHref: "/signup" },
  ];

  assert.strictEqual(testBlocks.length, KNOWN_BLOCK_TYPES.length);

  for (const b of testBlocks) {
    const res = validateBlock(b);
    assert.strictEqual(res.success, true, `Block type "${b.type}" must validate successfully`);
  }

  const mixed = [...testBlocks, { type: "unsupported" }, null, "primitive"];
  const parsedList = parseBlocks(mixed);
  assert.strictEqual(parsedList.length, testBlocks.length, "parseBlocks must filter out unsupported/null items");
});

test("rejects unknown block types", () => {
  const unknown = { type: "unsupported_widget", data: "xyz" };
  const res = validateBlock(unknown);
  assert.strictEqual(res.success, false);
  assert.ok(res.issues.some((i) => i.path === "type"));

  const fallback = parseBlock(unknown);
  assert.strictEqual(fallback, null);
});

// ── 6. Theme Tokens & Palettes ────────────────────────────────────────────────

test("resolves default and named presets correctly", () => {
  const def = resolveThemeTokens("default");
  assert.strictEqual(def.primary, THEME_PALETTES.default.primary);
  assert.strictEqual(def.background, "#ffffff");

  const dark = resolveThemeTokens("dark");
  assert.strictEqual(dark.background, "#09090b");
  assert.strictEqual(dark.text, "#f4f4f5");

  const warm = resolveThemeTokens("warm_amber");
  assert.strictEqual(warm.primary, "#d97706");

  const forest = resolveThemeTokens("forest");
  assert.strictEqual(forest.primary, "#15803d");

  const slate = resolveThemeTokens("slate");
  assert.strictEqual(slate.primary, "#0f172a");
});

test("applies custom primary color override to resolved tokens", () => {
  const custom = resolveThemeTokens("slate", "#2563eb");
  assert.strictEqual(custom.primary, "#2563eb");
  assert.strictEqual(custom.accent, "#2563eb");
  assert.strictEqual(custom.background, "#ffffff"); // Retains slate background
});

test("themeTokensToStyle produces complete CSS custom property dictionary", () => {
  const tokens = resolveThemeTokens("zinc_orange");
  const style = themeTokensToStyle(tokens);

  assert.ok(style["--site-primary"]);
  assert.ok(style["--site-bg"]);
  assert.ok(style["--site-surface"]);
  assert.ok(style["--site-border"]);
  assert.ok(style["--site-text"]);
  assert.strictEqual(style["--site-primary"], "#c2410c");
});

// ── 7. BlockRenderer Component Dispatcher & Theme Integration (Task 3.3) ───────

test("BlockRenderer dispatcher and page component enforce design system and server resolution invariants", () => {
  const blockRendererSrc = fs.readFileSync(
    path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"),
    "utf8"
  );
  const pageSrc = fs.readFileSync(
    path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"),
    "utf8"
  );

  // 1. All 10 block types + 2 legacy types are dispatched
  for (const blockType of KNOWN_BLOCK_TYPES) {
    assert.ok(
      blockRendererSrc.includes(`case "${blockType}":`),
      `BlockRenderer must handle block type: "${blockType}"`
    );
  }

  // 2. Server-side embed resolver invocations
  assert.ok(
    blockRendererSrc.includes("resolveEventsEmbed("),
    "BlockRenderer must call resolveEventsEmbed for events_embed"
  );
  assert.ok(
    blockRendererSrc.includes("resolveProductsEmbed("),
    "BlockRenderer must call resolveProductsEmbed for products_embed"
  );
  assert.ok(
    blockRendererSrc.includes("resolveFundraiserEmbed("),
    "BlockRenderer must call resolveFundraiserEmbed for fundraiser_embed"
  );

  // 3. Page component passes tenantId, isTeamMember and applies theme tokens
  assert.ok(
    pageSrc.includes("resolveThemeTokens("),
    "page.tsx must call resolveThemeTokens"
  );
  assert.ok(
    pageSrc.includes("themeTokensToStyle("),
    "page.tsx must call themeTokensToStyle"
  );
  assert.ok(
    pageSrc.includes("tenantId={website.tenant_id}"),
    "page.tsx must pass website.tenant_id to BlockRenderer"
  );
  assert.ok(
    pageSrc.includes("isTeamMember={isTeamMember}"),
    "page.tsx must pass isTeamMember to BlockRenderer"
  );
});

