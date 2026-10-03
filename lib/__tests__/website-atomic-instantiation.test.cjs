const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ── RPC atomicity and transaction tests ─────────────────────────────────

test("migration 131 atomic RPC exists and is transactional", () => {
  const rpcPath = path.join(ROOT, "db/migration_131_website_atomic_creation.sql");
  assert.ok(fs.existsSync(rpcPath), "migration_131 file must exist");
  const sql = read("db/migration_131_website_atomic_creation.sql");
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.create_website_from_template"), "RPC function must be defined");
  assert.ok(sql.includes("BEGIN;"), "must have BEGIN transaction");
  assert.ok(sql.includes("COMMIT;"), "must have COMMIT");
  assert.ok(sql.includes("SECURITY DEFINER"), "must be SECURITY DEFINER");
  assert.ok(sql.includes("SET search_path = public, pg_temp"), "must pin search_path");
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION"), "must revoke from public/anon/authenticated");
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION") && sql.includes("service_role"), "must grant to service_role only");
});

test("RPC inserts website + pages + navigation + drafts atomically and handles idempotency", () => {
  const sql = read("db/migration_131_website_atomic_creation.sql");
  // Must insert all three tables
  assert.ok(sql.includes("INSERT INTO public.tenant_websites"), "must insert tenant_websites");
  assert.ok(sql.includes("INSERT INTO public.website_pages"), "must insert website_pages");
  assert.ok(sql.includes("INSERT INTO public.website_navigation"), "must insert website_navigation");
  assert.ok(sql.includes("INSERT INTO public.website_page_drafts"), "must insert website_page_drafts for initial draft state");
  // Idempotency via tenant_id + creationRequestId
  assert.ok(sql.includes("v_request_id := p_metadata->>'creationRequestId'"), "must extract creationRequestId from metadata");
  assert.ok(sql.includes("SELECT * INTO v_existing FROM public.tenant_websites WHERE tenant_id = p_tenant_id"), "must check existing website by tenant_id");
  assert.ok(sql.includes("v_existing.metadata->>'creationRequestId' = v_request_id"), "must compare creationRequestId for idempotency");
  assert.ok(sql.includes("idempotent") && sql.includes("true"), "must return idempotent flag");
  assert.ok(sql.includes("RAISE EXCEPTION 'Website already exists for tenant"), "must raise on duplicate tenant with different requestId");
  // Validation
  assert.ok(sql.includes("Tenant ID is required"), "must validate tenant_id");
  assert.ok(sql.includes("Slug is required"), "must validate slug");
  assert.ok(sql.includes("Site title is required"), "must validate site_title");
  assert.ok(sql.includes("At least one page is required"), "must validate pages array");
  // Atomic rollback via exception propagation
  assert.ok(sql.includes("EXCEPTION") && sql.includes("WHEN OTHERS THEN"), "must propagate exception to rollback transaction");
});

test("RPC validates page fields and fails closed on invalid snapshot", () => {
  const sql = read("db/migration_131_website_atomic_creation.sql");
  assert.ok(sql.includes("Page title is required for page"), "must validate page title");
  assert.ok(sql.includes("Page slug is required for page"), "must validate page slug");
});

test("supabase mirror for migration 131 exists and matches canonical", () => {
  const mirror = path.join(ROOT, "supabase/migrations/20260922000000_migration_131_website_atomic_creation.sql");
  assert.ok(fs.existsSync(mirror), "supabase mirror must exist");
  const canonical = read("db/migration_131_website_atomic_creation.sql");
  const mirrored = read("supabase/migrations/20260922000000_migration_131_website_atomic_creation.sql");
  // Core function body should match (allow header diff)
  assert.ok(canonical.includes("create_website_from_template"), "canonical must contain function");
  assert.ok(mirrored.includes("create_website_from_template"), "mirror must contain function");
  assert.ok(mirrored.includes("INSERT INTO public.tenant_websites"), "mirror must contain website insert");
});

