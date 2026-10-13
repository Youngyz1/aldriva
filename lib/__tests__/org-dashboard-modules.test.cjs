const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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

const {
  getReservedOrgNavModules,
  getCapabilitiesForBusinesses,
  ORG_NAV_MODULES,
} = require("../org-dashboard-modules.ts");
const { getOrgNavItems } = require("../../app/dashboard/org/[id]/org-nav-items.ts");

const BASE = "/dashboard/org/org-1";
const labels = (items) => items.map((item) => item.label);
const business = (business_type) => getCapabilitiesForBusinesses([{ industry: "", category: "", business_type }]);
const noBusiness = () => getCapabilitiesForBusinesses([]);
const ORDERING_OFFERINGS = ["online_ordering"];

// ── 1. Nav matrix ───────────────────────────────────────────────────────────

test("restaurant org sees Menu and Orders but not Services", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Full-Service Restaurant"),
    offerings: ORDERING_OFFERINGS,
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Menu", "Orders", "Reviews", "Analytics", "Settings"]);
});

test("restaurant org without online_ordering offering hides Orders but keeps Menu", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Full-Service Restaurant"),
    offerings: [],
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Menu", "Reviews", "Analytics", "Settings"]);
  assert.ok(!labels(items).includes("Orders"), "Orders requires the online_ordering offering, not capability alone");
});

test("menu rows alone never enable Orders without the offering", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Full-Service Restaurant"),
    offerings: [],
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: true, hasServiceRows: false,
  });
  assert.ok(labels(items).includes("Menu"), "menu rows keep Menu visible");
  assert.ok(!labels(items).includes("Orders"), "menu rows alone must not show Orders");
});

test("car rental org sees neither Menu nor Services", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Car Rental"),
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Reviews", "Analytics", "Settings"]);
  assert.ok(!labels(items).includes("Fleet"), "fleet is reserved, never rendered");
  assert.ok(!labels(items).includes("Bookings"), "bookings are reserved, never rendered");
});

test("service org sees Services but not Menu", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Residential Cleaning"),
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Services", "Reviews", "Analytics", "Settings"]);
});

test("org with products sees the single Shop item (never Products)", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Boutique"),
    offerings: [],
    hasEvents: false, hasFundraisers: false, hasProducts: true, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  // Boutique lacks ONLINE_ORDERING capability and the online_ordering offering,
  // so Orders stays hidden even though ORDERS capability exists.
  assert.deepEqual(labels(items), ["Overview", "Website", "Shop", "Reviews", "Analytics", "Settings"]);
  const byLabel = new Map(items.map((item) => [item.label, item.href]));
  assert.equal(byLabel.get("Shop"), `${BASE}/products`, "Shop points at the products route");
});

test("a business alone never shows Shop without owner products", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Boutique"),
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.ok(!labels(items).includes("Shop"), "creating a business must not reveal Shop");
  assert.ok(!labels(items).includes("Products"), "no separate Products item exists");
});

test("digital-only owner sees Shop", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: noBusiness(),
    hasEvents: false, hasFundraisers: false, hasProducts: true, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Shop", "Reviews", "Analytics", "Settings"]);
});

test("business-tagged products count as owner products for Shop", () => {
  // hasProducts covers products of ANY kind (business_id irrelevant): the gate
  // cannot distinguish tagged rows, so tagged rows show Shop, never a 404.
  const items = getOrgNavItems(BASE, {
    capabilities: noBusiness(),
    hasEvents: false, hasFundraisers: false, hasProducts: true, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.ok(labels(items).includes("Shop"));
});

test("event organizer sees Events only", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: noBusiness(),
    hasEvents: true, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Events", "Reviews", "Analytics", "Settings"]);
});

test("fundraiser org sees Fundraisers only", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: noBusiness(),
    hasEvents: false, hasFundraisers: true, hasProducts: false, hasWebsite: false,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Fundraisers", "Reviews", "Analytics", "Settings"]);
});

test("generic org with nothing sees only the always-visible items", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: noBusiness(),
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: false,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Reviews", "Analytics", "Settings"]);
});

test("capabilities union across several linked businesses", () => {
  const caps = getCapabilitiesForBusinesses([
    { industry: "", category: "", business_type: "Car Rental" },
    { industry: "", category: "", business_type: "Residential Cleaning" },
  ]);
  assert.ok(caps.includes("SERVICES"), "union carries SERVICES");
  assert.ok(!caps.includes("MENU"), "union has no MENU");
  const items = getOrgNavItems(BASE, {
    capabilities: caps,
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Services", "Reviews", "Analytics", "Settings"]);
});

// ── 2. Existence fallback: rows always win ──────────────────────────────────

test("menu rows keep Menu visible without the MENU capability", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Car Rental"),
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: true, hasServiceRows: false,
  });
  assert.ok(labels(items).includes("Menu"), "NEVER hide Menu while rows exist");
});

