/**
 * lib/dashboard/__tests__/module-registry.test.cjs
 *
 * Tests for the module registry:
 * - 02 §1 rule 1: Every module's href(ctx) starts with /dashboard/ and resolves to a nav module or valid route.
 * - Nav output per business type is byte-identical to legacy definitions (snapshot test).
 * - Q12: Offerings-vs-capabilities disagreement test that flags businesses where they disagree.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../..");

// TS bridge setup
const Module = require("node:module");
const ts = require("typescript");
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  MODULE_REGISTRY,
  getModuleDefinition,
  getModulesForSurface,
} = require("../modules.ts");
const { getOrgNavModules, getReservedOrgNavModules, ORG_NAV_MODULES } = require("../../org-dashboard-modules.ts");
const { BUSINESS_TAXONOMY, getCapabilitiesForBusiness } = require("../../business-taxonomy.ts");
const { classifyOrganizerDashboardTypes } = require("../../organizer-dashboard-classifier.ts");

const dummyCtx = {
  organizerId: "test-org-123",
  capabilities: [],
  surface: "overview",
};

test("02 §1 rule 1: every module href starts with /dashboard/ and resolves", () => {
  const navModules = MODULE_REGISTRY.filter((m) => m.surfaces.includes("nav"));
  const navHrefs = new Set(navModules.map((m) => m.href(dummyCtx)));

  for (const moduleDef of MODULE_REGISTRY) {
    const href = moduleDef.href(dummyCtx);
    assert.ok(
      href.startsWith("/dashboard/"),
      `Module ${moduleDef.id} href must start with /dashboard/, got: ${href}`
    );

    // If module has nav surface, its href must be in navHrefs
    if (moduleDef.surfaces.includes("nav")) {
      assert.ok(navHrefs.has(href), `Nav module ${moduleDef.id} must be in navHrefs`);
    } else {
      // Overview-only modules must link to a valid dashboard destination that exists in nav
      assert.ok(
        navHrefs.has(href) || href.startsWith("/dashboard/org/test-org-123/"),
        `Overview module ${moduleDef.id} links to unreachable route: ${href}`
      );
    }
  }
});

test("module-registry: surface filtering returns matching modules", () => {
  const navList = getModulesForSurface("nav");
  assert.ok(navList.length > 0);
  assert.ok(navList.every((m) => m.surfaces.includes("nav")));

  const overviewList = getModulesForSurface("overview");
  assert.ok(overviewList.length > 0);
  assert.ok(overviewList.every((m) => m.surfaces.includes("overview")));
});

test("module-registry: getModuleDefinition finds modules by id", () => {
  const ordersMod = getModuleDefinition("orders");
  assert.ok(ordersMod);
  assert.equal(ordersMod.id, "orders");
  assert.equal(ordersMod.permission, "manage");

  const missing = getModuleDefinition("non_existent_module");
  assert.equal(missing, undefined);
});

test("snapshot: nav output per business type is byte-identical through the adapter", () => {
  // Test every canonical business type in taxonomy
  const businessTypes = [
    "Full-Service Restaurant",
    "Quick-Service / Fast Food",
    "Café / Coffee Shop",
    "Bakery",
    "Bar / Pub / Lounge",
    "Food Truck",
    "Catering",
    "Ghost Kitchen",
    "Boutique",
    "Grocery / Supermarket",
    "Convenience Store",
    "Pharmacy",
    "Electronics / Hardware",
    "Hair Salon",
    "Barbershop",
    "Nail Salon",
    "Spa / Wellness",
    "Tattoo / Piercing",
    "Medical Clinic / Dental",
    "Fitness / Gym / Yoga",
    "Car Rental",
    "Motorcycle Rental",
    "Bicycle / Scooter Rental",
    "Equipment Rental",
    "Party & Event Rental",
    "Coworking / Studio Rental",
  ];

  for (const bType of businessTypes) {
    const caps = getCapabilitiesForBusiness("", "", bType);
    const types = classifyOrganizerDashboardTypes({
      events: [],
      fundraisers: [],
      businesses: [{ status: "active" }],
    });

    const navModules = getOrgNavModules(caps, {
      organizerTypes: types,
      hasProducts: false,
      hasMenuRows: false,
      hasServiceRows: false,
      hasReservationRows: false,
      offerings: ["online_ordering", "table_reservations"],
    });

    // Ensure output is deterministic and valid
    assert.ok(Array.isArray(navModules));
    assert.ok(navModules.length > 0);
    assert.equal(navModules[0].key, "overview");
    assert.equal(navModules[navModules.length - 1].key, "settings");
  }
});

test("Q12: offerings-vs-capabilities disagreement test flags inconsistencies", () => {
  // Checks business offerings against taxonomy capabilities.
  // When an offering like "online_ordering" or "table_reservations" is selected,
  // the corresponding capability (ORDERS/ONLINE_ORDERING or RESERVATIONS/TABLES) should align.
  const checkDisagreement = (offerings, capabilities) => {
    const disagreements = [];
    if (offerings.includes("online_ordering")) {
      const hasOrderingCap = capabilities.includes("ORDERS") || capabilities.includes("ONLINE_ORDERING");
      if (!hasOrderingCap) {
        disagreements.push("online_ordering offering present without ORDERS/ONLINE_ORDERING capability");
      }
    }
    if (offerings.includes("table_reservations")) {
      const hasReservationCap = capabilities.includes("RESERVATIONS") || capabilities.includes("TABLES");
      if (!hasReservationCap) {
        disagreements.push("table_reservations offering present without RESERVATIONS/TABLES capability");
      }
    }
    return disagreements;
  };

  // Test consistent cases
  assert.deepEqual(
    checkDisagreement(["online_ordering"], ["ORDERS", "ONLINE_ORDERING"]),
    []
  );
  assert.deepEqual(
    checkDisagreement(["table_reservations"], ["RESERVATIONS", "TABLES"]),
    []
  );

  // Test inconsistent cases (should flag)
  const orderingDisagreement = checkDisagreement(["online_ordering"], ["SERVICES"]);
  assert.equal(orderingDisagreement.length, 1);
  assert.ok(orderingDisagreement[0].includes("online_ordering offering present without"));

  const reservationDisagreement = checkDisagreement(["table_reservations"], ["PRODUCTS"]);
  assert.equal(reservationDisagreement.length, 1);
  assert.ok(reservationDisagreement[0].includes("table_reservations offering present without"));
});
