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
  NEW_SITE_GALLERY_TEMPLATES,
  RESTAURANT_TABLE_FLAME,
  RENTAL_DRIVELINE,
  FOOD_ORDER_TEMPLATE,
  STORE_TEMPLATE,
  getFlagshipTemplate,
  listFlagshipSlotIds,
} = require("@/lib/website-template-v2");
const { FLAGSHIP_SAMPLES, FOOD_ORDER_SAMPLES, STORE_SAMPLES, STORE_PREVIEW_PRODUCTS } = require("@/lib/website-template-samples");
const {
  resolveTemplateContent,
  resolveTemplateManifest,
  selectTemplateRoutePage,
  planTemplateSwitch,
  checkPublishReadiness,
} = require("@/lib/website-template-resolver");
const { buildWebsiteTemplateResolverInputs } = require("@/lib/website-template-site-inputs");
const { V2SiteHeader } = require("@/components/site/v2/V2SiteHeader");
const { V2SiteFooter } = require("@/components/site/v2/V2SiteFooter");
const { V2WebsiteLiveLink } = require("@/components/dashboard/website/v2/V2WebsiteLiveLink");
const { PreviewBlock } = require("@/components/dashboard/website/v2/V2WebsitePreviewClient");
const { resolvePrimaryAction } = require("@/lib/storefront-primary-action");
const { getSiteBasePath } = require("@/lib/site-paths");
const { normalizeCurrencyCode } = require("@/lib/website-blocks");
const { resolveStorefrontCurrency } = require("@/lib/website-v2-theme");
const {
  PUBLIC_ACCENT_PALETTES,
  FUTURE_FOOD_ACCENT_ID,
  FUTURE_STORE_ACCENT_ID,
  getPublicAccentPalette,
  v2ThemeStyle,
} = require("@/lib/website-v2-theme");
const { resolveWebsiteCatalogAdapter } = require("@/lib/website-catalog-adapter");
const { getStoreProductStockState, canBuyStoreProduct } = require("@/lib/store-product-detail");
const { HeroBlockRenderer } = require("@/components/site/blocks/BlockRenderer");
const postcss = require("postcss");
const { chromium } = require("playwright");
const { createNeutralGallerySampleContent, getFoodOrderLocalizedCopy, getStoreLocalizedCopy } = require("@/lib/website-v2-template-preview");
const { resolveV2TemplateGalleryPreview } = require("@/lib/website-v2-template-preview");
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

const FOOD_ORDER_SLOTS_PINNED = [
  "nav.logo", "nav.labels", "nav.cta",
  "hero.image", "hero.headline", "hero.subtext", "hero.tagline",
  "hero.cta_primary", "hero.cta_secondary", "steps.items",
  "about.text", "about.photo", "testimonials.items",
  "hours.table", "location.address", "location.phone", "location.directions",
  "contact.email", "footer.business", "footer.socials", "footer.note",
];

const STORE_SLOTS_PINNED = [
  "nav.logo", "nav.labels", "hero.image", "hero.headline", "hero.subtext", "hero.tagline",
  "trust.copy", "testimonials.items", "product.fulfilment-note",
  "contact.address", "contact.phone", "contact.email", "contact.directions",
  "footer.business", "footer.socials", "footer.note",
];

test("flagship registry resolves legacy, Food Order, and Store templates at 1.0.0", () => {
  assert.equal(FLAGSHIP_TEMPLATES.length, 4);
  assert.equal(RESTAURANT_TABLE_FLAME.id, "restaurant-table-flame");
  assert.equal(RESTAURANT_TABLE_FLAME.version, "1.0.0");
  assert.equal(RENTAL_DRIVELINE.id, "rental-driveline");
  assert.equal(RENTAL_DRIVELINE.version, "1.0.0");
  assert.equal(FOOD_ORDER_TEMPLATE.id, "food-order");
  assert.equal(FOOD_ORDER_TEMPLATE.version, "1.0.0");
  assert.equal(STORE_TEMPLATE.id, "store");
  assert.equal(STORE_TEMPLATE.version, "1.0.0");
  assert.equal(getFlagshipTemplate("restaurant-table-flame", "1.0.0"), RESTAURANT_TABLE_FLAME);
  assert.equal(getFlagshipTemplate("rental-driveline", "1.0.0"), RENTAL_DRIVELINE);
  assert.equal(getFlagshipTemplate("food-order", "1.0.0"), FOOD_ORDER_TEMPLATE);
  assert.equal(getFlagshipTemplate("store", "1.0.0"), STORE_TEMPLATE);
  assert.deepEqual(NEW_SITE_GALLERY_TEMPLATES, [FOOD_ORDER_TEMPLATE, STORE_TEMPLATE]);
  assert.equal(RESTAURANT_TABLE_FLAME.lockedLayout, true);
  assert.equal(RENTAL_DRIVELINE.lockedLayout, true);
  assert.equal(FOOD_ORDER_TEMPLATE.lockedLayout, true);
  assert.equal(STORE_TEMPLATE.lockedLayout, true);
  assert.equal(STORE_TEMPLATE.defaultAccentId, FUTURE_STORE_ACCENT_ID);
});