test("service rows keep Services visible without the SERVICES capability", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: noBusiness(),
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: true,
  });
  assert.ok(labels(items).includes("Services"), "NEVER hide Services while rows exist");
});

test("capability alone shows the link with zero rows", () => {
  const items = getOrgNavItems(BASE, {
    capabilities: business("Full-Service Restaurant"),
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
    hasMenuRows: false, hasServiceRows: false,
  });
  assert.ok(labels(items).includes("Menu"));
});

// ── 3. Legacy path + reserved items ─────────────────────────────────────────

test("omitted capabilities keep today's behavior (Services/Menu always shown)", () => {
  const items = getOrgNavItems(BASE, {
    hasEvents: false, hasFundraisers: false, hasProducts: false, hasWebsite: true,
  });
  assert.deepEqual(labels(items), ["Overview", "Website", "Services", "Menu", "Reviews", "Analytics", "Settings"]);
  const bare = getOrgNavItems(BASE);
  assert.equal(bare.length, 10);
  const withProducts = getOrgNavItems(BASE, {
    hasEvents: false, hasFundraisers: false, hasProducts: true, hasWebsite: true,
  });
  const byLabel = new Map(withProducts.map((item) => [item.label, item.href]));
  assert.equal(byLabel.get("Shop"), `${BASE}/products`, "legacy Shop points at the products route");
});

test("reservations/fleet/bookings are reserved; orders now has a route", () => {
  const reserved = getReservedOrgNavModules();
  assert.deepEqual(reserved.map((module) => module.key).sort(), ["bookings", "fleet", "reservations"]);
  for (const entry of reserved) {
    assert.equal(entry.routeExists, false);
    assert.ok(entry.visibility.kind === "capability" && entry.visibility.capabilities.length > 0);
  }
  // Orders now has a route and must render for restaurant owners with the offering
  const restaurantItems = getOrgNavItems(BASE, { capabilities: business("Full-Service Restaurant"), offerings: ORDERING_OFFERINGS, hasMenuRows: false, hasServiceRows: false });
  assert.ok(restaurantItems.some((item) => item.label === "Orders"), "Orders renders for restaurant owners with online_ordering");
  const noOfferingItems = getOrgNavItems(BASE, { capabilities: business("Full-Service Restaurant"), offerings: [], hasMenuRows: false, hasServiceRows: false });
  assert.ok(!noOfferingItems.some((item) => item.label === "Orders"), "Orders hides without the offering");
  const rendered = new Set();
  for (const caps of [
    business("Car Rental"),
    business("Boutique"),
    business("Residential Cleaning"),
    noBusiness(),
  ]) {
    for (const item of getOrgNavItems(BASE, { capabilities: caps })) rendered.add(item.label);
  }
  for (const key of ["Reservations", "Fleet", "Bookings"]) {
    assert.ok(!rendered.has(key), `${key} must not render without a route`);
  }
});

test("rendered hrefs stay on the org workspace base", () => {
  const items = getOrgNavItems(BASE, { capabilities: business("Full-Service Restaurant"), offerings: ORDERING_OFFERINGS });
  for (const item of items) {
    assert.ok(item.href.startsWith(`${BASE}/`), `${item.label} href stays under the org base`);
  }
  const byLabel = new Map(items.map((item) => [item.label, item.href]));
  assert.equal(byLabel.get("Menu"), `${BASE}/menu`);
  assert.equal(byLabel.get("Orders"), `${BASE}/orders`, "Orders points at the orders route");
  const serviceItems = getOrgNavItems(BASE, { capabilities: business("Residential Cleaning") });
  const serviceByLabel = new Map(serviceItems.map((item) => [item.label, item.href]));
  assert.equal(serviceByLabel.get("Services"), `${BASE}/services`);
});

// ── 4. No raw keys: every key exists in en + fr ─────────────────────────────

