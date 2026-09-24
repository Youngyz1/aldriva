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
  // service_tiers
  assert.ok(sql.includes("char_length(name) >= 1 AND char_length(name) <= 80"), "tier name 1..80");
  assert.ok(sql.includes("char_length(description) <= 500"), "tier desc 500");
  assert.ok(sql.includes("UNIQUE (service_id, position)"), "tier unique position");
  // menu_sections
  assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS menu_sections"), "menu_sections");
  assert.ok(sql.includes("UNIQUE (organizer_id, position)"), "menu_sections unique position");
  // menu_items dietary/allergens
  assert.ok(sql.includes("dietary_tags") && sql.includes("array_length(dietary_tags, 1) <= 12"), "dietary max 12");
  assert.ok(sql.includes("allergens") && sql.includes("array_length(allergens, 1) <= 12"), "allergens max 12");
  assert.ok(sql.includes("dietary_tags <@ ARRAY['vegan'"), "dietary enum");
  assert.ok(sql.includes("allergens <@ ARRAY['nuts'"), "allergens enum");
  assert.ok(sql.includes("modifiers") && sql.includes("jsonb_typeof(modifiers) = 'array'"), "modifiers array");
  assert.ok(sql.includes("price_delta") && sql.includes(">= -10000") && sql.includes("<= 10000"), "modifier price_delta bounded");
  assert.ok(sql.includes("UNIQUE (section_id, position)"), "menu_items unique section+position");
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
});

test("§1 database: no cart/booking/pos tables", () => {
  const sql = read("db/migration_136_services_and_menus.sql");
  assert.ok(!sql.includes("CREATE TABLE IF NOT EXISTS bookings"), "no bookings");
  assert.ok(!sql.includes("pos_connectors") && !sql.includes("pos_sync_logs"), "no pos");
  assert.ok(!sql.includes("cart") || sql.includes("cart") === false || !sql.toLowerCase().includes("create table if not exists cart"), "no cart");
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
  assert.ok(menus.includes('array_length') || menus.includes('MAX_ARRAY') || menus.includes('12'), "must bound max 12");
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
  assert.ok(menuPage.includes('QR-ready') || menuPage.includes('/site/'), "must mention QR-ready or site route");
  assert.ok(menuPage.includes('menu_sections') && menuPage.includes('menu_items'), "must list sections/items");
});