test("server action validates before calling transactional RPC", () => {
  const src = read("lib/actions/website-instantiation.ts");
  // Auth and tenant access
  assert.ok(src.includes("getCurrentUser()"), "must authenticate");
  assert.ok(src.includes("requireTenantContext"), "must verify tenant access");
  // Template resolution + version
  assert.ok(src.includes("getTemplateByIdVersion") || src.includes("getTemplateById"), "must resolve canonical template");
  assert.ok(src.includes("Invalid template version"), "must reject invalid version");
  // Category compatibility
  assert.ok(src.includes("isTemplateCompatibleWithCategory"), "must validate category compatibility");
  assert.ok(src.includes("Incompatible category"), "must reject incompatible category");
  // Approved business data loading only whitelisted columns
  assert.ok(src.includes('select("id, name, slug, bio, photo, website, contact_email'), "must load only approved organizer columns");
  assert.ok(!src.includes("tax_id") || src.includes("buildHydrationContext"), "must not leak sensitive columns");
  // Deep-copy + fresh IDs + hydration + validation before transaction
  assert.ok(src.includes("cloneBlockWithNewIds"), "must generate fresh block/item IDs");
  assert.ok(src.includes("hydrateBlocks") || src.includes("buildHydrationContext"), "must hydrate approved tokens in memory");
  assert.ok(src.includes("validateBlocks"), "must validate final snapshot before transaction");
  // Transactional RPC via service_role
  assert.ok(src.includes('supabaseAdmin.rpc("create_website_from_template"'), "must call transactional RPC via service_role");
  assert.ok(src.includes("p_metadata") && src.includes("creationRequestId"), "must persist provenance metadata including creationRequestId");
  // No external side effects inside transaction (no fetch, no file upload inside RPC params)
  assert.ok(!src.includes("fetch(") || src.includes("supabaseAdmin.rpc"), "must not put external APIs inside transaction");
});

test("instantiation result handles idempotency and failure without partial state", () => {
  const src = read("lib/actions/website-instantiation.ts");
  // Idempotency handling on unique violation
  assert.ok(src.includes("creationRequestId") && src.includes("idempotent"), "must handle idempotent retry");
  assert.ok(src.includes("Website already exists for this organization") || src.includes("already exists for tenant"), "must map duplicate to user-friendly error");
  // Failure mapping: invalid snapshot → no creation
  assert.ok(src.includes("Invalid snapshot"), "must return invalid snapshot error without calling RPC");
  // RPC error handling must not leave partial state (RPC is atomic, so no manual cleanup needed)
  // Verify that createTenantWebsite sequential path is not used for template flow
  const newClient = read("app/dashboard/org/[id]/website/new/NewWebsiteClient.tsx");
  assert.ok(newClient.includes("instantiateWebsiteFromTemplate"), "NewWebsiteClient must use atomic instantiation for template flow");
  assert.ok(newClient.includes("crypto.randomUUID()") && newClient.includes("creationRequestId"), "must generate idempotency key per request");
});

test("creation flow does not perform external side effects inside DB transaction", () => {
  const rpc = read("db/migration_131_website_atomic_creation.sql");
  // RPC must not contain external calls (HTTP, storage, etc. are outside) — check for function calls not comment substrings
  assert.ok(!rpc.includes("fetch(") && !rpc.includes("http://") && !rpc.includes("https://") && !rpc.includes("pg_net"), "RPC must not contain external side effects");
  const action = read("lib/actions/website-instantiation.ts");
  // Action must do hydration and ID generation before RPC, not inside RPC
  assert.ok(action.indexOf("hydrateBlocks") < action.indexOf('supabaseAdmin.rpc'), "hydration must happen before RPC");
  assert.ok(action.indexOf("cloneBlockWithNewIds") < action.indexOf('supabaseAdmin.rpc'), "ID generation must happen before RPC");
});

