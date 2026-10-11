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
} = require("@/lib/website-template-v2");
const { FLAGSHIP_SAMPLES } = require("@/lib/website-template-samples");
const {
  resolveTemplateContent,
  resolveTemplateManifest,
  planTemplateSwitch,
  checkPublishReadiness,
} = require("@/lib/website-template-resolver");
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
  assert.ok(pending.includes("menu_order"));
  assert.ok(pending.includes("order_summary"));
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
    .find((b) => b.type === "menu_embed");
  assert.deepEqual(featured.selectedItemIds, [dishId], "only UUID-shaped picks bind");
  const plain = resolveTemplateContent("restaurant-table-flame", "1.0.0", buildFullDoc());
  const plainFeatured = plain.pages
    .find((p) => p.purpose === "home").blocks
    .find((b) => b.type === "menu_embed");
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