test("slot ids are stable per id@version", () => {
  assert.deepEqual(listFlagshipSlotIds(RESTAURANT_TABLE_FLAME), RESTAURANT_SLOTS_PINNED);
  assert.deepEqual(listFlagshipSlotIds(RENTAL_DRIVELINE), RENTAL_SLOTS_PINNED);
  assert.deepEqual(listFlagshipSlotIds(FOOD_ORDER_TEMPLATE), FOOD_ORDER_SLOTS_PINNED);
  assert.deepEqual(listFlagshipSlotIds(STORE_TEMPLATE), STORE_SLOTS_PINNED);
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
    assert.deepEqual(template.lockedBlocks, template.id === "store" ? ["footer"] : ["cta-band", "footer"]);
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

test("resolver handles an empty content doc for every registered template", () => {
  for (const template of FLAGSHIP_TEMPLATES) {
    const before = JSON.stringify({});
    const resolved = resolveTemplateContent(template.id, template.version, {});
    const expected = template.id === "restaurant-table-flame" || template.id === "food-order" || template.id === "store"
      ? ["catalog", "contact", "home"]
      : ["contact", "home"];
    assertValidResolution(resolved, template.id, expected);
    assert.ok(resolved.sampleFields.length > 0, "empty doc must yield sample placeholders");
    if (template.id === "food-order" || template.id === "store") {
      assert.equal(resolved.skipped.length, 0, `${template.id} uses only existing blocks and has no pending sections`);
    } else {
      assert.ok(resolved.skipped.length > 0, "pending commerce sections must be reported skipped");
    }
    assert.equal(JSON.stringify({}), before, "input doc must never be mutated");
  }
});

test("pages with zero renderable blocks are omitted from pages and navigation", () => {
  const restaurant = resolveTemplateContent("restaurant-table-flame", "1.0.0", {});
  assert.deepEqual(
    restaurant.omittedPages.map((p) => p.purpose).sort(),
    ["booking", "transaction"]
  );
  assert.equal(restaurant.omittedPages[0].slug, "order");
  assert.ok(restaurant.omittedPages[0].reason.includes("no renderable blocks yet"));

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
  assert.ok(!pending.includes("order_summary"), "order page now reuses the built menu/checkout block when ordering is live");
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
    template_extras: { storeTrustText: "Owner supplied trust note", storeHowToReceive: "Ask us about arrangements." },
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
    const expected = template.id === "restaurant-table-flame" || template.id === "food-order" || template.id === "store"
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
    if (template.id === "food-order" || template.id === "store") {
      assert.equal(imagePaths.length, 0, "Food Order must not invent placeholder photos");
    } else {
      assert.ok(imagePaths.length > 0, `${template.id} must declare sample images`);
    }
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
  const preview = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, { siteSlug: "acme" });
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
  assert.match(previewHeader, />Contact<\/a>/);
  assert.doesNotMatch(previewHeader, /Order Now/);
  assert.ok(previewHeader.includes('href="/site/acme/contact"'), "a catalog action is not offered without a live menu");
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
    siteSlug: "acme",
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
  assert.match(publicHeader, />Contact<\/a>/);
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

test("restaurant reservation offering emits its page when online ordering stays off", () => {
  // Reservations and online ordering are separate offerings and gates.
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    siteSlug: "aldriva-food",
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
  assert.equal(resolved.storefrontFeatures.reservations, true, "the selected reservation offering is built and supported");
  assert.ok(resolved.pages.some((page) => page.slug === "reservations"));
  assert.ok(resolved.navigation.some((item) => item.href === "/site/aldriva-food/reservations"));
  assert.equal(hero.ctaHref, "/site/aldriva-food/reservations");
});

test("existing restaurant sites with reservations unticked omit the page and navigation", () => {
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    siteSlug: "aldriva-food",
    business: {
      industry: "Food & Beverage",
      category: "Restaurant",
      businessType: "Full-Service Restaurant",
      offerings: ["online_ordering", "pickup"],
    },
  });
  assert.equal(resolved.storefrontFeatures.reservations, false);
  assert.ok(!resolved.pages.some((page) => page.slug === "reservations"));
  assert.ok(!resolved.navigation.some((item) => item.href === "/site/aldriva-food/reservations"));
});

test("publish and public resolution share live reservation and order page inputs", () => {
  const linkedBusiness = {
    industry: "Food & Beverage",
    category: "Restaurant",
    business_type: "Full-Service Restaurant",
    offerings: ["online_ordering", "pickup", "table_reservations"],
  };
  const siteInputs = buildWebsiteTemplateResolverInputs({
    siteSlug: "aldriva-food",
    currency: "USD",
    metadata: { timezone: "Africa/Lagos" },
    linkedBusiness,
  });
  assert.ok(siteInputs.business.capabilities.includes("ONLINE_ORDERING"));
  assert.ok(siteInputs.business.capabilities.includes("RESERVATIONS"));
  assert.deepEqual(siteInputs.business.offerings, linkedBusiness.offerings);
  assert.equal(siteInputs.timeZone, "Africa/Lagos");
  assert.equal(Object.hasOwn(siteInputs, "reservationsApproved"), false, "approval stays outside publish-time inputs");

  const publishResolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    ...siteInputs,
    includeSamples: false,
  });
  const publishedPageSlugs = publishResolved.pages.map((page) => page.slug).sort();
  assert.ok(publishedPageSlugs.includes("order"));
  assert.ok(publishedPageSlugs.includes("reservations"));
  assert.ok(publishResolved.navigation.some((item) => item.pageSlug === "order"));
  assert.ok(publishResolved.navigation.some((item) => item.pageSlug === "reservations"));

  const publicResolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    ...siteInputs,
    includeSamples: false,
    reservationsApproved: true,
    availablePageSlugs: publishedPageSlugs,
  });
  assert.deepEqual(publicResolved.pages.map((page) => page.slug).sort(), publishedPageSlugs,
    "the public route can render the same page set as publish for identical linked-business inputs");

  const offInputs = buildWebsiteTemplateResolverInputs({
    siteSlug: "aldriva-food",
    linkedBusiness: { ...linkedBusiness, offerings: ["pickup"] },
  });
  const offResolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    ...offInputs,
    includeSamples: false,
    reservationsApproved: true,
  });
  assert.ok(!offResolved.pages.some((page) => ["order", "reservations"].includes(page.slug)));
  assert.ok(!offResolved.navigation.some((item) => ["order", "reservations"].includes(item.pageSlug)));
});