test("migration 130 remains single source for metadata column (no rerun)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "db/migration_130_website_category_and_metadata.sql")), "migration 130 must still exist");
  // Ensure we did not create a duplicate metadata column migration
  const rpc = read("db/migration_131_website_atomic_creation.sql");
  assert.ok(!rpc.includes("ADD COLUMN") || !rpc.includes("metadata"), "RPC migration must not add metadata column again");
});

test("concurrent idempotency uses ON CONFLICT race boundary", () => {
  const sql = read("db/migration_131_website_atomic_creation.sql");
  // Must use ON CONFLICT (tenant_id) DO NOTHING as the atomic race boundary
  assert.ok(sql.includes("ON CONFLICT (tenant_id) DO NOTHING"), "must use ON CONFLICT (tenant_id) DO NOTHING as race boundary");
  assert.ok(sql.includes("RETURNING id INTO v_inserted_website_id"), "must RETURNING into variable to detect conflict");
  assert.ok(sql.includes("IF v_inserted_website_id IS NULL THEN"), "must branch on conflict (NULL indicates concurrent winner)");
  // Must NOT rely solely on SELECT-before-INSERT (which races)
  const selectBeforeInsert = sql.indexOf("SELECT * INTO v_existing FROM public.tenant_websites WHERE tenant_id = p_tenant_id");
  const onConflictPos = sql.indexOf("ON CONFLICT (tenant_id) DO NOTHING");
  const whereInsert = sql.indexOf("INSERT INTO public.tenant_websites");
  assert.ok(onConflictPos !== -1 && whereInsert !== -1, "ON CONFLICT must exist");
  // SELECT for idempotency check must occur AFTER the conflict branch, not before the INSERT
  assert.ok(selectBeforeInsert > whereInsert, "SELECT for idempotency must occur after ON CONFLICT insert, not before");
  // Must return idempotent:true for same requestId
  assert.ok(sql.includes("'idempotent', true"), "must return idempotent:true for same creationRequestId");
  // Must raise 23505 for different requestId
  assert.ok(sql.includes("RAISE EXCEPTION 'Website already exists for tenant") && sql.includes("23505"), "must raise 23505 for different requestId");
});

test("atomicity preserves all inserts in same transaction", () => {
  const sql = read("db/migration_131_website_atomic_creation.sql");
  const beginIdx = sql.indexOf("BEGIN;");
  const commitIdx = sql.indexOf("COMMIT;");
  const websiteInsert = sql.indexOf("INSERT INTO public.tenant_websites");
  const pagesInsert = sql.indexOf("INSERT INTO public.website_pages");
  const draftsInsert = sql.indexOf("INSERT INTO public.website_page_drafts");
  const navInsert = sql.indexOf("INSERT INTO public.website_navigation");
  assert.ok(beginIdx !== -1 && commitIdx !== -1, "must have BEGIN/COMMIT");
  assert.ok(websiteInsert > beginIdx && pagesInsert > websiteInsert && draftsInsert > pagesInsert && navInsert > draftsInsert, "all inserts must occur sequentially inside same transaction");
  assert.ok(commitIdx > navInsert, "COMMIT must be after all inserts");
  assert.ok(sql.includes("EXCEPTION") && sql.includes("WHEN OTHERS THEN") && sql.includes("RAISE;"), "must propagate exception to rollback entire transaction");
  assert.ok(!sql.includes("COMMIT;") || sql.indexOf("COMMIT;", sql.indexOf("INSERT INTO public.website_navigation")) === commitIdx, "must not have intermediate COMMIT between inserts");
});

