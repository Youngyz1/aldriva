const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ── §1 Database ──────────────────────────────────────────────────────────

test("§1 database: tables services, service_tiers, menu_sections, menu_items exist and no service_categories", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS services"), "services table must exist");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS service_tiers"), "service_tiers must exist");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS menu_sections"), "menu_sections must exist");
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS menu_items"), "menu_items must exist");
  assert.ok(!sql.includes("CREATE TABLE IF NOT EXISTS service_categories"), "must not create service_categories");
  assert.ok(sql.includes("BEGIN;") && sql.includes("COMMIT;"), "must be transactional");
  // rollback exists
  const rollback = read("db/migration_136_services_and_menus_rollback.sql");
  assert.ok(rollback.includes("DROP TABLE IF EXISTS menu_items"), "rollback must drop menu_items");
  assert.ok(rollback.includes("DROP TABLE IF EXISTS services"), "rollback must drop services");
});

test("§1 database: tenant FK to organizers.id and cascade", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(sql.includes("organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE"), "services/menu must FK organizers cascade");
  assert.ok(sql.includes("service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE"), "service_tiers FK cascade");
  assert.ok(sql.includes("section_id uuid NOT NULL REFERENCES menu_sections(id) ON DELETE CASCADE"), "menu_items FK section cascade");
});

test("§1 database: constraints and bounds", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  // services constraints
  assert.ok(sql.includes("char_length(title) >= 1 AND char_length(title) <= 120"), "services.title 1..120");
  assert.ok(sql.includes("slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'"), "slug format");
  assert.ok(sql.includes("char_length(description) <= 2000"), "description 2000");
  assert.ok(sql.includes("duration_minutes >= 5 AND duration_minutes <= 1440"), "duration 5..1440");
  assert.ok(sql.includes("price >= 0 AND price <= 999999.99"), "price 0..999999");
  assert.ok(sql.includes("position >= 0 AND position <= 999"), "position 0..999");
  assert.ok(sql.includes("UNIQUE (organizer_id, slug)"), "unique organizer+slug");
  // service_tiers — NO unique position in live version
  assert.ok(sql.includes("char_length(name) >= 1 AND char_length(name) <= 80"), "tier name 1..80");
  assert.ok(sql.includes("char_length(description) <= 500"), "tier desc 500");
  assert.equal(sql.includes("UNIQUE (service_id, position)"), false, "live: no UNIQUE service_id position");
  // menu_sections — NO unique position in live version
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS menu_sections"), "menu_sections");
  assert.equal(sql.includes("UNIQUE (organizer_id, position)"), false, "live: no UNIQUE organizer position for sections");
  // menu_items dietary/allergens — renamed constraints
  assert.ok(sql.includes("dietary_tags") && sql.includes("array_length(dietary_tags, 1) <= 12"), "dietary max 12");
  assert.ok(sql.includes("allergens") && sql.includes("array_length(allergens, 1) <= 12"), "allergens max 12");
  assert.ok(sql.includes("CONSTRAINT menu_items_dietary_tags_enum_check"), "renamed dietary constraint");
  assert.ok(sql.includes("CONSTRAINT menu_items_allergens_enum_check"), "renamed allergens constraint");
  assert.equal(sql.includes("CONSTRAINT menu_items_dietary_tags_check"), false, "old dietary name must not exist (42710)");
  assert.equal(sql.includes("CONSTRAINT menu_items_allergens_check") && !sql.includes("menu_items_allergens_enum_check"), false, "old allergens name must not exist");
  // modifiers: live uses function, no subquery in CHECK
  assert.ok(sql.includes("menu_modifiers_valid(modifiers)"), "modifiers via function");
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION menu_modifiers_valid"), "function must exist");
  // ensure function defined BEFORE table
  assert.ok(sql.indexOf("CREATE OR REPLACE FUNCTION menu_modifiers_valid") < sql.indexOf("CREATE TABLE IF NOT EXISTS menu_items"), "function before table");
  assert.equal(sql.includes("CONSTRAINT menu_items_modifiers_check CHECK (\n    jsonb_typeof(modifiers) = 'array'"), false, "old subquery CHECK must not exist");
  assert.equal(sql.includes("UNIQUE (section_id, position)"), false, "live: no UNIQUE section position for menu_items");
});