test("public reservation route needs a published row, renders ReservationForm when present, and scopes its 404", async () => {
  const siteInputs = buildWebsiteTemplateResolverInputs({
    siteSlug: "aldriva-food",
    linkedBusiness: {
      industry: "Food & Beverage",
      category: "Restaurant",
      business_type: "Full-Service Restaurant",
      offerings: ["table_reservations"],
    },
  });
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    ...siteInputs,
    includeSamples: false,
    reservationsApproved: true,
  });
  const reservationPage = resolved.pages.find((page) => page.slug === "reservations");
  assert.ok(reservationPage);
  assert.ok(reservationPage.blocks.some((block) => block.type === "reservation_form"));

  const pageRows = ["home", "menu", "contact", "reservations"].map((slug) => ({ slug, status: "published" }));
  const withRow = selectTemplateRoutePage(resolved.pages, pageRows, "reservations");
  assert.equal(withRow.target?.row.slug, "reservations");
  assert.ok(withRow.target.page.blocks.some((block) => block.type === "reservation_form"));
  const withoutRow = selectTemplateRoutePage(resolved.pages, pageRows.filter((row) => row.slug !== "reservations"), "reservations");
  assert.equal(withoutRow.target, null, "the scoped route has no render target without its page row");

  const fs = require("node:fs");
  const route = fs.readFileSync(path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"), "utf8");
  const scopedNotFound = fs.readFileSync(path.join(ROOT, "app/site/[slug]/not-found.tsx"), "utf8");
  const blockRenderer = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.match(route, /if \(!website \|\| !targetPage\)\s*\{\s*notFound\(\);/);
  assert.match(route, /selectTemplateRoutePage\(resolved\.pages, visiblePages, requestedPageSlug\)/);
  assert.match(scopedNotFound, /This page isn’t available on this site/);
  assert.match(blockRenderer, /case "reservation_form"[\s\S]*ReservationFormBlockRenderer/);
  assert.doesNotMatch(scopedNotFound, /Browse events/i);

  const website = {
    id: "website-route-test",
    tenant_id: "tenant-route-test",
    slug: "aldriva-food",
    site_title: "Aldriva Food",
    site_tagline: null,
    theme_config: { theme: "warm", primaryColor: "#c65d3b", darkMode: false },
    header_config: {},
    footer_config: {},
    seo_title: null,
    seo_description: null,
    seo_og_image: null,
    status: "published",
    metadata: { templateId: "restaurant-table-flame", templateVersion: "1.0.0" },
  };
  const linkedBusiness = {
    country: "United States",
    industry: "Food & Beverage",
    category: "Restaurant",
    business_type: "Full-Service Restaurant",
    offerings: ["table_reservations"],
  };
  let routePageRows = [
    { id: "home", website_id: website.id, slug: "home", title: "Home", is_home: true, status: "published", sort_order: 0, blocks: [] },
    { id: "menu", website_id: website.id, slug: "menu", title: "Menu", is_home: false, status: "published", sort_order: 1, blocks: [] },
    { id: "contact", website_id: website.id, slug: "contact", title: "Contact", is_home: false, status: "published", sort_order: 2, blocks: [] },
    { id: "reservations", website_id: website.id, slug: "reservations", title: "Reservations", is_home: false, status: "published", sort_order: 3, blocks: [] },
  ];
  const supabaseChain = (result) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => result,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  const moduleMocks = new Map([
    ["next/navigation", { notFound: () => { throw new Error("SITE_SCOPED_NOT_FOUND"); } }],
    ["next/headers", {
      cookies: async () => ({ get: () => undefined }),
      headers: async () => ({ get: () => null }),
    }],
    ["next-intl/server", { getTranslations: async () => (key) => key }],
    ["@/lib/supabase-admin", {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "tenant_websites") return supabaseChain({ data: website, error: null });
          if (table === "businesses") return supabaseChain({ data: linkedBusiness, error: null });
          if (table === "website_pages") return supabaseChain({ data: routePageRows, error: null });
          if (table === "website_content") return supabaseChain({ data: { content: {} }, error: null });
          throw new Error(`unexpected route table ${table}`);
        },
      }),
    }],
    ["@/lib/supabase-server", { createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }],
    ["@/lib/entity-auth", { ENTITY_ROLES_ALL: [], hasEntityAccess: async () => false }],
    ["@/lib/auth", { isAdmin: async () => false }],
    ["@/lib/server-approval", { getOrgApproval: async () => "approved" }],
    ["@/components/site/blocks/BlockRenderer", { BlockRenderer: () => null }],
    ["@/components/site/SiteHeader", { SiteHeader: () => null }],
    ["@/components/site/SiteFooter", { SiteFooter: () => null }],
    ["@/components/site/v2/V2SiteHeader", { V2SiteHeader: () => null }],
    ["@/components/site/v2/V2SiteFooter", { V2SiteFooter: () => null }],
    ["@/components/site/DraftPreviewBanner", { DraftPreviewBanner: () => null }],
  ]);
  const originalLoad = Module._load;
  Module._load = function loadPublicRouteMocks(request, parent, isMain) {
    if (request === "server-only") return {};
    if (moduleMocks.has(request)) return moduleMocks.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };
  let publicRoute;
  try {
    publicRoute = require("@/app/site/[slug]/[[...page]]/page.tsx");
  } finally {
    Module._load = originalLoad;
  }

  const rendered = await publicRoute.default({
    params: Promise.resolve({ slug: "aldriva-food", page: ["reservations"] }),
  });
  const main = React.Children.toArray(rendered.props.children).find((child) => child.type === "main");
  const reservationBlock = React.Children.toArray(main.props.children)[0];
  assert.equal(reservationBlock.props.block.type, "reservation_form",
    "/site/aldriva-food/reservations passes ReservationForm to the public block renderer");

  routePageRows = routePageRows.filter((row) => row.slug !== "reservations");
  await assert.rejects(
    publicRoute.default({ params: Promise.resolve({ slug: "aldriva-food", page: ["reservations"] }) }),
    /SITE_SCOPED_NOT_FOUND/,
    "the same scoped URL invokes the site's notFound boundary without its published row"
  );
});

test("header and footer hide internal links when a published page row is missing", () => {
  const linkedBusiness = {
    industry: "Food & Beverage",
    category: "Restaurant",
    businessType: "Full-Service Restaurant",
    offerings: ["table_reservations"],
  };
  const availablePageSlugs = ["home", "menu", "contact"];
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    siteSlug: "aldriva-food",
    business: linkedBusiness,
    reservationsApproved: true,
    availablePageSlugs,
  });
  const headerMarkup = renderWithMessages(React.createElement(V2SiteHeader, {
    template: RESTAURANT_TABLE_FLAME,
    content: {},
    navigation: resolved.navigation,
    siteTitle: "Aldriva Food",
    siteSlug: "aldriva-food",
    storefrontFeatures: resolved.storefrontFeatures,
    primaryAction: { labelKey: "reserveTable", href: "/site/aldriva-food/reservations" },
    availablePageSlugs,
  }));
  const footerMarkup = renderWithMessages(React.createElement(V2SiteFooter, {
    template: RESTAURANT_TABLE_FLAME,
    content: {},
    navigation: resolved.navigation,
    siteTitle: "Aldriva Food",
    siteSlug: "aldriva-food",
    storefrontFeatures: resolved.storefrontFeatures,
    availablePageSlugs,
  }));
  assert.ok(!headerMarkup.includes("Reserve a table"));
  assert.ok(!headerMarkup.includes("/site/aldriva-food/reservations"));
  assert.ok(!footerMarkup.includes("/site/aldriva-food/reservations"));
  const hero = resolved.pages.find((page) => page.isHome).blocks.find((block) => block.type === "hero");
  assert.equal(hero.ctaHref, "/site/aldriva-food/contact", "hero action falls back to an emitted page");
});

