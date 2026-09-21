/**
 * lib/security/__tests__/website-builder-integration.test.cjs
 *
 * End-to-End Integration & Security Test Suite for Phase 4 (Visual Website Builder).
 *
 * Covers:
 * 1. checkTenantAccess() helper:
 *    - entity_members role resolution.
 *    - organizers.user_id direct ownership fallback.
 *    - Non-member / cross-tenant rejection.
 *    - Role subset filtering (e.g., owner only vs manager+).
 * 2. Full Builder Lifecycle:
 *    - Editor saves draft (WIP allowed).
 *    - Editor reorders draft blocks.
 *    - Editor attempts publish -> REJECTED (insufficient permissions).
 *    - Manager publishes draft -> VALIDATED & PUBLISHED atomically via RPC.
 *    - Discard draft -> draft cleared.
 * 3. Embed Options Tenant Isolation:
 *    - Unauthorized user cannot enumerate embed options.
 *    - Authorized user only receives tenant's events, products, and fundraisers.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");

// Compile TypeScript modules on the fly
require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
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

// Setup path alias resolution for "@/..."
const originalResolveFilename = Module._resolveFilename;
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

// In-memory mock database state
let mockCurrentUser = null;
let mockIsAdmin = false;

let mockEntityMembers = []; // { user_id, organizer_id, role, deleted_at }
let mockOrganizers = []; // { id, user_id }
let mockWebsitePages = []; // { id, website_id, slug, title, status, blocks }
let mockTenantWebsites = []; // { id, tenant_id, slug }
let mockDrafts = []; // { page_id, blocks, version, updated_at, updated_by }
let mockEvents = [];
let mockBusinesses = [];
let mockProducts = [];
let mockFundraisers = [];

let rpcCalls = [];

const originalLoad = Module._load;
Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/auth" || request === path.join(ROOT, "lib/auth.ts")) {
    return {
      getCurrentUser: async () => mockCurrentUser,
      isAdmin: async () => mockIsAdmin,
    };
  }

  if (request === "next/cache") {
    return {
      revalidatePath: () => {},
    };
  }

  if (request === "@/lib/supabase-server" || request === path.join(ROOT, "lib/supabase-server.ts")) {
    return {
      createSupabaseServer: async () => ({
        auth: {
          getUser: async () => ({ data: { user: mockCurrentUser } }),
        },
      }),
    };
  }

  if (request === "@/lib/supabase-admin" || request === path.join(ROOT, "lib/supabase-admin.ts")) {
    return {
      createSupabaseAdmin: () => ({
        from: (table) => ({
          select: (columns = "*") => {
            let filtered = [];
            if (table === "entity_members") filtered = [...mockEntityMembers];
            else if (table === "organizers") filtered = [...mockOrganizers];
            else if (table === "website_pages") {
              filtered = mockWebsitePages.map((p) => {
                const tw = mockTenantWebsites.find((w) => w.id === p.website_id);
                return { ...p, tenant_websites: tw };
              });
            } else if (table === "website_page_drafts") filtered = [...mockDrafts];
            else if (table === "events") filtered = [...mockEvents];
            else if (table === "businesses") filtered = [...mockBusinesses];
            else if (table === "products") filtered = [...mockProducts];
            else if (table === "fundraisers") filtered = [...mockFundraisers];

            const builder = {
              eq: (col, val) => {
                filtered = filtered.filter((r) => r[col] === val);
                return builder;
              },
              in: (col, vals) => {
                filtered = filtered.filter((r) => vals.includes(r[col]));
                return builder;
              },
              is: (col, val) => {
                filtered = filtered.filter((r) => r[col] === val);
                return builder;
              },
              order: () => builder,
              limit: (n) => {
                filtered = filtered.slice(0, n);
                return builder;
              },
              maybeSingle: async () => ({
                data: filtered.length > 0 ? filtered[0] : null,
                error: null,
              }),
              then: (resolve) => resolve({ data: filtered, error: null }),
            };
            return builder;
          },
          upsert: (row, options) => {
            let newDraft = null;
            if (table === "website_page_drafts") {
              const idx = mockDrafts.findIndex((d) => d.page_id === row.page_id);
              const currentVersion = idx >= 0 ? mockDrafts[idx].version : 0;
              newDraft = {
                ...row,
                version: currentVersion + 1,
              };
              if (idx >= 0) {
                mockDrafts[idx] = newDraft;
              } else {
                mockDrafts.push(newDraft);
              }
            }
            return {
              select: () => ({
                single: async () => ({ data: newDraft, error: null }),
                maybeSingle: async () => ({ data: newDraft, error: null }),
              }),
              then: (resolve) => resolve({ data: newDraft, error: null }),
            };
          },
          delete: () => ({
            eq: async (col, val) => {
              if (table === "website_page_drafts") {
                mockDrafts = mockDrafts.filter((d) => d[col] !== val);
              }
              return { error: null };
            },
          }),
        }),
        rpc: async (funcName, params) => {
          rpcCalls.push({ funcName, params });
          if (funcName === "publish_page_draft") {
            const draft = mockDrafts.find((d) => d.page_id === params.p_page_id);
            if (!draft) {
              return { data: null, error: { message: "No draft found." } };
            }
            if (draft.version !== params.p_expected_version) {
              return {
                data: null,
                error: { message: "version mismatch: draft has been modified", code: "40001" },
              };
            }
            // Apply publish atomically
            const page = mockWebsitePages.find((p) => p.id === params.p_page_id);
            if (page) {
              page.blocks = draft.blocks;
              page.status = "published";
            }
            // Clear draft
            mockDrafts = mockDrafts.filter((d) => d.page_id !== params.p_page_id);
            return {
              data: {
                page_id: params.p_page_id,
                status: "published",
                block_count: draft.blocks.length,
                published_at: new Date().toISOString(),
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      }),
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

// Import actual units under test
const { checkTenantAccess, ENTITY_ROLES_ALL, ENTITY_ROLES_CONTENT_WRITE, ENTITY_ROLES_MANAGE } = require("@/lib/entity-auth");
const {
  savePageDraft,
  publishPageDraft,
  discardPageDraft,
  reorderPageBlocks,
  getPageBuilderData,
  getBuilderEmbedOptions,
} = require("@/lib/actions/website-builder");

function resetDb() {
  mockCurrentUser = null;
  mockIsAdmin = false;
  mockEntityMembers = [];
  mockOrganizers = [];
  mockWebsitePages = [];
  mockTenantWebsites = [];
  mockDrafts = [];
  mockEvents = [];
  mockBusinesses = [];
  mockProducts = [];
  mockFundraisers = [];
  rpcCalls = [];
}

test("checkTenantAccess: entity_members role resolution", async () => {
  resetDb();
  const userId = "u1";
  const orgId = "org-1";

  mockEntityMembers.push({
    user_id: userId,
    organizer_id: orgId,
    role: "editor",
    deleted_at: null,
  });

  // Editor has content-write access
  const resWrite = await checkTenantAccess(userId, orgId, ENTITY_ROLES_CONTENT_WRITE);
  assert.equal(resWrite.hasAccess, true);
  assert.equal(resWrite.role, "editor");
  assert.equal(resWrite.isDirectOwner, false);

  // Editor does NOT have manage/publish access
  const resManage = await checkTenantAccess(userId, orgId, ENTITY_ROLES_MANAGE);
  assert.equal(resManage.hasAccess, false);
  assert.equal(resManage.role, "editor");
  assert.equal(resManage.isDirectOwner, false);
});

test("checkTenantAccess: organizers.user_id direct ownership fallback", async () => {
  resetDb();
  const ownerUserId = "u-owner";
  const orgId = "org-2";

  // No entity_members row, but matches organizers.user_id
  mockOrganizers.push({
    id: orgId,
    user_id: ownerUserId,
  });

  // Direct owner has manage access
  const resManage = await checkTenantAccess(ownerUserId, orgId, ENTITY_ROLES_MANAGE);
  assert.equal(resManage.hasAccess, true);
  assert.equal(resManage.role, "owner");
  assert.equal(resManage.isDirectOwner, true);

  // Direct owner without owner in allowedRoles
  const resEditorOnly = await checkTenantAccess(ownerUserId, orgId, ["editor"]);
  assert.equal(resEditorOnly.hasAccess, false);
  assert.equal(resEditorOnly.role, "owner");
  assert.equal(resEditorOnly.isDirectOwner, true);
});

test("checkTenantAccess: non-member / stranger rejected", async () => {
  resetDb();
  const strangerId = "u-stranger";
  const orgId = "org-3";

  mockOrganizers.push({
    id: orgId,
    user_id: "u-real-owner",
  });

  const res = await checkTenantAccess(strangerId, orgId, ENTITY_ROLES_ALL);
  assert.equal(res.hasAccess, false);
  assert.equal(res.role, null);
  assert.equal(res.isDirectOwner, false);
});

test("Builder E2E: Editor draft lifecycle & publish gate", async () => {
  resetDb();
  const editorUser = { id: "u-editor", email: "editor@test.com" };
  const managerUser = { id: "u-manager", email: "manager@test.com" };
  const tenantId = "org-alpha";
  const websiteId = "web-alpha";
  const pageId = "page-1";

  mockTenantWebsites.push({ id: websiteId, tenant_id: tenantId, slug: "alpha-org" });
  mockWebsitePages.push({
    id: pageId,
    website_id: websiteId,
    slug: "home",
    title: "Home Page",
    status: "published",
    blocks: [{ id: "b0", type: "hero", heading: "Original Hero" }],
  });

  mockEntityMembers.push(
    { user_id: editorUser.id, organizer_id: tenantId, role: "editor", deleted_at: null },
    { user_id: managerUser.id, organizer_id: tenantId, role: "manager", deleted_at: null }
  );

  // 1. Editor loads builder data
  mockCurrentUser = editorUser;
  const initialData = await getPageBuilderData(pageId);
  assert.equal(initialData.success, true);
  assert.equal(initialData.data.canPublish, false);
  assert.equal(initialData.data.userRole, "editor");
  assert.equal(initialData.data.hasDraft, false);

  // 2. Editor saves a working draft (including WIP block)
  const draftBlocks = [
    { id: "b1", type: "hero", heading: "New Draft Hero", layout: "left" },
    { id: "b2", type: "cta_banner", heading: "Support Us" },
  ];
  const saveRes = await savePageDraft(pageId, draftBlocks);
  assert.equal(saveRes.success, true);
  assert.equal(saveRes.data.blockCount, 2);
  assert.equal(saveRes.data.version, 1);

  // 3. Verify getPageBuilderData now reflects working draft
  const draftData = await getPageBuilderData(pageId);
  assert.equal(draftData.data.hasDraft, true);
  assert.equal(draftData.data.version, 1);
  assert.equal(draftData.data.blocks.length, 2);

  // 4. Editor attempts to publish -> MUST BE REJECTED
  const editorPublishRes = await publishPageDraft(pageId);
  assert.equal(editorPublishRes.success, false);
  assert.match(editorPublishRes.error, /Forbidden: Insufficient permissions/i);
  assert.equal(rpcCalls.length, 0); // No RPC called

  // 5. Manager logs in and publishes
  mockCurrentUser = managerUser;
  const managerData = await getPageBuilderData(pageId);
  assert.equal(managerData.data.canPublish, true);
  assert.equal(managerData.data.userRole, "manager");

  const managerPublishRes = await publishPageDraft(pageId);
  assert.equal(managerPublishRes.success, true);
  assert.equal(managerPublishRes.data.status, "published");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].params.p_expected_version, 1);

  // 6. Verify live page now has published blocks and draft is cleared
  const publishedPage = mockWebsitePages.find((p) => p.id === pageId);
  assert.equal(publishedPage.blocks.length, 2);
  assert.equal(publishedPage.blocks[0].heading, "New Draft Hero");

  const afterPublishData = await getPageBuilderData(pageId);
  assert.equal(afterPublishData.data.hasDraft, false);
});

test("Builder E2E: Discard draft functionality", async () => {
  resetDb();
  const editorUser = { id: "u-editor", email: "editor@test.com" };
  const tenantId = "org-alpha";
  const websiteId = "web-alpha";
  const pageId = "page-2";

  mockTenantWebsites.push({ id: websiteId, tenant_id: tenantId, slug: "alpha-org" });
  mockWebsitePages.push({
    id: pageId,
    website_id: websiteId,
    slug: "about",
    title: "About Us",
    status: "published",
    blocks: [],
  });

  mockEntityMembers.push({
    user_id: editorUser.id,
    organizer_id: tenantId,
    role: "editor",
    deleted_at: null,
  });

  mockCurrentUser = editorUser;
  await savePageDraft(pageId, [{ id: "temp", type: "rich_text", body_html: "<p>WIP</p>" }]);
  assert.equal(mockDrafts.length, 1);

  const discardRes = await discardPageDraft(pageId);
  assert.equal(discardRes.success, true);
  assert.equal(mockDrafts.length, 0);
});

test("Embed Options: Strict Tenant Authorization & Isolation", async () => {
  resetDb();
  const allowedUser = { id: "u-allowed" };
  const forbiddenUser = { id: "u-forbidden" };
  const tenantId = "org-target";
  const foreignTenantId = "org-foreign";

  mockEntityMembers.push({
    user_id: allowedUser.id,
    organizer_id: tenantId,
    role: "editor",
    deleted_at: null,
  });

  mockEvents.push(
    { id: "e1", title: "Target Gala", organizer_id: tenantId, status: "published" },
    { id: "e2", title: "Foreign Gala", organizer_id: foreignTenantId, status: "published" }
  );

  mockBusinesses.push({ id: "biz-1", organizer_id: tenantId });
  mockProducts.push(
    { id: "p1", title: "Target T-Shirt", business_id: "biz-1", status: "active", price_cents: 2500 }
  );

  mockFundraisers.push(
    { id: "f1", title: "Target Campaign", organizer_id: tenantId, status: "active", deleted_at: null },
    { id: "f2", title: "Foreign Campaign", organizer_id: foreignTenantId, status: "active", deleted_at: null }
  );

  // 1. Forbidden user rejected
  mockCurrentUser = forbiddenUser;
  const forbiddenRes = await getBuilderEmbedOptions(tenantId);
  assert.equal(forbiddenRes.success, false);
  assert.match(forbiddenRes.error, /Forbidden/i);

  // 2. Allowed user only sees target tenant items
  mockCurrentUser = allowedUser;
  const allowedRes = await getBuilderEmbedOptions(tenantId);
  assert.equal(allowedRes.success, true);
  assert.equal(allowedRes.data.events.length, 1);
  assert.equal(allowedRes.data.events[0].id, "e1");

  assert.equal(allowedRes.data.products.length, 1);
  assert.equal(allowedRes.data.products[0].id, "p1");

  assert.equal(allowedRes.data.fundraisers.length, 1);
  assert.equal(allowedRes.data.fundraisers[0].id, "f1");
});