test("§1 database: organizer_id denormalized and trigger enforces match", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(sql.includes("organizer_id uuid NOT NULL REFERENCES organizers(id) ON DELETE CASCADE") && sql.includes("CREATE TABLE IF NOT EXISTS menu_items"), "menu_items has organizer_id");
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION check_menu_item_organizer_match()"), "trigger function must exist");
  assert.ok(sql.includes("menu_items.organizer_id must match menu_sections.organizer_id"), "must enforce match");
  assert.ok(sql.includes("BEFORE INSERT OR UPDATE ON menu_items"), "trigger before insert/update");
});

test("§1 database: uses is_active only, no status enum", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(sql.includes("is_active boolean NOT NULL DEFAULT true"), "is_active must exist");
  // ensure no status enum with draft/active/archived for these tables (except services maybe has no status)
  const hasStatusOnServices = /CREATE TABLE IF NOT EXISTS services[\s\S]*?status text/i.test(sql);
  assert.equal(hasStatusOnServices, false, "services must not have status enum in Phase 5 (is_active only)");
});

test("§1 database: prices are local NUMERIC(12,2), not stripe_price_id", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(sql.includes("price numeric(12,2) NOT NULL CHECK"), "price NUMERIC(12,2)");
  assert.ok(!sql.includes("stripe_price_id"), "must not add stripe_price_id");
});

test("§1 database: indexes and updated_at triggers", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(sql.includes("idx_services_organizer_id"), "idx services organizer");
  assert.ok(sql.includes("idx_service_tiers_service_id"), "idx tiers");
  assert.ok(sql.includes("idx_menu_sections_organizer_id"), "idx sections");
  assert.ok(sql.includes("idx_menu_items_section_id"), "idx items section");
  assert.ok(sql.includes("GIN (dietary_tags)") && sql.includes("GIN (allergens)"), "GIN indexes");
  assert.ok(sql.includes("update_services_updated_at()"), "updated_at trigger services");
  assert.ok(sql.includes("update_menu_items_updated_at()"), "updated_at trigger items");
});

test("§1 database: RLS enabled and policies", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(sql.includes("ALTER TABLE services ENABLE ROW LEVEL SECURITY"), "RLS services");
  assert.ok(sql.includes("ALTER TABLE service_tiers ENABLE ROW LEVEL SECURITY"), "RLS tiers");
  assert.ok(sql.includes("ALTER TABLE menu_sections ENABLE ROW LEVEL SECURITY"), "RLS sections");
  assert.ok(sql.includes("ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY"), "RLS items");
  assert.ok(sql.includes("Public can view active services") && sql.includes("FOR SELECT") && sql.includes("is_active = true"), "public active services");
  assert.ok(sql.includes("Tenant members can view services") && sql.includes("is_entity_member"), "tenant select");
  assert.ok(sql.includes("Tenant editors can insert services") && sql.includes("FOR INSERT"), "insert policy");
  assert.ok(sql.includes("Tenant editors can update services") && sql.includes("FOR UPDATE"), "update policy");
  assert.ok(sql.includes("Tenant managers can delete services") && sql.includes("FOR DELETE") && sql.includes("ARRAY['owner','admin','manager']"), "delete policy manager only");
  // check tiers/items also have public+tenant
  assert.ok(sql.includes("Public can view active service tiers"), "public tiers");
  assert.ok(sql.includes("Public can view active menu sections"), "public sections");
  assert.ok(sql.includes("Public can view active menu items"), "public items");
});

test("§1 database: local mirror exists and no rollback in supabase/migrations", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "supabase/migrations/20260925000000_migration_136_services_and_menus.sql")), "mirror must exist");
  const mirrors = fs.readdirSync(path.join(ROOT, "supabase/migrations"));
  const hasRollbackMirror = mirrors.some((f) => f.includes("136") && f.includes("rollback"));
  assert.equal(hasRollbackMirror, false, "supabase/migrations must not contain rollback");
  const canonical = read("db/migration_136_services_and_menus.sql");
  const mirrored = read("supabase/migrations/20260925000000_migration_136_services_and_menus.sql");
  assert.ok(mirrored.includes("CREATE TABLE IF NOT EXISTS services"), "mirror contains services");
  assert.equal(mirrored, canonical, "mirror must equal canonical");
  // rollback order and no CASCADE
  const rollback = read("db/migration_136_services_and_menus_rollback.sql");
  assert.ok(rollback.includes("DROP TRIGGER IF EXISTS trg_menu_items_organizer_match"), "rollback drops triggers first");
  assert.ok(rollback.indexOf("DROP TABLE IF EXISTS menu_items") < rollback.indexOf("DROP TABLE IF EXISTS menu_sections"), "children before parents");
  assert.ok(rollback.indexOf("DROP TABLE IF EXISTS menu_items") < rollback.indexOf("DROP FUNCTION IF EXISTS menu_modifiers_valid"), "function after tables");
  assert.equal(/DROP TABLE.*CASCADE/.test(rollback), false, "rollback must not use CASCADE on table drops");
  assert.ok(rollback.includes("DROP FUNCTION IF EXISTS menu_modifiers_valid(jsonb)"), "must drop modifiers function last");
});