test("rental preview uses a localized availability enquiry CTA and still targets Contact", () => {
  const resolved = resolveTemplateContent("rental-driveline", "1.0.0", {}, {
    siteSlug: "driveline",
    business: { industry: "Automotive & Transportation", category: "Vehicle Rental", businessType: "Car Rental" },
    rentalContactCta: "Demander les disponibilités",
    primaryActionLabels: { rentalContactCta: "Demander les disponibilités" },
  });
  const hero = resolved.pages.find((page) => page.isHome).blocks.find((block) => block.type === "hero");
  assert.equal(hero.ctaLabel, "Demander les disponibilités");
  assert.equal(hero.ctaHref, "/site/driveline/contact");
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
    siteSlug: "aldriva-food",
    industry: "Food & Beverage",
    category: "Restaurant",
    businessType: "Full-Service Restaurant",
    features: { offerings: [], built: emptyBuilt },
    builtPages: menuPages,
    catalogAdapter: "menu",
    ...input,
  });
  const rows = [
    ["restaurant ordering off", {}, { labelKey: "viewMenu", href: "/site/aldriva-food/menu" }],
    ["restaurant ordering selected but not implemented", {
      features: { offerings: ["online_ordering"], built: emptyBuilt },
    }, { labelKey: "viewMenu", href: "/site/aldriva-food/menu" }],
    ["restaurant ordering live", {
      features: { offerings: ["online_ordering", "pickup"], built: { ...emptyBuilt, ordering: true, pickup: true } },
    }, { labelKey: "orderNow", href: "/site/aldriva-food/menu" }],
    ["full-service reservations selected but not implemented", {
      features: { offerings: ["table_reservations"], built: emptyBuilt },
    }, { labelKey: "viewMenu", href: "/site/aldriva-food/menu" }],
    ["full-service reservations live", {
      features: { offerings: ["table_reservations"], built: { ...emptyBuilt, reservations: true } },
      builtPages: ["home", "menu", "reservations", "contact"],
    }, { labelKey: "reserveTable", href: "/site/aldriva-food/reservations" }],
    ["fast-food reservation selection is not a capability", {
      businessType: "Fast Food / Quick Service",
      features: { offerings: ["table_reservations"], built: { ...emptyBuilt, reservations: true } },
    }, { labelKey: "viewMenu", href: "/site/aldriva-food/menu" }],
    ["car rental uses contact fallback", {
      industry: "Automotive & Transportation",
      category: "Vehicle Rental",
      businessType: "Car Rental",
      builtPages: ["home", "contact"],
    }, { labelKey: "rentalContactCta", href: "/site/aldriva-food/contact" }],
    ["car rental booking action requires a live booking feature and emitted page", {
      industry: "Automotive & Transportation",
      category: "Vehicle Rental",
      businessType: "Car Rental",
      features: { offerings: [], built: emptyBuilt, bookings: { selected: true, built: true } },
      builtPages: ["home", "booking", "contact"],
    }, { labelKey: "bookNow", href: "/site/aldriva-food/booking" }],
    ["custom business uses contact", {
      businessType: "Custom Business",
      category: "Other",
      builtPages: ["home", "contact"],
    }, { labelKey: "contact", href: "/site/aldriva-food/contact" }],
    ["unset business uses contact", {
      industry: "",
      category: "",
      businessType: null,
      builtPages: ["home", "contact"],
    }, { labelKey: "contact", href: "/site/aldriva-food/contact" }],
  ];
  for (const [name, input, expected] of rows) {
    assert.deepEqual(resolve(input).primary, expected, name);
  }
  const noMenu = resolve({ catalogAdapter: undefined, builtPages: ["home", "menu", "contact"] });
  assert.equal(noMenu.primary?.labelKey, "contact", "a page row without a live menu is not exposed as View Menu");

  const missingTarget = resolve({
    features: { offerings: ["online_ordering"], built: { ...emptyBuilt, ordering: true } },
    builtPages: ["home", "contact"],
  });
  assert.deepEqual(missingTarget.primary, { labelKey: "contact", href: "/site/aldriva-food/contact" }, "an unavailable action target falls back to Contact");

  const bothLive = resolve({
    features: { offerings: ["online_ordering", "pickup", "table_reservations"], built: { ordering: true, delivery: false, pickup: true, reservations: true } },
    builtPages: ["home", "menu", "reservations", "contact"],
  });
  assert.deepEqual(bothLive.primary, { labelKey: "orderNow", href: "/site/aldriva-food/menu" });
  assert.deepEqual(bothLive.secondary, { labelKey: "reserveTable", href: "/site/aldriva-food/reservations" });
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
  for (const slotId of ["nav.cta", "hero.headline", "hours.table", "location.address", "location.phone", "footer.business"]) {
    assert.ok(missing.includes(slotId), `empty doc must miss ${slotId}`);
  }
  assert.ok(!missing.includes("nav.logo"), "logo is optional");
  assert.ok(!missing.includes("hero.image"), "hero media is optional");
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
  assert.equal(restaurant["--site-primary-hover"], "#7c2d12");
  assert.equal(restaurant["--site-accent"], "#c65d3b");
  assert.equal(restaurant["--site-bg"], "#faf6ef");
  assert.ok(restaurant["--v2-heading-font"].includes("Georgia"), "serif headings for restaurant");

  const rental = v2ThemeStyle(RENTAL_DRIVELINE);
  assert.equal(rental["--site-primary"], "#2563eb");
  assert.equal(rental["--site-bg"], "#f1f4f9");
  assert.ok(!rental["--v2-heading-font"].includes("Georgia"), "sans headings for rental");
});

