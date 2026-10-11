/**
 * lib/security/__tests__/website-content-actions.test.cjs
 *
 * Security & regression tests for lib/actions/website-content.ts (Stage S2).
 * Mirrors the mocked-auth pattern of website-builder-actions.test.cjs:
 * fakes @/lib/auth, @/lib/entity-auth, next/cache, @/lib/supabase-server and
 * @/lib/supabase-admin in memory. No DB, no network.
 *
 * Invariants:
 * 1. saveContentDraft allows owner/admin/manager/editor; rejects viewer/non-member.
 * 2. saveContentDraft enforces expectedVersion (STALE_DRAFT on mismatch).
 * 3. publishContentDraft rejects editors; maps RPC 40001 -> STALE_DRAFT,
 *    P0002 -> NO_DRAFT; validates pageBlocks shape before the RPC.
 * 4. discardContentDraft allows editors; getContentForBuilder allows viewers.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");

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

// ── Mock state ──────────────────────────────────────────────────────────────

let currentUser = null;
let currentRole = null;
let isPlatformAdmin = false;
let websiteRow = null;
let draftRow = null;
let liveRow = null;
let lastUpsert = null;
let lastRpcCall = null;
let lastDeletedWebsiteId = null;
let rpcError = null;
let revalidated = [];

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
      ENTITY_ROLES_CONTENT_WRITE: ["owner", "admin", "manager", "editor"],
      ENTITY_ROLES_MANAGE: ["owner", "admin", "manager"],
      checkTenantAccess: async (_userId, _tenantId, allowedRoles) => {
        if (currentRole) {
          return {
            hasAccess: allowedRoles.includes(currentRole),
            role: currentRole,
            isDirectOwner: false,
          };
        }
        return { hasAccess: false, role: null, isDirectOwner: false };
      },
    };
  }

  if (request === "next/cache") {
    return {
      revalidatePath: (p) => {
        revalidated.push(p);
      },
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
          if (table === "tenant_websites") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: websiteRow, error: null }),
                }),
              }),
            };
          }
          if (table === "website_content_drafts") {
            const chain = {
              select: () => chain,
              eq: () => chain,
              maybeSingle: async () => ({ data: draftRow, error: null }),
              upsert: (payload) => {
                lastUpsert = payload;
                return {
                  select: () => ({
                    maybeSingle: async () => ({
                      data: {
                        version: draftRow ? draftRow.version + 1 : 1,
                        updated_at: "2026-10-11T00:00:00.000Z",
                      },
                      error: null,
                    }),
                  }),
                };
              },
              delete: () => ({
                eq: (col, val) => {
                  lastDeletedWebsiteId = val;
                  return Promise.resolve({ error: null });
                },
              }),
            };
            return chain;
          }
          if (table === "website_content") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: liveRow, error: null }),
                }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
        rpc: async (fn, params) => {
          lastRpcCall = { fn, params };
          if (rpcError) return { data: null, error: rpcError };
          return { data: { version: 3, pages_written: 0 }, error: null };
        },
      }),
    };
  }

  return originalLoad.apply(this, [request, parent, isMain]);
};

const {
  saveContentDraft,
  getContentForBuilder,
  publishContentDraft,
  discardContentDraft,
} = require("@/lib/actions/website-content");

function reset() {
  currentUser = { id: "user-1" };
  currentRole = null;
  isPlatformAdmin = false;
  websiteRow = {
    id: "website-1",
    tenant_id: "tenant-1",
    slug: "acme",
    site_title: "Acme",
  };
  draftRow = null;
  liveRow = null;
  lastUpsert = null;
  lastRpcCall = null;
  lastDeletedWebsiteId = null;
  rpcError = null;
  revalidated = [];
}

// ── 1. saveContentDraft roles ───────────────────────────────────────────────

test("saveContentDraft allows editor and normalizes content", async () => {
  reset();
  currentRole = "editor";
  const res = await saveContentDraft("website-1", {
    business_name: "  Acme  ",
    unknown_key: "dropped",
  });
  assert.equal(res.success, true);
  assert.equal(lastUpsert.website_id, "website-1");
  assert.equal(lastUpsert.content.business_name, "Acme");
  assert.ok(!("unknown_key" in lastUpsert.content));
});

test("saveContentDraft rejects viewer and unauthenticated callers", async () => {
  reset();
  currentRole = "viewer";
  const viewerRes = await saveContentDraft("website-1", { business_name: "x" });
  assert.equal(viewerRes.success, false);
  assert.equal(lastUpsert, null);

  reset();
  currentUser = null;
  const anonRes = await saveContentDraft("website-1", { business_name: "x" });
  assert.equal(anonRes.success, false);
});

test("saveContentDraft returns STALE_DRAFT on version mismatch", async () => {
  reset();
  currentRole = "manager";
  draftRow = { version: 5 };
  const res = await saveContentDraft("website-1", { business_name: "x" }, 4);
  assert.equal(res.success, false);
  assert.equal(res.code, "STALE_DRAFT");
  assert.equal(lastUpsert, null);
});

test("saveContentDraft accepts matching expectedVersion", async () => {
  reset();
  currentRole = "manager";
  draftRow = { version: 5 };
  const res = await saveContentDraft("website-1", { business_name: "x" }, 5);
  assert.equal(res.success, true);
  assert.equal(res.data.version, 6);
});

// ── 2. getContentForBuilder ─────────────────────────────────────────────────

test("getContentForBuilder allows viewer and prefers draft over live", async () => {
  reset();
  currentRole = "viewer";
  liveRow = { content: { business_name: "Live" } };
  draftRow = { content: { business_name: "Draft" }, version: 2 };
  const res = await getContentForBuilder("website-1");
  assert.equal(res.success, true);
  assert.equal(res.data.content.business_name, "Draft");
  assert.equal(res.data.liveContent.business_name, "Live");
  assert.equal(res.data.version, 2);
  assert.equal(res.data.hasDraft, true);
  assert.equal(res.data.canPublish, false);
});

// ── 3. publishContentDraft ──────────────────────────────────────────────────

test("publishContentDraft rejects editors but allows managers", async () => {
  reset();
  currentRole = "editor";
  const editorRes = await publishContentDraft("website-1");
  assert.equal(editorRes.success, false);
  assert.equal(lastRpcCall, null);

  reset();
  currentRole = "manager";
  const managerRes = await publishContentDraft("website-1", 3);
  assert.equal(managerRes.success, true);
  assert.equal(lastRpcCall.fn, "publish_content_draft");
  assert.equal(lastRpcCall.params.p_website_id, "website-1");
  assert.equal(lastRpcCall.params.p_expected_version, 3);
  assert.ok(revalidated.includes("/site/acme"));
});

test("publishContentDraft maps RPC 40001 to STALE_DRAFT and P0002 to NO_DRAFT", async () => {
  reset();
  currentRole = "manager";
  rpcError = { code: "40001", message: "version mismatch" };
  const stale = await publishContentDraft("website-1", 2);
  assert.equal(stale.success, false);
  assert.equal(stale.code, "STALE_DRAFT");

  rpcError = { code: "P0002", message: "No content draft found" };
  const empty = await publishContentDraft("website-1");
  assert.equal(empty.success, false);
  assert.equal(empty.code, "NO_DRAFT");
});

test("publishContentDraft validates pageBlocks shape before the RPC", async () => {
  reset();
  currentRole = "manager";
  const bad = await publishContentDraft("website-1", null, [{ nope: true }]);
  assert.equal(bad.success, false);
  assert.equal(lastRpcCall, null);

  const good = await publishContentDraft(
    "website-1",
    null,
    [{ page_id: "11111111-1111-4111-8111-111111111111", blocks: [] }]
  );
  assert.equal(good.success, true);
  assert.equal(lastRpcCall.params.p_page_blocks.length, 1);
});

// ── 4. discardContentDraft ──────────────────────────────────────────────────

test("discardContentDraft allows editor and deletes by website_id", async () => {
  reset();
  currentRole = "editor";
  const res = await discardContentDraft("website-1");
  assert.equal(res.success, true);
  assert.equal(lastDeletedWebsiteId, "website-1");
});