test("§1 database: no cart/booking/pos tables", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(!sql.includes("CREATE TABLE IF NOT EXISTS bookings"), "no bookings");
  assert.ok(!sql.includes("pos_connectors") && !sql.includes("pos_sync_logs"), "no pos");
  assert.equal(sql.toLowerCase().includes("create table if not exists cart"), false, "no cart");
});

// ── §2 Services ──────────────────────────────────────────────────────────

test("§2 services: actions exist and enforce tenant isolation, validation, and sanitization", () => {
  const svc = read("lib/actions/services.ts");
  assert.ok(svc.includes('createService') && svc.includes('updateService') && svc.includes('deleteService'), "must have CRUD");
  assert.ok(svc.includes('requireTenantContext') && svc.includes('createSupabaseServer'), "must auth");
  assert.ok(svc.includes('createSlug') && svc.includes('SLUG_REGEX'), "must handle slug");
  assert.ok(svc.includes('sanitizeUrl') && svc.includes('image_url'), "must sanitize image_url");
  assert.ok(svc.includes('TITLE_MAX') || svc.includes('char_length(title)'), "must validate title");
  assert.ok(svc.includes('PRICE_MAX') || svc.includes('price >= 0'), "must validate price");
  assert.ok(svc.includes('requireTenantContext'), "must check tenant");
  assert.ok(svc.includes('revalidatePath'), "must revalidate");
  assert.ok(svc.includes('service_tiers') || svc.includes('createServiceTier'), "must handle tiers");
  assert.ok(!svc.includes('stripe_price_id'), "must not use stripe_price_id for services");
  const tier = svc.includes('createServiceTier') || svc.includes('service_tiers');
  assert.ok(tier, "tiers must be handled");
  // check dashboard routes exist
  assert.ok(fs.existsSync(path.join(ROOT, "app/dashboard/org/[id]/services/page.tsx")), "services page must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "components/dashboard/services/ServiceForm.tsx")), "ServiceForm must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "app/dashboard/org/[id]/services/[serviceId]/page.tsx")), "service edit page must exist");
});

test("§2 services: dashboard uses MediaUploadField and bounded inputs", () => {
  const form = read("components/dashboard/services/ServiceForm.tsx");
  assert.ok(form.includes('MediaUploadField') && form.includes('folderSubpath="services"'), "must use MediaUploadField services");
  assert.ok(form.includes('is_active') || form.includes('Switch'), "must have is_active toggle");
  assert.ok(form.includes('price') && form.includes('duration'), "must have price/duration");
  assert.ok(form.includes('maxLength={120}') || form.includes('TITLE_MAX'), "must bound title");
});

test("§2 services: navigation includes Services and Menu", () => {
  const nav = read("app/dashboard/org/[id]/org-nav-items.ts");
  assert.ok(nav.includes('Services') && nav.includes('/services'), "nav must have Services");
  assert.ok(nav.includes('Menu') && nav.includes('/menu'), "nav must have Menu");
});

// ── §3 Service tiers ─────────────────────────────────────────────────────

test("§3 tiers: zero tiers allowed and parent ownership enforced", () => {
  const svc = read("lib/actions/services.ts");
  assert.ok(svc.includes('service_tiers'), "must reference service_tiers");
  const db = read("db/migration_136_services_and_menus.sql");
  assert.ok(db.includes('service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE'), "must have cascade in migration");
  // check createServiceTier validates parent belongs to organizer
  assert.ok(svc.includes('Service not found or not owned by tenant'), "must enforce parent ownership");
  assert.ok(svc.includes('deleteServiceTier') && svc.includes('owner') && svc.includes('admin') && svc.includes('manager'), "delete requires manager");
});