test("template manifest has no root-relative internal page hrefs", () => {
  assert.equal(RESTAURANT_TABLE_FLAME.header.ctaHref, "");
  assert.equal(RENTAL_DRIVELINE.header.ctaHref, "");
  assert.ok(RESTAURANT_TABLE_FLAME.navigation.every((entry) => !entry.href), "internal targets are page/anchor identities");
  assert.ok(RENTAL_DRIVELINE.navigation.every((entry) => !entry.href), "internal targets are page/anchor identities");
  const source = require("node:fs").readFileSync(path.join(ROOT, "lib/website-template-v2.ts"), "utf8");
  assert.doesNotMatch(source, /href:\s*["']\/(?:reservations|menu|contact|fleet)(?:["'/?#])/);
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

test("header, hero, CTA band, and footer internal links resolve within the emitted site for reservation on/off and rental", () => {
  const scenarios = [
    {
      name: "restaurant reservations on",
      template: RESTAURANT_TABLE_FLAME,
      slug: "aldriva-food",
      business: { industry: "Food & Beverage", category: "Restaurant", businessType: "Full-Service Restaurant", offerings: ["table_reservations"] },
      reservationsApproved: true,
      reservationsLive: true,
    },
    {
      name: "restaurant reservations off",
      template: RESTAURANT_TABLE_FLAME,
      slug: "aldriva-food",
      business: { industry: "Food & Beverage", category: "Restaurant", businessType: "Full-Service Restaurant", offerings: ["online_ordering", "pickup"] },
      reservationsApproved: true,
      reservationsLive: false,
    },
    {
      name: "rental",
      template: RENTAL_DRIVELINE,
      slug: "driveline",
      business: { industry: "Automotive & Transportation", category: "Vehicle Rental", businessType: "Car Rental", offerings: [] },
      reservationsApproved: true,
      reservationsLive: false,
    },
  ];

  for (const scenario of scenarios) {
    const resolved = resolveTemplateContent(scenario.template.id, scenario.template.version, buildFullDoc(), {
      includeSamples: false,
      siteSlug: scenario.slug,
      reservationsApproved: scenario.reservationsApproved,
      business: scenario.business,
    });
    const emitted = new Set(resolved.pages.map((page) => page.slug));
    const emittedAnchors = new Set();
    const home = resolved.pages.find((page) => page.isHome);
    for (const block of home.blocks) {
      if (block.type === "about") emittedAnchors.add("about");
      if (block.type === "contact") emittedAnchors.add("contact");
      if (block.type === "features" && block.heading === "How it works") emittedAnchors.add("how-it-works");
      if (block.type === "faq" && block.items.length > 0) emittedAnchors.add("faq");
    }
    assert.equal(resolved.storefrontFeatures.reservations, scenario.reservationsLive, scenario.name);
    assert.equal(emitted.has("reservations"), scenario.reservationsLive, `${scenario.name}: reservation page emit gate`);

    const internalHrefs = [];
    for (const item of resolved.navigation) internalHrefs.push(item.href);
    if (resolved.primaryAction.primary) internalHrefs.push(resolved.primaryAction.primary.href);
    if (resolved.primaryAction.secondary) internalHrefs.push(resolved.primaryAction.secondary.href);
    for (const page of resolved.pages) {
      for (const block of page.blocks) {
        if (block.type === "hero") {
          if (block.ctaHref) internalHrefs.push(block.ctaHref);
          if (block.secondaryCtaHref) internalHrefs.push(block.secondaryCtaHref);
        }
        if (block.type === "cta_banner") {
          if (block.ctaHref) internalHrefs.push(block.ctaHref);
        }
      }
    }

    const base = getSiteBasePath(scenario.slug);
    const assertResolves = (href, source) => {
      if (!href || !href.startsWith("/")) return;
      assert.ok(href === base || href.startsWith(`${base}/`) || href.startsWith(`${base}#`), `${scenario.name} ${source}: ${href} must stay under ${base}`);
      const [pathname, hash] = href.split("#", 2);
      const suffix = pathname === base ? "" : pathname.slice(base.length + 1).split("/")[0];
      const pageSlug = suffix || "home";
      assert.ok(emitted.has(pageSlug), `${scenario.name} ${source}: ${href} must resolve to an emitted page`);
      if (hash) assert.ok(emittedAnchors.has(decodeURIComponent(hash)), `${scenario.name} ${source}: #${hash} must exist on home`);
    };
    for (const href of internalHrefs) assertResolves(href, "resolver");

    const headerMarkup = renderWithMessages(React.createElement(V2SiteHeader, {
      template: scenario.template,
      content: buildFullDoc(),
      navigation: resolved.navigation,
      siteTitle: scenario.slug,
      siteSlug: scenario.slug,
      storefrontFeatures: resolved.storefrontFeatures,
      primaryAction: resolved.primaryAction.primary,
    }));
    const footerMarkup = renderWithMessages(React.createElement(V2SiteFooter, {
      template: scenario.template,
      content: buildFullDoc(),
      navigation: resolved.navigation,
      siteTitle: scenario.slug,
      siteSlug: scenario.slug,
      storefrontFeatures: resolved.storefrontFeatures,
    }));
    for (const [surface, markup] of [["header", headerMarkup], ["footer", footerMarkup]]) {
      for (const [, href] of markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) assertResolves(href, surface);
      assert.doesNotMatch(markup, /href="\/(?:reservations|menu|contact|fleet)(?:["/?#])/,
        `${scenario.name} ${surface}: no platform-root site-page links`);
    }

    const hero = home.blocks.find((block) => block.type === "hero");
    const previewHero = renderWithMessages(React.createElement(PreviewBlock, {
      block: hero,
      menuItems: [],
      currency: "USD",
      currencyLocale: "en",
      nextDayLabel: "Next day",
      closedLabel: "Closed",
      addFirstDishLabel: "Add a dish",
      manageMenuLabel: "Manage menu",
      siteSlug: scenario.slug,
    }));
    for (const [, href] of previewHero.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) assertResolves(href, "editor preview hero");
    if (scenario.reservationsLive) {
      assert.ok(previewHero.includes(`href="${base}/reservations"`), "preview hero points to the live Reservations page");
      assert.ok(headerMarkup.includes(`href="${base}/reservations"`), "published header exposes the live Reservations link");
      assert.ok(footerMarkup.includes(`href="${base}/reservations"`), "published footer exposes the live Reservations link");
    }
  }

  const notFound = require("node:fs").readFileSync(path.join(ROOT, "app/site/[slug]/not-found.tsx"), "utf8");
  assert.match(notFound, /This page isn’t available on this site/);
  assert.doesNotMatch(notFound, /Browse events/i);
  const publicRoute = require("node:fs").readFileSync(path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"), "utf8");
  assert.match(publicRoute, /scopeInternalLinks=\{Boolean\(v2Content\)\}/, "published V2 block links use tenant path resolution");
});

test("unapproved restaurant reservations are omitted from page, nav and primary action", () => {
  const resolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    siteSlug: "aldriva-food",
    reservationsApproved: false,
    business: {
      industry: "Food & Beverage",
      category: "Restaurant",
      businessType: "Full-Service Restaurant",
      offerings: ["table_reservations"],
    },
  });
  assert.equal(resolved.storefrontFeatures.reservations, false);
  assert.ok(!resolved.pages.some((page) => page.slug === "reservations"));
  assert.ok(!resolved.navigation.some((item) => item.pageSlug === "reservations"));
  assert.notEqual(resolved.primaryAction.primary?.href, "/site/aldriva-food/reservations");
});

test("public accent palettes keep existing defaults, support metadata overrides, and meet text contrast", () => {
  assert.equal(v2ThemeStyle(RESTAURANT_TABLE_FLAME)["--ps-accent"], "#c65d3b");
  assert.equal(v2ThemeStyle(RENTAL_DRIVELINE)["--ps-accent"], "#2563eb");
  assert.equal(FOOD_ORDER_TEMPLATE.defaultAccentId, FUTURE_FOOD_ACCENT_ID);
  assert.equal(FOOD_ORDER_TEMPLATE.defaultAccentId, "mustard");
  assert.equal(v2ThemeStyle(FOOD_ORDER_TEMPLATE)["--ps-accent"], getPublicAccentPalette("mustard").accent);
  assert.equal(v2ThemeStyle(FOOD_ORDER_TEMPLATE, { brand: { accentId: "forest" } })["--ps-accent"], getPublicAccentPalette("forest").accent);
  assert.equal(STORE_TEMPLATE.defaultAccentId, FUTURE_STORE_ACCENT_ID);
  assert.equal(v2ThemeStyle(STORE_TEMPLATE)["--ps-accent"], getPublicAccentPalette("warm-gold").accent);
  assert.equal(v2ThemeStyle(STORE_TEMPLATE, { brand: { accentId: "forest" } })["--ps-accent"], getPublicAccentPalette("forest").accent);
  assert.doesNotMatch(JSON.stringify(FOOD_ORDER_TEMPLATE), /#[\da-f]{3,8}\b/i, "Food Order uses role tokens rather than template-owned hex values");
  assert.doesNotMatch(JSON.stringify(FOOD_ORDER_TEMPLATE), /\b\d{1,2}px\b/i, "Food Order does not define sub-12px typography");
  assert.equal(FOOD_ORDER_TEMPLATE.templateBackground.base, "var(--ps-cream)");
  assert.equal(v2ThemeStyle(RESTAURANT_TABLE_FLAME, { brand: { accentId: "mustard" } })["--ps-accent"], "#e4a81c");
  assert.equal(v2ThemeStyle(RENTAL_DRIVELINE, { brand: { accentId: "warm-gold" } })["--ps-accent"], "#b88d2d");
  assert.equal(v2ThemeStyle(RESTAURANT_TABLE_FLAME, { brand: { accentId: "unknown" } })["--ps-accent"], "#c65d3b");
  assert.equal(FUTURE_FOOD_ACCENT_ID, "mustard");
  assert.equal(FUTURE_STORE_ACCENT_ID, "warm-gold");

  function luminance(hex) {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }
  for (const palette of PUBLIC_ACCENT_PALETTES) {
    const ratio = (Math.max(luminance(palette.accent), luminance(palette.foreground)) + 0.05) /
      (Math.min(luminance(palette.accent), luminance(palette.foreground)) + 0.05);
    assert.ok(ratio >= 4.5, `${palette.id} foreground contrast is ${ratio.toFixed(2)}:1`);
    assert.equal(getPublicAccentPalette(palette.id), palette);
  }
});

test("catalog adapters choose only live catalogs and omit empty pages, navigation, and actions", () => {
  assert.equal(resolveWebsiteCatalogAdapter({ menuItems: true, products: false }), "menu");
  assert.equal(resolveWebsiteCatalogAdapter({ menuItems: false, products: true }), "products");
  assert.equal(resolveWebsiteCatalogAdapter({ menuItems: false, products: false }), undefined);
  assert.equal(resolveWebsiteCatalogAdapter({ menuItems: true, products: true }, { category: "retail" }), "products");

  const siteSlug = "catalog-check";
  const noData = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    siteSlug,
    includeSamples: false,
    catalogAvailability: { menuItems: false, products: false },
    business: { category: "Restaurant", businessType: "Full-Service Restaurant" },
  });
  assert.ok(!noData.pages.some((page) => page.slug === "menu"));
  assert.ok(!noData.navigation.some((item) => item.pageSlug === "menu"));
  assert.notEqual(noData.primaryAction.primary?.labelKey, "viewMenu");

  const foodNoData = resolveTemplateContent("food-order", "1.0.0", {}, {
    siteSlug,
    includeSamples: false,
    catalogAvailability: { menuItems: false, products: false },
    business: { category: "Restaurant", businessType: "Full-Service Restaurant" },
    primaryActionLabels: { viewMenu: "View Menu" },
  });
  assert.ok(!foodNoData.pages.some((page) => ["menu", "order"].includes(page.slug)));
  assert.ok(!foodNoData.navigation.some((item) => ["menu", "order"].includes(item.pageSlug)));
  assert.notEqual(foodNoData.primaryAction.primary?.labelKey, "viewMenu");
  assert.ok(!JSON.stringify(foodNoData.primaryAction).includes("View Menu"));
  assert.ok(!foodNoData.pages.flatMap((page) => page.blocks).some((block) => block.type === "testimonials"));
  assert.equal(foodNoData.storefrontFeatures.onlinePayment, false);

  const foodMenu = resolveTemplateContent("food-order", "1.0.0", {}, {
    siteSlug,
    includeSamples: false,
    catalogAvailability: { menuItems: true, products: false },
    business: { category: "Restaurant", businessType: "Full-Service Restaurant" },
  });
  const popularMenu = foodMenu.pages.find((page) => page.isHome).blocks.find((block) => block.type === "menu_embed");
  assert.equal(popularMenu.heading, "Popular items");
  assert.equal(popularMenu.limit, 6);
  assert.equal(popularMenu.selectedItemIds, undefined, "the live menu catalog stays owner-managed and browseable");

  const products = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    siteSlug,
    includeSamples: false,
    catalogAvailability: { menuItems: false, products: true },
    business: { category: "Retail", businessType: "Store" },
    catalogLabels: { products: "Products", featuredProducts: "Featured products" },
  });
  const productPage = products.pages.find((page) => page.slug === "menu");
  assert.ok(productPage);
  assert.ok(productPage.blocks.some((block) => block.type === "products_embed"));
  assert.equal(products.primaryAction.primary?.labelKey, "viewProducts");
  assert.ok(!productPage.blocks.some((block) => block.type === "menu_order"));

  const foodProducts = resolveTemplateContent("food-order", "1.0.0", {}, {
    siteSlug,
    includeSamples: false,
    catalogAvailability: { menuItems: false, products: true },
    business: { category: "Retail", businessType: "Store" },
    catalogLabels: { products: "Products", featuredProducts: "Featured products" },
  });
  assert.ok(foodProducts.pages.some((page) => page.slug === "menu"));
  assert.equal(foodProducts.pages.some((page) => page.slug === "order"), false);
  assert.ok(foodProducts.pages.find((page) => page.slug === "menu").blocks.some((block) => block.type === "products_embed"));
  const popularProducts = foodProducts.pages.find((page) => page.isHome).blocks.find((block) => block.type === "products_embed");
  assert.equal(popularProducts.heading, "Popular items");
  assert.equal(popularProducts.limit, 6);
  assert.equal(foodProducts.primaryAction.primary?.labelKey, "viewProducts");
});

