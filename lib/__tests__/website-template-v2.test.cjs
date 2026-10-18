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

const originalModuleLoad = Module._load;
const fontStub = (variable) => () => ({ variable });
Module._load = function mockNextFontGoogle(request, parent, isMain) {
  if (request === "next/font/google") {
    return {
      Arimo: fontStub("font-arimo-test"),
      Fraunces: fontStub("font-fraunces-test"),
      Geist: fontStub("font-geist-test"),
      Geist_Mono: fontStub("font-geist-mono-test"),
    };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
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
  RESTAURANT_SAVANNAH,
  RESTAURANT_TABLE_FLAME,
  RENTAL_DRIVELINE,
  FOOD_ORDER_TEMPLATE,
  STORE_TEMPLATE,
  getFlagshipTemplate,
  listFlagshipSlotIds,
} = require("@/lib/website-template-v2");
const { FLAGSHIP_SAMPLES, SAVANNAH_SAMPLES, FOOD_ORDER_SAMPLES, STORE_SAMPLES, STORE_PREVIEW_PRODUCTS } = require("@/lib/website-template-samples");
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
const { PlatformThemeBootstrap } = require("@/components/PlatformThemeBootstrap");
const { resolveStorefrontCurrency } = require("@/lib/website-v2-theme");
const { contrastRatio, readableOn } = require("@/lib/readable-on");
const { resolveV2ThemeColor, deriveWebsitePaletteRoles } = require("@/lib/website-v2-color-resolution");
const { TableFlameMenuRows } = require("@/components/site/blocks/StorefrontBrowse");
const {
  PUBLIC_ACCENT_PALETTES,
  FUTURE_FOOD_ACCENT_ID,
  FUTURE_STORE_ACCENT_ID,
  getPublicAccentPalette,
  getWebsitePaletteId,
  getWebsiteBackgroundPattern,
  v2ThemeStyle,
} = require("@/lib/website-v2-theme");
const { getBuiltStorefrontFeatures, resolveStorefrontFeatures } = require("@/lib/storefront-features");
const { resolveWebsiteCatalogAdapter } = require("@/lib/website-catalog-adapter");
const { getStoreProductStockState, canBuyStoreProduct } = require("@/lib/store-product-detail");
const moduleLoadWithFontStub = Module._load;
Module._load = function mockBlockRendererTranslations(request, parent, isMain) {
  if (request === "next-intl/server") {
    return { getTranslations: async () => (key) => key };
  }
  return moduleLoadWithFontStub.call(this, request, parent, isMain);
};
const { BlockRenderer, HeroBlockRenderer } = require("@/components/site/blocks/BlockRenderer");
Module._load = moduleLoadWithFontStub;
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

async function resolveRenderedElements(node) {
  const elements = [];
  const visit = async (value) => {
    if (Array.isArray(value)) {
      await Promise.all(value.map(visit));
      return;
    }
    if (!React.isValidElement(value)) return;
    if (typeof value.type === "function") {
      if (value.type.name === "StorefrontBrowse") {
        await visit(value.props.children);
        return;
      }
      await visit(await value.type(value.props));
      return;
    }
    elements.push(value);
    await visit(value.props.children);
  };
  await visit(node);
  return elements;
}

test("platform theme bootstrap emits valid JavaScript for locale-scoped routes", () => {
  const markup = renderToStaticMarkup(React.createElement(PlatformThemeBootstrap));
  const script = markup.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "the bootstrap script is present");
  assert.doesNotThrow(() => new Function(script), "the inline bootstrap parses before hydration");
});

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
  "hero.cta_primary",
  "trust.copy", "testimonials.items", "product.fulfilment-note", "home.featured", "shop.density",
  "contact.address", "contact.phone", "contact.email", "contact.directions",
  "footer.business", "footer.socials", "footer.note",
];

test("flagship registry resolves Table & Flame 1.0.0 as the 1.1.0 manifest alias", () => {
  assert.equal(FLAGSHIP_TEMPLATES.length, 5);
  assert.equal(RESTAURANT_TABLE_FLAME.id, "restaurant-table-flame");
  assert.equal(RESTAURANT_TABLE_FLAME.version, "1.1.0");
  assert.equal(RENTAL_DRIVELINE.id, "rental-driveline");
  assert.equal(RENTAL_DRIVELINE.version, "1.0.0");
  assert.equal(FOOD_ORDER_TEMPLATE.id, "food-order");
  assert.equal(FOOD_ORDER_TEMPLATE.version, "1.0.0");
  assert.equal(STORE_TEMPLATE.id, "store");
  assert.equal(STORE_TEMPLATE.version, "1.0.0");
  assert.equal(getFlagshipTemplate("restaurant-table-flame", "1.0.0"), RESTAURANT_TABLE_FLAME);
  assert.equal(getFlagshipTemplate("restaurant-table-flame", "1.1.0"), RESTAURANT_TABLE_FLAME);
  assert.equal(getFlagshipTemplate("restaurant-table-flame", "9.9.9"), undefined);
  assert.equal(getFlagshipTemplate("rental-driveline", "1.0.0"), RENTAL_DRIVELINE);
  assert.equal(getFlagshipTemplate("food-order", "1.0.0"), FOOD_ORDER_TEMPLATE);
  assert.equal(getFlagshipTemplate("store", "1.0.0"), STORE_TEMPLATE);
  assert.deepEqual(NEW_SITE_GALLERY_TEMPLATES, [RESTAURANT_SAVANNAH, FOOD_ORDER_TEMPLATE, STORE_TEMPLATE]);
  assert.equal(RESTAURANT_TABLE_FLAME.lockedLayout, true);
  assert.equal(RENTAL_DRIVELINE.lockedLayout, true);
  assert.equal(FOOD_ORDER_TEMPLATE.lockedLayout, true);
  assert.equal(STORE_TEMPLATE.lockedLayout, true);
  assert.equal(STORE_TEMPLATE.defaultAccentId, FUTURE_STORE_ACCENT_ID);
});