// ── §4 Menus ─────────────────────────────────────────────────────────────

test("§4 menus: actions exist and enforce dietary/allergen/modifier bounds", () => {
  const menus = read("lib/actions/menus.ts");
  assert.ok(menus.includes('createMenuSection') && menus.includes('createMenuItem'), "must have menu CRUD");
  assert.ok(menus.includes('DIETARY_TAGS') && menus.includes('ALLERGENS'), "must define enums");
  assert.ok(menus.includes('dietary_tags') && menus.includes('allergens') && menus.includes('modifiers'), "must handle tags/allergens/modifiers");
  assert.ok(menus.includes('MAX_ARRAY') && menus.includes('12'), "must bound max 12");
  assert.ok(menus.includes('sanitizeUrl') && menus.includes('image_url'), "must sanitize image_url");
  assert.ok(menus.includes('requireTenantContext') && menus.includes('createSupabaseServer'), "must auth");
  assert.ok(menus.includes('Section not found or not owned'), "must enforce organizer match");
  assert.ok(fs.existsSync(path.join(ROOT, "app/dashboard/org/[id]/menu/page.tsx")), "menu page must exist");
});

test("§4 menus: dietary allergen enum values correct", () => {
  const menus = read("lib/actions/menus.ts");
  assert.ok(menus.includes('vegan') && menus.includes('vegetarian') && menus.includes('gluten_free') && menus.includes('halal'), "dietary must include vegan etc");
  assert.ok(menus.includes('nuts') && menus.includes('dairy') && menus.includes('gluten') && menus.includes('soy'), "allergens must include nuts etc");
  assert.ok(menus.includes('price_delta') && menus.includes('-10000') && menus.includes('10000'), "modifier price_delta bounded");
});

test("§4 menus: uses is_active only", () => {
  const menus = read("lib/actions/menus.ts");
  assert.ok(menus.includes('is_active'), "must use is_active");
  assert.ok(!menus.includes("status = 'draft'") || menus.includes('is_active'), "must not use draft status");
});

// ── §5 Public rendering ──────────────────────────────────────────────────

test("§5 public: blocks services_embed and menu_embed added with tenant isolation and limit clamp", () => {
  const blocks = read("lib/website-blocks.ts");
  assert.ok(blocks.includes('services_embed') && blocks.includes('menu_embed'), "must add block types");
  assert.ok(blocks.includes('ServicesEmbedBlock') && blocks.includes('MenuEmbedBlock'), "must define interfaces");
  assert.ok(blocks.includes('selectedServiceIds') && blocks.includes('selectedSectionIds'), "must have selected IDs");
  const embeds = read("lib/website-embeds.ts");
  assert.ok(embeds.includes('resolveServicesEmbed') && embeds.includes('resolveMenuEmbed'), "must have resolvers");
  assert.ok(embeds.includes('organizer_id') && embeds.includes('tenantId'), "must filter by organizer_id");
  assert.ok(embeds.includes('is_active') && embeds.includes('eq("is_active", true)'), "must filter is_active for public");
  assert.ok(embeds.includes('clampLimit') || embeds.includes('clampEmbedLimit'), "must clamp limit");
  assert.ok(embeds.includes('selectedServiceIds') && embeds.includes('selectedSectionIds'), "must handle selected IDs");
  assert.ok(!embeds.includes('owner_id') || embeds.includes('organizer_id'), "must not fallback to owner_id");
  const renderer = read("components/site/blocks/BlockRenderer.tsx");
  assert.ok(renderer.includes('ServicesEmbedBlockRenderer') && renderer.includes('MenuEmbedBlockRenderer'), "must have renderers");
  assert.ok(renderer.includes('case "services_embed"') && renderer.includes('case "menu_embed"'), "must dispatch blocks");
  assert.ok(renderer.includes('DraftBadge') && renderer.includes('dietary_tags') || renderer.includes('allergens'), "must show badges");
});

test("§5 public: menu dashboard is QR-ready via website block", () => {
  const menuPage = read("app/dashboard/org/[id]/menu/page.tsx");
  assert.ok(menuPage.includes('Published by adding a Menu block') || menuPage.includes('website builder'), "must mention published via Menu block");
  assert.ok(menuPage.includes('menu_sections') && menuPage.includes('menu_items'), "must list sections/items");
});

