/**
 * lib/__tests__/website-template-v2.test.cjs
 *
 * Hermetic tests for flagship v2 templates (Stage S3):
 * lib/website-template-v2.ts, lib/website-template-samples.ts,
 * lib/website-template-resolver.ts.
 *
 * No DB, no network. SlotId stability is pinned per id@version.
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

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const fs = require("node:fs");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
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
  listFlagshipSlotIds,
  V2_ORDER_CTA_HREF,
  V2_BOOK_CTA_HREF,
} = require("@/lib/website-template-v2");
const { FLAGSHIP_SAMPLES } = require("@/lib/website-template-samples");
const {
  resolveTemplateContent,
  resolveTemplateManifest,
  planTemplateSwitch,
  checkPublishReadiness,
} = require("@/lib/website-template-resolver");
const { V2SiteHeader } = require("@/components/site/v2/V2SiteHeader");
const { V2SiteFooter } = require("@/components/site/v2/V2SiteFooter");
const { V2WebsiteLiveLink } = require("@/components/dashboard/website/v2/V2WebsiteLiveLink");
const { PreviewBlock } = require("@/components/dashboard/website/v2/V2WebsitePreviewClient");
const { resolvePrimaryAction } = require("@/lib/storefront-primary-action");
const { normalizeCurrencyCode } = require("@/lib/website-blocks");
const { resolveStorefrontCurrency } = require("@/lib/website-v2-theme");
const { formatCurrency } = require("@/lib/format-locale");
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");
const { NextIntlClientProvider } = require("next-intl");
const enMessages = require(path.join(ROOT, "messages/en.json"));
const frMessages = require(path.join(ROOT, "messages/fr.json"));
const { KNOWN_BLOCK_TYPES, validateBlock, validateBlocks } = require("@/lib/website-blocks");
const {
  SHARED_CONTENT_KEYS,
  OPTIONAL_CONTENT_KEYS,
  normalizeContent,
} = require("@/lib/website-content");
const { safeImageSrc } = require("@/lib/image-url");
const {
  TEMPLATE_REGISTRY,
  getTemplateById,
  validateRegistry,
} = require("@/lib/website-template-registry");

function renderWithMessages(element, locale = "en") {
  const messages = locale === "fr" ? frMessages : enMessages;
  return renderToStaticMarkup(React.createElement(
    NextIntlClientProvider,
    { locale, messages },
    element
  ));
}

function valueAtElementPath(block, elementPath) {
  const normalizedPath = block.type === "hero" && elementPath === "image"
    ? "backgroundImage"
    : elementPath;
  let current = block;
  for (const token of normalizedPath.match(/[^.[\]]+|\[\d+\]/g) || []) {
    const key = token.startsWith("[") ? Number(token.slice(1, -1)) : token;
    current = current?.[key];
  }
  return current;
}

// ── Pinned slot ids per id@version (renames fail this test) ─────────────────

const RESTAURANT_SLOTS_PINNED = [
  "nav.logo", "nav.labels", "nav.cta",
  "hero.image", "hero.headline", "hero.subtext", "hero.tagline",
  "hero.cta_primary", "hero.cta_secondary", "hero.open_tag",
  "highlights.items", "menu.featured",
  "about.photo", "about.text", "about.stats",
  "gallery.photos", "testimonials.items",
  "hours.table", "location.address", "location.phone", "location.directions",
  "contact.email", "footer.business", "footer.socials", "footer.note",
];

const RENTAL_SLOTS_PINNED = [
  "nav.logo", "nav.labels", "nav.cta",
  "hero.image", "hero.headline", "hero.tagline",
  "trust.items", "fleet.featured", "steps.items",
  "about.text", "about.photo",
  "testimonials.items", "faq.items", "locations.list",
  "hours.table", "location.phone", "location.directions", "contact.email",
  "footer.business", "footer.socials", "footer.note",
];

test("flagship registry holds the two templates at 1.0.0", () => {
  assert.equal(FLAGSHIP_TEMPLATES.length, 2);
  assert.equal(RESTAURANT_TABLE_FLAME.id, "restaurant-table-flame");
  assert.equal(RESTAURANT_TABLE_FLAME.version, "1.0.0");
  assert.equal(RENTAL_DRIVELINE.id, "rental-driveline");
  assert.equal(RENTAL_DRIVELINE.version, "1.0.0");
  assert.equal(RESTAURANT_TABLE_FLAME.lockedLayout, true);
  assert.equal(RENTAL_DRIVELINE.lockedLayout, true);
});

test("slot ids are stable per id@version", () => {
  assert.deepEqual(listFlagshipSlotIds(RESTAURANT_TABLE_FLAME), RESTAURANT_SLOTS_PINNED);
  assert.deepEqual(listFlagshipSlotIds(RENTAL_DRIVELINE), RENTAL_SLOTS_PINNED);
});

test("every slot field exists in the content key registry", () => {
  const known = new Set([...SHARED_CONTENT_KEYS, ...OPTIONAL_CONTENT_KEYS]);
  for (const template of FLAGSHIP_TEMPLATES) {
    for (const slot of template.editableSlots) {
      assert.ok(known.has(slot.field), `${template.id} slot ${slot.slotId} field ${slot.field} must be a known content key`);
    }
  }
});

test("today_tag is presented as optional highlight copy and rental enquiry copy is localized", () => {
  const heroTag = RESTAURANT_TABLE_FLAME.editableSlots.find((slot) => slot.slotId === "hero.open_tag");
  assert.equal(heroTag.label, "Highlight text (optional)");
  assert.equal(enMessages.Storefront.highlightText, "Highlight text (optional)");
  assert.equal(frMessages.Storefront.highlightText, "Texte de mise en avant (facultatif)");
  assert.equal(enMessages.Storefront.rentalContactCta, "Ask about availability");
  assert.equal(frMessages.Storefront.rentalContactCta, "Demander les disponibilités");
});

test("every non-chrome section maps to an existing block type or a pendingBlock", () => {
  const known = new Set(KNOWN_BLOCK_TYPES);
  for (const template of FLAGSHIP_TEMPLATES) {
    for (const section of template.sections) {
      if (section.chrome) continue;
      if (section.block) {
        assert.ok(known.has(section.block), `${template.id} section ${section.id} block ${section.block} must exist`);
      } else {
        assert.ok(
          typeof section.pendingBlock === "string" && section.pendingBlock.length > 0,
          `${template.id} section ${section.id} must declare a pendingBlock`
        );
      }
    }
  }
});

test("locked blocks list the CTA band and footer chrome", () => {
  for (const template of FLAGSHIP_TEMPLATES) {
    assert.deepEqual(template.lockedBlocks, ["cta-band", "footer"]);
  }
});

// ── Resolver: empty doc ─────────────────────────────────────────────────────

function assertValidResolution(resolved, templateId, expectedPurposes) {
  assert.equal(resolved.templateId, templateId);
  const purposes = resolved.pages.map((p) => p.purpose).sort();
  assert.deepEqual(purposes, expectedPurposes);
  assert.ok(resolved.pages.some((p) => p.isHome), "a home page must be emitted");
  for (const page of resolved.pages) {
    assert.ok(Array.isArray(page.blocks), `${page.slug} blocks must be an array`);
    assert.ok(page.blocks.length > 0, `${page.slug} must not publish blank`);
    for (const block of page.blocks) {
      const result = validateBlock(block);
      assert.equal(result.success, true, `${templateId}/${page.slug} block invalid: ${JSON.stringify(result.issues)}`);
    }
  }
  const pageIds = new Set(resolved.pages.map((p) => p.id));
  for (const item of resolved.navigation) {
    if (item.page_id) {
      assert.ok(pageIds.has(item.page_id), `nav ${item.label} page_id ${item.page_id} must resolve to a page`);
    }
  }
}

test("resolver handles an empty content doc for both templates", () => {
  for (const template of FLAGSHIP_TEMPLATES) {
    const before = JSON.stringify({});
    const resolved = resolveTemplateContent(template.id, template.version, {});
    const expected = template.id === "restaurant-table-flame"
      ? ["catalog", "contact", "home"]
      : ["contact", "home"];
    assertValidResolution(resolved, template.id, expected);
    assert.ok(resolved.sampleFields.length > 0, "empty doc must yield sample placeholders");
    assert.ok(resolved.skipped.length > 0, "pending commerce sections must be reported skipped");
    assert.equal(JSON.stringify({}), before, "input doc must never be mutated");
  }
});

test("pages with zero renderable blocks are omitted from pages and navigation", () => {
  const restaurant = resolveTemplateContent("restaurant-table-flame", "1.0.0", {});
  assert.deepEqual(
    restaurant.omittedPages.map((p) => p.purpose),
    ["transaction"]
  );
  assert.equal(restaurant.omittedPages[0].slug, "order");
  assert.ok(restaurant.omittedPages[0].reason.includes("order_summary"));

  const rental = resolveTemplateContent("rental-driveline", "1.0.0", {});
  assert.deepEqual(
    rental.omittedPages.map((p) => p.purpose).sort(),
    ["catalog", "transaction"]
  );
  for (const omitted of rental.omittedPages) {
    assert.ok(omitted.reason.includes("pending:"));
  }
  const rentalNavLabels = rental.navigation.map((item) => item.label);
  assert.ok(!rentalNavLabels.includes("Fleet"), "omitted fleet page must drop its nav link");
  assert.ok(!rentalNavLabels.includes("Book"), "omitted book page must drop its nav link");
  for (const resolved of [restaurant, rental]) {
    for (const omitted of resolved.omittedPages) {
      assert.ok(
        !resolved.pages.some((p) => p.purpose === omitted.purpose),
        `${omitted.slug} must not be emitted`
      );
    }
  }
});

test("a test double implementing a pending block brings the page back", () => {
  const withFleet = {
    ...RENTAL_DRIVELINE,
    sections: RENTAL_DRIVELINE.sections.map((section) =>
      section.id === "fleet.grid"
        ? { ...section, block: "features", pendingBlock: undefined }
        : section
    ),
  };
  const resolved = resolveTemplateManifest(withFleet, {});
  assert.ok(
    resolved.pages.some((p) => p.purpose === "catalog" && p.blocks.length > 0),
    "fleet page reappears once fleet_grid is a real block type"
  );
  assert.ok(
    resolved.navigation.some((item) => item.label === "Fleet" && item.page_id),
    "fleet nav link is restored with the page"
  );
  assert.ok(
    !resolved.omittedPages.some((p) => p.purpose === "catalog"),
    "catalog is no longer omitted"
  );
});
test("skipped sections name pending commerce blocks, never faked types", () => {
  const restaurant = resolveTemplateContent("restaurant-table-flame", "1.0.0", {});
  const pending = restaurant.skipped.map((s) => s.pendingBlock);
  assert.ok(pending.includes("order_summary"));
  assert.ok(pending.includes("contact_form"));
  const rental = resolveTemplateContent("rental-driveline", "1.0.0", {});
  const rentalPending = rental.skipped.map((s) => s.pendingBlock);
  for (const name of ["booking_bar", "fleet_cards", "fleet_grid", "booking_form", "addons_table"]) {
    assert.ok(rentalPending.includes(name), `rental must skip ${name}`);
  }
  const emitted = new Set([
    ...restaurant.pages.flatMap((p) => p.blocks.map((b) => b.type)),
    ...rental.pages.flatMap((p) => p.blocks.map((b) => b.type)),
  ]);
  for (const name of [...pending, ...rentalPending]) {
    assert.ok(!emitted.has(name), `pending block ${name} must never be emitted`);
  }
});

// ── Resolver: full doc ──────────────────────────────────────────────────────

function buildFullDoc() {
  return {
    business_name: "Test Business",
    logo_url: "/logo.png",
    tagline: "We do things well",
    hero_image: "/hero.jpg",
    hero_headline: "Welcome to Test Business",
    hero_subtext: "The finest test business in town.",
    primary_cta_label: "Order Now",
    secondary_cta_label: "Learn More",
    about_text: "Our story begins with testing.",
    about_image: "/about.jpg",
    gallery_images: ["/g1.jpg", "/g2.jpg"],
    testimonials: [{ quote: "Great!", author: "Sam" }],
    faq: [{ question: "Open?", answer: "Yes." }],
    hours: { mon: { open: "09:00", close: "18:00" }, today_tag: "Open today until 6pm" },
    address: "1 Test Street",
    phone: "+1 (555) 000-0000",
    email: "test@example.com",
    directions_url: "https://maps.example.com/?q=test",
    socials: { instagram: "https://instagram.com/test" },
    nav_labels: { home: "Home" },
    footer_note: "Test footer.",
    stats: [{ label: "Since", value: "2020" }],
    highlights: [{ title: "Fast", description: "Very fast." }],
    trust: [{ title: "Safe", description: "Very safe." }],
    steps: [{ title: "One", description: "First." }],
    locations: [{ name: "HQ", address: "1 Test Street", hours: "9-6" }],
    featured: { menu_item_ids: ["dish-1"], vehicle_ids: ["car-1"] },
  };
}

test("resolver with a full doc yields no samples and valid blocks", () => {
  for (const template of FLAGSHIP_TEMPLATES) {
    const doc = buildFullDoc();
    const before = JSON.stringify(doc);
    const resolved = resolveTemplateContent(template.id, template.version, doc);
    const expected = template.id === "restaurant-table-flame"
      ? ["catalog", "contact", "home"]
      : ["contact", "home"];
    assertValidResolution(resolved, template.id, expected);
    assert.deepEqual(resolved.sampleFields, [], `${template.id} full doc must need no samples`);
    assert.equal(JSON.stringify(doc), before, "input doc must never be mutated");
    const hero = resolved.pages.find((p) => p.purpose === "home").blocks.find((b) => b.type === "hero");
    assert.equal(hero.heading, "Welcome to Test Business");
    assert.equal(hero.backgroundImage, "/hero.jpg");
  }
});

test("featured menu picks bind UUID-shaped ids as selectedItemIds", () => {
  const dishId = "33333333-3333-3333-3333-333333333333";
  const doc = { ...buildFullDoc(), featured: { menu_item_ids: [dishId, "not-a-uuid"] } };
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", doc);
  const featured = resolved.pages
    .find((p) => p.purpose === "home").blocks
    .find((b) => b.type === "menu_embed" && b.heading === "Featured dishes");
  assert.deepEqual(featured.selectedItemIds, [dishId], "only UUID-shaped picks bind");
  const plain = resolveTemplateContent("restaurant-table-flame", "1.0.0", {
    ...buildFullDoc(),
    featured: { menu_item_ids: ["not-a-uuid"] },
  });
  const plainFeatured = plain.pages
    .find((p) => p.purpose === "home").blocks
    .find((b) => b.type === "menu_embed" && b.heading === "Featured dishes");
  assert.ok(!("selectedItemIds" in plainFeatured), "non-UUID picks leave show-all behavior");
});
test("contact block renders hours table, locations, and directions link", () => {
  const withDetails = {
    ...buildFullDoc(),
    hours: {
      mon: { open: "09:00", close: "18:00" },
      tue: { closed: true },
      today_tag: "Open today until 6pm",
    },
    locations: [{ name: "HQ", address: "1 Test Street", hours: "9-6" }],
    directions_url: "https://maps.example.com/?q=test",
  };
  const resolved = resolveTemplateContent("rental-driveline", "1.0.0", withDetails);
  const contact = resolved.pages
    .find((p) => p.purpose === "home").blocks
    .find((b) => b.type === "contact");
  assert.deepEqual(contact.hoursTable, [
    { day: "Mon", open: "09:00", close: "18:00" },
    { day: "Tue", closed: true },
  ]);
  assert.deepEqual(contact.locations, [{ name: "HQ", address: "1 Test Street", hours: "9-6" }]);
  assert.equal(contact.directionsUrl, "https://maps.example.com/?q=test");

  const bad = validateBlock({
    type: "contact",
    hoursTable: [{ open: "09:00" }, ...Array.from({ length: 7 }, (_, i) => ({ day: `D${i}` }))],
    directionsUrl: "javascript:evil()",
  });
  assert.equal(bad.success, false, "day without label, >7 rows, and bad URL must fail");

  const fs = require("node:fs");
  const renderer = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(renderer.includes("block.hoursTable"), "renderer must read the hours table");
  assert.ok(renderer.includes("block.locations"), "renderer must read locations");
  assert.ok(renderer.includes("Get Directions"), "renderer must offer a directions link");
});
test("every sample image path has a file on disk under public/", () => {
  const fs = require("node:fs");
  for (const template of FLAGSHIP_TEMPLATES) {
    const samples = FLAGSHIP_SAMPLES[template.id];
    const imagePaths = [
      samples.hero_image,
      samples.about_image,
      ...(samples.gallery_images || []),
    ].filter(Boolean);
    assert.ok(imagePaths.length > 0, `${template.id} must declare sample images`);
    for (const imagePath of imagePaths) {
      assert.ok(
        imagePath.startsWith("/placeholders/"),
        `sample image ${imagePath} must live under /placeholders/`
      );
      assert.ok(
        fs.existsSync(path.join(ROOT, "public", imagePath)),
        `sample image file missing on disk: public${imagePath}`
      );
    }
  }
});

test("samples are render-only: never saved, always flagged, images allowed", () => {
  const doc = {};
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", doc);
  assert.deepEqual(doc, {}, "doc stays empty — samples live only in blocks + sampleFields");
  assert.ok(resolved.sampleFields.includes("hero.headline"));
  const normalized = normalizeContent(FLAGSHIP_SAMPLES["restaurant-table-flame"]);
  assert.ok(Object.keys(normalized).length > 0, "samples are valid content-shaped values");
  for (const key of ["hero_image", "about_image"]) {
    assert.ok(safeImageSrc(FLAGSHIP_SAMPLES["restaurant-table-flame"][key]), `sample ${key} must pass safeImageSrc`);
  }
  for (const src of FLAGSHIP_SAMPLES["restaurant-table-flame"].gallery_images) {
    assert.ok(safeImageSrc(src), `sample gallery ${src} must pass safeImageSrc`);
  }
});

test("resolver source maps target rendered block fields and retain original item indexes", () => {
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {});
  const blocksById = new Map(resolved.pages.flatMap((page) => page.blocks.map((block) => [block.id, block])));
  for (const [blockId, paths] of Object.entries(resolved.sourceMap)) {
    const block = blocksById.get(blockId);
    assert.ok(block, "source map block id must belong to an emitted block");
    for (const [elementPath, entry] of Object.entries(paths)) {
      assert.notEqual(
        valueAtElementPath(block, elementPath),
        undefined,
        "mapped element path must exist on the rendered block: " + block.type + "." + elementPath
      );
      assert.ok(entry.slotId && entry.field, "mapped entries identify the editable slot and content field");
    }
  }

  const homeBlocks = resolved.pages.find((page) => page.isHome).blocks;
  const lockedCta = homeBlocks.find((block) => block.type === "cta_banner");
  assert.ok(!resolved.sourceMap[lockedCta.id], "locked CTA copy has no source map");
  const features = homeBlocks.find((block) => block.type === "features");
  const featurePaths = Object.keys(resolved.sourceMap[features.id] || {});
  assert.ok(!featurePaths.some((path) => path.endsWith(".icon") || path.endsWith(".href")));

  const filtered = resolveTemplateContent("restaurant-table-flame", "1.0.0", {
    highlights: [
      { description: "No title means this normalized row is filtered from the block." },
      { title: "Kept row", description: "Still points to row two." },
    ],
  });
  const filteredFeatures = filtered.pages.find((page) => page.isHome).blocks.find((block) => block.type === "features");
  const titleEntry = filtered.sourceMap[filteredFeatures.id]["items[0].title"];
  assert.equal(titleEntry.itemIndex, 1, "the emitted first item keeps its original content index");
  assert.equal(titleEntry.subfield, "title");

  const requiredEmpty = resolveTemplateContent(
    "restaurant-table-flame",
    "1.0.0",
    {},
    { includeSamples: false }
  );
  for (const slotId of ["nav.logo", "nav.cta", "hero.image", "hero.headline", "hours.table", "location.address", "location.phone", "footer.business"]) {
    assert.ok(requiredEmpty.checklistTargets[slotId], "required empty slot has an editor target: " + slotId);
  }
});

test("sample flags match source-map samples and maps do not alter serialized blocks", () => {
  const doc = buildFullDoc();
  const withMap = resolveTemplateContent("restaurant-table-flame", "1.0.0", doc, {
    includeSamples: false,
    includeSourceMap: true,
  });
  const withoutMap = resolveTemplateContent("restaurant-table-flame", "1.0.0", doc, {
    includeSamples: false,
    includeSourceMap: false,
  });
  assert.equal(
    JSON.stringify(withMap.pages.map((page) => page.blocks)),
    JSON.stringify(withoutMap.pages.map((page) => page.blocks)),
    "source-map presence cannot modify block bytes"
  );

  const empty = resolveTemplateContent("restaurant-table-flame", "1.0.0", {});
  const sampledSlots = new Set();
  for (const paths of Object.values(empty.sourceMap)) {
    for (const entry of Object.values(paths)) if (entry.sampled) sampledSlots.add(entry.slotId);
  }
  for (const paths of Object.values(empty.chromeSourceMap)) {
    for (const entry of Object.values(paths)) if (entry.sampled) sampledSlots.add(entry.slotId);
  }
  assert.deepEqual([...sampledSlots].sort(), [...empty.sampleFields].sort());
});

test("hero tagline is rendered above the heading in each existing variant", () => {
  const fs = require("node:fs");
  const renderer = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.equal((renderer.match(/\{block\.tagline && \(/g) || []).length, 3);
  assert.equal((renderer.match(/text-sm font-medium uppercase tracking-wide/g) || []).length, 3);
});

test("v2 chrome renders preview samples, omits empty public optionals, and emits edit paths only in edit mode", () => {
  const samples = FLAGSHIP_SAMPLES["restaurant-table-flame"];
  const preview = resolveTemplateContent("restaurant-table-flame", "1.0.0", {});
  const headerProps = {
    template: RESTAURANT_TABLE_FLAME,
    content: {},
    navigation: preview.navigation,
    siteTitle: "Acme public",
    siteSlug: "acme",
    previewMode: true,
    editMode: true,
    sampleContent: samples,
    sourceMap: preview.chromeSourceMap.menuBar,
    storefrontFeatures: preview.storefrontFeatures,
    primaryAction: preview.primaryAction.primary,
  };
  const footerProps = {
    template: RESTAURANT_TABLE_FLAME,
    content: {},
    navigation: preview.navigation,
    siteTitle: "Acme public",
    siteSlug: "acme",
    previewMode: true,
    editMode: true,
    sampleContent: samples,
    sourceMap: preview.chromeSourceMap.footer,
    storefrontFeatures: preview.storefrontFeatures,
    todayHours: preview.todayHours,
  };
  const previewHeader = renderWithMessages(React.createElement(V2SiteHeader, headerProps));
  const previewFooter = renderWithMessages(React.createElement(V2SiteFooter, footerProps));
  assert.match(previewHeader, /View menu/);
  assert.doesNotMatch(previewHeader, /Order Now/);
  assert.ok(previewHeader.includes('href="/site/acme/menu"'), "header CTA points at the emitted Menu page, not the omitted order page");
  assert.ok(previewHeader.includes('data-element-path="navigation[0].label"'));
  assert.match(previewHeader, /data-sample-content="true"/);
  assert.match(previewFooter, /Family-run since 2012/);
  assert.match(previewFooter, /instagram/);
  assert.ok(previewFooter.includes(`data-element-path="hours.${preview.todayHours.day}"`));
  assert.match(previewFooter, /Today:/);
  assert.equal((previewFooter.match(/Today:/g) || []).length, 1);
  assert.doesNotMatch(previewFooter, /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);

  const publicResolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    includeSourceMap: false,
  });
  const publicHeader = renderWithMessages(React.createElement(V2SiteHeader, {
    ...headerProps,
    navigation: publicResolved.navigation,
    previewMode: false,
    editMode: false,
    sourceMap: undefined,
  }));
  const publicFooter = renderWithMessages(React.createElement(V2SiteFooter, {
    ...footerProps,
    navigation: publicResolved.navigation,
    previewMode: false,
    editMode: false,
    sourceMap: undefined,
  }));
  assert.match(publicHeader, /View menu/);
  assert.ok(!publicHeader.includes("Order Now"));
  assert.ok(!publicFooter.includes("Family-run since 2012"));
  assert.ok(!publicFooter.includes("instagram"));
  assert.ok(!publicHeader.includes("data-element-path"));
  assert.ok(!publicFooter.includes("data-element-path"));

  const unsafeHeader = renderWithMessages(React.createElement(V2SiteHeader, {
    ...headerProps,
    content: { logo_url: "javascript:alert(1)", primary_cta_label: "Unsafe target" },
    previewMode: false,
    editMode: false,
    sampleContent: undefined,
    sourceMap: undefined,
    template: {
      ...RESTAURANT_TABLE_FLAME,
      header: { ...RESTAURANT_TABLE_FLAME.header, ctaHref: "javascript:alert(1)" },
    },
  }));
  const unsafeFooter = renderWithMessages(React.createElement(V2SiteFooter, {
    ...footerProps,
    content: { socials: { x: "javascript:alert(1)" } },
    previewMode: false,
    editMode: false,
    sampleContent: undefined,
    sourceMap: undefined,
  }));
  assert.ok(!unsafeHeader.includes("javascript:"));
  assert.ok(!unsafeFooter.includes("javascript:"));
  assert.ok(!unsafeFooter.includes(">X</a>"));
});

test("restaurant ordering-off (no offering) CTA is localized to View menu", () => {
  // Offering list deliberately excludes online_ordering -> ordering feature stays off
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    business: {
      industry: "Food & Beverage",
      category: "Restaurant",
      businessType: "Full-Service Restaurant",
      offerings: ["table_reservations"], // online_ordering absent -> ordering=false
    },
    viewMenuLabel: "Voir le menu",
  });
  const home = resolved.pages.find((page) => page.isHome);
  const hero = home.blocks.find((block) => block.type === "hero");
  // ordering built=true (menu_order block exists) but offering not selected -> ordering=false
  assert.equal(resolved.storefrontFeatures.ordering, false, "ordering is off when online_ordering offering is absent");
  assert.equal(resolved.storefrontFeatures.reservations, false, "reservations are not built by the current manifest");
  assert.equal(hero.ctaLabel, "Voir le menu");
  assert.equal(hero.ctaHref, "/menu");
  assert.equal(hero.secondaryCtaLabel, undefined, "do not duplicate the menu CTA");
  assert.doesNotMatch(JSON.stringify({ pages: resolved.pages, navigation: resolved.navigation }), /reservation|order now/i);
});

test("rental preview uses a localized availability enquiry CTA and still targets Contact", () => {
  const resolved = resolveTemplateContent("rental-driveline", "1.0.0", {}, {
    business: { industry: "Automotive & Transportation", category: "Vehicle Rental", businessType: "Car Rental" },
    rentalContactCta: "Demander les disponibilités",
    primaryActionLabels: { rentalContactCta: "Demander les disponibilités" },
  });
  const hero = resolved.pages.find((page) => page.isHome).blocks.find((block) => block.type === "hero");
  assert.equal(hero.ctaLabel, "Demander les disponibilités");
  assert.equal(hero.ctaHref, "/contact");
  assert.equal(RENTAL_DRIVELINE.header.ctaLabel, "Ask about availability");
  assert.doesNotMatch(RENTAL_DRIVELINE.description, /date.range booking|booking flow/i);
  assert.doesNotMatch(JSON.stringify(resolved.pages), /book online|reserve online|free cancellation/i);

  const header = renderWithMessages(React.createElement(V2SiteHeader, {
    template: RENTAL_DRIVELINE,
    content: {},
    navigation: resolved.navigation,
    siteTitle: "DriveLine",
    siteSlug: "driveline",
    previewMode: true,
    sampleContent: FLAGSHIP_SAMPLES["rental-driveline"],
    storefrontFeatures: resolved.storefrontFeatures,
    primaryAction: resolved.primaryAction.primary,
  }), "fr");
  assert.match(header, /Demander les disponibilités/);
  assert.ok(header.includes('href="/site/driveline/contact"'));
  assert.doesNotMatch(header, /Book a Car/);

  const restaurantPreview = resolveTemplateContent("restaurant-table-flame", "1.0.0", {});
  assert.doesNotMatch(JSON.stringify(restaurantPreview.pages), /reservations|pickup and delivery|order now/i);
});

test("selected fact offerings resolve into the existing features block for restaurants and rentals", () => {
  const emptyRestaurant = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    business: { industry: "Food & Beverage", category: "Restaurant", businessType: "Full-Service Restaurant", offerings: [] },
  });
  const unsetRestaurant = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    business: { industry: "Food & Beverage", category: "Restaurant", businessType: "Full-Service Restaurant" },
  });
  const plainRestaurant = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, { includeSamples: false });
  assert.deepEqual(emptyRestaurant.pages, plainRestaurant.pages, "unset offerings do not create an empty section or mutate legacy render output");
  assert.deepEqual(unsetRestaurant.pages, plainRestaurant.pages, "missing offerings on an existing business do not change its published output");

  const restaurant = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    business: {
      industry: "Food & Beverage",
      category: "Restaurant",
      businessType: "Full-Service Restaurant",
      offerings: ["dine_in", "parking", "online_ordering"],
      offeringLabels: { dine_in: "Sur place", parking: "Parking", online_ordering: "Commande en ligne" },
    },
    offeringsHeading: "Ce que nous proposons",
  });
  const offers = restaurant.pages.find((page) => page.isHome).blocks.find((block) => block.type === "features" && block.heading === "Ce que nous proposons");
  assert.deepEqual(offers.items.map((item) => item.title), ["Sur place", "Parking"]);
  assert.ok(!offers.items.some((item) => item.title === "Commande en ligne"), "feature offerings do not masquerade as facts");

  const rental = resolveTemplateContent("rental-driveline", "1.0.0", {}, {
    includeSamples: false,
    business: {
      industry: "Automotive & Transportation",
      category: "Vehicle Rental",
      businessType: "Car Rental",
      offerings: ["daily_rental", "delivery_to_customer"],
      offeringLabels: { daily_rental: "Location à la journée", delivery_to_customer: "Livraison chez le client" },
    },
  });
  const rentalOffers = rental.pages.find((page) => page.isHome).blocks.find((block) => block.type === "features" && block.heading === "What we offer");
  assert.deepEqual(rentalOffers.items.map((item) => item.title), ["Location à la journée"]);
});

test("primary action matrix gates by capability, live feature, and emitted page", () => {
  const emptyBuilt = { ordering: false, delivery: false, pickup: false, reservations: false };
  const menuPages = ["home", "menu", "contact"];
  const resolve = (input) => resolvePrimaryAction({
    industry: "Food & Beverage",
    category: "Restaurant",
    businessType: "Full-Service Restaurant",
    features: { offerings: [], built: emptyBuilt },
    builtPages: menuPages,
    ...input,
  });
  const rows = [
    ["restaurant ordering off", {}, { labelKey: "viewMenu", href: "/menu" }],
    ["restaurant ordering selected but not implemented", {
      features: { offerings: ["online_ordering"], built: emptyBuilt },
    }, { labelKey: "viewMenu", href: "/menu" }],
    ["restaurant ordering live", {
      features: { offerings: ["online_ordering", "pickup"], built: { ...emptyBuilt, ordering: true, pickup: true } },
    }, { labelKey: "orderNow", href: "/menu" }],
    ["full-service reservations selected but not implemented", {
      features: { offerings: ["table_reservations"], built: emptyBuilt },
    }, { labelKey: "viewMenu", href: "/menu" }],
    ["full-service reservations live", {
      features: { offerings: ["table_reservations"], built: { ...emptyBuilt, reservations: true } },
      builtPages: ["home", "menu", "reservations", "contact"],
    }, { labelKey: "reserveTable", href: "/reservations" }],
    ["fast-food reservation selection is not a capability", {
      businessType: "Fast Food / Quick Service",
      features: { offerings: ["table_reservations"], built: { ...emptyBuilt, reservations: true } },
    }, { labelKey: "viewMenu", href: "/menu" }],
    ["car rental uses contact fallback", {
      industry: "Automotive & Transportation",
      category: "Vehicle Rental",
      businessType: "Car Rental",
      builtPages: ["home", "contact"],
    }, { labelKey: "rentalContactCta", href: "/contact" }],
    ["car rental booking action requires a live booking feature and emitted page", {
      industry: "Automotive & Transportation",
      category: "Vehicle Rental",
      businessType: "Car Rental",
      features: { offerings: [], built: emptyBuilt, bookings: { selected: true, built: true } },
      builtPages: ["home", "booking", "contact"],
    }, { labelKey: "bookNow", href: "/booking" }],
    ["custom business uses contact", {
      businessType: "Custom Business",
      category: "Other",
      builtPages: ["home", "contact"],
    }, { labelKey: "contact", href: "/contact" }],
    ["unset business uses contact", {
      industry: "",
      category: "",
      businessType: null,
      builtPages: ["home", "contact"],
    }, { labelKey: "contact", href: "/contact" }],
  ];
  for (const [name, input, expected] of rows) {
    assert.deepEqual(resolve(input).primary, expected, name);
  }

  const missingTarget = resolve({
    features: { offerings: ["online_ordering"], built: { ...emptyBuilt, ordering: true } },
    builtPages: ["home", "contact"],
  });
  assert.deepEqual(missingTarget.primary, { labelKey: "contact", href: "/contact" }, "an unavailable action target falls back to Contact");

  const bothLive = resolve({
    features: { offerings: ["online_ordering", "pickup", "table_reservations"], built: { ordering: true, delivery: false, pickup: true, reservations: true } },
    builtPages: ["home", "menu", "reservations", "contact"],
  });
  assert.deepEqual(bothLive.primary, { labelKey: "orderNow", href: "/menu" });
  assert.deepEqual(bothLive.secondary, { labelKey: "reserveTable", href: "/reservations" });
});

test("preview menu empty state links to menu management; live link is published-only", () => {
  const preview = renderToStaticMarkup(React.createElement(PreviewBlock, {
    block: { type: "menu_embed", heading: "Our menu" },
    menuItems: [],
    tenantId: "tenant-7",
    currency: "USD",
    currencyLocale: "en",
    nextDayLabel: "Next day",
    closedLabel: "Closed",
    addFirstDishLabel: enMessages.Storefront.addFirstDish,
    manageMenuLabel: enMessages.Storefront.manageMenu,
  }));
  assert.match(preview, /Add your first dish/);
  assert.match(preview, /<button type="button"[^>]*>Manage menu<\/button>/);
  assert.match(preview, /Manage menu/);

  const hidden = renderWithMessages(React.createElement(V2WebsiteLiveLink, {
    isPublished: false,
    url: "https://aldriva.com/site/acme",
  }));
  assert.equal(hidden, "", "unpublished websites have no live URL controls");
  const visible = renderWithMessages(React.createElement(V2WebsiteLiveLink, {
    isPublished: true,
    url: "https://aldriva.com/site/acme",
  }));
  assert.match(visible, /Open site/);
  assert.match(visible, /Copy link/);
  assert.match(visible, /href="https:\/\/aldriva\.com\/site\/acme" target="_blank"/);
});

test("published resolver output does not contain template sample text", () => {
  const published = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    includeSourceMap: false,
  });
  const output = JSON.stringify(published.pages);
  assert.doesNotMatch(output, /Fire-kissed dishes|Wood-fired kitchen|Since 2012/);
  assert.doesNotMatch(output, /placeholders\/restaurant/);
});

test("footer displays only the timezone-resolved current day and marks overnight times", () => {
  const hoursModule = require("@/lib/website-hours");
  const now = new Date("2026-10-12T12:00:00.000Z");
  const today = hoursModule.resolveTodayHours({ mon: { open: "08:00", close: "01:00" } }, "Africa/Abidjan", now);
  assert.deepEqual(today, { day: "mon", open: "08:00", close: "01:00", overnight: true });
  assert.equal(hoursModule.isOvernightWebsiteInterval("22:00", "02:00"), true);
  assert.equal(hoursModule.resolveTodayHours({ mon: { open: "08:00" } }, "Africa/Abidjan", now), null);
  const source = require("node:fs").readFileSync(path.join(ROOT, "components/site/v2/V2SiteFooter.tsx"), "utf8");
  assert.match(source, /todayHours\.overnight/);
  assert.doesNotMatch(source, /DAYS\.map|hours\[day\]/);
});

// ── Switch planner ──────────────────────────────────────────────────────────

test("restaurant -> rental -> restaurant keeps the doc byte-identical", () => {
  const doc = buildFullDoc();
  const before = JSON.stringify(doc);
  const toRental = planTemplateSwitch("restaurant-table-flame", "rental-driveline", doc);
  assert.ok(toRental.hiddenSections.length > 0, "restaurant-only sections hide on rental");
  assert.ok(toRental.keptUnslottedKeys.includes("highlights"), "highlights kept, hidden");
  assert.ok(toRental.keptUnslottedKeys.includes("stats"), "stats kept, hidden");
  const purposes = toRental.pageMapping.map((m) => m.purpose).sort();
  assert.deepEqual(purposes, ["catalog", "contact", "home", "transaction"]);
  for (const mapping of toRental.pageMapping) {
    assert.ok(mapping.to, "every purpose maps to a slug");
  }
  const back = planTemplateSwitch("rental-driveline", "restaurant-table-flame", doc);
  assert.ok(back.keptUnslottedKeys.includes("trust"), "trust kept, hidden");
  assert.ok(back.keptUnslottedKeys.includes("steps"), "steps kept, hidden");
  assert.equal(JSON.stringify(doc), before, "planning never mutates the doc");
});

test("unknown and unslotted keys survive a switch", () => {
  const doc = { ...buildFullDoc(), template_extras: { loyalty_url: "https://example.com/loyalty" } };
  const plan = planTemplateSwitch("restaurant-table-flame", "rental-driveline", doc);
  assert.ok(plan.keptUnslottedKeys.includes("template_extras"));
  assert.ok(plan.newEmptySlots.length === 0, "full doc leaves no empty rental slots");
  const emptyPlan = planTemplateSwitch("restaurant-table-flame", "rental-driveline", {});
  assert.ok(emptyPlan.newEmptySlots.includes("hero.headline"));
});

test("unknown template ids throw", () => {
  assert.throws(() => resolveTemplateContent("nope", "1.0.0", {}), /Unknown flagship template/);
  assert.throws(() => resolveTemplateContent("restaurant-table-flame", "9.9.9", {}), /Unknown flagship template/);
  assert.throws(() => planTemplateSwitch("restaurant-table-flame", "nope", {}), /Unknown flagship template/);
});

// ── Publish readiness ───────────────────────────────────────────────────────

test("checkPublishReadiness flags missing required slots and sample use", () => {
  const empty = checkPublishReadiness("restaurant-table-flame", "1.0.0", {});
  assert.equal(empty.ready, false);
  const missing = empty.missingRequired.map((slot) => slot.slotId);
  for (const slotId of ["nav.logo", "nav.cta", "hero.image", "hero.headline", "hours.table", "location.address", "location.phone", "footer.business"]) {
    assert.ok(missing.includes(slotId), `empty doc must miss ${slotId}`);
  }
  assert.ok(empty.sampleFieldsInUse.includes("hero.headline"), "empty hero shows samples");

  const full = checkPublishReadiness("restaurant-table-flame", "1.0.0", buildFullDoc());
  assert.equal(full.ready, true);
  assert.deepEqual(full.missingRequired, []);
  assert.deepEqual(full.sampleFieldsInUse, []);

  assert.throws(() => checkPublishReadiness("nope", "1.0.0", {}), /Unknown flagship template/);
});

// ── Original 6 templates untouched ──────────────────────────────────────────

test("the original 6 templates still validate and instantiate-path helpers exist", () => {
  assert.equal(TEMPLATE_REGISTRY.length, 6);
  const registryCheck = validateRegistry();
  assert.equal(registryCheck.valid, true, `registry invalid: ${registryCheck.errors.join("; ")}`);
  for (const template of TEMPLATE_REGISTRY) {
    const found = getTemplateById(template.id);
    assert.ok(found, `${template.id} must resolve`);
    const home = template.pages.find((p) => p.isHome);
    assert.ok(home, `${template.id} must keep a home page`);
    const result = validateBlocks(home.blocks);
    assert.equal(result.success, true, `${template.id} home blocks invalid: ${JSON.stringify(result.error)}`);
  }
  const fs = require("node:fs");
  const instantiation = fs.readFileSync(path.join(ROOT, "lib/actions/website-instantiation.ts"), "utf8");
  assert.ok(instantiation.includes("create_website_from_template"), "instantiation RPC path intact");
});

// ── Stage 4A: public-route v2 theming (pure helpers) ─────────────────────────

const {
  getV2TemplateForWebsite,
  v2ThemeStyle,
} = require("@/lib/website-v2-theme");

test("getV2TemplateForWebsite resolves flagships and ignores everything else", () => {
  assert.equal(
    getV2TemplateForWebsite({ templateId: "restaurant-table-flame" })?.id,
    "restaurant-table-flame"
  );
  assert.equal(
    getV2TemplateForWebsite({ templateId: "rental-driveline" })?.id,
    "rental-driveline"
  );
  assert.equal(getV2TemplateForWebsite({ templateId: "business-starter" }), undefined, "v1 ids unchanged");
  assert.equal(getV2TemplateForWebsite({}), undefined);
  assert.equal(getV2TemplateForWebsite(null), undefined);
  assert.equal(getV2TemplateForWebsite(undefined), undefined);
  assert.equal(getV2TemplateForWebsite("restaurant-table-flame"), undefined, "non-object metadata ignored");
});

test("v2ThemeStyle applies the locked look per template", () => {
  const restaurant = v2ThemeStyle(RESTAURANT_TABLE_FLAME);
  assert.equal(restaurant["--site-primary"], "#c65d3b");
  assert.equal(restaurant["--site-primary-hover"], "#c65d3b");
  assert.equal(restaurant["--site-accent"], "#c65d3b");
  assert.equal(restaurant["--site-bg"], "#faf6ef");
  assert.ok(restaurant["--v2-heading-font"].includes("Georgia"), "serif headings for restaurant");

  const rental = v2ThemeStyle(RENTAL_DRIVELINE);
  assert.equal(rental["--site-primary"], "#2563eb");
  assert.equal(rental["--site-bg"], "#f1f4f9");
  assert.ok(!rental["--v2-heading-font"].includes("Georgia"), "sans headings for rental");
});

test("order/booking CTA targets are single constants pointing at emitted pages", () => {
  assert.equal(V2_ORDER_CTA_HREF, "/menu", "Phase 1: restaurant Order CTA goes to the emitted Menu page");
  assert.equal(V2_BOOK_CTA_HREF, "/contact", "Phase 1: rental booking CTA goes to the nearest emitted page");
  assert.equal(RESTAURANT_TABLE_FLAME.header.ctaHref, V2_ORDER_CTA_HREF);
  assert.equal(RENTAL_DRIVELINE.header.ctaHref, V2_BOOK_CTA_HREF);
});

test("currency codes normalize to ISO 4217 or drop", () => {
  assert.equal(normalizeCurrencyCode("xof"), "XOF");
  assert.equal(normalizeCurrencyCode("USD"), "USD");
  assert.equal(normalizeCurrencyCode("eur "), "EUR");
  assert.equal(normalizeCurrencyCode("US"), undefined);
  assert.equal(normalizeCurrencyCode("USDD"), undefined);
  assert.equal(normalizeCurrencyCode(""), undefined);
  assert.equal(normalizeCurrencyCode(123), undefined);
  assert.equal(normalizeCurrencyCode(null), undefined);
});

test("resolver stamps currency onto menu_embed blocks that still validate", () => {
  const { validateBlock } = require("@/lib/website-blocks");
  const withCurrency = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, { includeSamples: true, currency: "xof" });
  const menus = withCurrency.pages.flatMap((page) => page.blocks).filter((block) => block.type === "menu_embed");
  assert.ok(menus.length > 0);
  for (const block of menus) {
    assert.equal(block.currency, "XOF");
    assert.equal(validateBlock(block).success, true);
  }
  const withoutCurrency = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, { includeSamples: true });
  for (const block of withoutCurrency.pages.flatMap((page) => page.blocks).filter((block) => block.type === "menu_embed")) {
    assert.equal(block.currency, undefined);
  }
  const invalid = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, { includeSamples: true, currency: "XX" });
  for (const block of invalid.pages.flatMap((page) => page.blocks).filter((block) => block.type === "menu_embed")) {
    assert.equal(block.currency, undefined, "invalid codes drop instead of throwing");
  }
});

test("storefront currency prefers metadata, then CI country, then USD", () => {
  assert.equal(resolveStorefrontCurrency({ storefront: { currency: "eur" } }, "United States"), "EUR");
  assert.equal(resolveStorefrontCurrency({ storefront: { currency: "bogus" } }, "Côte d'Ivoire"), "XOF", "invalid metadata code falls through");
  assert.equal(resolveStorefrontCurrency({}, "Côte d'Ivoire"), "XOF");
  assert.equal(resolveStorefrontCurrency({}, "cote d'ivoire"), "XOF");
  assert.equal(resolveStorefrontCurrency({}, "Ivory Coast"), "XOF");
  assert.equal(resolveStorefrontCurrency({}, "CI"), "XOF");
  assert.equal(resolveStorefrontCurrency({}, "Senegal"), "USD");
  assert.equal(resolveStorefrontCurrency({}, null), "USD");
  assert.equal(resolveStorefrontCurrency(undefined, undefined), "USD");
});

test("XOF formats with zero decimals in both locales", () => {
  const squash = (value) => value.replace(/[  ]/g, " ");
  assert.equal(squash(formatCurrency(2500, "XOF", "fr")), "2 500 F CFA");
  assert.equal(squash(formatCurrency(2500, "XOF", "en")), "F CFA 2,500");
  assert.equal(formatCurrency(9.5, "USD", "en"), "$9.50");
});

test("BlockRenderer formats menu prices with block currency, not hardcoded USD", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.match(source, /formatCurrency\(Number\(it\.price\), displayCurrency, locale\)/);
  assert.match(source, /normalizeCurrencyCode\(block\.currency\) \?\? normalizeCurrencyCode\(currency\) \?\? "USD"/);
  assert.doesNotMatch(source, /\$\{Number\(it\.price\)\.toFixed\(2\)\}/);
});

test("every internal header/hero/nav href resolves to an emitted page (no dead links)", () => {
  const toSlug = (href) => {
    const path = String(href).split("#")[0].split("?")[0].replace(/^\/+|\/+$/g, "");
    return path === "" ? "home" : path;
  };
  for (const template of FLAGSHIP_TEMPLATES) {
    for (const doc of [{}, buildFullDoc()]) {
      const resolved = resolveTemplateContent(template.id, template.version, doc, { includeSamples: true });
      const emitted = new Set(resolved.pages.map((page) => page.slug));
      assert.ok(emitted.has("home"), `${template.id} always emits home`);
      const hrefs = [template.header.ctaHref];
      for (const page of resolved.pages) {
        for (const block of page.blocks) {
          if (block.type !== "hero" || !block || typeof block !== "object") continue;
          if (typeof block.ctaHref === "string") hrefs.push(block.ctaHref);
          if (typeof block.secondaryCtaHref === "string") hrefs.push(block.secondaryCtaHref);
        }
      }
      for (const item of resolved.navigation) hrefs.push(item.href);
      for (const href of hrefs) {
        if (typeof href !== "string" || !href.startsWith("/")) continue;
        assert.ok(emitted.has(toSlug(href)), `${template.id}: ${href} must resolve to an emitted page`);
      }
    }
  }
});
