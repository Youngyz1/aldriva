/**
 * lib/__tests__/service-categories.test.cjs
 *
 * Source-level tests (no DB) for the service categories feature: migration
 * 220 files exist with the expected additive shape, lib/actions/services.ts
 * gained the new optional fields with graceful degrade, lib/actions/
 * service-categories.ts exists with role-gated CRUD + delete-blocked/move,
 * ServiceForm.tsx exposes the new fields, and the /services/new blank-form
 * fix (explicit `key` props distinguishing "new" from "edit").
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ── Migration 220 files ─────────────────────────────────────────────────────

test("migration 220 files exist (forward, rollback, supabase mirror)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "db/migration_220_service_categories.sql")), "db migration 220 forward file must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "db/migration_220_service_categories_rollback.sql")), "db migration 220 rollback file must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "supabase/migrations/20261106000000_migration_220_service_categories.sql")), "supabase migration 220 mirror must exist");
});

test("migration 220: creates service_categories additively and extends services without dropping anything", () => {
  const sql = read("db/migration_220_service_categories.sql");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.service_categories"), "must create service_categories");
  assert.ok(sql.includes("organizer_id uuid NOT NULL REFERENCES public.organizers(id)"), "service_categories must be tenant-scoped like services");
  assert.ok(sql.includes("UNIQUE (organizer_id, slug)"), "slug uniqueness must be scoped to organizer_id, same as services");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES public.service_categories(id) ON DELETE SET NULL"), "category_id must be nullable with ON DELETE SET NULL");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS summary text NULL"), "must add summary column");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS includes jsonb NOT NULL DEFAULT '[]'::jsonb"), "must add includes jsonb column defaulting to empty array");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS hero_image_url text NULL"), "must add hero_image_url column");
  assert.ok(!/DROP\s+(TABLE|COLUMN)/i.test(sql), "forward migration must not drop anything");
  assert.ok(!sql.includes("ALTER TABLE public.reservations"), "must not touch reservations");
  assert.ok(!/ALTER TABLE public\.(reservation|general_booking)/i.test(sql), "must not alter any booking table");
});

test("migration 220: RLS policies on service_categories mirror services (public active read, tenant roles, is_entity_member)", () => {
  const sql = read("db/migration_220_service_categories.sql");
  assert.ok(sql.includes("ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes('ON public.service_categories FOR SELECT') && sql.includes("USING (is_active = true)"));
  assert.ok(sql.includes("is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])"));
  assert.ok(sql.includes("is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])"));
  assert.ok(sql.includes("is_entity_member(organizer_id, ARRAY['owner','admin','manager'])"));
});

test("migration 220 rollback: fail-closed, refuses while data exists", () => {
  const sql = read("db/migration_220_service_categories_rollback.sql");
  assert.ok(sql.includes("RAISE EXCEPTION"), "rollback must fail closed");
  assert.ok(sql.includes("MIGRATION_220_ROLLBACK_BLOCKED"));
  assert.ok(sql.includes("DROP TABLE IF EXISTS public.service_categories"));
});

test("migration 220 is not mirrored to supabase/migrations as a rollback (repo convention)", () => {
  const files = fs.readdirSync(path.join(ROOT, "supabase/migrations"));
  assert.ok(!files.some((f) => f.includes("220") && f.includes("rollback")), "rollback must never be mirrored to supabase/migrations");
});

// ── DECISIONS.md ─────────────────────────────────────────────────────────

test("DECISIONS.md: DEC-0064 documents the service categories decision", () => {
  const sql = read("docs/DECISIONS.md");
  assert.ok(sql.includes("DEC-0064"));
  assert.ok(sql.includes("DEC-0018") && sql.includes("does not forbid"));
});

// ── lib/actions/services.ts: new fields + graceful degrade ────────────────

test("services.ts: createService and updateService accept the new optional fields", () => {
  const svc = read("lib/actions/services.ts");
  assert.ok(svc.includes("category_id?: string | null"));
  assert.ok(svc.includes("summary?: string | null"));
  assert.ok(svc.includes("includes?: unknown"));
  assert.ok(svc.includes("hero_image_url?: string | null"));
  // existing price-nullable behavior (services-price-optional.test.cjs) must be untouched
  assert.ok(svc.includes('price: input.price === null || input.price === undefined ? null : Number(input.price)'));
  assert.ok(svc.includes('updates.price = input.price === null || input.price === undefined ? null : Number(input.price);'));
});

test("services.ts: isMissingTableError guards new-column writes (graceful degrade when migration 220 not applied)", () => {
  const svc = read("lib/actions/services.ts");
  assert.ok(svc.includes("function isMissingTableError"));
  assert.ok(svc.includes('code === "42P01" || code === "42703"'));
  const createStart = svc.indexOf("export async function createService");
  const createEnd = svc.indexOf("export async function updateService", createStart);
  const createBody = svc.slice(createStart, createEnd);
  assert.ok(createBody.includes("isMissingTableError(error)"), "createService must retry without new columns on missing-table/column error");
  const updateStart = svc.indexOf("export async function updateService");
  const updateEnd = svc.indexOf("export async function deleteService", updateStart);
  const updateBody = svc.slice(updateStart, updateEnd);
  assert.ok(updateBody.includes("isMissingTableError(error)"), "updateService must retry without new columns on missing-table/column error");
});

test("services.ts: createService still loops 10 attempts and reserves 6 chars for a collision suffix (unchanged)", () => {
  const svc = read("lib/actions/services.ts");
  const fnStart = svc.indexOf("export async function createService");
  const fnEnd = svc.indexOf("export async function updateService", fnStart);
  const fnBody = svc.slice(fnStart, fnEnd);
  assert.ok(fnBody.includes('for (let attempt = 0; attempt < 10; attempt++)'));
  assert.ok(fnBody.includes("SLUG_MAX - 6"));
  assert.ok(fnBody.includes('code === "23505"'));
});

// ── lib/actions/service-categories.ts: role-gated CRUD + delete-blocked/move ──

test("service-categories.ts: exports list/create/update/delete/reorder with tenant auth", () => {
  const svc = read("lib/actions/service-categories.ts");
  assert.ok(svc.includes("export async function listServiceCategories"));
  assert.ok(svc.includes("export async function createServiceCategory"));
  assert.ok(svc.includes("export async function updateServiceCategory"));
  assert.ok(svc.includes("export async function deleteServiceCategory"));
  assert.ok(svc.includes("export async function reorderServiceCategories"));
  assert.ok(svc.includes("requireTenantContext"));
});

test("service-categories.ts: listServiceCategories degrades gracefully when the table is missing (categories empty, no crash)", () => {
  const svc = read("lib/actions/service-categories.ts");
  const start = svc.indexOf("export async function listServiceCategories");
  const end = svc.indexOf("export async function createServiceCategory", start);
  const body = svc.slice(start, end);
  assert.ok(body.includes("isMissingTableError(error)"));
  assert.ok(body.includes("migrated: false"));
  assert.ok(body.includes("data: []"));
});

test("service-categories.ts: deleting a category with attached services is blocked unless the caller supplies a move target", () => {
  const svc = read("lib/actions/service-categories.ts");
  const start = svc.indexOf("export async function deleteServiceCategory");
  const end = svc.indexOf("export async function reorderServiceCategories", start);
  const body = svc.slice(start, end);
  assert.ok(body.includes('"CATEGORY_HAS_SERVICES"'));
  assert.ok(body.includes("moveServicesTo === undefined"));
  assert.ok(body.includes('.update({ category_id: moveServicesTo'), "must bulk-move services before deleting the category");
});

// ── ServiceForm.tsx: new fields ─────────────────────────────────────────

test("ServiceForm.tsx: exposes category select, slug, summary, includes repeater, hero image", () => {
  const form = read("components/dashboard/services/ServiceForm.tsx");
  assert.ok(form.includes('htmlFor="category"'));
  assert.ok(form.includes('htmlFor="slug"'));
  assert.ok(form.includes('htmlFor="summary"'));
  assert.ok(form.includes("What's included"));
  assert.ok(form.includes("MediaUploadField") && form.includes('folderSubpath="services"'), "must still use MediaUploadField services (unchanged convention)");
  assert.ok(form.includes("INCLUDES_MAX_ITEMS") && form.includes("INCLUDE_ITEM_MAX") && form.includes("SUMMARY_MAX"));
});

test("ServiceForm.tsx: double-submit guard and price-optional behavior are unchanged", () => {
  const form = read("components/dashboard/services/ServiceForm.tsx");
  assert.ok(form.includes("if (submittingRef.current) return;"));
  assert.ok(form.includes("submittingRef.current = true"));
  assert.ok(form.includes("submittingRef.current = false"));
  assert.ok(form.includes("finally"));
  assert.ok(form.includes("disabled={saving}"));
  assert.ok(form.includes('<Label htmlFor="price">Price</Label>'));
  assert.ok(form.includes('placeholder="Optional"'));
  assert.ok(form.includes('price: price === "" || price === null || price === undefined ? null : Number(price)'));
});

// ── ServicesManager.tsx: grouping + explicit Edit button ───────────────────

test("ServicesManager.tsx: groups by category with an Uncategorized bucket and keeps the Price-on-request literal", () => {
  const mgr = read("components/dashboard/services/ServicesManager.tsx");
  assert.ok(mgr.includes('s.price === null ? "Price on request" :'), "existing price-on-request rendering must be unchanged");
  assert.ok(mgr.includes("Uncategorized"));
  assert.ok(mgr.includes("aria-label=\"Edit service\""), "must have an explicit Edit button, not just a clickable card");
});

// ── Blank-form fix (0.4): explicit key props distinguish new vs edit ──────

test("services/new page.tsx: ServiceForm is keyed \"new\" so it never reuses a previous edit instance's state", () => {
  const page = read("app/dashboard/org/[id]/services/new/page.tsx");
  assert.ok(page.includes('key="new"'));
});

test("services/[serviceId] edit page.tsx: ServiceForm is keyed by service.id", () => {
  const page = read("app/dashboard/org/[id]/services/[serviceId]/page.tsx");
  assert.ok(page.includes("key={service.id}"));
});

// ── Dashboard page wiring ───────────────────────────────────────────────

test("services page.tsx: renders ServiceCategoriesManager only when migration 220 has been applied", () => {
  const page = read("app/dashboard/org/[id]/services/page.tsx");
  assert.ok(page.includes("ServiceCategoriesManager"));
  assert.ok(page.includes("categoriesResult.migrated"));
});

// ── test-files.json registration ───────────────────────────────────────

test("test-files.json registers both new test files", () => {
  const list = JSON.parse(read("test-files.json"));
  assert.ok(list.includes("lib/__tests__/service-catalog-validation.test.cjs"));
  assert.ok(list.includes("lib/__tests__/service-categories.test.cjs"));
});
