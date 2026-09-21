/**
 * lib/dashboard/__tests__/website-builder-inspectors.test.cjs
 *
 * Behavioral & Structural Test Suite for Task 4.2: Block Property Inspectors.
 *
 * Invariants Tested:
 * 1. Inspector Component Inventory:
 *    - All 10 modern block inspectors + 2 legacy inspectors exist and export correctly.
 * 2. BLOCK_LIMITS Parity:
 *    - Inspectors import and bind to BLOCK_LIMITS from lib/website-blocks.ts.
 *    - Exceeding field length bounds (heading > 200, subheading > 1000, label > 100, etc.)
 *      is flagged by validation logic.
 * 3. Media Upload Scope:
 *    - Image upload fields bind to bucket "cms-media" and folder prefix "<tenant_id>/...".
 * 4. Embed Scoping & Limit Bounds:
 *    - Limit fields are clamped within MIN_EMBED_LIMIT (1) and MAX_EMBED_LIMIT (12).
 *    - Item pickers strictly isolate tenant items: items belonging to other organizers/tenants
 *      are filtered out.
 * 5. URL Safety:
 *    - Unsafe URL schemes (javascript:, data:, vbscript:) are rejected.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
}

require.extensions[".ts"] = compileTs;
require.extensions[".tsx"] = compileTs;

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

const INSPECTORS_DIR = path.join(
  ROOT,
  "components",
  "dashboard",
  "website",
  "builder",
  "inspectors"
);

const { BLOCK_LIMITS, validateBlock } = require("@/lib/website-blocks");
const { sanitizeUrl } = require("@/lib/sanitize-html");
const {
  filterTenantEvents,
} = require("@/components/dashboard/website/builder/inspectors/EventsEmbedInspector");
const {
  filterTenantProducts,
} = require("@/components/dashboard/website/builder/inspectors/ProductsEmbedInspector");
const {
  filterTenantFundraisers,
} = require("@/components/dashboard/website/builder/inspectors/FundraiserEmbedInspector");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Inspector Component Inventory
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_INSPECTORS = [
  "HeroInspector.tsx",
  "FeaturesInspector.tsx",
  "AboutInspector.tsx",
  "GalleryInspector.tsx",
  "TestimonialsInspector.tsx",
  "ContactInspector.tsx",
  "FaqInspector.tsx",
  "EventsEmbedInspector.tsx",
  "ProductsEmbedInspector.tsx",
  "FundraiserEmbedInspector.tsx",
  "RichTextInspector.tsx",
  "CtaBannerInspector.tsx",
  "BlockInspector.tsx",
  "index.ts",
];

test("all 10 modern and 2 legacy inspector components exist in inspectors directory", () => {
  for (const file of EXPECTED_INSPECTORS) {
    const filePath = path.join(INSPECTORS_DIR, file);
    assert.ok(
      fs.existsSync(filePath),
      `Expected inspector component file ${file} must exist`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BLOCK_LIMITS Parity & Client Validation
// ─────────────────────────────────────────────────────────────────────────────

test("inspectors import and bind to canonical BLOCK_LIMITS from lib/website-blocks.ts", () => {
  const heroCode = fs.readFileSync(
    path.join(INSPECTORS_DIR, "HeroInspector.tsx"),
    "utf8"
  );
  assert.ok(
    heroCode.includes("BLOCK_LIMITS"),
    "HeroInspector must import BLOCK_LIMITS"
  );
  assert.ok(
    heroCode.includes("BLOCK_LIMITS.HEADING_MAX_LENGTH"),
    "HeroInspector must bind HEADING_MAX_LENGTH"
  );
  assert.ok(
    heroCode.includes("BLOCK_LIMITS.SUBHEADING_MAX_LENGTH"),
    "HeroInspector must bind SUBHEADING_MAX_LENGTH"
  );
  assert.ok(
    heroCode.includes("BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH"),
    "HeroInspector must bind CTA_LABEL_MAX_LENGTH"
  );

  const featuresCode = fs.readFileSync(
    path.join(INSPECTORS_DIR, "FeaturesInspector.tsx"),
    "utf8"
  );
  assert.ok(
    featuresCode.includes("BLOCK_LIMITS.MAX_ARRAY_ITEMS"),
    "FeaturesInspector must bind MAX_ARRAY_ITEMS (12)"
  );
});

test("client validation identifies when fields exceed BLOCK_LIMITS", () => {
  const headingOverLimit = "A".repeat(BLOCK_LIMITS.HEADING_MAX_LENGTH + 1);
  const isValidLength = headingOverLimit.length <= BLOCK_LIMITS.HEADING_MAX_LENGTH;
  assert.equal(isValidLength, false, "Heading exceeding 200 chars must fail validation");

  const blockWithOverLimitHeading = {
    type: "hero",
    heading: headingOverLimit,
  };
  const res = validateBlock(blockWithOverLimitHeading);
  assert.equal(res.success, false, "validateBlock must reject over-limit heading");
  assert.ok(
    res.issues.some((i) => i.message.includes("exceeds maximum length")),
    "issue message must describe length violation"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Media Upload Integration & Tenant Scoping
// ─────────────────────────────────────────────────────────────────────────────

test("MediaUploadField uses cms-media bucket and tenant-scoped folder path", () => {
  const mediaFieldCode = fs.readFileSync(
    path.join(INSPECTORS_DIR, "common", "MediaUploadField.tsx"),
    "utf8"
  );
  assert.ok(
    mediaFieldCode.includes('bucket="cms-media"'),
    "MediaUploadField must explicitly target cms-media bucket"
  );
  assert.ok(
    mediaFieldCode.includes("uploadFolder = tenantId ? `${tenantId}/${folderSubpath}`"),
    "MediaUploadField must namespace uploads under tenant_id folder prefix"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Embed Inspector Scoping & Limit Clamping
// ─────────────────────────────────────────────────────────────────────────────

test("EventsEmbedInspector strictly isolates tenant events and excludes foreign/null/missing organizer_id", () => {
  const eventsInspectorCode = fs.readFileSync(
    path.join(INSPECTORS_DIR, "EventsEmbedInspector.tsx"),
    "utf8"
  );
  assert.ok(
    eventsInspectorCode.includes("BLOCK_LIMITS.MIN_EMBED_LIMIT") &&
      eventsInspectorCode.includes("BLOCK_LIMITS.MAX_EMBED_LIMIT"),
    "EventsEmbedInspector must enforce MIN_EMBED_LIMIT (1) and MAX_EMBED_LIMIT (12)"
  );
  assert.ok(
    !eventsInspectorCode.includes("!ev.organizer_id"),
    "EventsEmbedInspector must NOT include events with missing organizer_id"
  );

  // Test tenant filtering logic with mixed foreign and corrupted/missing data
  const TENANT_A = "tenant-aaaa-1111";
  const TENANT_B = "tenant-bbbb-2222";

  const mixedEvents = [
    { id: "e1", title: "Tenant A Gala", organizer_id: TENANT_A },
    { id: "e2", title: "Tenant A Workshop", organizer_id: TENANT_A },
    { id: "e3", title: "Tenant B Concert", organizer_id: TENANT_B },
    { id: "e4", title: "Unscoped / Corrupted Event", organizer_id: undefined },
    { id: "e5", title: "Null Org Event", organizer_id: null },
    { id: "e6", title: "Empty String Org Event", organizer_id: "" },
  ];

  // Call the actual exported pure function: filterTenantEvents
  const tenantAEvents = filterTenantEvents(mixedEvents, TENANT_A);

  assert.equal(tenantAEvents.length, 2, "Only Tenant A events must be retained");
  assert.deepEqual(
    tenantAEvents.map((e) => e.id),
    ["e1", "e2"]
  );
  assert.ok(
    !tenantAEvents.some((ev) => ev.organizer_id === TENANT_B),
    "Foreign Tenant B event must be excluded"
  );
  assert.ok(
    !tenantAEvents.some((ev) => !ev.organizer_id),
    "Events with missing/null/empty organizer_id must be excluded"
  );

  // Edge case: null or invalid inputs fail closed
  assert.deepEqual(filterTenantEvents(null, TENANT_A), []);
  assert.deepEqual(filterTenantEvents(mixedEvents, ""), []);
  assert.deepEqual(filterTenantEvents(mixedEvents, null), []);
});

test("ProductsEmbedInspector strictly isolates tenant products and excludes foreign/null/missing tenant_id", () => {
  const productsInspectorCode = fs.readFileSync(
    path.join(INSPECTORS_DIR, "ProductsEmbedInspector.tsx"),
    "utf8"
  );
  assert.ok(
    productsInspectorCode.includes("BLOCK_LIMITS.MIN_EMBED_LIMIT") &&
      productsInspectorCode.includes("BLOCK_LIMITS.MAX_EMBED_LIMIT"),
    "ProductsEmbedInspector must enforce embed limit bounds"
  );
  assert.ok(
    !productsInspectorCode.includes("!p.tenant_id") &&
      !productsInspectorCode.includes("!p.organizer_id"),
    "ProductsEmbedInspector must NOT include products with missing tenant_id"
  );

  const TENANT_A = "tenant-aaaa-1111";
  const TENANT_B = "tenant-bbbb-2222";

  const mixedProducts = [
    { id: "p1", title: "Product A", tenant_id: TENANT_A },
    { id: "p2", title: "Product B", tenant_id: TENANT_B },
    { id: "p3", title: "Unscoped Product", tenant_id: undefined },
    { id: "p4", title: "Null Tenant Product", tenant_id: null },
    { id: "p5", title: "Empty Tenant Product", tenant_id: "" },
  ];

  // Call the actual exported pure function: filterTenantProducts
  const tenantAProducts = filterTenantProducts(mixedProducts, TENANT_A);

  assert.equal(tenantAProducts.length, 1, "Only Tenant A product must be retained");
  assert.equal(tenantAProducts[0].id, "p1");
  assert.ok(!tenantAProducts.some((p) => p.tenant_id === TENANT_B));
  assert.ok(!tenantAProducts.some((p) => !p.tenant_id && !p.organizer_id));

  // Edge case: null or invalid inputs fail closed
  assert.deepEqual(filterTenantProducts(null, TENANT_A), []);
  assert.deepEqual(filterTenantProducts(mixedProducts, ""), []);
  assert.deepEqual(filterTenantProducts(mixedProducts, null), []);
});

test("FundraiserEmbedInspector strictly isolates tenant fundraisers and excludes foreign/null/missing organizer_id", () => {
  const fundraiserInspectorCode = fs.readFileSync(
    path.join(INSPECTORS_DIR, "FundraiserEmbedInspector.tsx"),
    "utf8"
  );
  assert.ok(
    fundraiserInspectorCode.includes("BLOCK_LIMITS.MIN_EMBED_LIMIT") &&
      fundraiserInspectorCode.includes("BLOCK_LIMITS.MAX_EMBED_LIMIT"),
    "FundraiserEmbedInspector must enforce embed limit bounds"
  );
  assert.ok(
    !fundraiserInspectorCode.includes("!f.organizer_id"),
    "FundraiserEmbedInspector must NOT include fundraisers with missing organizer_id"
  );

  const TENANT_A = "tenant-aaaa-1111";
  const TENANT_B = "tenant-bbbb-2222";

  const mixedFundraisers = [
    { id: "f1", title: "Campaign A", organizer_id: TENANT_A },
    { id: "f2", title: "Campaign B", organizer_id: TENANT_B },
    { id: "f3", title: "Unscoped Campaign", organizer_id: undefined },
    { id: "f4", title: "Null Org Campaign", organizer_id: null },
    { id: "f5", title: "Empty Org Campaign", organizer_id: "" },
  ];

  // Call the actual exported pure function: filterTenantFundraisers
  const tenantAFundraisers = filterTenantFundraisers(mixedFundraisers, TENANT_A);

  assert.equal(tenantAFundraisers.length, 1, "Only Tenant A fundraiser must be retained");
  assert.equal(tenantAFundraisers[0].id, "f1");
  assert.ok(!tenantAFundraisers.some((f) => f.organizer_id === TENANT_B));
  assert.ok(!tenantAFundraisers.some((f) => !f.organizer_id));

  // Edge case: null or invalid inputs fail closed
  assert.deepEqual(filterTenantFundraisers(null, TENANT_A), []);
  assert.deepEqual(filterTenantFundraisers(mixedFundraisers, ""), []);
  assert.deepEqual(filterTenantFundraisers(mixedFundraisers, null), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. URL Safety & Draft Tolerance
// ─────────────────────────────────────────────────────────────────────────────

test("inspector URL validation flags malicious schemes (javascript: / data:)", () => {
  assert.equal(sanitizeUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="), "");
  assert.equal(sanitizeUrl("vbscript:msgbox(1)"), "");
  assert.equal(sanitizeUrl("https://example.com"), "https://example.com");
  assert.equal(sanitizeUrl("/events/annual-gala"), "/events/annual-gala");
});

test("draft-tolerant behavior allows incomplete fields without throwing runtime errors", () => {
  // Empty draft hero block (valid for draft saving, marked incomplete for publish)
  const draftHero = {
    type: "hero",
  };
  // Should parse safely without throwing
  assert.doesNotThrow(() => {
    const { parseBlock } = require("../../website-blocks.ts");
    const parsed = parseBlock(draftHero);
    assert.equal(parsed.type, "hero");
  });
});