test("every nav key (rendered and reserved) exists in both language files", () => {
  const en = require("../../messages/en.json");
  const fr = require("../../messages/fr.json");
  const keys = new Set(ORG_NAV_MODULES.map((module) => module.key));
  for (const key of keys) {
    assert.equal(typeof en.Organizer[key], "string", `en Organizer.${key} must exist`);
    assert.equal(typeof fr.Organizer[key], "string", `fr Organizer.${key} must exist`);
  }
  assert.equal(en.Organizer.services, "Services");
  assert.equal(en.Organizer.menu, "Menu");
  assert.equal(en.Organizer.shop, "Shop", "the single products item uses the shop key");
  assert.equal(fr.Organizer.shop, "Boutique");
  assert.equal(fr.Organizer.orders, "Commandes");
  assert.equal(fr.Organizer.reservations, "Réservations");
  assert.equal(fr.Organizer.fleet, "Véhicules");
  assert.equal(fr.Organizer.bookings, "Rendez-vous");
});

// ── 5. Surfaces: translation wiring + icon ──────────────────────────────────

test("all three nav surfaces translate labels through the Organizer namespace", () => {
  const sidebar = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/OrgDashboardSidebar.tsx"), "utf8");
  assert.match(sidebar, /useTranslations\('Organizer'\)/);
  const mobileNav = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/OrgMobileNav.tsx"), "utf8");
  assert.match(mobileNav, /useTranslations\('Organizer'\)/);
  assert.match(mobileNav, /item\.label\.toLowerCase\(\)/);
  const mobileHeader = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/OrgMobileHeader.tsx"), "utf8");
  assert.match(mobileHeader, /useTranslations\('Organizer'\)/);
  assert.match(mobileHeader, /item\.label\.toLowerCase\(\)/);
});

test("sidebar icon map covers the Menu and Shop icons", () => {
  const sidebar = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/OrgDashboardSidebar.tsx"), "utf8");
  assert.match(sidebar, /Utensils,/);
  assert.match(sidebar, /Settings, Utensils/);
  assert.match(sidebar, /ShoppingBag,/);
});

test("layout loads businesses, catalog counts, capabilities, and the dev-only loss log", () => {
  const layout = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/layout.tsx"), "utf8");
  assert.match(layout, /from\("businesses"\)\.select\("id, industry, category, business_type, offerings"\)/);
  assert.match(layout, /from\("menu_sections"\)/);
  assert.match(layout, /from\("services"\)/);
  assert.match(layout, /getCapabilitiesForBusinesses\(/);
  assert.match(layout, /capabilities,/);
  assert.match(layout, /offerings/);
  assert.match(layout, /NODE_ENV !== "production"/);
  assert.match(layout, /would lose nav items/);
});

test("business Orders module stays hidden until a real route ships (same as Reservations)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/business-dashboard-modules.ts"), "utf8");
  assert.match(src, /key: "orders"[\s\S]*?routeExists: false/, "business Orders must carry routeExists: false");
});

test("org Orders nav requires the online_ordering offering via the shared resolver", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/org-dashboard-modules.ts"), "utf8");
  assert.match(src, /module\.key === "orders"/, "orders has a dedicated offering gate");
  assert.match(src, /resolveStorefrontFeatures/, "gate uses the shared storefront resolver");
  assert.match(src, /offerings/, "offerings flow into the visibility check");
});

test("shop count uses owner rows of any kind, never organizer_id or business existence", () => {
  const layout = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/layout.tsx"), "utf8");
  assert.doesNotMatch(layout, /from\("products"\)\.select\("id"[^)]*\)\.eq\("organizer_id"/);
  assert.doesNotMatch(layout, /\.is\("business_id", null\)/, "no business_id filter: any owner product shows Shop");
  assert.doesNotMatch(layout, /hasShopRows/, "no separate Shop plumbing remains");
  assert.match(layout, /\.eq\("owner_id", orgUserId\)/);
  assert.match(layout, /hasProducts = \(productCount \?\? 0\) > 0/);
  const productsPage = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/products/page.tsx"), "utf8");
  assert.doesNotMatch(productsPage, /\.is\("business_id", null\)/, "org Products page lists ALL owner products, matching the gate");
});

test("no separate shop page remains and the create form has no business preselect", () => {
  assert.ok(
    !fs.existsSync(path.join(ROOT, "app/dashboard/org/[id]/shop/page.tsx")),
    "the separate business-tagged Shop page is removed"
  );
  const newPage = fs.readFileSync(path.join(ROOT, "app/dashboard/products/new/page.tsx"), "utf8");
  assert.doesNotMatch(newPage, /searchParams/);
  assert.doesNotMatch(newPage, /initialBusinessId/);
  const form = fs.readFileSync(path.join(ROOT, "app/dashboard/products/new/NewProductFormClient.tsx"), "utf8");
  assert.doesNotMatch(form, /initialBusinessId/);
  assert.match(form, /Business \(optional\)/, "the optional Business dropdown stays as it was");
});