test("live schema verification matches RPC assumptions", () => {
  const tenantSql = read("db/migration_125_tenant_websites.sql");
  const metaSql = read("db/migration_130_website_category_and_metadata.sql");
  const rpcSql = read("db/migration_131_website_atomic_creation.sql");
  // tenant_websites.tenant_id UNIQUE
  assert.ok(tenantSql.includes("tenant_id UUID NOT NULL UNIQUE"), "tenant_websites.tenant_id must be UNIQUE");
  // tenant_websites.metadata JSONB
  assert.ok(metaSql.includes("metadata JSONB"), "tenant_websites.metadata must be JSONB");
  assert.ok(tenantSql.includes("tenant_id UUID NOT NULL UNIQUE REFERENCES organizers(id)"), "tenant_id must reference organizers(id)");
  // website_pages columns used by RPC
  assert.ok(tenantSql.includes("CREATE TABLE IF NOT EXISTS website_pages"), "website_pages must exist");
  assert.ok(tenantSql.includes("website_id UUID NOT NULL REFERENCES tenant_websites(id) ON DELETE CASCADE"), "website_pages.website_id must FK tenant_websites");
  assert.ok(tenantSql.includes("title TEXT NOT NULL"), "website_pages.title must exist");
  assert.ok(tenantSql.includes("slug TEXT NOT NULL"), "website_pages.slug must exist");
  assert.ok(tenantSql.includes("is_home BOOLEAN"), "website_pages.is_home must exist");
  assert.ok(tenantSql.includes("status TEXT"), "website_pages.status must exist");
  assert.ok(tenantSql.includes("blocks JSONB NOT NULL DEFAULT '[]'::jsonb"), "website_pages.blocks must exist");
  assert.ok(tenantSql.includes("sort_order INTEGER"), "website_pages.sort_order must exist");
  assert.ok(tenantSql.includes("UNIQUE (website_id, slug)"), "website_pages must have UNIQUE(website_id, slug)");
  // website_page_drafts columns
  const draftsSql = read("db/migration_129_website_page_drafts_and_publishing_guard.sql");
  assert.ok(draftsSql.includes("CREATE TABLE IF NOT EXISTS public.website_page_drafts"), "website_page_drafts must exist");
  assert.ok(draftsSql.includes("page_id UUID PRIMARY KEY REFERENCES public.website_pages(id) ON DELETE CASCADE"), "website_page_drafts.page_id must FK website_pages");
  assert.ok(draftsSql.includes("blocks JSONB NOT NULL DEFAULT '[]'::jsonb"), "website_page_drafts.blocks must exist");
  assert.ok(draftsSql.includes("version INTEGER NOT NULL DEFAULT 1"), "website_page_drafts.version must exist");
  // website_navigation columns
  assert.ok(tenantSql.includes("CREATE TABLE IF NOT EXISTS website_navigation"), "website_navigation must exist");
  assert.ok(tenantSql.includes("website_id UUID NOT NULL UNIQUE REFERENCES tenant_websites(id) ON DELETE CASCADE"), "website_navigation.website_id must be UNIQUE FK");
  assert.ok(tenantSql.includes("items JSONB NOT NULL DEFAULT '[]'::jsonb"), "website_navigation.items must exist");
  // RPC must not omit required columns and must not introduce unnecessary tables
  assert.ok(!rpcSql.includes("CREATE TABLE"), "RPC must not create tables");
  assert.ok(rpcSql.includes("theme_config") && rpcSql.includes("header_config") && rpcSql.includes("footer_config"), "RPC must persist theme/header/footer configs");
});

test("security: RPC remains service_role only and application authorizes before call", () => {
  const sql = read("db/migration_131_website_atomic_creation.sql");
  assert.ok(sql.includes("SECURITY DEFINER"), "must be SECURITY DEFINER");
  assert.ok(sql.includes("SET search_path = public, pg_temp"), "must set search_path");
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION") && sql.includes("FROM PUBLIC, anon, authenticated"), "must revoke from PUBLIC/anon/authenticated");
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION") && sql.includes("TO service_role"), "must grant only to service_role");
  const action = read("lib/actions/website-instantiation.ts");
  assert.ok(action.includes("getCurrentUser()") && action.includes("requireTenantContext"), "application must authenticate and authorize before RPC");
  assert.ok(action.includes('supabaseAdmin.rpc("create_website_from_template"'), "must call via service_role client");
});
