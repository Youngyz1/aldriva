/**
 * lib/__tests__/service-catalog-slug-collision.test.cjs
 *
 * Phase 3 of the services catalog virtual-route work: a
 * category and an uncategorized service are both reachable at
 * /services/<slug>, so the two must never share a slug for one organizer.
 * Source-level checks (no DB), following the pattern in
 * lib/__tests__/service-categories.test.cjs.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("services.ts: defines findCategoryWithSlug scoped to organizer_id", () => {
  const svc = read("lib/actions/services.ts");
  assert.ok(svc.includes("async function findCategoryWithSlug"));
  assert.ok(svc.includes('.from("service_categories")'));
});

test("services.ts: createService rejects an uncategorized slug that collides with a category", () => {
  const svc = read("lib/actions/services.ts");
  const start = svc.indexOf("export async function createService");
  const end = svc.indexOf("export async function updateService", start);
  const body = svc.slice(start, end);
  assert.ok(body.includes("categoryId === null && (await findCategoryWithSlug(admin, organizerId, base))"));
  assert.ok(body.includes("already used by a service category"));
});

test("services.ts: updateService rejects when the effective (possibly unchanged) slug collides with a category", () => {
  const svc = read("lib/actions/services.ts");
  const start = svc.indexOf("export async function updateService");
  const end = svc.indexOf("export async function deleteService", start);
  const body = svc.slice(start, end);
  assert.ok(body.includes("effectiveCategoryId === null && (await findCategoryWithSlug(admin, organizerId, effectiveSlug))"));
  assert.ok(body.includes("already used by a service category"));
});

test("service-categories.ts: defines findUncategorizedServiceWithSlug scoped to organizer_id and category_id IS NULL", () => {
  const svc = read("lib/actions/service-categories.ts");
  assert.ok(svc.includes("async function findUncategorizedServiceWithSlug"));
  assert.ok(svc.includes('.from("services")'));
  assert.ok(svc.includes('.is("category_id", null)'));
});

test("service-categories.ts: createServiceCategory rejects a slug that collides with an uncategorized service", () => {
  const svc = read("lib/actions/service-categories.ts");
  const start = svc.indexOf("export async function createServiceCategory");
  const end = svc.indexOf("export async function updateServiceCategory", start);
  const body = svc.slice(start, end);
  assert.ok(body.includes("findUncategorizedServiceWithSlug(admin, organizerId, base)"));
  assert.ok(body.includes("already used by a service"));
});

test("service-categories.ts: updateServiceCategory rejects when the effective slug collides with an uncategorized service", () => {
  const svc = read("lib/actions/service-categories.ts");
  const start = svc.indexOf("export async function updateServiceCategory");
  const end = svc.indexOf("export async function deleteServiceCategory", start);
  const body = svc.slice(start, end);
  assert.ok(body.includes("findUncategorizedServiceWithSlug(admin, organizerId, effectiveSlug)"));
  assert.ok(body.includes("already used by a service"));
});

test("service-categories.ts: updateServiceCategory skips the collision query when the slug is unchanged", () => {
  const svc = read("lib/actions/service-categories.ts");
  const start = svc.indexOf("export async function updateServiceCategory");
  const end = svc.indexOf("export async function deleteServiceCategory", start);
  const body = svc.slice(start, end);
  assert.ok(body.includes("effectiveSlug !== existing.slug &&"));
});

test("test-files.json registers this test file", () => {
  const list = JSON.parse(read("test-files.json"));
  assert.ok(list.includes("lib/__tests__/service-catalog-slug-collision.test.cjs"));
});
