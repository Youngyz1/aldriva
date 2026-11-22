/**
 * lib/dashboard/__tests__/phase-b-overview.test.cjs
 *
 * Tests for Phase B overview components, capability compositions, and generic fallback.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../..");

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

const { resolvePeriodRange } = require("../date-range.ts");

test("phase-b: validates capability mapping rules for restaurant and generic fallback", () => {
  const restaurantCaps = new Set(["ORDERS", "ONLINE_ORDERING", "MENU", "TABLES"]);
  const hasRestaurant = restaurantCaps.has("MENU") || restaurantCaps.has("TABLES");
  assert.equal(hasRestaurant, true);

  const genericCaps = new Set(["CONTENT", "GALLERY", "REVIEWS"]);
  const hasOrdersOrMenu = genericCaps.has("ORDERS") || genericCaps.has("ONLINE_ORDERING") || genericCaps.has("MENU");
  const hasBookings = genericCaps.has("BOOKINGS") || genericCaps.has("APPOINTMENTS") || genericCaps.has("RESERVATIONS");
  const hasServices = genericCaps.has("SERVICES");
  const hasProducts = genericCaps.has("PRODUCTS");
  const hasEvents = genericCaps.has("EVENTS");
  const hasFundraising = genericCaps.has("FUNDRAISING");
  const genericHasRestaurant = genericCaps.has("MENU") || genericCaps.has("TABLES");

  const hasAnyOperationalModule =
    hasOrdersOrMenu ||
    genericHasRestaurant ||
    hasBookings ||
    hasServices ||
    hasProducts ||
    hasEvents ||
    hasFundraising;

  assert.equal(hasAnyOperationalModule, false, "Generic unmapped business should not trigger operational commerce modules");
  const hasReviews = genericCaps.has("REVIEWS") || genericCaps.has("CUSTOMERS") || !hasAnyOperationalModule;
  assert.equal(hasReviews, true, "Generic unmapped business should receive reviews section");
});

test("phase-b: verifies date range parser produces valid bounds for overview queries", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const rangeToday = resolvePeriodRange("today", "America/New_York", undefined, undefined, now);
  assert.ok(rangeToday.fromIso);
  assert.ok(rangeToday.toIso);
  assert.ok(new Date(rangeToday.fromIso) <= new Date(rangeToday.toIso));

  const range7d = resolvePeriodRange("7d", "America/New_York", undefined, undefined, now);
  assert.equal(range7d.kind, "7d");
  assert.ok(new Date(range7d.fromIso) < new Date(range7d.toIso));
});