test("Table & Flame 1.0.0 sites preserve derived order and reservation features", () => {
  const options = {
    siteSlug: "table-flame-alias",
    includeSamples: false,
    reservationsApproved: true,
    availablePageSlugs: ["home", "menu", "order", "reservations", "contact"],
    catalogAvailability: { menuItems: true, products: false },
    business: {
      industry: "Food & Beverage",
      category: "Restaurant",
      businessType: "Full-Service Restaurant",
      offerings: ["online_ordering", "pickup", "table_reservations"],
    },
  };
  const legacy = resolveTemplateContent("restaurant-table-flame", "1.0.0", {}, options);
  const current = resolveTemplateContent("restaurant-table-flame", "1.1.0", {}, options);
  assert.deepEqual(legacy.storefrontFeatures, current.storefrontFeatures);
  assert.equal(legacy.storefrontFeatures.ordering, true);
  assert.equal(legacy.storefrontFeatures.reservations, true);
  assert.deepEqual(legacy.primaryAction, current.primaryAction);
  assert.deepEqual(legacy.pages.map((page) => [page.slug, page.purpose]), current.pages.map((page) => [page.slug, page.purpose]));
  assert.equal(legacy.primaryAction.primary?.labelKey, "orderNow");
  assert.equal(legacy.primaryAction.secondary?.labelKey, "reserveTable");
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
    const expected = template.id === "restaurant-table-flame" || template.id === "restaurant-savannah" || template.id === "food-order" || template.id === "store"
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
    const expected = template.id === "restaurant-table-flame" || template.id === "restaurant-savannah" || template.id === "food-order" || template.id === "store"
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
test("every sample image path has a file on disk under public/; photo-free templates use their fallback", () => {
  const fs = require("node:fs");
  for (const template of FLAGSHIP_TEMPLATES) {
    const samples = FLAGSHIP_SAMPLES[template.id];
    const imagePaths = [
      samples.hero_image,
      samples.about_image,
      ...(samples.gallery_images || []),
    ].filter(Boolean);
    if (template.id === "food-order" || template.id === "store" || template.id === "restaurant-savannah") {
      assert.equal(imagePaths.length, 0, `${template.id} must not invent unrelated placeholder photos`);
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
  assert.match(previewHeader, /color:var\(--tf-on-header\);background-color:var\(--tf-base\)/);
  assert.doesNotMatch(previewHeader, /Order Now/);
  assert.ok(previewHeader.includes('href="/site/acme/contact"'), "a catalog action is not offered without a live menu");
  assert.ok(previewHeader.includes('data-element-path="navigation[0].label"'));
  assert.match(previewHeader, /data-sample-content="true"/);
  assert.match(previewFooter, /Family-run since 2012/);
  assert.match(previewFooter, /background-color:var\(--tf-band\);color:var\(--tf-on-footer\)/);
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
    ["next/font/google", { Fraunces: () => ({ variable: "font-fraunces-test" }) }],
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
  const blockTypesByPage = (resolved) => resolved.pages.map((page) => page.blocks.map((block) => block.type));
  assert.deepEqual(blockTypesByPage(emptyRestaurant), blockTypesByPage(plainRestaurant), "unset offerings do not create an empty section");
  assert.deepEqual(blockTypesByPage(unsetRestaurant), blockTypesByPage(plainRestaurant), "missing offerings do not create an empty section");
  assert.equal(
    emptyRestaurant.pages.find((page) => page.isHome).blocks.find((block) => block.type === "hero").tagline,
    "Full-Service Restaurant",
    "the Table & Flame hero eyebrow uses the available cuisine data"
  );

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

test("Table & Flame thin content keeps menu rows, missing media, and long names usable", () => {
  const row = (id, name, description, image = null) => ({
    id,
    name,
    description,
    image,
    priceLabel: "$12.00",
    tags: [],
    detailRows: [],
  });
  const renderRows = (items) => renderToStaticMarkup(React.createElement(TableFlameMenuRows, {
    items,
    onSelect: () => {},
  }));
  const countRows = (markup) => (markup.match(/data-menu-row="true"/g) || []).length;

  for (const count of [0, 1, 2, 12]) {
    const items = Array.from({ length: count }, (_, index) => row(`item-${index}`, `Dish ${index + 1}`, index === 0 ? "Warm" : undefined));
    const markup = renderRows(items);
    assert.equal(countRows(markup), count, `${count} menu items render exactly ${count} rows`);
    assert.doesNotMatch(markup, /<img/, "rows without photos do not render empty image boxes");
  }

  const longDescription = "x".repeat(300);
  const descriptions = renderRows([
    row("short-description", "Soup", "Hot"),
    row("long-description", "House stew", longDescription),
  ]);
  assert.match(descriptions, />Hot<\/span>/);
  assert.ok(descriptions.includes(longDescription), "300-character descriptions are preserved");

  const longName = "A Very Long Restaurant Name That Needs To Wrap Rather Than Force The Header Wide";
  const thin = resolveTemplateContent("restaurant-table-flame", "1.0.0", {
    business_name: longName,
    hero_headline: "A small menu, served well",
  }, { includeSamples: false });
  const hero = thin.pages.find((page) => page.isHome).blocks.find((block) => block.type === "hero");
  assert.equal(hero.backgroundImage, undefined);
  assert.equal(hero.logoMark, undefined);
  const heroMarkup = renderToStaticMarkup(HeroBlockRenderer({ block: hero, accentColor: "#c65d3b", tableFlame: true }));
  assert.match(heroMarkup, /linear-gradient\(125deg, var\(--tf-accent\) 0%, var\(--tf-accent-deep\) 48%, var\(--tf-band\) 100%\)/);
  assert.match(heroMarkup, /A small menu, served well/);
  assert.doesNotMatch(heroMarkup, />A<\/span>/, "the no-photo fallback contains no text over the hero");
  assert.doesNotMatch(heroMarkup, /aspect-4\/3|Hero Media/);

  const placeholderHeroMarkup = renderToStaticMarkup(HeroBlockRenderer({
    block: {
      type: "hero",
      variant: "full-bleed",
      backgroundImage: "/placeholders/restaurant/hero.svg",
      logoMark: "/logo-horizontal.png",
      heading: "A quiet table",
    },
    tableFlame: true,
  }));
  assert.doesNotMatch(placeholderHeroMarkup, /src="\/placeholders\/restaurant\/hero\.svg"/);
  assert.match(placeholderHeroMarkup, /src="\/logo-horizontal\.png"/, "the fallback uses the logo mark only");
  assert.doesNotMatch(placeholderHeroMarkup, /Hero photo placeholder|Table & Flame/);
  assert.match(placeholderHeroMarkup, /linear-gradient\(125deg, var\(--tf-accent\)/);

  const headerMarkup = renderWithMessages(React.createElement(V2SiteHeader, {
    template: RESTAURANT_TABLE_FLAME,
    content: { business_name: longName },
    navigation: [],
    siteTitle: longName,
    siteSlug: "table-flame-thin",
  }));
  assert.ok(headerMarkup.includes(longName), "a long business name remains present in the header");
  assert.match(headerMarkup, /aria-label="Open menu"/);
});

test("Table & Flame section headings, intros, metrics, and CTA rows follow left section alignment", async () => {
  const sections = [
    { type: "features", heading: "Offerings", subheading: "Seasonal highlights", items: [{ title: "Fresh daily", description: "Produce picked every morning." }] },
    { type: "menu_embed", heading: "Our Menu", subheading: "From the fire", variant: "rows", limit: 12 },
    { type: "about", heading: "Our Story", subheading: "A neighborhood table", story: "Cooked with care.", highlights: [{ value: "2012", label: "Since" }] },
    { type: "gallery", heading: "Gallery", subheading: "A look around", images: [] },
    { type: "testimonials", heading: "Words from the table", subheading: "What guests say", items: [] },
    { type: "contact", heading: "Hours & Location", subheading: "Visit us", hours: "Daily, 11–10", address: "1 Main Street" },
    { type: "cta_banner", heading: "Join us", subheading: "Order for tonight", variant: "footer", ctaLabel: "Order now", ctaHref: "/order" },
  ];

  for (const block of sections) {
    const tree = await BlockRenderer({
      block,
      siteTemplateId: "restaurant-table-flame",
      sectionAlign: "left",
    });
    const elements = [];
    const visit = async (node) => {
      if (Array.isArray(node)) return Promise.all(node.map(visit));
      if (!React.isValidElement(node)) return;
      if (typeof node.type === "function") {
        if (node.type.name === "StorefrontBrowse") return visit(node.props.children);
        return visit(await node.type(node.props));
      }
      elements.push(node);
      await visit(node.props.children);
    };
    await visit(tree);
    const classes = elements.map((element) => element.props.className).filter((value) => typeof value === "string");
    assert.ok(elements.some((element) => element.props["data-section-align"] === "left"), `${block.type} receives the Table & Flame alignment`);
    if (block.type === "cta_banner") {
      assert.ok(classes.some((value) => value.includes("w-full text-left")), "CTA copy is left aligned");
      assert.ok(classes.some((value) => value.includes("justify-start")), "CTA button row is left aligned");
      assert.ok(!classes.some((value) => value.includes("border-b")), "the CTA has no narrow separator under its heading");
      assert.ok(classes.some((value) => value.includes("bg-[var(--tf-band)]") && value.includes("text-[var(--tf-on-band)]")), "the Table & Flame CTA uses the palette's dark band and readable foreground");
      assert.ok(elements.some((element) => element.type === "section" && element.props.style?.backgroundColor === "var(--tf-band)"), "the CTA section carries the dark band background");
    } else {
      assert.ok(classes.some((value) => value.includes("flex flex-col text-left items-start")), `${block.type} heading and intro use left alignment`);
      assert.ok(!classes.some((value) => value.includes("flex flex-col text-center items-center")), `${block.type} heading and intro are not centered`);
    }
    if (block.type === "about") {
      assert.ok(classes.some((value) => value.includes("p-4 text-left")), "Table & Flame metric tiles follow left section alignment");
    }
    if (block.type === "features") {
      assert.ok(classes.some((value) => value.includes("h-32") && value.includes("sm:h-40")), "the no-photo offering panel stays compact above its text");
    }
  }

  const photoHero = renderToStaticMarkup(HeroBlockRenderer({
    block: {
      type: "hero",
      variant: "full-bleed",
      backgroundImage: "/images/Donation.jpeg",
      heading: "A table for everyone",
      metaPills: [{ label: "Open today" }],
    },
    accentColor: "#c65d3b",
    tableFlame: true,
  }));
  assert.match(photoHero, /src="\/images\/Donation\.jpeg"/, "the hero accepts a real repository photo");
  assert.match(photoHero, /max-w-6xl px-6/, "the hero text uses the shared Table & Flame container");
  assert.match(photoHero, /rgba\(var\(--tf-scrim-rgb\), 0\.68\) 100%/, "the photo scrim keeps the top of the hero dark enough for its foreground role");
  assert.match(photoHero, /bg-\[var\(--tf-band\)\]\/80/, "hero metadata uses the palette band backing");

  const headerMarkup = renderWithMessages(React.createElement(V2SiteHeader, {
    template: RESTAURANT_TABLE_FLAME,
    content: { business_name: "Table & Flame" },
    navigation: [],
    siteTitle: "Table & Flame",
    siteSlug: "table-flame-alignment",
  }));
  const footerMarkup = renderWithMessages(React.createElement(V2SiteFooter, {
    template: RESTAURANT_TABLE_FLAME,
    content: { business_name: "Table & Flame" },
    navigation: [],
    siteTitle: "Table & Flame",
    siteSlug: "table-flame-alignment",
  }));
  assert.match(headerMarkup, /max-w-6xl[^\"]*px-6/, "the header uses the shared container");
  assert.match(footerMarkup, /max-w-6xl[^\"]*px-6/, "the footer uses the shared container");

  const nonTableTree = await BlockRenderer({
    block: { type: "features", heading: "Services", items: [] },
    siteTemplateId: "food-order",
  });
  const nonTableElements = [];
  const visitNonTable = async (node) => {
    if (Array.isArray(node)) return Promise.all(node.map(visitNonTable));
    if (!React.isValidElement(node)) return;
    if (typeof node.type === "function") return visitNonTable(await node.type(node.props));
    nonTableElements.push(node);
    await visitNonTable(node.props.children);
  };
  await visitNonTable(nonTableTree);
  assert.ok(
    nonTableElements.some((element) => element.props.className?.includes("text-center items-center")),
    "templates without sectionAlign retain the existing centered headings"
  );
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

test("readableOn selects the first AA candidate and otherwise the highest contrast", () => {
  assert.equal(readableOn("#f3f1ec", ["#18181b", "#ffffff"]), "#18181b");
  assert.equal(readableOn("#23211f", ["#18181b", "#ffffff"]), "#ffffff");
  assert.equal(readableOn("#777777", ["#777777", "#ffffff", "#000000"]), "#000000");
  assert.throws(() => readableOn("var(--ps-neutral)", ["#ffffff"]), /#RGB or #RRGGBB/);
  assert.throws(() => readableOn("#ffffff", []), /at least one/);
  assert.throws(() => resolveV2ThemeColor("var(--ps-unknown)", "unknown-template"), /No public-site color token/);
});

test("V2 footer resolves Food Order contrast and omits missing business details", () => {
  const resolved = resolveTemplateContent("food-order", "1.0.0", {}, {
    includeSamples: false,
    siteSlug: "food-order-check",
  });
  const props = {
    template: FOOD_ORDER_TEMPLATE,
    content: { business_name: "Aldriva Kitchen", address: "1 Main Street", phone: "+15551234567" },
    navigation: resolved.navigation,
    siteTitle: "Aldriva Kitchen",
    siteSlug: "food-order-check",
    storefrontFeatures: resolved.storefrontFeatures,
    availablePageSlugs: resolved.availablePageSlugs,
  };
  const withDetails = renderWithMessages(React.createElement(V2SiteFooter, props));
  assert.match(withDetails, /background-color:#f3f1ec;color:#22201c/);
  assert.match(withDetails, /1 Main Street/);
  assert.match(withDetails, /tel:\+15551234567/);
  assert.match(withDetails, /Get directions/);
  assert.match(withDetails, /grid-template-columns:repeat\(auto-fit,\s*minmax\(min\(100%,\s*14rem\),\s*1fr\)\)/);

  const withoutDetails = renderWithMessages(React.createElement(V2SiteFooter, {
    ...props,
    content: { business_name: "Aldriva Kitchen" },
  }));
  assert.match(withoutDetails, /Footer navigation/);
  assert.doesNotMatch(withoutDetails, /Get directions|tel:|Opening hours|Add phone|Add address/);
});

test("all V2 template bands and accents meet foreground contrast thresholds", () => {
  const platformText = "#22201c";
  const white = "#ffffff";
  const normalMinimum = 4.5;
  const largeMinimum = 3;

  // TODO: Add only pre-existing failures here with their exact current ratio;
  // do not change template colors as part of this shared-foundation phase.
  const existingFailureAllowlist = Object.freeze({});
  const observedAllowlistedFailures = new Set();

  function check(key, foreground, background, minimum) {
    const ratio = contrastRatio(background, foreground);
    if (ratio >= minimum) {
      assert.equal(Object.hasOwn(existingFailureAllowlist, key), false, `stale allowlist entry: ${key}`);
      return;
    }
    const allowedRatio = existingFailureAllowlist[key];
    assert.notEqual(allowedRatio, undefined, `${key}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
    assert.equal(allowedRatio, ratio.toFixed(2), `${key}: update the documented current ratio`);
    observedAllowlistedFailures.add(key);
  }

  for (const template of FLAGSHIP_TEMPLATES) {
    for (const palette of PUBLIC_ACCENT_PALETTES) {
      const paletteTokens = {
        "--ps-accent": palette.accent,
        "--ps-accent-hover": palette.hover,
        "--ps-accent-light": palette.light,
        "--ps-accent-foreground": palette.foreground,
      };
      const base = resolveV2ThemeColor(template.templateBackground.base, template.id, paletteTokens);
      const baseText = readableOn(base, [platformText, white]);
      const baseKey = `${template.id}/${palette.id}/base`;
      check(`${baseKey}/normal`, baseText, base, normalMinimum);
      check(`${baseKey}/large`, baseText, base, largeMinimum);

      for (const band of template.templateBackground.bands) {
        const background = resolveV2ThemeColor(band.color, template.id, paletteTokens);
        const foreground = readableOn(background, [platformText, white]);
        const key = `${template.id}/${palette.id}/${band.zone}`;
        check(`${key}/normal`, foreground, background, normalMinimum);
        check(`${key}/large`, foreground, background, largeMinimum);
      }

      check(`${template.id}/${palette.id}/cta`, palette.foreground, palette.accent, normalMinimum);
    }
  }

  const tableFlameAccentText = readableOn("#c65d3b", ["#090909", "#faf6ef"]);
  check("table-flame/ink-on-base", "#2a211b", "#faf6ef", normalMinimum);
  check("table-flame/muted-on-base", "#6b5d52", "#faf6ef", normalMinimum);
  check("table-flame/deep-accent-on-base", "#7c2d12", "#faf6ef", normalMinimum);
  check("table-flame/on-accent", tableFlameAccentText, "#c65d3b", normalMinimum);
  check("table-flame/ivory-on-footer", "#faf6ef", "#23211f", normalMinimum);
  check("table-flame/ivory-on-worst-case-scrim", "#faf6ef", "#706f6d", normalMinimum);

  assert.deepEqual(
    [...observedAllowlistedFailures].sort(),
    Object.keys(existingFailureAllowlist).sort(),
    "every allowlisted contrast exception must still occur"
  );
});

test("Table & Flame manifest palettes preserve the default and meet contrast in every surface state", () => {
  const template = RESTAURANT_TABLE_FLAME;
  assert.equal(template.palettes.length, 6);
  assert.deepEqual(template.patterns.map((pattern) => pattern.id), ["none", "dots"]);

  const defaultRoles = deriveWebsitePaletteRoles(template.palettes[0]);
  assert.deepEqual(
    {
      base: defaultRoles.base,
      subtle: defaultRoles.subtle,
      ink: defaultRoles.ink,
      muted: defaultRoles.muted,
      border: defaultRoles.border,
      accent: defaultRoles.accent,
      accentDeep: defaultRoles.accentDeep,
      onAccent: defaultRoles.onAccent,
      onInk: defaultRoles.onInk,
      band: defaultRoles.band,
      scrim: defaultRoles.scrim,
      hairline: defaultRoles.hairline,
      menuLeader: defaultRoles.menuLeader,
    },
    {
      base: "#faf6ef",
      subtle: "#f1e9dd",
      ink: "#2a211b",
      muted: "#6b5d52",
      border: "#e6dccd",
      accent: "#c65d3b",
      accentDeep: "#7c2d12",
      onAccent: "#090909",
      onInk: "#ffffff",
      band: "#23211f",
      scrim: "#23211f",
      hairline: "#3a3632",
      menuLeader: "#9b8d7d",
    }
  );

  const mix = (first, second, amount) => {
    const channels = (color) => color.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16));
    const a = channels(first);
    const b = channels(second);
    return `#${a.map((channel, index) => Math.round(channel * (1 - amount) + b[index] * amount).toString(16).padStart(2, "0")).join("")}`;
  };
  const check = (paletteId, name, foreground, background, threshold = 4.5) => {
    const ratio = contrastRatio(background, foreground);
    assert.ok(ratio >= threshold, `${paletteId}/${name}: ${ratio.toFixed(2)}:1 is below ${threshold}:1`);
  };
  const luminance = (color) => {
    const channels = color.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };

  for (const palette of template.palettes) {
    const roles = deriveWebsitePaletteRoles(palette);
    const overHeroWhitePixel = mix("#ffffff", roles.scrim, 0.68);
    const overHeroBlackPixel = mix("#000000", roles.scrim, 0.68);
    assert.ok(luminance(roles.scrim) < 0.1, `${palette.id}: hero scrim must stay dark`);
    check(palette.id, "ink on base", roles.ink, roles.base);
    check(palette.id, "muted on base", roles.muted, roles.base);
    check(palette.id, "ink on subtle", roles.ink, roles.subtle);
    check(palette.id, "fallback mark on subtle", roles.muted, roles.subtle);
    check(palette.id, "accent deep on base", roles.accentDeep, roles.base);
    check(palette.id, "on accent", roles.onAccent, roles.accent);
    check(palette.id, "on ink", roles.onInk, roles.ink);
    check(palette.id, "band text", roles.onBand, roles.band);
    check(palette.id, "footer text", roles.onFooter, roles.band);
    assert.ok(contrastRatio(roles.base, roles.band) >= 1.5, palette.id + ": CTA/footer band is distinguishable from the page background");
    check(palette.id, "solid header", roles.onHeader, roles.base);
    check(palette.id, "mobile overlay", roles.onBase, roles.base);
    check(palette.id, "hero scrim on white photo", roles.onScrim, overHeroWhitePixel);
    check(palette.id, "hero scrim on black photo", roles.onScrim, overHeroBlackPixel);
    check(palette.id, "ink over dot", roles.ink, roles.dotBackground);
    check(palette.id, "muted over dot", roles.muted, roles.dotBackground);

    const style = v2ThemeStyle(template, { brand: { paletteId: palette.id } });
    assert.equal(style["--tf-base"], palette.base);
    assert.equal(style["--tf-accent"], palette.accent);
    assert.equal(style["--tf-ink"], palette.ink);
    assert.equal(style["--tf-on-scrim"], roles.onScrim);
    assert.equal(style["--tf-band"], roles.band);
    const transparentHeader = renderWithMessages(React.createElement(V2SiteHeader, {
      template,
      content: { logo_url: "/owner-logo.svg" },
      navigation: [{ id: "home", label: "Home", href: "/", pageSlug: "home", order: 0 }],
      siteTitle: "Table & Flame",
      siteSlug: "table-flame",
      overHero: true,
    }));
    assert.ok(transparentHeader.includes("color:var(--tf-on-scrim);background-color:transparent"), `${palette.id}: transparent header uses the light scrim foreground role`);
    assert.ok(transparentHeader.includes("bg-[var(--tf-base)]"), `${palette.id}: transparent header logo uses the palette base plate`);
    assert.ok(transparentHeader.includes("/owner-logo.svg"));
    assert.ok(transparentHeader.includes(">Home</a>"), "transparent nav links inherit the light scrim foreground role");
    const footerMarkup = renderWithMessages(React.createElement(V2SiteFooter, {
      template,
      content: { business_name: "Table & Flame" },
      navigation: [],
      siteTitle: "Table & Flame",
      siteSlug: "table-flame",
    }));
    assert.match(footerMarkup, /background-color:var\(--tf-band\);color:var\(--tf-on-footer\)/);
    assert.match(footerMarkup, /border-top-color:var\(--tf-hairline\)/, palette.id + ": footer retains the 1px CTA/footer hairline token");
    const solidHeader = renderWithMessages(React.createElement(V2SiteHeader, {
      template,
      content: { logo_url: "/owner-logo.svg" },
      navigation: [],
      siteTitle: "Table & Flame",
      siteSlug: "table-flame",
    }));
    assert.ok(!solidHeader.includes("bg-[var(--tf-base)]"), "solid headers do not add the transparent-state logo plate");
  }

  const missingChoice = v2ThemeStyle(template, { brand: { paletteId: "unknown" } });
  assert.equal(missingChoice["--tf-base"], "#faf6ef");
  assert.equal(missingChoice["--tf-accent"], "#c65d3b");
  const otherTemplate = v2ThemeStyle(FOOD_ORDER_TEMPLATE, { brand: { paletteId: "ink-brass", backgroundPattern: "dots" } });
  assert.equal(otherTemplate["--tf-base"], undefined, "other templates do not receive Table & Flame palette tokens");
});

test("Table & Flame menu empty state follows the shared left-aligned section container", async () => {
  const tree = await BlockRenderer({
    block: { type: "menu_embed", heading: "Our Menu", subheading: "From the fire", variant: "rows" },
    siteTemplateId: "restaurant-table-flame",
    sectionAlign: "left",
  });
  const elements = await resolveRenderedElements(tree);
  const container = elements.find((element) => typeof element.props.className === "string" && element.props.className.includes("mx-auto w-full max-w-6xl px-6"));
  const heading = elements.find((element) => element.type === "h2" && element.props.children === "Our Menu");
  const headingGroup = elements.find((element) => typeof element.props.className === "string" && element.props.className.includes("text-left items-start") && element.props.className.includes("mb-[var(--ps-space-12)]"));
  const emptyState = elements.find((element) => element.type === "p" && element.props.children === "menuComingSoon");
  assert.ok(container, "menu heading and empty state share the Table & Flame max-width container");
  assert.ok(heading, "Our Menu heading remains rendered");
  assert.ok(headingGroup, "the menu heading uses the same left-aligned heading group as other sections");
  assert.ok(emptyState, "the empty state remains rendered");
  assert.match(emptyState.props.className, /text-left/);
  assert.doesNotMatch(emptyState.props.className, /text-center/);
  assert.match(emptyState.props.className, /w-full/);
  assert.doesNotMatch(emptyState.props.className, /(?:p|pt|py)-\[/, "the empty state does not add padding on top of SectionHeading's standard bottom margin");
});

test("Table & Flame no-photo fallbacks use the accessible business initial instead of the uploaded logo", async () => {
  const fixtures = [
    { name: "offerings", block: { type: "features", items: [{ title: "Wood-fired" }] } },
    { name: "about", block: { type: "about", heading: "Our Story", story: "Cooked with care." } },
    { name: "gallery", block: { type: "gallery", heading: "Gallery", images: [{ src: "" }] } },
  ];
  for (const fixture of fixtures) {
    const tree = await BlockRenderer({
      block: fixture.block,
      siteTemplateId: "restaurant-table-flame",
      sectionAlign: "left",
      businessName: "Aldriva Kitchen",
      businessLogo: "/dark-wordmark.svg",
    });
    const elements = await resolveRenderedElements(tree);
    const fallback = elements.find((element) => element.type === "span" && element.props.className?.includes("text-[var(--tf-muted)]"));
    assert.ok(fallback, `${fixture.name}: has a palette-readable fallback mark`);
    assert.equal(fallback.props.children, "A", `${fixture.name}: uses the business initial`);
    assert.ok(!elements.some((element) => element.type === "img" && element.props.src === "/dark-wordmark.svg"), `${fixture.name}: does not put the logo on an uncontrolled dark panel`);
  }
});

test("Table & Flame appearance choices resolve for both stored template versions and keep unrelated metadata", () => {
  for (const version of ["1.0.0", "1.1.0"]) {
    const template = getFlagshipTemplate("restaurant-table-flame", version);
    assert.ok(template, `${version} still resolves`);
    const style = v2ThemeStyle(template, { brand: { paletteId: "sea-salt", backgroundPattern: "dots" } });
    assert.equal(style["--tf-base"], "#f4f7f6");
  }
  const { mergeWebsiteAppearanceMetadata, getWebsitePaletteId, getWebsiteBackgroundPattern, getWebsiteBackgroundPatternStyle } = require("@/lib/website-v2-theme");
  const merged = mergeWebsiteAppearanceMetadata(
    { preserved: "yes", brand: { accentId: "legacy-orange", other: 7 } },
    { paletteId: "sea-salt", backgroundPattern: "dots" }
  );
  assert.deepEqual(merged, {
    preserved: "yes",
    brand: { accentId: "legacy-orange", other: 7, paletteId: "sea-salt", backgroundPattern: "dots" },
  });
  const publishAction = require("node:fs").readFileSync(path.join(ROOT, "lib/actions/website-content.ts"), "utf8");
  assert.match(publishAction, /metadata:\s*mergeWebsiteAppearanceMetadata\(currentWebsite\.metadata,\s*appearanceToPublish\)/);
  assert.equal(getWebsitePaletteId(RESTAURANT_TABLE_FLAME, { brand: {} }), "terracotta");
  assert.equal(getWebsiteBackgroundPattern(RESTAURANT_TABLE_FLAME, { brand: {} }), "none");
  assert.deepEqual(getWebsiteBackgroundPatternStyle(RESTAURANT_TABLE_FLAME, "dots"), {
    backgroundImage: "radial-gradient(circle, var(--tf-dot) 1px, transparent 1px)",
    backgroundSize: "20px 20px",
  });
  assert.deepEqual(getWebsiteBackgroundPatternStyle(FOOD_ORDER_TEMPLATE, "dots"), {});
});

test("Table & Flame appearance panel and live preview remain palette-gated", () => {
  const fs = require("node:fs");
  const editor = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/V2WebsiteEditor.tsx"), "utf8");
  const preview = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/V2WebsitePreviewClient.tsx"), "utf8");
  assert.match(editor, /template\.palettes\?\.length\s*\?\s*\(/);
  assert.match(editor, /aria-label=\{publicT\("appearance"\)\}/);
  assert.ok(RESTAURANT_TABLE_FLAME.palettes?.length, "Table & Flame declares Appearance options");
  assert.equal(FOOD_ORDER_TEMPLATE.palettes, undefined, "Food Order does not declare Appearance options");
  assert.match(preview, /getWebsiteBackgroundPatternStyle\(template, activePattern\)/);
  assert.match(preview, /data-background-pattern=\{template\.palettes\?\.length \? activePattern : undefined\}/);
  assert.match(preview, /style=\{themeStyle\}/);
});

test("Table & Flame renderer branches use palette tokens instead of stray color literals", () => {
  const fs = require("node:fs");
  const sourceFiles = [
    "components/site/blocks/BlockRenderer.tsx",
    "components/site/blocks/StorefrontBrowse.tsx",
    "components/site/v2/V2SiteHeader.tsx",
    "components/site/v2/V2SiteFooter.tsx",
  ];
  const colorPattern = /#[\da-f]{3,8}\b|\brgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/ig;
  const terracotta = deriveWebsitePaletteRoles(RESTAURANT_TABLE_FLAME.palettes.find((palette) => palette.id === "terracotta"));
  const approvedColors = new Set([
    ...RESTAURANT_TABLE_FLAME.palettes.flatMap((palette) => [palette.base, palette.accent, palette.ink]),
    ...Object.values(terracotta).filter((value) => typeof value === "string" && /#[\da-f]{3,8}\b|\brgba?\s*\(/i.test(value)),
  ].map((value) => value.toLowerCase()));
  let scopedBranchCount = 0;

  const isTableFlameCondition = (node, source) =>
    /\b(?:tableFlame|tableFlameRows|isTableFlame)\b|siteTemplateId\s*===\s*["']restaurant-table-flame["']|template\.id\s*===\s*["']restaurant-table-flame["']/.test(node.getText(source));
  const assertAllowedLiterals = (node, source, file) => {
    const text = node.getText(source);
    const found = text.match(colorPattern) ?? [];
    for (const literal of found) {
      assert.ok(approvedColors.has(literal.toLowerCase()), file + ": Table & Flame branch contains unapproved color literal " + literal);
    }
  };

  for (const relativePath of sourceFiles) {
    const file = path.join(ROOT, relativePath);
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node, inheritedScope = false) => {
      if (ts.isConditionalExpression(node)) {
        const tableFlameCondition = isTableFlameCondition(node.condition, source);
        if (tableFlameCondition) {
          scopedBranchCount += 1;
          assertAllowedLiterals(node.whenTrue, source, relativePath);
        }
        visit(node.whenTrue, inheritedScope || tableFlameCondition);
        visit(node.whenFalse, inheritedScope);
        return;
      }
      if (ts.isIfStatement(node)) {
        const tableFlameCondition = isTableFlameCondition(node.expression, source);
        if (tableFlameCondition) {
          scopedBranchCount += 1;
          assertAllowedLiterals(node.thenStatement, source, relativePath);
        }
        visit(node.thenStatement, inheritedScope || tableFlameCondition);
        if (node.elseStatement) visit(node.elseStatement, inheritedScope);
        return;
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const tableFlameCondition = isTableFlameCondition(node.left, source);
        if (tableFlameCondition) {
          scopedBranchCount += 1;
          assertAllowedLiterals(node.right, source, relativePath);
        }
        visit(node.left, inheritedScope);
        visit(node.right, inheritedScope || tableFlameCondition);
        return;
      }
      ts.forEachChild(node, (child) => visit(child, inheritedScope));
    };
    visit(source);
  }
  assert.ok(scopedBranchCount > 0, "the scanner inspected Table & Flame-specific renderer branches");

  const css = postcss.parse(fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8"));
  css.walkRules((rule) => {
    if (!rule.selector.includes('data-site-template="restaurant-table-flame"')) return;
    rule.walkDecls((declaration) => {
      const found = declaration.value.match(colorPattern) ?? [];
      for (const literal of found) {
        assert.ok(approvedColors.has(literal.toLowerCase()), "app/globals.css: Table & Flame selector contains unapproved color literal " + literal);
      }
    });
  });
});

test("V2 appearance draft action accepts declared palette and pattern ids and rejects unknown ids", async () => {
  const actionPath = path.join(ROOT, "lib/actions/website-v2.ts");
  const resolvedActionPath = require.resolve(actionPath);
  delete require.cache[resolvedActionPath];
  const { WEBSITE_APPEARANCE_DRAFT_EXTRA_KEY } = require("@/lib/website-v2-theme");
  let saveCount = 0;
  let activeAppearanceTemplate = { templateId: "restaurant-table-flame", templateVersion: "1.1.0" };
  const mocks = {
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase-admin": { createSupabaseAdmin() { throw new Error("unused in appearance draft test"); } },
    "@/lib/auth": { getCurrentUser: async () => null, isAdmin: async () => false },
    "@/lib/entity-auth": { checkTenantAccess: async () => ({ hasAccess: false }), ENTITY_ROLES_MANAGE: [] },
    "@/lib/slug": { createSlug: (value) => value },
    "@/lib/website-category": { normalizeWebsiteCategory: (value) => value, resolveWebsiteCategoryForOrganizer: (value) => value },
    "@/lib/website-v2-initial-content": { buildInitialContentFromOrganizer: () => ({}) },
    "@/lib/website-template-resolver": {},
    "@/lib/website-blocks": { generateStableId: () => "test-id" },
    "@/lib/store-product-detail": { getStoreProductStockState: () => "available" },
    "@/lib/website-nav": { isReservedWebsiteSlug: () => false },
    "@/lib/website-structured-data": { getTenantSiteBuilderLiveUrl: () => "" },
    "@/lib/actions/website-content": {
      getContentForBuilder: async () => ({
        success: true,
        data: { metadata: activeAppearanceTemplate },
      }),
      saveContentDraft: async () => {
        saveCount += 1;
        return { success: true, data: { savedAt: "now", version: 2, hasDraft: true } };
      },
    },
  };
  const originalLoad = Module._load;
  Module._load = function mockWebsiteV2ActionDependencies(request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { saveV2WebsiteAppearanceDraft } = require(actionPath);
    const content = (paletteId, backgroundPattern) => ({
      template_extras: {
        [WEBSITE_APPEARANCE_DRAFT_EXTRA_KEY]: { paletteId, backgroundPattern },
      },
    });
    const accepted = await saveV2WebsiteAppearanceDraft("website-id", content("sea-salt", "dots"));
    assert.equal(accepted.success, true);
    assert.equal(saveCount, 1);
    const unknownPalette = await saveV2WebsiteAppearanceDraft("website-id", content("not-a-palette", "dots"));
    assert.equal(unknownPalette.success, false);
    const unknownPattern = await saveV2WebsiteAppearanceDraft("website-id", content("sea-salt", "stripes"));
    assert.equal(unknownPattern.success, false);
    assert.equal(saveCount, 1, "invalid appearance ids never reach the content save action");
    activeAppearanceTemplate = { templateId: "restaurant-savannah", templateVersion: "1.0.0" };
    const savannahPalette = await saveV2WebsiteAppearanceDraft("website-id", content("midnight-sapphire", "none"));
    assert.equal(savannahPalette.success, true, "Savannah can save a palette without declaring pattern options");
    assert.equal(saveCount, 2);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedActionPath];
  }
});

test("Savannah is a non-legacy restaurant flagship with six localized palettes and no pattern control", () => {
  assert.equal(RESTAURANT_SAVANNAH.id, "restaurant-savannah");
  assert.equal(RESTAURANT_SAVANNAH.version, "1.0.0");
  assert.equal(RESTAURANT_SAVANNAH.legacy, undefined);
  assert.equal(RESTAURANT_TABLE_FLAME.legacy, true);
  assert.ok(NEW_SITE_GALLERY_TEMPLATES.includes(RESTAURANT_SAVANNAH));
  assert.ok(!NEW_SITE_GALLERY_TEMPLATES.includes(RESTAURANT_TABLE_FLAME));
  assert.equal(RESTAURANT_SAVANNAH.localizedName.en, "Savannah");
  assert.ok(RESTAURANT_SAVANNAH.localizedDescription.en && RESTAURANT_SAVANNAH.localizedDescription.fr);
  assert.deepEqual(RESTAURANT_SAVANNAH.sections, RESTAURANT_TABLE_FLAME.sections);
  assert.deepEqual(RESTAURANT_SAVANNAH.editableSlots.map((slot) => slot.slotId), RESTAURANT_TABLE_FLAME.editableSlots.map((slot) => slot.slotId));
  assert.equal(RESTAURANT_SAVANNAH.sectionAlign, "center");
  assert.equal(RESTAURANT_SAVANNAH.header.sticky, true);
  assert.equal(RESTAURANT_SAVANNAH.header.ctaLabel, "Order Now");
  assert.equal(RESTAURANT_SAVANNAH.header.mobileMenu, "overlay");
  assert.equal(RESTAURANT_SAVANNAH.defaultPaletteId, "midnight-sapphire");
  assert.equal(RESTAURANT_SAVANNAH.palettes.length, 6);
  assert.equal(RESTAURANT_SAVANNAH.patterns, undefined);
  for (const palette of RESTAURANT_SAVANNAH.palettes) {
    assert.ok(palette.label.en && palette.label.fr, `${palette.id} has EN/FR names`);
  }
  assert.equal(FLAGSHIP_SAMPLES[RESTAURANT_SAVANNAH.id], SAVANNAH_SAMPLES);
  assert.ok(resolveV2TemplateGalleryPreview(RESTAURANT_SAVANNAH.id)?.resolved.pages.length);
  const { getTemplateSwitchTargets } = require("@/lib/website-template-switch");
  const frenchTarget = getTemplateSwitchTargets(null, "fr").find((target) => target.id === RESTAURANT_SAVANNAH.id);
  assert.equal(frenchTarget.name, "Savannah");
  assert.equal(frenchTarget.description, RESTAURANT_SAVANNAH.localizedDescription.fr);
  const { buildWebsiteEditorSections, getWebsiteEditorControlForSlot } = require("@/lib/website-v2-editor-schema");
  const normalized = normalizeContent({ business_name: "Savannah House" });
  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, normalized, { includeSamples: true, includeSourceMap: true });
  const readiness = checkPublishReadiness(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, normalized);
  const editorSections = buildWebsiteEditorSections(RESTAURANT_SAVANNAH, normalized, resolved, readiness.missingRequired.map((slot) => slot.slotId));
  assert.ok(getWebsiteEditorControlForSlot(editorSections, "menu.featured"));
  assert.ok(getWebsiteEditorControlForSlot(editorSections, "hours.table"));

  const editor = require("node:fs").readFileSync(path.join(ROOT, "components/dashboard/website/v2/V2WebsiteEditor.tsx"), "utf8");
  assert.match(editor, /template\.palettes\?\.length\s*\?\s*\(/);
  assert.match(editor, /template\.patterns\?\.map/);
  assert.ok(!RESTAURANT_SAVANNAH.patterns?.length, "the Appearance panel has no pattern options for Savannah");
  assert.equal(FOOD_ORDER_TEMPLATE.palettes, undefined, "templates without palettes do not show Appearance");
  const savannahTheme = v2ThemeStyle(RESTAURANT_SAVANNAH);
  assert.equal(savannahTheme["--site-card-radius"], "0px");
  assert.equal(savannahTheme["--site-card-shadow"], "none");
  assert.equal(savannahTheme["--site-card-border-style"], "none");
  assert.equal(savannahTheme["--ps-font-body"], "'Helvetica Neue', Helvetica, var(--font-arimo), Arial, sans-serif");
  assert.equal(savannahTheme["--ps-font-heading"], savannahTheme["--v2-heading-font"]);

  const createAction = require("node:fs").readFileSync(path.join(ROOT, "lib/actions/website-v2.ts"), "utf8");
  assert.match(createAction, /templateId:\s*template\.id/);
  assert.match(createAction, /templateVersion:\s*template\.version/);
  assert.equal(getFlagshipTemplate("restaurant-savannah", "1.0.0"), RESTAURANT_SAVANNAH);
});

test("creating Savannah sends its registered template id and version to the atomic create RPC", async () => {
  const actionPath = path.join(ROOT, "lib/actions/website-v2.ts");
  const resolvedActionPath = require.resolve(actionPath);
  delete require.cache[resolvedActionPath];
  let rpcArgs;
  const organizer = { id: "org-savannah", name: "Savannah House", slug: "savannah-house", org_type: "restaurant" };
  const supabase = {
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        delete() { return this; },
        async maybeSingle() { return { data: table === "organizers" ? organizer : null, error: null }; },
        async upsert() { return { error: null }; },
        then(resolve, reject) {
          return Promise.resolve({ data: table === "website_pages" ? [] : null, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, "create_website_from_template");
      rpcArgs = args;
      return { data: { website_id: "website-savannah", slug: "savannah-house" }, error: null };
    },
  };
  const mocks = {
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase-admin": { createSupabaseAdmin: () => supabase },
    "@/lib/auth": { getCurrentUser: async () => ({ id: "user-owner" }), isAdmin: async () => true },
    "@/lib/entity-auth": { checkTenantAccess: async () => ({ hasAccess: true }), ENTITY_ROLES_MANAGE: [] },
    "@/lib/slug": { createSlug: (value) => value.toLowerCase().replace(/\s+/g, "-") },
    "@/lib/website-category": {
      normalizeWebsiteCategory: (value, fallback) => value || fallback || "restaurant",
      resolveWebsiteCategoryForOrganizer: () => "restaurant",
    },
    "@/lib/website-blocks": { generateStableId: () => "generated-id" },
    "@/lib/store-product-detail": { getStoreProductStockState: () => "available" },
    "@/lib/website-nav": { isReservedWebsiteSlug: () => false },
    "@/lib/website-structured-data": { getTenantSiteBuilderLiveUrl: () => "" },
    "@/lib/actions/website-content": { getContentForBuilder: async () => ({ success: true }), saveContentDraft: async () => ({ success: true }) },
  };
  const previousLoad = Module._load;
  Module._load = function mockSavannahCreateDependencies(request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return previousLoad.call(this, request, parent, isMain);
  };
  try {
    const { createWebsiteFromV2Template } = require(actionPath);
    const result = await createWebsiteFromV2Template("org-savannah", RESTAURANT_SAVANNAH.id, {
      creationRequestId: "savannah-create-test",
    });
    assert.equal(result.success, true);
    assert.equal(rpcArgs.p_metadata.templateId, "restaurant-savannah");
    assert.equal(rpcArgs.p_metadata.templateVersion, "1.0.0");
    assert.equal(rpcArgs.p_metadata.storefront.currency, "XOF");
  } finally {
    Module._load = previousLoad;
    delete require.cache[resolvedActionPath];
  }
});

test("Savannah palette roles pass the required text, header, band, scrim, and overlay contrast pairs", () => {
  const luminance = (color) => {
    const channels = color.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const mix = (first, second, amount) => {
    const channels = (color) => color.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16));
    const a = channels(first);
    const b = channels(second);
    return `#${a.map((channel, index) => Math.round(channel * (1 - amount) + b[index] * amount).toString(16).padStart(2, "0")).join("")}`;
  };
  const check = (paletteId, name, foreground, background) => {
    const ratio = contrastRatio(background, foreground);
    assert.ok(ratio >= 4.5, `${paletteId}/${name}: ${ratio.toFixed(2)}:1 is below 4.5:1`);
    return ratio;
  };

  for (const palette of RESTAURANT_SAVANNAH.palettes) {
    const roles = deriveWebsitePaletteRoles(palette);
    const worstWhitePhoto = mix("#ffffff", roles.scrim, 0.68);
    const worstBlackPhoto = mix("#000000", roles.scrim, 0.68);
    assert.ok(luminance(roles.scrim) < 0.1, `${palette.id}: scrim remains a dark shade`);
    check(palette.id, "ink/base", roles.ink, roles.base);
    check(palette.id, "muted/base", roles.muted, roles.base);
    check(palette.id, "ink/subtle", roles.ink, roles.subtle);
    check(palette.id, "on subtle/subtle", roles.onSubtle, roles.subtle);
    check(palette.id, "accent deep/base", roles.accentDeep, roles.base);
    check(palette.id, "on accent/accent", roles.onAccent, roles.accent);
    check(palette.id, "light text/band", roles.onBand, roles.band);
    check(palette.id, "footer text/band", roles.onFooter, roles.band);
    check(palette.id, "solid header/base", roles.onHeader, roles.base);
    check(palette.id, "mobile overlay/base", roles.onBase, roles.base);
    check(palette.id, "scrim/white photo", roles.onScrim, worstWhitePhoto);
    check(palette.id, "scrim/black photo", roles.onScrim, worstBlackPhoto);
    assert.ok(contrastRatio(roles.base, roles.band) >= 1.5, `${palette.id}: band remains visibly distinct from base`);
    assert.ok(contrastRatio(roles.ink, roles.soft ?? roles.subtle) < 4.5 || roles.onSoft, `${palette.id}: soft is decorative and has a derived readable fallback role`);
  }
});

test("Savannah resolver, switch planning, and restaurant feature derivation preserve content and commerce readiness", () => {
  const content = {
    business_name: "Savannah House",
    hero_headline: "Dinner, thoughtfully made",
    about_text: "A long-table neighborhood kitchen.",
    template_extras: { retained: { ownerKey: true } },
  };
  const before = structuredClone(content);
  for (const [from, to] of [
    [RESTAURANT_TABLE_FLAME.id, RESTAURANT_SAVANNAH.id],
    [RESTAURANT_SAVANNAH.id, RESTAURANT_TABLE_FLAME.id],
  ]) {
    const plan = planTemplateSwitch(from, to, content);
    assert.equal(plan.newTemplateId, to);
    assert.deepEqual(plan.hiddenSections, []);
    assert.deepEqual(plan.keptUnslottedKeys, ["template_extras"]);
  }
  assert.deepEqual(content, before, "switch planning never mutates the source content");
  assert.equal(getWebsitePaletteId(RESTAURANT_SAVANNAH, { brand: { paletteId: "stale-id" } }), "midnight-sapphire");
  assert.equal(getWebsiteBackgroundPattern(RESTAURANT_SAVANNAH, { brand: { backgroundPattern: "dots" } }), "none");
  assert.equal(v2ThemeStyle(RESTAURANT_SAVANNAH, { brand: { paletteId: "stale-id" } })["--tf-base"], "#EEF3FB");

  const tableBuilt = getBuiltStorefrontFeatures(RESTAURANT_TABLE_FLAME);
  const savannahBuilt = getBuiltStorefrontFeatures(RESTAURANT_SAVANNAH);
  assert.deepEqual(savannahBuilt, tableBuilt);
  assert.equal(savannahBuilt.ordering, true);
  assert.equal(savannahBuilt.reservations, true);
  const input = {
    capabilities: ["ONLINE_ORDERING", "PICKUP", "RESERVATIONS"],
    offerings: ["online_ordering", "pickup", "table_reservations"],
    built: savannahBuilt,
    currency: "USD",
    hasActiveDish: true,
    reservationsApproved: true,
  };
  assert.deepEqual(resolveStorefrontFeatures(input), resolveStorefrontFeatures({ ...input, built: tableBuilt }));
  assert.equal(resolveStorefrontFeatures(input).ordering, true);
  assert.equal(resolveStorefrontFeatures(input).reservations, true);
});

test("Savannah thin content renders safe static markup for empty, sparse, and full menus", async () => {
  const resolverModule = require("@/lib/website-embeds");
  const rendererPath = require.resolve("@/components/site/blocks/BlockRenderer");
  const originalLoad = Module._load;
  const menuSections = { current: [] };
  delete require.cache[rendererPath];
  Module._load = function mockSavannahMenuResolver(request, parent, isMain) {
    if (request === "next-intl/server") return { getTranslations: async () => (key) => key };
    if (request === "@/lib/website-embeds") {
      return { ...resolverModule, resolveMenuEmbed: async () => menuSections.current };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let fixtureRenderer;
  try {
    fixtureRenderer = require("@/components/site/blocks/BlockRenderer").BlockRenderer;
  } finally {
    Module._load = originalLoad;
    delete require.cache[rendererPath];
  }

  const makeItem = (index, description = "Soup") => ({
    id: `dish-${index}`,
    name: `Dish ${index + 1}`,
    description,
    image_url: null,
    price: 12,
    promo_price: null,
    option_groups: [],
    is_sold_out: false,
    dietary_tags: [],
    allergens: [],
    modifiers: [],
    is_featured: false,
    isDraft: false,
  });
  const renderMenu = async (items) => {
    menuSections.current = items.length ? [{ id: "dinner", name: "Dinner", description: null, items }] : [];
    const tree = await fixtureRenderer({
      block: { type: "menu_embed", heading: "Menu", variant: "editorial" },
      tenantId: "tenant-for-fixture",
      siteTemplateId: RESTAURANT_SAVANNAH.id,
      sectionAlign: "center",
      businessName: "Savannah House",
    });
    return renderToStaticMarkup(tree);
  };

  const empty = await renderMenu([]);
  assert.equal(empty, "", "a Savannah menu with no items omits the empty section");
  for (const count of [1, 2, 12]) {
    const items = Array.from({ length: count }, (_, index) => makeItem(index, index === 0 ? "Soup" : undefined));
    const markup = await renderMenu(items);
    assert.equal((markup.match(/Dish \d+/g) || []).length, count, `${count} menu items appear exactly once`);
    assert.match(markup, /grid-cols-1 gap-8 md:grid-cols-2/);
    assert.doesNotMatch(markup, /<img/, "missing menu photos do not create empty image boxes");
  }
  const longDescription = "x".repeat(300);
  const descriptions = await renderMenu([makeItem(0, "Soup"), makeItem(1, longDescription)]);
  assert.ok(descriptions.includes("Soup"));
  assert.ok(descriptions.includes(longDescription), "a 300-character description remains in static markup");

  const emptyFeatures = await fixtureRenderer({ block: { type: "features", items: [] }, siteTemplateId: RESTAURANT_SAVANNAH.id });
  assert.equal(renderToStaticMarkup(emptyFeatures), "", "empty feature sections are omitted");
  for (const block of [
    { type: "about", heading: "Our Story" },
    { type: "gallery", images: [] },
    { type: "testimonials", items: [] },
    { type: "contact", heading: "Hours & Location" },
  ]) {
    const emptyBlock = await fixtureRenderer({ block, siteTemplateId: RESTAURANT_SAVANNAH.id });
    assert.equal(renderToStaticMarkup(emptyBlock), "", `${block.type} with no content is omitted`);
  }
  const aboutTree = await fixtureRenderer({
    block: { type: "about", heading: "Our Story", story: "A quiet neighborhood table." },
    siteTemplateId: RESTAURANT_SAVANNAH.id,
    businessName: "Savannah House",
    businessLogo: "/owner-logo.svg",
  });
  const aboutMarkup = renderToStaticMarkup(aboutTree);
  assert.match(aboutMarkup, />S<\/span>/, "missing About photos use the business initial");
  assert.doesNotMatch(aboutMarkup, /<img/, "a missing About photo does not create an empty image box or reuse the logo");

  const resolved = resolveTemplateContent(RESTAURANT_SAVANNAH.id, RESTAURANT_SAVANNAH.version, {
    business_name: "A Very Long Restaurant Name That Must Stay Readable On A Narrow Header",
    hero_headline: "A calm plate",
  }, { includeSamples: false });
  const hero = resolved.pages.find((page) => page.isHome).blocks.find((block) => block.type === "hero");
  assert.equal(hero.backgroundImage, undefined);
  const heroMarkup = renderToStaticMarkup(HeroBlockRenderer({
    block: hero,
    savannah: true,
    businessName: "A Very Long Restaurant Name That Must Stay Readable On A Narrow Header",
  }));
  assert.match(heroMarkup, /linear-gradient/);
  assert.match(heroMarkup, /A calm plate/);
  assert.doesNotMatch(heroMarkup, /<img/);
  const headerMarkup = renderWithMessages(React.createElement(V2SiteHeader, {
    template: RESTAURANT_SAVANNAH,
    content: { business_name: "A Very Long Restaurant Name That Must Stay Readable On A Narrow Header" },
    navigation: [],
    siteTitle: "Savannah",
    siteSlug: "savannah-thin",
  }));
  assert.match(headerMarkup, /A Very Long Restaurant Name/);
  assert.doesNotMatch(headerMarkup, /<img/);
});

test("Savannah-specific renderer paths use palette tokens and contain no color literals", () => {
  const sourceFiles = [
    "components/site/blocks/BlockRenderer.tsx",
    "components/site/blocks/StorefrontBrowse.tsx",
    "components/site/v2/V2SiteHeader.tsx",
    "components/site/v2/V2SiteFooter.tsx",
  ];
  const colorPattern = /#[\da-f]{3,8}\b|\brgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/ig;
  const approvedPaletteLiterals = new Set(RESTAURANT_SAVANNAH.palettes.flatMap((palette) => [palette.base, palette.accent, palette.ink, palette.soft].filter(Boolean)).map((value) => value.toLowerCase()));
  const savannahPattern = /\bsavannah(?:Editorial|FallbackMark|Button|Font)?\b|siteTemplateId\s*===\s*["']restaurant-savannah["']|template\.id\s*===\s*["']restaurant-savannah["']/i;
  let scopedBranchCount = 0;
  const assertNoLiteral = (node, source, file) => {
    const found = node.getText(source).match(colorPattern) ?? [];
    assert.deepEqual(found, [], `${file}: Savannah renderer branch contains color literals: ${found.join(", ")}`);
  };
  for (const relativePath of sourceFiles) {
    const file = path.join(ROOT, relativePath);
    const source = ts.createSourceFile(file, require("node:fs").readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isConditionalExpression(node) && savannahPattern.test(node.condition.getText(source))) {
        scopedBranchCount += 1;
        assertNoLiteral(node.whenTrue, source, relativePath);
      } else if (ts.isIfStatement(node) && savannahPattern.test(node.expression.getText(source))) {
        scopedBranchCount += 1;
        assertNoLiteral(node.thenStatement, source, relativePath);
      } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && savannahPattern.test(node.left.getText(source))) {
        scopedBranchCount += 1;
        assertNoLiteral(node.right, source, relativePath);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.ok(scopedBranchCount > 0, "scanner found Savannah-specific renderer branches");
  const templatePath = path.join(ROOT, "lib/website-template-v2.ts");
  const templateSourceText = require("node:fs").readFileSync(templatePath, "utf8");
  const paletteDefinition = /const SAVANNAH_PALETTES:[\s\S]*?= \[[\s\S]*?\n\];/.exec(templateSourceText)?.[0];
  assert.ok(paletteDefinition, "the scanner located Savannah's explicit palette definition allowlist");
  for (const literal of paletteDefinition.match(colorPattern) ?? []) {
    assert.ok(approvedPaletteLiterals.has(literal.toLowerCase()), `palette definition contains unapproved literal ${literal}`);
  }
  const css = postcss.parse(require("node:fs").readFileSync(path.join(ROOT, "app/globals.css"), "utf8"));
  css.walkRules((rule) => {
    if (!rule.selector.includes('data-site-template="restaurant-savannah"')) return;
    rule.walkDecls((declaration) => {
      const found = declaration.value.match(colorPattern) ?? [];
      assert.deepEqual(found, [], `Savannah CSS selector contains color literals: ${found.join(", ")}`);
    });
  });
});