test("image-free hero is text-only and missing hero media and logo do not block publish readiness", () => {
  const splitHtml = renderToStaticMarkup(HeroBlockRenderer({
    block: { type: "hero", variant: "split", heading: "A calm starting point", subheading: "Tell people what your business does." },
  }));
  assert.match(splitHtml, /A calm starting point/);
  assert.match(splitHtml, /Tell people what your business does\./);
  assert.doesNotMatch(splitHtml, /Hero Media|aspect-4\/3/);

  const contentWithoutMediaOrLogo = {
    primary_cta_label: "Explore",
    hero_headline: "A clear introduction",
    hours: { mon: { open: "09:00", close: "17:00" } },
    address: "12 Main Street",
    phone: "+1 555 0100",
    business_name: "Owner business",
  };
  const foodHero = resolveTemplateContent("food-order", "1.0.0", {
    hero_headline: "A clear introduction",
    business_name: "Owner business",
  }, { includeSamples: true }).pages.find((page) => page.isHome).blocks.find((block) => block.type === "hero");
  const foodHeroMarkup = renderToStaticMarkup(HeroBlockRenderer({ block: foodHero }));
  assert.match(foodHeroMarkup, /A clear introduction/);
  assert.doesNotMatch(foodHeroMarkup, /aspect-4\/3|Hero Media/);

  for (const template of [RESTAURANT_TABLE_FLAME, RENTAL_DRIVELINE, FOOD_ORDER_TEMPLATE, STORE_TEMPLATE]) {
    const readiness = checkPublishReadiness(template.id, template.version, contentWithoutMediaOrLogo);
    assert.equal(readiness.ready, true, `${template.id} accepts an absent logo and hero image`);
    assert.ok(!readiness.missingRequired.some((slot) => ["logo_url", "hero_image"].includes(slot.field)));
  }
});

test("Food Order samples are localized, owner-neutral, editable, and never leak into published output", () => {
  const translate = (messages) => (key, values = {}) => {
    let value = messages.PublicSite[key];
    assert.equal(typeof value, "string", `PublicSite.${key} exists`);
    for (const [name, replacement] of Object.entries(values)) {
      value = value.replaceAll(`{${name}}`, replacement);
    }
    return value;
  };
  const enKeys = Object.keys(enMessages.PublicSite).filter((key) => key.startsWith("foodOrder"));
  const frKeys = Object.keys(frMessages.PublicSite).filter((key) => key.startsWith("foodOrder"));
  assert.deepEqual(frKeys, enKeys, "Food Order message keys have EN/FR parity");
  for (const key of enKeys) assert.equal(typeof frMessages.PublicSite[key], "string", `fr PublicSite.${key}`);

  for (const [locale, messages] of [["en", enMessages], ["fr", frMessages]]) {
    const foodCopy = getFoodOrderLocalizedCopy(translate(messages));
    const sample = createNeutralGallerySampleContent("food-order", "Aldriva Food", null, {
      tagline: messages.PublicSite.previewTagline,
      headline: messages.PublicSite.previewHeadline,
      subtext: messages.PublicSite.previewSubtext,
      about: messages.PublicSite.previewAbout,
      featureTitle: messages.PublicSite.previewFeatureTitle,
      featureDescription: messages.PublicSite.previewFeatureDescription,
      callToAction: messages.PublicSite.previewExplore,
      home: messages.PublicSite.home,
      catalog: messages.PublicSite.catalog,
      aboutNav: messages.PublicSite.about,
      contact: messages.PublicSite.contact,
      process: messages.PublicSite.process,
      faq: messages.PublicSite.faq,
      pricing: messages.PublicSite.pricing,
      foodOrder: foodCopy.sample,
    });
    const preview = resolveV2TemplateGalleryPreview("food-order", {
      sampleContentOverride: sample,
      foodOrderCopy: foodCopy.resolver,
    });
    assert.equal(preview.sampleContent.business_name, "Aldriva Food");
    assert.equal(preview.sampleContent.logo_url, undefined);
    assert.equal(preview.sampleContent.hero_image, undefined);
    assert.equal(preview.sampleContent.about_image, undefined);
    assert.ok(!preview.sampleContent.testimonials || preview.sampleContent.testimonials.length === 0);
    assert.ok(preview.sampleContent.hero_headline.includes("Aldriva Food"));

    const home = preview.resolved.pages.find((page) => page.isHome);
    const steps = home.blocks.find((block) => block.type === "features" && block.heading === foodCopy.resolver.stepsHeading);
    assert.ok(steps);
    assert.equal(steps.items.length, 3);
    assert.doesNotMatch(JSON.stringify(steps).toLowerCase(), /delivery|pickup|livraison|retrait/);
    assert.ok(home.blocks.some((block) => block.type === "cta_banner" && block.heading === foodCopy.resolver.offerHeading));

    const publicEmpty = resolveTemplateContent("food-order", "1.0.0", {}, {
      includeSamples: false,
      sampleContentOverride: sample,
      foodOrderCopy: foodCopy.resolver,
    });
    assert.deepEqual(publicEmpty.sampleFields, []);
    assert.ok(!JSON.stringify(publicEmpty.pages).includes(sample.hero_headline));
    assert.ok(!publicEmpty.pages.flatMap((page) => page.blocks).some((block) => block.type === "testimonials"));

    const ownerReviews = resolveTemplateContent("food-order", "1.0.0", {
      business_name: "Aldriva Food",
      hero_headline: "A real owner headline",
      testimonials: [{ quote: "A real owner supplied review.", author: "A guest" }],
    }, { includeSamples: false, foodOrderCopy: foodCopy.resolver });
    const ownerTestimonialBlock = ownerReviews.pages.flatMap((page) => page.blocks).find((block) => block.type === "testimonials");
    assert.equal(ownerTestimonialBlock.items[0].quote, "A real owner supplied review.");

    const localeName = messages.PublicSite.foodOrderTemplateName;
    assert.ok(localeName.length > 0, `${locale} template name is present`);
  }
  assert.deepEqual(FOOD_ORDER_SAMPLES.testimonials, [], "no sample testimonials are fabricated");
  assert.ok(!JSON.stringify(FOOD_ORDER_SAMPLES.steps).toLowerCase().match(/delivery|pickup|livraison|retrait/));
});

