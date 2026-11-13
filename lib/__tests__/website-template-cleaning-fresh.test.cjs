/**
 * lib/__tests__/website-template-cleaning-fresh.test.cjs
 *
 * Source-level tests for the new "Fresh Home" v2 website template
 * (id "cleaning-fresh", category "service") for home cleaning businesses.
 *
 * These tests read source files directly (hermetic) and do not touch the
 * database, a running server, or any existing template.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
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
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { getFlagshipTemplate, FLAGSHIP_TEMPLATES, NEW_SITE_GALLERY_TEMPLATES } = require("../website-template-v2.ts");
const { resolveTemplateContent } = require("../website-template-resolver.ts");
const { normalizeContent } = require("../website-content.ts");
const { summarizeTemplateSwitch } = require("../website-template-switch.ts");

const manifestSource = fs.readFileSync(path.join(ROOT, "lib/website-template-v2.ts"), "utf8");
const resolverSource = fs.readFileSync(path.join(ROOT, "lib/website-template-resolver.ts"), "utf8");
const editorSchemaSource = fs.readFileSync(path.join(ROOT, "lib/website-v2-editor-schema.ts"), "utf8");
const enMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const frMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

const template = getFlagshipTemplate("cleaning-fresh", "1.0.0");

test("cleaning-fresh is registered, not legacy, and targets the service category", () => {
  assert.ok(template, "cleaning-fresh template must be resolvable");
  assert.equal(template.id, "cleaning-fresh");
  assert.equal(template.name, "Fresh Home");
  assert.equal(template.version, "1.0.0");
  assert.equal(template.legacy, undefined, "template must not be legacy");
  assert.ok(template.supportedCategories.includes("service"), "supportedCategories must include service");
  assert.equal(template.category, "service");
});

test("FLAGSHIP_TEMPLATES keeps existing templates and adds cleaning-fresh", () => {
  const ids = FLAGSHIP_TEMPLATES.map((t) => t.id);
  for (const existing of ["restaurant-table-flame", "restaurant-savannah", "rental-driveline", "food-order", "store"]) {
    assert.ok(ids.includes(existing), `existing template ${existing} must remain registered`);
  }
  assert.ok(ids.includes("cleaning-fresh"), "cleaning-fresh must be registered");
  assert.equal(FLAGSHIP_TEMPLATES.length, 6, "five existing templates plus cleaning-fresh");
});

test("cleaning-fresh appears in the new-site gallery (not filtered as legacy)", () => {
  const ids = NEW_SITE_GALLERY_TEMPLATES.map((t) => t.id);
  assert.ok(ids.includes("cleaning-fresh"), "cleaning-fresh must be in the new-site gallery");
});

test("five pages: home, services, about, contact, book; no menu anywhere", () => {
  const pageSlugs = template.pages.map((p) => p.slug);
  for (const slug of ["home", "services", "about", "contact", "book"]) {
    assert.ok(pageSlugs.includes(slug), `page ${slug} must exist`);
  }
  assert.equal(template.pages.length, 5, "exactly five pages");
  const home = template.pages.find((p) => p.slug === "home");
  assert.ok(home && home.isHome, "home page must be marked isHome");
  const navLabels = template.navigation.map((n) => n.label.toLowerCase());
  for (const banned of ["menu", "dish", "restaurant", "food", "order"]) {
    assert.ok(!navLabels.some((label) => label.includes(banned)), `navigation must not contain "${banned}"`);
  }
  // The "Book now" entry is the header CTA button, not a nav link; the nav
  // entries are Home, Services, About, Contact (printed link labels).
  const navSlugs = template.navigation.map((n) => n.pageSlug);
  assert.ok(navSlugs.includes("services"), "Services nav link present");
  assert.ok(navSlugs.includes("about"), "About nav link present");
  assert.ok(navSlugs.includes("contact"), "Contact nav link present");
  assert.ok(!navSlugs.includes("book"), "Book is the header CTA button, not a nav link");
});

test("services_embed block appears on home and services pages", () => {
  const homeSections = template.sections.filter((s) => s.page === "home");
  const servicesSections = template.sections.filter((s) => s.page === "catalog");
  const homeServices = homeSections.find((s) => s.block === "services_embed");
  const catalogServices = servicesSections.find((s) => s.block === "services_embed");
  assert.ok(homeServices, "home page must have a services_embed section");
  assert.ok(catalogServices, "services (catalog) page must have a services_embed section");
  assert.ok(catalogServices.limit === undefined || catalogServices.slots.some((s) => s === "services.limit"), "services page services_embed must allow a different limit");
});

test("general_booking_form block appears on the book page", () => {
  const bookSections = template.sections.filter((s) => s.page === "booking");
  const bookingForm = bookSections.find((s) => s.block === "general_booking_form");
  assert.ok(bookingForm, "book page must have a general_booking_form section");
});

test("three palettes with required fields", () => {
  assert.ok(Array.isArray(template.palettes) && template.palettes.length === 3, "three palettes required");
  const ids = template.palettes.map((p) => p.id);
  assert.deepEqual(ids, ["fresh", "calm", "bold"], "palette ids must be fresh, calm, bold");
  for (const palette of template.palettes) {
    assert.ok(palette.id, "palette id required");
    assert.ok(palette.label && typeof palette.label.en === "string" && typeof palette.label.fr === "string", "palette label needs en and fr");
    assert.ok(typeof palette.base === "string" && palette.base.startsWith("#"), "palette base colour required");
    assert.ok(typeof palette.accent === "string" && palette.accent.startsWith("#"), "palette accent colour required");
    assert.ok(typeof palette.ink === "string" && palette.ink.startsWith("#"), "palette ink colour required");
  }
  assert.equal(template.defaultPaletteId, "fresh", "default palette must be fresh");
});

test("EN and FR template name and description present", () => {
  assert.equal(template.localizedName.en, "Fresh Home");
  assert.equal(template.localizedName.fr, "Foyer Frais");
  assert.ok(typeof template.localizedDescription.en === "string" && template.localizedDescription.en.length > 0);
  assert.ok(typeof template.localizedDescription.fr === "string" && template.localizedDescription.fr.length > 0);
  assert.equal(enMessages.PublicSite.cleaningFreshTemplateName, "Fresh Home");
  assert.equal(frMessages.PublicSite.cleaningFreshTemplateName, "Foyer Frais");
  assert.ok(typeof enMessages.PublicSite.cleaningFreshTemplateDescription === "string");
  assert.ok(typeof frMessages.PublicSite.cleaningFreshTemplateDescription === "string");
});

test("no new font loader or font import is added for the template", () => {
  assert.ok(!manifestSource.includes('from "next/font'), "template file must not import a font loader");
  assert.ok(!manifestSource.includes("next/font/google"), "template file must not import next/font/google");
});

test("resolver emits services_embed and general_booking_form blocks for cleaning-fresh", () => {
  const resolved = resolveTemplateContent("cleaning-fresh", "1.0.0", {}, {
    business: {
      offerings: ["table_reservations"],
      capabilities: ["RESERVATIONS"],
      reservationsApproved: true,
    },
  });
  assert.ok(resolved, "resolver must produce output");
  const homePage = resolved.pages.find((p) => p.slug === "home");
  const servicesPage = resolved.pages.find((p) => p.slug === "services");
  const bookPage = resolved.pages.find((p) => p.slug === "book");
  assert.ok(homePage, "home page must resolve");
  assert.ok(servicesPage, "services page must resolve");
  assert.ok(bookPage, "book page must resolve");
  const homeServicesBlock = homePage.blocks.find((b) => b.type === "services_embed");
  const catalogServicesBlock = servicesPage.blocks.find((b) => b.type === "services_embed");
  const bookingFormBlock = bookPage.blocks.find((b) => b.type === "general_booking_form");
  assert.ok(homeServicesBlock, "resolved home page must emit services_embed block");
  assert.ok(catalogServicesBlock, "resolved services page must emit services_embed block");
  assert.ok(bookingFormBlock, "resolved book page must emit general_booking_form block");
  assert.equal(homeServicesBlock.limit, 6, "home services_embed default limit 6");
  assert.equal(homeServicesBlock.layout, "grid", "home services_embed default layout grid");
});

test("resolver has services_embed and general_booking_form cases", () => {
  assert.ok(resolverSource.includes('case "services_embed":'), "resolver must handle services_embed");
  assert.ok(resolverSource.includes('case "general_booking_form":'), "resolver must handle general_booking_form");
  assert.ok(editorSchemaSource.includes('{ id: "services", title: "Services"'), "editor schema must have a Services group");
});

test("normalizeContent accepts empty/invalid services_limit (uses default)", () => {
  const empty = normalizeContent({ services_limit: "" });
  assert.equal(empty.services_limit, undefined, "empty string services_limit is dropped");
  const nonNumeric = normalizeContent({ services_limit: "abc" });
  assert.equal(nonNumeric.services_limit, undefined, "non-numeric services_limit is dropped");
  const zero = normalizeContent({ services_limit: 0 });
  assert.equal(zero.services_limit, 1, "zero services_limit is clamped to 1");
  const overLimit = normalizeContent({ services_limit: 99 });
  assert.equal(overLimit.services_limit, 12, "over-12 services_limit is clamped to 12");
  const valid = normalizeContent({ services_limit: 6 });
  assert.equal(valid.services_limit, 6, "valid services_limit passes through");
});

test("normalizeContent handles new cleaning-fresh keys gracefully", () => {
  const doc = normalizeContent({
    services_heading: "",
    services_layout: "invalid",
    benefits: [{ title: "", description: "" }],
    areas: [{ title: "Central", description: "" }],
    values: [{ title: "Reliable", description: "We arrive on time." }],
    team: [{ title: "", description: "" }],
  });
  assert.equal(doc.services_heading, undefined, "empty services_heading is dropped");
  assert.equal(doc.services_layout, undefined, "invalid services_layout is dropped");
  assert.ok(Array.isArray(doc.areas) && doc.areas.length === 1, "areas with valid entry passes through");
  assert.ok(Array.isArray(doc.values) && doc.values.length === 1, "values with valid entry passes through");
  assert.equal(doc.benefits, undefined, "benefits with empty title is dropped");
  assert.equal(doc.team, undefined, "team with empty title is dropped");
});

test("general_booking_form block emits without reservations feature live", () => {
  const resolved = resolveTemplateContent("cleaning-fresh", "1.0.0", {}, {
    business: {
      offerings: [],
      capabilities: [],
      reservationsApproved: true,
    },
  });
  assert.ok(resolved, "resolver must produce output");
  const bookPage = resolved.pages.find((p) => p.slug === "book");
  assert.ok(bookPage, "book page must resolve even when reservations are off");
  const bookingFormBlock = bookPage.blocks.find((b) => b.type === "general_booking_form");
  assert.ok(bookingFormBlock, "general_booking_form block must be emitted without reservations gate");
});

test("summarizeTemplateSwitch reports pages to add", () => {
  const summary = summarizeTemplateSwitch(null, "cleaning-fresh", {});
  assert.ok(Array.isArray(summary.pagesToAdd), "pagesToAdd must be an array");
  assert.ok(summary.pagesToAdd.includes("home"), "home page should be listed to add");
  assert.ok(summary.pagesToAdd.includes("services"), "services page should be listed to add");
  assert.ok(summary.pagesToAdd.includes("book"), "book page should be listed to add");
  assert.ok(!summary.pagesToAdd.includes("nonexistent"), "should not list nonexistent pages");
});

test("switching to cleaning-fresh does not auto-enable reservations", () => {
  // Residential Cleaning capabilities include BOOKINGS/APPOINTMENTS but not
  // RESERVATIONS/TABLES, so storefrontFeatures.reservations is never live.
  const { getCapabilitiesForBusiness } = require("../business-taxonomy.ts");
  const caps = getCapabilitiesForBusiness("Home & Property Services", "Cleaning", "Residential Cleaning");
  assert.ok(!caps.includes("RESERVATIONS"), "cleaning business does not have RESERVATIONS capability");
  assert.ok(!caps.includes("TABLES"), "cleaning business does not have TABLES capability");
});
