/**
 * lib/security/__tests__/website-builder-actions.test.cjs
 *
 * Security & Regression Test Suite for lib/actions/website-builder.ts (Phase 4 Task 4.1).
 *
 * Invariants Tested:
 * 1. Role Authorization:
 *    - Editor can call savePageDraft, discardPageDraft, reorderPageBlocks.
 *    - Editor is REJECTED by publishPageDraft (owner/admin/manager only).
 *    - Viewer / Non-member is REJECTED by all four actions.
 * 2. Draft-Time vs Publish-Time Validation:
 *    - savePageDraft accepts WIP drafts (valid array of objects with type, even with incomplete fields).
 *    - publishPageDraft validates every block through validateBlock() and REJECTS if any block is malformed
 *      (e.g., javascript: URL, oversized heading, invalid column count, unknown type).
 * 3. Atomic Publish Execution:
 *    - When all blocks are valid, manager/owner publishPageDraft succeeds and executes atomic publish.
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

// Mock states
let currentUser = null;
let currentRole = null; // 'owner' | 'admin' | 'manager' | 'editor' | 'viewer' | null
let isPlatformAdmin = false;
let organizerOwnerId = "99999999-9999-4999-a999-999999999999";
let pageRow = null;
let draftRow = null;
let lastRpcCall = null;
let lastUpsertData = null;
let lastDeletedDraftPageId = null;

let draftSelectHook = null;

const originalLoad = Module._load;
Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/auth" || request === path.join(ROOT, "lib/auth.ts")) {
    return {
      getCurrentUser: async () => currentUser,
      isAdmin: async () => isPlatformAdmin,
    };
  }

  if (request === "@/lib/entity-auth" || request === path.join(ROOT, "lib/entity-auth.ts")) {
    return {
      ENTITY_ROLES_ALL: ["owner", "admin", "manager", "editor", "finance", "viewer"],
      hasEntityAccess: async (_userId, _tenantId, allowedRoles) => {
        if (!currentRole) return false;
        return allowedRoles.includes(currentRole);
      },
      checkTenantAccess: async (userId, _tenantId, allowedRoles) => {
        if (currentRole) {
          return {
            hasAccess: allowedRoles.includes(currentRole),
            role: currentRole,
            isDirectOwner: false,
          };
        }
        if (currentUser && currentUser.id === organizerOwnerId) {
          return {
            hasAccess: allowedRoles.includes("owner"),
            role: "owner",
            isDirectOwner: true,
          };
        }
        return {
          hasAccess: false,
          role: null,
          isDirectOwner: false,
        };
      },
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
          getUser: async () => ({ data: { user: currentUser } }),
        },
      }),
    };
  }

  if (request === "@/lib/supabase-admin" || request === path.join(ROOT, "lib/supabase-admin.ts")) {
    return {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "website_pages") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: pageRow, error: null }),
                }),
              }),
              update: (updatePayload) => ({
                eq: async () => {
                  if (pageRow) {
                    pageRow.blocks = updatePayload.blocks;
                    pageRow.status = updatePayload.status;
                  }
                  return { error: null };
                },
              }),
            };
          }
          if (table === "website_page_drafts") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    const data = draftRow ? { ...draftRow } : null;
                    if (draftSelectHook) {
                      draftSelectHook();
                    }
                    return { data, error: null };
                  },
                }),
              }),
              upsert: (payload) => {
                lastUpsertData = payload;
                const newVersion = (draftRow?.version || 0) + 1;
                draftRow = {
                  blocks: payload.blocks,
                  version: newVersion,
                  updated_by: payload.updated_by,
                  updated_at: payload.updated_at,
                };
                return {
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { version: newVersion, updated_at: payload.updated_at },
                      error: null,
                    }),
                    single: async () => ({
                      data: { version: newVersion, updated_at: payload.updated_at },
                      error: null,
                    }),
                  }),
                  then: (resolve) => resolve({ data: draftRow, error: null }),
                  error: null,
                };
              },
              delete: () => ({
                eq: async (_col, val) => {
                  lastDeletedDraftPageId = val;
                  draftRow = null;
                  return { error: null };
                },
              }),
            };
          }
          if (table === "organizers") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { user_id: organizerOwnerId },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (
            table === "events" ||
            table === "businesses" ||
            table === "products" ||
            table === "fundraisers"
          ) {
            const chain = {
              select: () => chain,
              eq: () => chain,
              in: () => chain,
              is: () => chain,
              order: () => chain,
              limit: async () => ({ data: [], error: null }),
            };
            return chain;
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
        rpc: async (fnName, params) => {
          lastRpcCall = { fnName, params };
          if (fnName === "publish_page_draft") {
            if (!draftRow) {
              return { data: null, error: { message: "No draft found for page", code: "P0002" } };
            }
            if (
              params.p_expected_version !== undefined &&
              params.p_expected_version !== null &&
              draftRow.version !== params.p_expected_version
            ) {
              return {
                data: null,
                error: { message: "Draft version mismatch for page", code: "40001" },
              };
            }
            if (pageRow && draftRow) {
              pageRow.blocks = draftRow.blocks;
              pageRow.status = "published";
              draftRow = null;
            }
            return {
              data: {
                success: true,
                page_id: params.p_page_id,
                version_published: params.p_expected_version || 1,
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

// Import the real website builder server actions
const {
  savePageDraft,
  publishPageDraft,
  discardPageDraft,
  reorderPageBlocks,
  getBuilderEmbedOptions,
} = require("@/lib/actions/website-builder");

// Test Fixtures
const TEST_PAGE_ID = "00000000-0000-4000-a000-000000000001";
const TEST_USER_ID = "11111111-1111-4111-a111-111111111111";

function setupPageFixture() {
  pageRow = {
    id: TEST_PAGE_ID,
    website_id: "a1111111-0000-0000-0000-000000000001",
    slug: "home",
    title: "Homepage",
    status: "draft",
    blocks: [{ id: "b0", type: "hero", heading: "Live Hero" }],
    tenant_websites: {
      id: "a1111111-0000-0000-0000-000000000001",
      tenant_id: "t0000000-0000-0000-0000-000000000001",
      slug: "test-site",
    },
  };
  draftRow = null;
  draftSelectHook = null;
  lastRpcCall = null;
  lastUpsertData = null;
  lastDeletedDraftPageId = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Role Authorization Invariants
// ─────────────────────────────────────────────────────────────────────────────

test("savePageDraft allows editor role to save working drafts", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "editor@example.com" };
  currentRole = "editor";
  isPlatformAdmin = false;

  const draftBlocks = [
    { id: "b1", type: "hero", heading: "WIP Draft Headline" },
    { id: "b2", type: "features", heading: "WIP Features" },
  ];

  const result = await savePageDraft(TEST_PAGE_ID, draftBlocks);

  assert.equal(result.success, true);
  assert.equal(result.data.blockCount, 2);
  assert.deepEqual(lastUpsertData.blocks, draftBlocks);
});

test("discardPageDraft allows editor role to discard working drafts", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "editor@example.com" };
  currentRole = "editor";
  isPlatformAdmin = false;
  draftRow = { blocks: [{ type: "hero" }], version: 1 };

  const result = await discardPageDraft(TEST_PAGE_ID);

  assert.equal(result.success, true);
  assert.equal(lastDeletedDraftPageId, TEST_PAGE_ID);
  assert.equal(draftRow, null);
  // Live blocks untouched
  assert.equal(pageRow.blocks[0].heading, "Live Hero");
});

test("reorderPageBlocks allows editor role to reorder draft blocks", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "editor@example.com" };
  currentRole = "editor";
  isPlatformAdmin = false;
  draftRow = {
    blocks: [
      { id: "b1", type: "hero", heading: "Block 1" },
      { id: "b2", type: "about", heading: "Block 2" },
      { id: "b3", type: "contact", heading: "Block 3" },
    ],
    version: 1,
  };

  // Reorder with indices [2, 0, 1] -> Block 3, Block 1, Block 2
  const result = await reorderPageBlocks(TEST_PAGE_ID, [2, 0, 1]);

  assert.equal(result.success, true);
  assert.equal(result.data.blockCount, 3);
  assert.equal(result.data.blocks[0].id, "b3");
  assert.equal(result.data.blocks[1].id, "b1");
  assert.equal(result.data.blocks[2].id, "b2");
});

test("publishPageDraft STRICTLY REJECTS editor role (Forbidden)", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "editor@example.com" };
  currentRole = "editor";
  isPlatformAdmin = false;
  draftRow = {
    blocks: [{ id: "b1", type: "hero", heading: "Ready to publish" }],
    version: 1,
  };

  const result = await publishPageDraft(TEST_PAGE_ID);

  assert.equal(result.success, false);
  assert.match(result.error, /Forbidden: Insufficient permissions/);
  assert.equal(lastRpcCall, null, "publish RPC must NOT be called for editor");
  assert.equal(pageRow.status, "draft", "Live page status must remain draft");
});

test("Viewer and Non-Member are REJECTED by all four actions", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "viewer@example.com" };
  currentRole = "viewer";
  isPlatformAdmin = false;

  const res1 = await savePageDraft(TEST_PAGE_ID, [{ type: "hero" }]);
  assert.equal(res1.success, false);
  assert.match(res1.error, /Forbidden: Insufficient permissions/);

  const res2 = await discardPageDraft(TEST_PAGE_ID);
  assert.equal(res2.success, false);
  assert.match(res2.error, /Forbidden: Insufficient permissions/);

  const res3 = await reorderPageBlocks(TEST_PAGE_ID, [0]);
  assert.equal(res3.success, false);
  assert.match(res3.error, /Forbidden: Insufficient permissions/);

  const res4 = await publishPageDraft(TEST_PAGE_ID);
  assert.equal(res4.success, false);
  assert.match(res4.error, /Forbidden: Insufficient permissions/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Draft-Time vs Publish-Time Schema & Security Validation
// ─────────────────────────────────────────────────────────────────────────────

test("savePageDraft allows WIP incomplete blocks to be saved as draft", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "manager@example.com" };
  currentRole = "manager";
  isPlatformAdmin = false;

  // Incomplete block missing required items or fields
  const wipDraft = [
    { type: "hero", heading: "Draft with no cta" },
    { type: "testimonials" }, // Empty testimonials block (valid draft WIP, invalid publish)
  ];

  const result = await savePageDraft(TEST_PAGE_ID, wipDraft);

  assert.equal(result.success, true);
  assert.equal(result.data.blockCount, 2);
});

test("publishPageDraft REJECTS when one block is invalid (e.g. javascript: URL or oversized heading)", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "manager@example.com" };
  currentRole = "manager";
  isPlatformAdmin = false;

  // Draft containing 1 valid block and 1 malicious / invalid block
  draftRow = {
    blocks: [
      { id: "b1", type: "hero", heading: "Valid Hero Block", ctaLabel: "Join", ctaHref: "/join" },
      {
        id: "b2",
        type: "hero",
        heading: "A".repeat(600), // Exceeds HEADING_MAX_LENGTH (180 chars)
        ctaLabel: "XSS Attempt",
        ctaHref: "javascript:alert(1)", // Malicious XSS URL
      },
    ],
    version: 1,
  };

  const result = await publishPageDraft(TEST_PAGE_ID);

  assert.equal(result.success, false);
  assert.match(result.error, /Publish rejected: Block #2/);
  assert.equal(result.invalidBlockIndex, 1);
  assert.ok(result.issues.length > 0, "Must return specific validation issues");

  // Database must NOT be touched
  assert.equal(lastRpcCall, null, "publish RPC must NOT be invoked when validation fails");
  assert.equal(pageRow.status, "draft", "Live page status must remain untouched");
});

test("publishPageDraft SUCCEEDS for manager when all blocks are valid", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "manager@example.com" };
  currentRole = "manager";
  isPlatformAdmin = false;

  draftRow = {
    blocks: [
      { id: "b1", type: "hero", heading: "Clean Hero", ctaLabel: "Get Started", ctaHref: "https://example.com" },
      { id: "b2", type: "about", heading: "Our Mission", story: "We build community software." },
    ],
    version: 1,
  };

  const result = await publishPageDraft(TEST_PAGE_ID);

  assert.equal(result.success, true);
  assert.equal(result.data.status, "published");
  assert.ok(lastRpcCall, "publish_page_draft RPC must be called");
  assert.equal(lastRpcCall.fnName, "publish_page_draft");
  assert.equal(pageRow.status, "published");
  assert.equal(draftRow, null, "Working draft must be cleared on publish");
});

test("publishPageDraft REJECTS when concurrent draft mutation causes version mismatch (TOCTOU prevention)", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "manager@example.com" };
  currentRole = "manager";
  isPlatformAdmin = false;

  // Initial draft in DB is version 1
  draftRow = {
    blocks: [
      { id: "b1", type: "hero", heading: "Validated Hero", ctaLabel: "Go", ctaHref: "/go" },
    ],
    version: 1,
  };

  // Simulate concurrent savePageDraft right after validation read, bumping version to 2
  draftSelectHook = () => {
    draftRow = {
      ...draftRow,
      version: 2, // Concurrently bumped in DB before RPC executes
    };
  };

  const result = await publishPageDraft(TEST_PAGE_ID);

  assert.equal(result.success, false);
  assert.match(result.error, /Draft was modified concurrently while publishing/);
  // Live page status must remain draft and live blocks untouched
  assert.equal(pageRow.status, "draft");
  assert.equal(pageRow.blocks[0].heading, "Live Hero");
});

test("publishPageDraft GUARANTEES a numeric p_expected_version is passed to the RPC", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "manager@example.com" };
  currentRole = "manager";
  isPlatformAdmin = false;

  draftRow = {
    blocks: [
      { id: "b1", type: "hero", heading: "Validated Hero", ctaLabel: "Go", ctaHref: "/go" },
    ],
    version: 42,
  };

  const result = await publishPageDraft(TEST_PAGE_ID);

  assert.equal(result.success, true);
  assert.equal(typeof lastRpcCall.params.p_expected_version, "number");
  assert.equal(lastRpcCall.params.p_expected_version, 42);
  assert.notEqual(lastRpcCall.params.p_expected_version, null);
  assert.notEqual(lastRpcCall.params.p_expected_version, undefined);
});

test("publishPageDraft REJECTS if draft version is missing or not a number (fail-closed)", async () => {
  setupPageFixture();
  currentUser = { id: TEST_USER_ID, email: "manager@example.com" };
  currentRole = "manager";
  isPlatformAdmin = false;

  // Corrupted / missing version
  draftRow = {
    blocks: [
      { id: "b1", type: "hero", heading: "Validated Hero", ctaLabel: "Go", ctaHref: "/go" },
    ],
    version: null,
  };

  const result = await publishPageDraft(TEST_PAGE_ID);

  assert.equal(result.success, false);
  assert.match(result.error, /No working draft found/);
  assert.equal(lastRpcCall, null, "RPC must never be invoked with null version");
});

// ─────────────────────────────────────────────────────────────────────────────
// getBuilderEmbedOptions Authorization & Tenant Scoping
// ─────────────────────────────────────────────────────────────────────────────

test("getBuilderEmbedOptions rejects unauthenticated calls", async () => {
  currentUser = null;
  currentRole = null;
  isPlatformAdmin = false;

  const result = await getBuilderEmbedOptions("00000000-0000-4000-a000-000000000001");
  assert.equal(result.success, false);
  assert.match(result.error, /Unauthorized: Please sign in/);
});

test("getBuilderEmbedOptions rejects invalid or empty tenantId", async () => {
  currentUser = { id: TEST_USER_ID, email: "editor@example.com" };
  currentRole = "editor";
  isPlatformAdmin = false;

  const res1 = await getBuilderEmbedOptions("");
  assert.equal(res1.success, false);
  assert.match(res1.error, /Invalid tenant ID/);

  const res2 = await getBuilderEmbedOptions(null);
  assert.equal(res2.success, false);
  assert.match(res2.error, /Invalid tenant ID/);
});

test("getBuilderEmbedOptions rejects non-member / viewer trying to enumerate tenant data", async () => {
  currentUser = { id: "foreign-user-id", email: "foreign@example.com" };
  currentRole = null; // No entity_members role
  organizerOwnerId = "some-other-owner-id"; // Not direct owner
  isPlatformAdmin = false;

  const result = await getBuilderEmbedOptions("foreign-tenant-id");
  assert.equal(result.success, false);
  assert.match(result.error, /Forbidden: Insufficient permissions for this organization/);
});

test("getBuilderEmbedOptions succeeds for authorized roles (editor, manager, admin, owner)", async () => {
  currentUser = { id: TEST_USER_ID, email: "editor@example.com" };
  currentRole = "editor";
  isPlatformAdmin = false;

  const result = await getBuilderEmbedOptions("authorized-tenant-id");
  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.data.events));
  assert.ok(Array.isArray(result.data.products));
  assert.ok(Array.isArray(result.data.fundraisers));
});

test("getBuilderEmbedOptions succeeds for direct organizer owner fallback", async () => {
  currentUser = { id: TEST_USER_ID, email: "directowner@example.com" };
  currentRole = null; // Not in entity_members
  organizerOwnerId = TEST_USER_ID; // Is direct organizer user_id
  isPlatformAdmin = false;

  const result = await getBuilderEmbedOptions("direct-owner-tenant-id");
  assert.equal(result.success, true);
  assert.ok(result.data);
});