test("Store is category-neutral, keeps Shop conditional, and uses site-local product detail links", () => {
  const noProducts = resolveTemplateContent("store", "1.0.0", {}, {
    siteSlug: "atelier",
    includeSamples: false,
    catalogAvailability: { menuItems: false, products: false },
  });
  assert.deepEqual(noProducts.pages.map((page) => page.slug).sort(), ["contact", "home"]);
  assert.equal(noProducts.navigation.some((item) => item.pageSlug === "shop"), false);
  assert.equal(noProducts.pages.flatMap((page) => page.blocks).some((block) => block.type === "products_embed"), false);

  const withProducts = resolveTemplateContent("store", "1.0.0", {}, {
    siteSlug: "atelier",
    includeSamples: false,
    catalogAvailability: { menuItems: false, products: true },
    business: { category: "Retail", capabilities: [], offerings: [] },
  });
  assert.ok(withProducts.pages.some((page) => page.slug === "shop"));
  assert.ok(withProducts.navigation.some((item) => item.pageSlug === "shop" && item.label === "Shop"));
  assert.equal(withProducts.primaryAction.primary.labelKey, "shopNow");
  assert.equal(withProducts.primaryAction.primary.href, "/site/atelier/shop");
  const productBlocks = withProducts.pages.flatMap((page) => page.blocks).filter((block) => block.type === "products_embed");
  assert.equal(productBlocks.length, 2);
  assert.ok(productBlocks.every((block) => block.siteLocalProductDetails && block.allowLargeCatalog && block.limit === 200));
  assert.ok(productBlocks.every((block) => block.previewProducts === undefined), "public blocks never carry gallery products");

  const gallery = resolveTemplateContent("store", "1.0.0", {});
  const sampleProducts = gallery.pages.flatMap((page) => page.blocks).find((block) => block.type === "products_embed");
  assert.deepEqual(sampleProducts.previewProducts, STORE_PREVIEW_PRODUCTS);
  assert.ok(sampleProducts.categoryTiles);
});

test("Store checkout gate requires a live feature, active stock, a Stripe price, and matching currency", () => {
  assert.equal(getStoreProductStockState("active", 0), "sold_out");
  assert.equal(getStoreProductStockState("out_of_stock", 3), "sold_out");
  assert.equal(getStoreProductStockState("active", 5), "low_stock");
  assert.equal(getStoreProductStockState("active", null), "in_stock");
  const purchase = {
    onlinePayment: true,
    status: "active",
    stockQuantity: 2,
    siteCurrency: "USD",
    stripePriceId: "price_123",
    price: { amount: 12.5, currency: "usd" },
  };
  assert.equal(canBuyStoreProduct(purchase), true);
  assert.equal(canBuyStoreProduct({ ...purchase, onlinePayment: false }), false);
  assert.equal(canBuyStoreProduct({ ...purchase, status: "out_of_stock" }), false);
  assert.equal(canBuyStoreProduct({ ...purchase, stripePriceId: null }), false);
  assert.equal(canBuyStoreProduct({ ...purchase, price: { amount: 12.5, currency: "EUR" } }), false);
  const route = require("node:fs").readFileSync(path.join(ROOT, "app/site/[slug]/products/[productSlug]/page.tsx"), "utf8");
  assert.match(route, /\.eq\("slug", productSlug\)[\s\S]*?\.in\("business_id", businessIds\)[\s\S]*?\.in\("status", \["active", "out_of_stock"\]\)/);
});

test("Store sample copy and UI labels have EN/FR parity and stay neutral", () => {
  const enStoreKeys = Object.keys(enMessages.PublicSite).filter((key) => key.startsWith("store")).sort();
  const frStoreKeys = Object.keys(frMessages.PublicSite).filter((key) => key.startsWith("store")).sort();
  assert.deepEqual(frStoreKeys, enStoreKeys);
  const translate = (messages) => (key, values = {}) => {
    let value = messages.PublicSite[key];
    assert.equal(typeof value, "string", `PublicSite.${key} exists`);
    for (const [name, replacement] of Object.entries(values)) value = value.replaceAll(`{${name}}`, replacement);
    return value;
  };
  for (const [locale, messages] of [["en", enMessages], ["fr", frMessages]]) {
    const copy = getStoreLocalizedCopy(translate(messages));
    const sample = createNeutralGallerySampleContent("store", "Northwind Studio", null, {
      tagline: messages.PublicSite.previewTagline,
      headline: messages.PublicSite.previewHeadline,
      subtext: messages.PublicSite.previewSubtext,
      about: messages.PublicSite.previewAbout,
      featureTitle: messages.PublicSite.previewFeatureTitle,
      featureDescription: messages.PublicSite.previewFeatureDescription,
      callToAction: messages.PublicSite.previewExplore,
      home: messages.PublicSite.home,
      catalog: messages.PublicSite.catalog,
      aboutNav: messages.PublicSite.about,
      contact: messages.PublicSite.contact,
      process: messages.PublicSite.process,
      faq: messages.PublicSite.faq,
      pricing: messages.PublicSite.pricing,
      store: copy.sample,
    });
    const preview = resolveV2TemplateGalleryPreview("store", { sampleContentOverride: sample, storeCopy: copy.resolver });
    const home = preview.resolved.pages.find((page) => page.slug === "home");
    const trust = home.blocks.find((block) => block.type === "features" && block.heading === copy.resolver.trustHeading);
    const cards = home.blocks.find((block) => block.type === "products_embed");
    assert.ok(trust);
    assert.match(trust.items[0].description, /contact|contactez/i);
    assert.equal(cards.previewProducts.length, 3);
    assert.ok(cards.previewProducts.every((product) => product.images.length === 0 && product.category === null && product.stripe_price_id === null));
    assert.equal(preview.sampleContent.business_name, "Northwind Studio");
    assert.equal(preview.sampleContent.hero_image, undefined);
    assert.equal(messages.PublicSite.storeTemplateName, locale === "en" ? "Store" : "Boutique");
  }
  assert.deepEqual(STORE_SAMPLES.testimonials, [], "the Store sample has no invented testimonials");
});

