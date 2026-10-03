/**
 * lib/__tests__/website-engine.test.cjs
 *
 * Test suite for Aldriva Phase 2: Public Website Rendering Engine
 *
 * Covers:
 * 1. Rich text HTML sanitization & XSS neutralization for block content
 * 2. Navigation staleness guard (runtime pruning of draft page links)
 * 3. Reserved platform slug detection and validation
 * 4. Theme configuration to CSS variable generation
 * 5. Structured Data JSON-LD generation (WebSite, Organization, WebPage)
 * 6. File structure and component inventory
 * 7. Proxy gate and catch-all routing invariants
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

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const { sanitizeArticleHtml, sanitizeUrl } = require("@/lib/sanitize-html");
const {
  isReservedWebsiteSlug,
  RESERVED_WEBSITE_SLUGS,
  DEFAULT_THEME_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_FOOTER_CONFIG,
} = require("@/lib/website-nav");
const {
  getTenantSiteBaseUrl,
  getWebsiteJsonLd,
  getPageJsonLd,
  themeConfigToStyle,
  filterPublishedNavItems,
} = require("@/lib/website-structured-data");

// ── 1. HTML & URL Sanitization (XSS & Protocol Neutralization) ──────────────

test("sanitizeArticleHtml neutralizes script execution and harmful tags in block HTML", () => {
  const payloadWithScript = '<p>Welcome</p><script>alert("xss")</script>';
  const sanitizedScript = sanitizeArticleHtml(payloadWithScript);
  assert.ok(!sanitizedScript.includes("<script"), "script tags must be stripped");
  assert.ok(sanitizedScript.includes("<p>Welcome</p>"), "safe paragraph tag preserved");

  const payloadWithOnerror = '<img src="invalid.jpg" onerror="alert(1)">';
  const sanitizedOnerror = sanitizeArticleHtml(payloadWithOnerror);
  assert.ok(!sanitizedOnerror.includes("onerror"), "onerror handler must be stripped");

  const payloadWithJsLink = '<a href="javascript:alert(1)">Click me</a>';
  const sanitizedJsLink = sanitizeArticleHtml(payloadWithJsLink);
  assert.ok(!sanitizedJsLink.includes("javascript:"), "javascript: URIs must be stripped");

  const payloadWithIframe = '<iframe src="https://evil.com"></iframe>';
  const sanitizedIframe = sanitizeArticleHtml(payloadWithIframe);
  assert.ok(!sanitizedIframe.includes("<iframe"), "iframe tags must be stripped");

  const legitimateHtml = '<h1>Our Story</h1><p>We build <strong>quality</strong> solutions.</p>';
  const sanitizedClean = sanitizeArticleHtml(legitimateHtml);
  assert.equal(sanitizedClean, legitimateHtml, "legitimate formatting remains intact");
});

test("sanitizeUrl strips dangerous protocols and permits safe web schemes and relative paths", () => {
  // Dangerous schemes must be stripped (return fallback / empty string)
  assert.equal(sanitizeUrl("javascript:alert(1)"), "", "javascript: must be stripped");
  assert.equal(sanitizeUrl("JAVASCRIPT:alert(1)"), "", "case-insensitive javascript: stripped");
  assert.equal(sanitizeUrl("javascript://%0aalert(1)"), "", "obfuscated javascript stripped");
  assert.equal(sanitizeUrl("data:text/html,<script>alert(1)</script>"), "", "data: scheme stripped");
  assert.equal(sanitizeUrl("vbscript:msgbox(1)"), "", "vbscript: stripped");
  assert.equal(sanitizeUrl("//evil.com/hack"), "", "protocol-relative URL stripped");

  // Safe schemes must pass through intact
  assert.equal(sanitizeUrl("https://example.com/page"), "https://example.com/page", "https allowed");
  assert.equal(sanitizeUrl("http://example.com/asset.jpg"), "http://example.com/asset.jpg", "http allowed");
  assert.equal(sanitizeUrl("mailto:info@business.com"), "mailto:info@business.com", "mailto allowed");
  assert.equal(sanitizeUrl("tel:+1234567890"), "tel:+1234567890", "tel allowed");
  assert.equal(sanitizeUrl("/about"), "/about", "root-relative path allowed");
  assert.equal(sanitizeUrl("#contact"), "#contact", "hash anchor allowed");
  assert.equal(sanitizeUrl("./services"), "./services", "relative path allowed");

  // Non-string or nullish inputs return fallback
  assert.equal(sanitizeUrl(null), "", "null fails closed to fallback");
  assert.equal(sanitizeUrl(undefined, "#"), "#", "custom fallback respected");
  assert.equal(sanitizeUrl(123), "", "non-string fails closed");
});


// ── 2. Navigation Staleness Guard (filterPublishedNavItems) ─────────────────

test("filterPublishedNavItems removes items linking to unpublished pages at render time", () => {
  const publishedIds = new Set(["page-home", "page-about"]);

  const navItems = [
    { id: "1", label: "Home", href: "/", page_id: "page-home", order: 0 },
    { id: "2", label: "About", href: "/about", page_id: "page-about", order: 1 },
    { id: "3", label: "Draft Services", href: "/services", page_id: "page-services-draft", order: 2 },
    { id: "4", label: "External Blog", href: "https://blog.com", page_id: null, order: 3 },
    {
      id: "5",
      label: "More",
      href: "#",
      page_id: null,
      order: 4,
      children: [
        { id: "5a", label: "Draft Team", href: "/team", page_id: "page-team-draft", order: 0 },
        { id: "5b", label: "External Help", href: "https://help.com", page_id: null, order: 1 },
      ],
    },
  ];

  const filtered = filterPublishedNavItems(navItems, publishedIds);

  // Root items check
  assert.equal(filtered.length, 4, "draft root item removed");
  assert.equal(filtered[0].id, "1", "home preserved");
  assert.equal(filtered[1].id, "2", "about preserved");
  assert.equal(filtered[2].id, "4", "external link preserved");
  assert.equal(filtered[3].id, "5", "parent container preserved");

  // Nested items check
  const nested = filtered[3].children;
  assert.ok(nested, "children array exists");
  assert.equal(nested.length, 1, "nested draft page pruned");
  assert.equal(nested[0].id, "5b", "nested external link preserved");
});

// ── 3. Reserved Website Slugs ───────────────────────────────────────────────

test("isReservedWebsiteSlug correctly detects system-reserved routes", () => {
  const reservedWords = [
    "api",
    "admin",
    "dashboard",
    "site",
    "products",
    "articles",
    "events",
    "fundraisers",
    "businesses",
    "login",
    "signup",
    "settings",
    "profile",
    "checkout",
    "cart",
    "recover-account",
  ];

  for (const word of reservedWords) {
    assert.ok(isReservedWebsiteSlug(word), `"${word}" must be identified as reserved`);
    assert.ok(isReservedWebsiteSlug(word.toUpperCase()), `case-insensitive reserved check for "${word}"`);
    assert.ok(isReservedWebsiteSlug(` ${word} `), `trimmed reserved check for "${word}"`);
  }

  const validCustomSlugs = [
    "acme-cafe",
    "downtown-yoga",
    "bright-future-foundation",
    "apex-consulting",
    "artisanal-bakery",
  ];

  for (const slug of validCustomSlugs) {
    assert.ok(!isReservedWebsiteSlug(slug), `"${slug}" must be allowed as a custom tenant slug`);
  }
});

// ── 4. Theme Configuration & CSS Style Generator ────────────────────────────

test("themeConfigToStyle maps ThemeConfig properties to CSS variables", () => {
  const theme = {
    theme: "default",
    primaryColor: "#0284c7",
    fontFamily: "serif",
    borderRadius: "lg",
    darkMode: false,
  };

  const style = themeConfigToStyle(theme);
  assert.equal(style["--site-primary"], "#0284c7");
  assert.equal(style["--site-radius"], "0.5rem");
  assert.ok(style["--site-font"].includes("serif"));
  assert.equal(style.fontFamily, "var(--site-font)");

  // Full radius test
  const fullRadiusStyle = themeConfigToStyle({ ...theme, borderRadius: "full" });
  assert.equal(fullRadiusStyle["--site-radius"], "9999px");
});

// ── 5. Structured Data JSON-LD Generators ───────────────────────────────────

test("getWebsiteJsonLd and getPageJsonLd emit compliant Schema.org structured metadata", () => {
  const mockWebsite = {
    id: "w-1",
    slug: "acme-co",
    site_title: "Acme Corporation",
    site_tagline: "Building tomorrow's solutions",
    theme_config: DEFAULT_THEME_CONFIG,
    header_config: DEFAULT_HEADER_CONFIG,
    footer_config: DEFAULT_FOOTER_CONFIG,
    seo_title: "Acme Corp | Official Site",
    seo_description: "Leading tech company",
    seo_og_image: "https://example.com/og.jpg",
    status: "published",
  };

  const appUrl = "https://aldriva.com";
  const siteLd = getWebsiteJsonLd(mockWebsite, appUrl);

  assert.equal(siteLd.length, 2, "emits WebSite and Organization schemas");
  assert.equal(siteLd[0]["@type"], "WebSite");
  assert.equal(siteLd[0].name, "Acme Corporation");
  assert.equal(siteLd[0].url, "https://aldriva.com/site/acme-co");

  assert.equal(siteLd[1]["@type"], "Organization");
  assert.equal(siteLd[1].name, "Acme Corporation");
  assert.equal(siteLd[1].image, "https://example.com/og.jpg");

  const mockHomePage = {
    id: "p-1",
    website_id: "w-1",
    title: "Home",
    slug: "home",
    is_home: true,
    status: "published",
    blocks: [],
    sort_order: 0,
    seo_title: null,
    seo_description: "Welcome to Acme",
    seo_og_image: null,
  };

  const homePageLd = getPageJsonLd(mockWebsite, mockHomePage, appUrl);
  assert.equal(homePageLd["@type"], "WebPage");
  assert.equal(homePageLd.url, "https://aldriva.com/site/acme-co");
  assert.equal(homePageLd.description, "Welcome to Acme");

  const mockSubPage = {
    id: "p-2",
    website_id: "w-1",
    title: "About Us",
    slug: "about",
    is_home: false,
    status: "published",
    blocks: [],
    sort_order: 1,
    seo_title: "About Acme Corp",
    seo_description: null,
    seo_og_image: null,
  };

  const subPageLd = getPageJsonLd(mockWebsite, mockSubPage, appUrl);
  assert.equal(subPageLd.url, "https://aldriva.com/site/acme-co/about");
  assert.equal(subPageLd.name, "About Acme Corp");
});

// ── 6. Component Inventory & Routing Files ──────────────────────────────────

test("Phase 2 public website components and routes exist", () => {
  const files = [
    "app/site/[slug]/layout.tsx",
    "app/site/[slug]/[[...page]]/page.tsx",
    "components/site/SiteHeader.tsx",
    "components/site/SiteFooter.tsx",
    "components/site/DraftPreviewBanner.tsx",
    "components/site/blocks/BlockRenderer.tsx",
    "lib/website-structured-data.ts",
  ];

  for (const file of files) {
    const filePath = path.join(ROOT, file);
    assert.ok(fs.existsSync(filePath), `file ${file} must exist`);
  }
});

// ── 7. Proxy Gating Invariant Assertions ────────────────────────────────────

test("proxy.ts implements checkWebsiteAccess and /site/:path* pre-stream gate", () => {
  const proxySql = read("proxy.ts");

  assert.ok(proxySql.includes("async function checkWebsiteAccess("), "checkWebsiteAccess helper defined");
  assert.ok(proxySql.includes("const websiteSlugMatch = pathname.match("), "website slug matcher present");
  assert.ok(proxySql.includes('"/site/:path*"'), "/site/:path* added to config.matcher");
  assert.ok(proxySql.includes('site.status === "published"'), "published status check");
  assert.ok(proxySql.includes("entity_members"), "entity member check for preview");
  assert.ok(proxySql.includes("isAuthorizedAdmin("), "admin check for preview");
});


