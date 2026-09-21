/**
 * Regression & Unit tests for Aldriva Phase 1: Business Website Foundation
 *
 * Verifies:
 * - db/migration_125_tenant_websites.sql & rollback schema, RLS, triggers, JSONB defaults
 * - Pure navigation sanitization algorithms (delete & slug-change)
 * - Server actions structure and exports in lib/actions/website.ts
 * - Dashboard route & settings client components
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
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

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ── Migration 125 Schema & Rollback Tests ──────────────────────────────────

test("migration 125 forward and rollback files exist and are well-formed", () => {
  const fwdPath = path.join(ROOT, "db", "migration_125_tenant_websites.sql");
  const rbPath = path.join(ROOT, "db", "migration_125_tenant_websites_rollback.sql");

  assert.ok(fs.existsSync(fwdPath), "db/migration_125_tenant_websites.sql must exist");
  assert.ok(fs.existsSync(rbPath), "db/migration_125_tenant_websites_rollback.sql must exist");

  const fwdSql = read("db/migration_125_tenant_websites.sql");
  const rbSql = read("db/migration_125_tenant_websites_rollback.sql");

  // Table definitions
  assert.ok(fwdSql.includes("CREATE TABLE IF NOT EXISTS tenant_websites"), "tenant_websites table");
  assert.ok(fwdSql.includes("tenant_id UUID NOT NULL UNIQUE REFERENCES organizers(id)"), "tenant_id 1:1 with organizers");
  assert.ok(fwdSql.includes("CREATE TABLE IF NOT EXISTS website_pages"), "website_pages table");
  assert.ok(fwdSql.includes("CREATE TABLE IF NOT EXISTS website_navigation"), "website_navigation table");

  // JSONB defaults
  assert.ok(fwdSql.includes("#ea580c"), "default primary color in theme_config");
  assert.ok(fwdSql.includes("Get in Touch"), "default cta in header_config");
  assert.ok(fwdSql.includes("'[]'::jsonb"), "default empty arrays for items and blocks");

  // Constraints & indexes
  assert.ok(fwdSql.includes("uq_website_pages_single_home"), "single home page partial unique index");
  assert.ok(fwdSql.includes("idx_website_pages_sort"), "sort index for pages");

  // RLS & Security
  assert.ok(fwdSql.includes("ALTER TABLE tenant_websites ENABLE ROW LEVEL SECURITY"), "tenant_websites RLS");
  assert.ok(fwdSql.includes("ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY"), "website_pages RLS");
  assert.ok(fwdSql.includes("ALTER TABLE website_navigation ENABLE ROW LEVEL SECURITY"), "website_navigation RLS");
  assert.ok(fwdSql.includes("is_entity_member("), "is_entity_member check present in RLS policies");

  // Triggers
  assert.ok(fwdSql.includes("trg_tenant_websites_updated_at"), "tenant_websites updated_at trigger");
  assert.ok(fwdSql.includes("trg_website_pages_updated_at"), "website_pages updated_at trigger");
  assert.ok(fwdSql.includes("trg_website_navigation_updated_at"), "website_navigation updated_at trigger");

  // Rollback completeness: drops functions, triggers, and tables
  assert.ok(rbSql.includes("DROP FUNCTION IF EXISTS update_website_navigation_updated_at()"), "rollback drops update_website_navigation_updated_at");
  assert.ok(rbSql.includes("DROP FUNCTION IF EXISTS update_website_pages_updated_at()"), "rollback drops update_website_pages_updated_at");
  assert.ok(rbSql.includes("DROP FUNCTION IF EXISTS update_tenant_websites_updated_at()"), "rollback drops update_tenant_websites_updated_at");
  assert.ok(rbSql.includes("DROP TABLE IF EXISTS website_navigation"), "rollback drops website_navigation");
  assert.ok(rbSql.includes("DROP TABLE IF EXISTS website_pages"), "rollback drops website_pages");
  assert.ok(rbSql.includes("DROP TABLE IF EXISTS tenant_websites"), "rollback drops tenant_websites");
});

test("migration 126 forward and rollback split DELETE permissions safely", () => {
  const fwdPath = path.join(ROOT, "db", "migration_126_website_delete_rls_fix.sql");
  const rbPath = path.join(ROOT, "db", "migration_126_website_delete_rls_fix_rollback.sql");

  assert.ok(fs.existsSync(fwdPath), "db/migration_126_website_delete_rls_fix.sql must exist");
  assert.ok(fs.existsSync(rbPath), "db/migration_126_website_delete_rls_fix_rollback.sql must exist");

  const fwdSql = read("db/migration_126_website_delete_rls_fix.sql");
  const rbSql = read("db/migration_126_website_delete_rls_fix_rollback.sql");

  // Migration 126 drops FOR ALL policies
  assert.ok(fwdSql.includes('DROP POLICY IF EXISTS "Tenant managers and editors can manage tenant websites"'), "drops legacy tenant_websites policy");
  assert.ok(fwdSql.includes('DROP POLICY IF EXISTS "Tenant managers and editors can manage website pages"'), "drops legacy website_pages policy");
  assert.ok(fwdSql.includes('DROP POLICY IF EXISTS "Tenant managers and editors can manage website navigation"'), "drops legacy website_navigation policy");

  // Migration 126 creates dedicated FOR DELETE policies excluding editor
  assert.ok(fwdSql.includes('CREATE POLICY "Tenant managers can delete tenant websites"'), "dedicated delete policy for tenant_websites");
  assert.ok(fwdSql.includes('CREATE POLICY "Tenant managers can delete website pages"'), "dedicated delete policy for website_pages");
  assert.ok(fwdSql.includes('CREATE POLICY "Tenant managers can delete website navigation"'), "dedicated delete policy for website_navigation");

  // Ensure DELETE policies use ARRAY['owner', 'admin', 'manager'] (no editor)
  const deleteClauses = fwdSql.match(/FOR DELETE[\s\S]*?ARRAY\['owner', 'admin', 'manager'\]/g);
  assert.equal(deleteClauses?.length, 3, "all 3 delete policies restrict to owner/admin/manager only");

  // Rollback recreates unified FOR ALL policies
  assert.ok(rbSql.includes('CREATE POLICY "Tenant managers and editors can manage tenant websites"'), "rollback recreates tenant_websites policy");
  assert.ok(rbSql.includes('CREATE POLICY "Tenant managers and editors can manage website pages"'), "rollback recreates website_pages policy");
  assert.ok(rbSql.includes('CREATE POLICY "Tenant managers and editors can manage website navigation"'), "rollback recreates website_navigation policy");
});

test("deletePage server action restricts authorization to ENTITY_ROLES_MANAGE (excludes editor)", () => {
  const actionsSrc = read("lib/actions/website.ts");
  // Asserts deletePage passes ENTITY_ROLES_MANAGE role array to resolveContextByWebsiteId
  const deletePageMatch = actionsSrc.match(/export async function deletePage[\s\S]*?resolveContextByWebsiteId\([^,]+,\s*[^,]+,\s*(\[[^\]]+\])\)/);
  assert.ok(deletePageMatch, "deletePage must call resolveContextByWebsiteId with an explicit role list");
  const rolesArray = deletePageMatch[1];
  assert.ok(rolesArray.includes('"owner"'), "owner must be authorized for deletePage");
  assert.ok(rolesArray.includes('"admin"'), "admin must be authorized for deletePage");
  assert.ok(rolesArray.includes('"manager"'), "manager must be authorized for deletePage");
  assert.ok(!rolesArray.includes('"editor"'), "editor must NOT be authorized for deletePage");
  assert.ok(!rolesArray.includes('"viewer"'), "viewer must NOT be authorized for deletePage");
  assert.ok(!rolesArray.includes('"finance"'), "finance must NOT be authorized for deletePage");
});

// ── Navigation Tree Sanitization Logic Tests ──────────────────────────────

const { sanitizeNavOnPageDelete, sanitizeNavOnPageSlugChange } = require("@/lib/website-nav");

test("sanitizeNavOnPageDelete removes matching items at root and nested levels", () => {
  const tree = [
    { id: "1", label: "Home", href: "/", page_id: "page-home", order: 0 },
    {
      id: "2",
      label: "About",
      href: "/about",
      page_id: "page-about",
      order: 1,
      children: [
        { id: "2a", label: "Team", href: "/team", page_id: "page-team", order: 0 },
        { id: "2b", label: "History", href: "/history", page_id: "page-history", order: 1 },
      ],
    },
    { id: "3", label: "External", href: "https://example.com", page_id: null, order: 2 },
  ];

  // 1. Delete root item
  const afterDeleteRoot = sanitizeNavOnPageDelete(tree, "page-home");
  assert.equal(afterDeleteRoot.length, 2);
  assert.equal(afterDeleteRoot[0].id, "2");
  assert.equal(afterDeleteRoot[1].id, "3");

  // 2. Delete nested child item
  const afterDeleteNested = sanitizeNavOnPageDelete(tree, "page-team");
  assert.equal(afterDeleteNested.length, 3);
  assert.equal(afterDeleteNested[1].children.length, 1);
  assert.equal(afterDeleteNested[1].children[0].id, "2b");

  // 3. Delete parent containing children
  const afterDeleteParent = sanitizeNavOnPageDelete(tree, "page-about");
  assert.equal(afterDeleteParent.length, 2);
  assert.equal(afterDeleteParent[0].id, "1");
  assert.equal(afterDeleteParent[1].id, "3");
});

test("sanitizeNavOnPageSlugChange updates href for matching page_id across tree", () => {
  const tree = [
    { id: "1", label: "Home", href: "/old-home", page_id: "page-1", order: 0 },
    {
      id: "2",
      label: "Services",
      href: "/services",
      page_id: "page-2",
      order: 1,
      children: [
        { id: "2a", label: "Consulting", href: "/consulting", page_id: "page-3", order: 0 },
      ],
    },
  ];

  // Change regular slug
  const updatedServices = sanitizeNavOnPageSlugChange(tree, "page-2", "our-services");
  assert.equal(updatedServices[1].href, "/our-services");

  // Change nested slug
  const updatedNested = sanitizeNavOnPageSlugChange(tree, "page-3", "expert-consulting");
  assert.equal(updatedNested[1].children[0].href, "/expert-consulting");

  // Change home slug to 'home' -> sets href to '/'
  const updatedHome = sanitizeNavOnPageSlugChange(tree, "page-1", "home");
  assert.equal(updatedHome[0].href, "/");
});

// ── Server Actions & Dashboard Interface Assertions ────────────────────────

test("lib/actions/website.ts and lib/website-nav.ts export required operations", () => {
  const actions = require("@/lib/actions/website");
  const nav = require("@/lib/website-nav");
  assert.equal(typeof actions.getTenantWebsite, "function");
  assert.equal(typeof actions.createTenantWebsite, "function");
  assert.equal(typeof actions.updateTenantWebsite, "function");
  assert.equal(typeof actions.createPage, "function");
  assert.equal(typeof actions.updatePage, "function");
  assert.equal(typeof actions.deletePage, "function");
  assert.equal(typeof actions.updateNavigation, "function");
  assert.equal(typeof nav.sanitizeNavOnPageDelete, "function");
  assert.equal(typeof nav.sanitizeNavOnPageSlugChange, "function");
});

test("dashboard website route and components exist", () => {
  const pagePath = path.join(ROOT, "app", "dashboard", "org", "[id]", "website", "page.tsx");
  const clientPath = path.join(ROOT, "app", "dashboard", "org", "[id]", "website", "WebsiteSettingsClient.tsx");
  const navItemsPath = path.join(ROOT, "app", "dashboard", "org", "[id]", "org-nav-items.ts");

  assert.ok(fs.existsSync(pagePath), "website page.tsx must exist");
  assert.ok(fs.existsSync(clientPath), "WebsiteSettingsClient.tsx must exist");
  assert.ok(fs.existsSync(navItemsPath), "org-nav-items.ts must exist");

  const navContent = read("app/dashboard/org/[id]/org-nav-items.ts");
  assert.ok(navContent.includes("/website"), "org navigation must include /website route");
});