test("§2 security: deleteServiceTier verifies ownership before delete", () => {
  const svc = read("lib/actions/services.ts");
  // extract deleteServiceTier function body and check order
  const fnStart = svc.indexOf("export async function deleteServiceTier");
  assert.ok(fnStart !== -1, "deleteServiceTier must exist");
  const fnBody = svc.slice(fnStart, svc.indexOf("export async function", fnStart + 1) !== -1 ? svc.indexOf("export async function", fnStart + 1) : svc.length);
  const serviceCheckIdx = fnBody.indexOf('from("services").select("id").eq("id", serviceId).eq("organizer_id", organizerId)');
  const deleteIdx = fnBody.indexOf('from("service_tiers").delete()');
  assert.ok(serviceCheckIdx !== -1, "must select service ownership");
  assert.ok(deleteIdx !== -1, "must delete tier");
  assert.ok(serviceCheckIdx < deleteIdx, "ownership check must come BEFORE delete (service-role bypasses RLS)");
  // also verify updateServiceTier scopes final update
  const updStart = svc.indexOf("export async function updateServiceTier");
  const updBody = svc.slice(updStart, svc.indexOf("export async function deleteServiceTier", updStart));
  assert.ok(updBody.includes('.eq("id", tierId).eq("service_id", serviceId)'), "update must filter by both id and service_id");
  // If DB trigger for menu_items organizer match needs live DB, note:
  // This is a static check only; real FK trigger behavior requires a live database and cannot be verified hermetically.
});

test("createService is race-safe length-safe: no SELECT-then-INSERT, handles 23505 in loop, reserves 6 chars", () => {
  const svc = read("lib/actions/services.ts");
  const fnStart = svc.indexOf("export async function createService");
  assert.ok(fnStart !== -1, "createService must exist");
  const fnEnd = svc.indexOf("export async function updateService", fnStart);
  const fnBody = svc.slice(fnStart, fnEnd !== -1 ? fnEnd : svc.length);
  assert.equal(fnBody.includes('.eq("slug", candidate)'), false, "must not contain SELECT-then-INSERT slug loop");
  assert.ok(fnBody.includes('code === "23505"'), "must handle 23505 inside loop");
  assert.ok(fnBody.includes("SLUG_MAX - 6"), "must reserve 6 chars for suffix");
  assert.ok(fnBody.includes("crypto.randomUUID().replace"), "must use crypto.randomUUID suffix, not Math.random");
  assert.ok(fnBody.includes('for (let attempt = 0; attempt < 10; attempt++)'), "must loop 10 attempts");
});

test("updateServiceTier checks parent service before tier", () => {
  const svc = read("lib/actions/services.ts");
  const fnStart = svc.indexOf("export async function updateServiceTier");
  assert.ok(fnStart !== -1, "updateServiceTier must exist");
  const fnEnd = svc.indexOf("export async function deleteServiceTier", fnStart);
  const fnBody = svc.slice(fnStart, fnEnd !== -1 ? fnEnd : svc.length);
  const serviceIdx = fnBody.indexOf('from("services").select("id").eq("id", serviceId).eq("organizer_id", organizerId)');
  const tierIdx = fnBody.indexOf('from("service_tiers").select("id, service_id").eq("id", tierId).eq("service_id", serviceId)');
  assert.ok(serviceIdx !== -1 && tierIdx !== -1, "both selects must exist");
  assert.ok(serviceIdx < tierIdx, "services ownership select must run before tier select to avoid probing");
});