test("Food Order exposes online payment only when the shared site, currency, catalog, and feature gates are live", () => {
  const common = {
    includeSamples: false,
    catalogAvailability: { menuItems: true, products: false },
    business: {
      category: "Restaurant",
      businessType: "Full-Service Restaurant",
      capabilities: ["ONLINE_ORDERING", "PICKUP", "ONLINE_PAYMENT"],
      offerings: ["online_ordering", "pickup", "online_payment"],
    },
  };
  const live = resolveTemplateContent("food-order", "1.0.0", {}, { ...common, currency: "USD" });
  assert.equal(live.storefrontFeatures.onlinePayment, true);
  const unsupportedCurrency = resolveTemplateContent("food-order", "1.0.0", {}, { ...common, currency: "XOF" });
  assert.equal(unsupportedCurrency.storefrontFeatures.onlinePayment, false);
  const unticked = resolveTemplateContent("food-order", "1.0.0", {}, {
    ...common,
    currency: "USD",
    business: { ...common.business, offerings: ["online_ordering", "pickup"] },
  });
  assert.equal(unticked.storefrontFeatures.onlinePayment, false);
});

test("Food Order reservations page and navigation appear only after the existing reservation gates resolve live", () => {
  const common = {
    includeSamples: false,
    catalogAvailability: { menuItems: false, products: false },
    business: {
      category: "Restaurant",
      businessType: "Full-Service Restaurant",
      capabilities: ["RESERVATIONS"],
      offerings: ["table_reservations"],
    },
  };
  const pendingApproval = resolveTemplateContent("food-order", "1.0.0", {}, {
    ...common,
    reservationsApproved: false,
  });
  assert.equal(pendingApproval.pages.some((page) => page.slug === "reservations"), false);
  assert.equal(pendingApproval.navigation.some((item) => item.pageSlug === "reservations"), false);

  const approved = resolveTemplateContent("food-order", "1.0.0", {}, {
    ...common,
    reservationsApproved: true,
  });
  assert.ok(approved.pages.some((page) => page.slug === "reservations"));
  assert.ok(approved.navigation.some((item) => item.pageSlug === "reservations"));
});

test("gallery sample preview uses the owner identity and stays out of public content", () => {
  const neutralSample = createNeutralGallerySampleContent("restaurant-table-flame", "Aldriva Food", null, {
    tagline: "A business built around what matters",
    headline: "A clear first look at {business}",
    subtext: "Explore this business and the ways to get in touch.",
    about: "Learn about the people and ideas behind this business.",
    featureTitle: "Thoughtful service",
    featureDescription: "A simple introduction to what this business offers.",
    callToAction: "Explore",
    home: "Home", catalog: "Explore", aboutNav: "About", contact: "Contact",
    process: "How it works", faq: "Questions", pricing: "Details",
  });
  const preview = resolveV2TemplateGalleryPreview("restaurant-table-flame", {
    sampleContentOverride: neutralSample,
  });
  assert.equal(preview.sampleContent.business_name, "Aldriva Food");
  assert.equal(preview.sampleContent.logo_url, undefined);
  assert.equal(preview.sampleContent.hero_image, undefined);
  assert.equal(preview.sampleContent.about_image, undefined);
  assert.deepEqual(preview.content, {});

  const publicResolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, {
    includeSamples: false,
    sampleContentOverride: neutralSample,
  });
  assert.deepEqual(publicResolved.sampleFields, []);
  assert.ok(!JSON.stringify(publicResolved.pages).includes("A clear first look at Aldriva Food"));
});

test("public design tokens are scoped and leave dashboard computed styles unchanged", async () => {
  const css = require("node:fs").readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  const ast = postcss.parse(css);
  const publicRules = ast.nodes
    .filter((node) => node.type === "rule" && node.selectors?.some((selector) => selector.startsWith(".public-site")))
    .map((node) => node.toString())
    .join("\n");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><body><div id="dashboard"><h1 id="dashboard-heading">Dashboard</h1></div><div id="site" class="public-site" style="--font-sans: Arial, sans-serif; --v2-heading-font: Georgia, serif; --site-primary: #e4a81c; --site-primary-hover: #805a00; --site-primary-light: #fff4d6; --site-primary-foreground: #241700"><h1 id="site-heading">Site</h1><span id="caption" class="text-xs">Caption</span><span id="emphasis" class="font-extrabold">Emphasis</span><article id="card" class="rounded-xl border">Card</article><button id="primary" class="ps-button ps-button-primary">Explore</button></div></body></html>`);
    const before = await page.evaluate(() => {
      const heading = getComputedStyle(document.querySelector("#dashboard-heading"));
      return { color: heading.color, fontFamily: heading.fontFamily };
    });
    await page.addStyleTag({ content: publicRules });
    await page.keyboard.press("Tab");
    const after = await page.evaluate(() => {
      const heading = getComputedStyle(document.querySelector("#dashboard-heading"));
      const publicHeading = getComputedStyle(document.querySelector("#site-heading"));
      const caption = getComputedStyle(document.querySelector("#caption"));
      const emphasis = getComputedStyle(document.querySelector("#emphasis"));
      const card = getComputedStyle(document.querySelector("#card"));
      const button = getComputedStyle(document.querySelector("#primary"));
      return {
        dashboard: { color: heading.color, fontFamily: heading.fontFamily },
        rootToken: getComputedStyle(document.documentElement).getPropertyValue("--ps-text").trim(),
        publicToken: getComputedStyle(document.querySelector("#site")).getPropertyValue("--ps-text").trim(),
        headingFont: publicHeading.fontFamily,
        captionSize: caption.fontSize,
        emphasisWeight: emphasis.fontWeight,
        cardRadius: card.borderRadius,
        buttonHeight: button.height,
        buttonPadding: button.paddingLeft,
        buttonRadius: button.borderRadius,
        focusRingWidth: getComputedStyle(document.activeElement).outlineWidth,
      };
    });
    assert.deepEqual(after.dashboard, before);
    assert.equal(after.rootToken, "");
    assert.equal(after.publicToken, "#22201c");
    assert.match(after.headingFont, /Georgia/);
    assert.equal(after.captionSize, "12px");
    assert.equal(after.emphasisWeight, "700");
    assert.equal(after.cardRadius, "8px");
    assert.equal(after.buttonHeight, "44px");
    assert.equal(after.buttonPadding, "16px");
    assert.equal(after.buttonRadius, "8px");
    assert.equal(after.focusRingWidth, "2px");
  } finally {
    await browser.close();
  }
});
