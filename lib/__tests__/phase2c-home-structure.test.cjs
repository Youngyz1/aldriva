/**
 * lib/__tests__/phase2c-home-structure.test.cjs
 *
 * Phase 2c — Home structure, browse menu, and storefront UX tests.
 * Hermetic tests reading source files, no DB/network.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

test("menu.browse section exists in RESTAURANT_SECTIONS before menu.featured", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "lib/website-template-v2.ts"), "utf8");
  const browseIndex = fileContent.indexOf('id: "menu.browse"');
  const featuredIndex = fileContent.indexOf('id: "menu.featured"');
  assert.ok(browseIndex !== -1, "menu.browse must exist in RESTAURANT_SECTIONS");
  assert.ok(featuredIndex !== -1, "menu.featured must exist in RESTAURANT_SECTIONS");
  assert.ok(browseIndex < featuredIndex, "menu.browse must come before menu.featured");
});

test("menu.featured is optional and defaultOff", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "lib/website-template-v2.ts"), "utf8");
  const featuredMatch = fileContent.match(/id:\s*"menu\.featured"[\s\S]*?optional:\s*true[\s\S]*?defaultOff:\s*true/);
  assert.ok(featuredMatch, "menu.featured section must have optional: true and defaultOff: true");
});

test("menu.browse produces menu_embed with no featured binding", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "lib/website-template-resolver.ts"), "utf8");
  const browseCaseMatch = fileContent.match(/if\s*\(\s*section\.id\s*===\s*"menu\.browse"\s*\)\s*return\s*buildMenuEmbed\(([^)]+)\);/);
  assert.ok(browseCaseMatch, "menu.browse case must call buildMenuEmbed");
  const args = browseCaseMatch[1];
  assert.ok(args.includes("false"), "menu.browse buildMenuEmbed must pass false for bindFeatured");
  assert.ok(!args.includes("true"), "menu.browse buildMenuEmbed args must not contain true");
});

test("menu.full limit is 200 not 12", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "lib/website-template-resolver.ts"), "utf8");
  const fullCaseMatch = fileContent.match(/if\s*\(\s*section\.id\s*===\s*"menu\.full"\s*\)\s*return\s*buildMenuEmbed\(([^)]+)\);/);
  assert.ok(fullCaseMatch, "menu.full case must call buildMenuEmbed");
  const args = fullCaseMatch[1];
  assert.ok(args.includes("200"), "menu.full limit must be 200");
  assert.ok(!args.includes("12"), "menu.full limit must not be 12");
});

test("editor section renamed to Popular dishes optional", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "lib/website-v2-editor-schema.ts"), "utf8");
  assert.ok(fileContent.includes("Popular dishes (optional)"), "editor schema must contain 'Popular dishes (optional)'");
});

test("publish button has title tooltip in source", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/V2WebsiteEditor.tsx"), "utf8");
  assert.ok(fileContent.includes("required field"), "Publish button tooltip must mention required field");
  assert.ok(fileContent.includes("Publish checklist"), "Publish button tooltip must mention Publish checklist");
});

test("restaurant reservations navigation is feature-gated and rental has no reservations page", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "lib/website-template-v2.ts"), "utf8");
  const navSectionMatch = fileContent.match(/RESTAURANT_TABLE_FLAME[\s\S]*?navigation:\s*\[([\s\S]*?)\]/);
  assert.ok(navSectionMatch, "RESTAURANT_TABLE_FLAME must have a navigation array");
  const navText = navSectionMatch[1];
  assert.match(navText, /label: "Reservations"[\s\S]*?feature: "reservations"/);

  const rentalPagesMatch = fileContent.match(/export const RENTAL_DRIVELINE:[\s\S]*?pages:\s*\[([\s\S]*?)\]/);
  assert.ok(rentalPagesMatch, "RENTAL_DRIVELINE must declare pages");
  assert.doesNotMatch(rentalPagesMatch[1], /slug:\s*["']reservations["']/i);
});

test("view full menu link in BlockRenderer", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "components/site/blocks/BlockRenderer.tsx"), "utf8");
  assert.ok(fileContent.includes("viewFullMenu"), "BlockRenderer must reference viewFullMenu translation key");
  assert.ok(fileContent.includes("siteSlug"), "BlockRenderer must reference siteSlug");
});

test("en fr parity for viewFullMenu and popularDishes", () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));
  assert.ok(en.Storefront?.viewFullMenu, "en.json Storefront must have viewFullMenu");
  assert.ok(en.Storefront?.popularDishes, "en.json Storefront must have popularDishes");
  assert.ok(fr.Storefront?.viewFullMenu, "fr.json Storefront must have viewFullMenu");
  assert.ok(fr.Storefront?.popularDishes, "fr.json Storefront must have popularDishes");
});

test("cart bar spacer in StorefrontBrowse", () => {
  const fileContent = fs.readFileSync(path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"), "utf8");
  assert.ok(fileContent.includes("h-24"), "StorefrontBrowse must contain h-24 spacer");
  assert.ok(fileContent.includes('aria-hidden="true"'), "StorefrontBrowse must contain aria-hidden on spacer");
});