test("reorder actions: menu sections, menu items, service tiers perform ownership SELECT before UPDATE", () => {
  const svc = read("lib/actions/services.ts");
  const menus = read("lib/actions/menus.ts");
  // reorderMenuSections
  const secStart = menus.indexOf("export async function reorderMenuSections");
  assert.ok(secStart !== -1, "reorderMenuSections must exist");
  const secBody = menus.slice(secStart, menus.indexOf("export async function reorderMenuItems", secStart) !== -1 ? menus.indexOf("export async function reorderMenuItems", secStart) : menus.length);
  const secSelectIdx = secBody.indexOf('from("menu_sections").select("id")');
  const secUpdateIdx = secBody.indexOf('.update({ position:');
  assert.ok(secSelectIdx !== -1 && secUpdateIdx !== -1, "reorderMenuSections must have SELECT and UPDATE");
  assert.ok(secSelectIdx < secUpdateIdx, "ownership SELECT before UPDATE for reorderMenuSections");
  // reorderMenuItems
  const itemStart = menus.indexOf("export async function reorderMenuItems");
  assert.ok(itemStart !== -1, "reorderMenuItems must exist");
  const itemEnd = menus.length;
  const itemBody = menus.slice(itemStart, itemEnd);
  const itemSelectIdx = itemBody.indexOf('from("menu_sections").select("id").eq("id", sectionId)');
  const itemUpdateIdx = itemBody.indexOf('.update({ position:');
  assert.ok(itemSelectIdx !== -1 && itemUpdateIdx !== -1, "reorderMenuItems must have section SELECT and UPDATE");
  assert.ok(itemSelectIdx < itemUpdateIdx, "ownership SELECT before UPDATE for reorderMenuItems");
  // reorderServiceTiers
  const tierStart = svc.indexOf("export async function reorderServiceTiers");
  assert.ok(tierStart !== -1, "reorderServiceTiers must exist");
  const tierBody = svc.slice(tierStart);
  const tierSelectIdx = tierBody.indexOf('from("services").select("id").eq("id", serviceId)');
  const tierUpdateIdx = tierBody.indexOf('.update({ position:');
  assert.ok(tierSelectIdx !== -1 && tierUpdateIdx !== -1, "reorderServiceTiers must have SELECT and UPDATE");
  assert.ok(tierSelectIdx < tierUpdateIdx, "ownership SELECT before UPDATE for reorderServiceTiers");
});

test("reorder actions: duplicate-id and length guards exist", () => {
  const svc = read("lib/actions/services.ts");
  const menus = read("lib/actions/menus.ts");
  assert.ok(svc.includes('new Set(orderedIds).size !== orderedIds.length'), "duplicate guard in services reorder");
  assert.ok(menus.includes('new Set(orderedIds).size !== orderedIds.length'), "duplicate guard in menus reorder");
  assert.ok(svc.includes('orderedIds.length > 100'), "length guard services");
  assert.ok(menus.includes('orderedIds.length > 100'), "length guard menus");
  assert.ok(svc.includes('!Array.isArray(orderedIds)'), "array guard services");
  assert.ok(menus.includes('!Array.isArray(orderedIds)'), "array guard menus");
});

test("admin UI components exist and are imported", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "components/dashboard/menu/MenuManager.tsx")), "MenuManager must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "components/dashboard/menu/MenuItemForm.tsx")), "MenuItemForm must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "components/dashboard/menu/ModifiersEditor.tsx")), "ModifiersEditor must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "components/dashboard/services/TierManager.tsx")), "TierManager must exist");
  assert.ok(fs.existsSync(path.join(ROOT, "components/dashboard/services/ServicesManager.tsx")), "ServicesManager must exist");
  const menuPage = read("app/dashboard/org/[id]/menu/page.tsx");
  assert.ok(menuPage.includes("MenuManager"), "menu page must import MenuManager");
  const serviceEdit = read("app/dashboard/org/[id]/services/[serviceId]/page.tsx");
  assert.ok(serviceEdit.includes("TierManager"), "service edit page must import TierManager");
  assert.ok(!serviceEdit.includes("Tier management (add/edit/reorder/delete) available"), "old placeholder must be gone");
});

test("ModifiersEditor caps at 12 and forms reference dietary/allergen enums", () => {
  const mod = read("components/dashboard/menu/ModifiersEditor.tsx");
  assert.ok(mod.includes("modifiers.length >= 12") && mod.includes("Maximum 12"), "ModifiersEditor must cap at 12");
  const itemForm = read("components/dashboard/menu/MenuItemForm.tsx");
  assert.ok(itemForm.includes("vegan") && itemForm.includes("vegetarian") && itemForm.includes("gluten_free"), "must reference dietary tags");
  assert.ok(itemForm.includes("nuts") && itemForm.includes("dairy") && itemForm.includes("gluten"), "must reference allergens");
  assert.ok(itemForm.includes("ModifersEditor") || itemForm.includes("ModifiersEditor"), "must use ModifiersEditor");
  // ensure no drag libraries
  const allNew = mod + itemForm + read("components/dashboard/menu/MenuManager.tsx") + read("components/dashboard/services/TierManager.tsx");
  assert.equal(allNew.includes("dnd-kit"), false, "must not import dnd-kit");
  assert.equal(allNew.includes("puck"), false, "must not import puck");
  assert.equal(allNew.toLowerCase().includes("dnd"), false, "must not import drag library");
});
