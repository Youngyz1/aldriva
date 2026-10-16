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
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(filePath);
    return /\.(?:[cm]?[jt]sx?)$/i.test(entry.name) ? [filePath] : [];
  });
}

function hasUseServerDirective(sourceFile) {
  return sourceFile.statements.some((statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression) &&
    statement.expression.text === "use server"
  );
}

function isExported(statement) {
  if (ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)) return true;
  return !!ts.canHaveModifiers(statement) &&
    !!ts.getModifiers(statement)?.some((modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword
    );
}

function isAllowedServerActionExport(statement) {
  if (ts.isFunctionDeclaration(statement)) {
    const modifiers = statement.modifiers ?? [];
    return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) &&
      !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
  }
  if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
    return isExported(statement);
  }
  if (ts.isExportDeclaration(statement)) {
    if (!statement.exportClause) return statement.isTypeOnly;
    return ts.isNamedExports(statement.exportClause) &&
      (statement.isTypeOnly || statement.exportClause.elements.every((element) => element.isTypeOnly));
  }
  return false;
}

test('module-level "use server" files export only async functions and types', () => {
  const violations = [];
  for (const directory of [path.join(ROOT, "lib/actions"), path.join(ROOT, "app")]) {
    for (const filePath of listSourceFiles(directory)) {
      const source = fs.readFileSync(filePath, "utf8");
      const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
      if (!hasUseServerDirective(sourceFile)) continue;

      for (const statement of sourceFile.statements) {
        if (!isExported(statement) || isAllowedServerActionExport(statement)) continue;
        const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
        violations.push(`${path.relative(ROOT, filePath)}:${line}: ${statement.getText(sourceFile).split(/\r?\n/, 1)[0]}`);
      }
    }
  }

  assert.deepEqual(violations, [], violations.join("\n"));
});

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
let draftReads = 0;
let liveRow = null;
let lastUpsert = null;
let lastRpcCall = null;
let lastDeletedWebsiteId = null;
let lastDeletedPageIds = [];
let rpcError = null;
let revalidated = [];
// Stage 4A mock state
let mockOrganizer = null;
let mockBusiness = null;
let mockMenuAvailable = true;
let mockProductsAvailable = false;
let mockPages = [];
let mockCreateConflict = false;
let lastInsertedPages = [];
let lastPageUpdates = [];
let lastWebsiteUpdate = null;
let lastNavUpsert = null;
let lastTenantQuery = null;

const originalLoad = Module._load;
Module._load = function loadMocks(request, parent, isMain) {
  if (request === "server-only") return {};

  if (request === "next-intl/server") {
    return { getTranslations: async () => (key) => key };
  }

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
              select: (cols) => ({
                eq: (col, val) => {
                  lastTenantQuery = { cols, col, val };
                  // Slug pre-checks see no collision; tenant lookups see websiteRow.
                  if (col === "slug") {
                    return {
                      maybeSingle: async () => ({ data: null, error: null }),
                    };
                  }
                  return {
                    maybeSingle: async () => ({ data: websiteRow, error: null }),
                  };
                },
              }),
              update: (patch) => ({
                eq: async () => {
                  lastWebsiteUpdate = patch;
                  return { error: null };
                },
              }),
            };
          }
          if (table === "organizers") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrganizer, error: null }),
                }),
              }),
            };
          }
          if (table === "businesses") {
            const chain = {
              select: () => chain,
              eq: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: mockBusiness, error: null }),
            };
            return chain;
          }
          if (table === "menu_sections") {
            return {
              select: () => ({
                eq: () => ({
                  eq: async () => ({
                    data: mockMenuAvailable ? [{ id: "section-1" }] : [],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "menu_items") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    in: async () => ({ count: mockMenuAvailable ? 1 : 0, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === "products") {
            return {
              select: () => ({
                eq: () => ({
                  eq: async () => ({ count: mockProductsAvailable ? 1 : 0, error: null }),
                }),
              }),
            };
          }
          if (table === "website_pages") {
            return {
              select: () => ({
                eq: async () => ({ data: mockPages, error: null }),
              }),
              insert: (rows) => {
                const inserted = Array.isArray(rows) ? rows : [rows];
                lastInsertedPages.push(...inserted);
                for (const row of inserted) {
                  mockPages.push({
                    id: row.id,
                    slug: row.slug,
                    is_home: row.is_home,
                    status: row.status,
                  });
                }
                return Promise.resolve({ data: rows, error: null });
              },
              update: (patch) => ({
                eq: async (col, val) => {
                  lastPageUpdates.push({ patch, col, val });
                  const row = mockPages.find((p) => p.id === val);
                  if (row) Object.assign(row, patch);
                  return { error: null };
                },
              }),
            };
          }
          if (table === "website_navigation") {
            return {
              upsert: (payload) => {
                lastNavUpsert = payload;
                return Promise.resolve({ error: null });
              },
            };
          }
          if (table === "website_page_drafts") {
            return {
              delete: () => ({
                eq: (col, val) => {
                  lastDeletedPageIds.push(val);
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          if (table === "website_content_drafts") {
            const chain = {
              select: () => chain,
              eq: () => chain,
              maybeSingle: async () => {
                draftReads += 1;
                return { data: draftRow, error: null };
              },
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
          if (fn === "create_website_from_template") {
            if (mockCreateConflict) {
              return {
                data: null,
                error: { code: "23505", message: "Website already exists for tenant x" },
              };
            }
            return {
              data: { website_id: "website-new", slug: params.p_slug, idempotent: false },
              error: null,
            };
          }
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
    status: "draft",
    // Content store is v2-only (save hardening); default fixture is a v2 site.
    metadata: { templateId: "restaurant-table-flame", templateVersion: "1.0.0" },
  };
  draftRow = null;
  draftReads = 0;
  liveRow = null;
  lastUpsert = null;
  lastRpcCall = null;
  lastDeletedWebsiteId = null;
  lastDeletedPageIds = [];
  rpcError = null;
  revalidated = [];
  mockOrganizer = {
    id: "tenant-1",
    name: "Acme Diner",
    slug: "acme-diner",
    bio: "Wood-fired neighborhood kitchen.",
    photo: "/logo.png",
    website: "https://acme.example",
    contact_email: "hello@acme.example",
    org_type: "restaurant",
  };
  mockBusiness = null;
  mockMenuAvailable = true;
  mockProductsAvailable = false;
  mockPages = [];
  mockCreateConflict = false;
  lastInsertedPages = [];
  lastPageUpdates = [];
  lastWebsiteUpdate = null;
  lastNavUpsert = null;
  lastTenantQuery = null;
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

// ── 3b. publishContentDraft readiness gate (v2 flagship templates) ──────────

function withV2Template(templateId) {
  websiteRow = {
    ...websiteRow,
    metadata: { templateId, templateVersion: "1.0.0" },
  };
}

test("publishContentDraft refuses NOT_READY when required slots are empty", async () => {
  reset();
  currentRole = "manager";
  withV2Template("restaurant-table-flame");
  draftRow = { content: {}, version: 1 };
  const res = await publishContentDraft("website-1");
  assert.equal(res.success, false);
  assert.equal(res.code, "NOT_READY");
  assert.ok(res.error.includes("Headline"), "missing list names required labels");
  assert.equal(lastRpcCall, null, "RPC must not run when not ready");
});

test("publishContentDraft proceeds when required slots are filled", async () => {
  reset();
  currentRole = "manager";
  withV2Template("restaurant-table-flame");
  draftRow = {
    content: {
      business_name: "Acme",
      logo_url: "/logo.png",
      hero_image: "/hero.jpg",
      hero_headline: "Welcome",
      primary_cta_label: "Order Now",
      hours: { today_tag: "Open late" },
      address: "1 Main St",
      phone: "+1 (555) 000-0000",
    },
    version: 1,
  };
  const res = await publishContentDraft("website-1");
  assert.equal(res.success, true);
  assert.equal(lastRpcCall.fn, "publish_content_draft");
});

test("publishContentDraft rejects non-v2 sites before draft reads or materialization", async () => {
  reset();
  currentRole = "manager";
  withV2Template("business-starter");
  draftRow = { content: {}, version: 1 };
  const oldRes = await publishContentDraft("website-1", null, [{ nope: true }]);
  assert.equal(oldRes.success, false);
  assert.equal(oldRes.code, "V2_ONLY");
  assert.equal(draftReads, 0, "the v2 metadata guard runs before loading a draft");
  assert.equal(lastRpcCall, null);

  reset();
  currentRole = "manager";
  websiteRow = { ...websiteRow, metadata: undefined };
  draftRow = { content: {}, version: 1 };
  const bareRes = await publishContentDraft("website-1");
  assert.equal(bareRes.success, false);
  assert.equal(bareRes.code, "V2_ONLY");
  assert.equal(draftReads, 0);
  assert.equal(lastRpcCall, null);
});

// ── 4. discardContentDraft ──────────────────────────────────────────────────

test("discardContentDraft allows editor and deletes by website_id", async () => {
  reset();
  currentRole = "editor";
  const res = await discardContentDraft("website-1");
  assert.equal(res.success, true);
  assert.equal(lastDeletedWebsiteId, "website-1");
});

// ── 5. saveContentDraft v2 hardening (Stage 4A) ─────────────────────────────

test("saveContentDraft rejects writes for sites without a v2 template", async () => {
  reset();
  currentRole = "manager";
  websiteRow = { ...websiteRow, metadata: { templateId: "business-starter" } };
  const oldRes = await saveContentDraft("website-1", { business_name: "x" });
  assert.equal(oldRes.success, false);
  assert.equal(lastUpsert, null);

  reset();
  currentRole = "manager";
  websiteRow = { ...websiteRow, metadata: undefined };
  const bareRes = await saveContentDraft("website-1", { business_name: "x" });
  assert.equal(bareRes.success, false);
  assert.equal(lastUpsert, null);
});

test("saveContentDraft verifies ownership server-side and never trusts payload ids", async () => {
  reset();
  currentRole = null;
  const res = await saveContentDraft("website-1", { business_name: "x" });
  assert.equal(res.success, false, "non-member denied even for a known website id");
  assert.equal(lastUpsert, null);
});

// ── 6. publishContentDraft v2 materialization (Stage 4A) ────────────────────

const FULL_V2_CONTENT = {
  business_name: "Acme",
  logo_url: "/logo.png",
  hero_image: "/hero.jpg",
  hero_headline: "Welcome",
  primary_cta_label: "Order Now",
  hours: { today_tag: "Open late" },
  address: "1 Main St",
  phone: "+1 (555) 000-0000",
};

test("publishContentDraft materializes v2 pages, nav, and statuses", async () => {
  reset();
  currentRole = "manager";
  // Home row already exists (reused); menu + contact must be created once.
  mockPages = [{ id: "page-home-real", slug: "home", is_home: true, status: "draft" }];
  draftRow = { content: { ...FULL_V2_CONTENT }, version: 1 };
  const res = await publishContentDraft("website-1", 1);
  assert.equal(res.success, true);

  // Page rows: home reused, missing created exactly once, omitted never created.
  const blockIds = lastRpcCall.params.p_page_blocks.map((e) => e.page_id);
  assert.equal(lastRpcCall.params.p_page_blocks.length, 3);
  assert.ok(blockIds.includes("page-home-real"), "existing home row reused by id");
  assert.deepEqual(
    lastInsertedPages.map((p) => p.slug).sort(),
    ["contact", "menu"],
    "only missing emitted pages are inserted, exactly once"
  );
  assert.ok(!lastInsertedPages.some((p) => p.slug === "order"), "omitted order page not created");
  for (const entry of lastRpcCall.params.p_page_blocks) {
    assert.ok(Array.isArray(entry.blocks), "each entry carries a blocks array");
  }
  // The content doc consumed by the RPC is the draft itself: zero sample keys.
  assert.ok(!JSON.stringify(draftRow.content).includes("/placeholders/"), "no samples in the content doc");
  assert.doesNotMatch(JSON.stringify(lastRpcCall.params.p_page_blocks), /Fire-kissed dishes|placeholders\/restaurant/, "resolved published blocks never contain template samples");

  // Exactly one home page after finalize.
  const homes = mockPages.filter((p) => p.is_home);
  assert.equal(homes.length, 1);
  assert.equal(homes[0].slug, "home");
  // Emitted pages published.
  for (const page of mockPages) {
    assert.equal(page.status, "published", `page ${page.slug} published`);
  }
  assert.deepEqual(lastWebsiteUpdate, { status: "published" });

  // Nav rebuilt with real ids, omitted pages excluded.
  assert.equal(lastNavUpsert.website_id, "website-1");
  const hrefs = lastNavUpsert.items.map((i) => i.href);
  assert.ok(hrefs.includes("/site/acme/menu") && hrefs.includes("/site/acme/contact"));
  assert.ok(!hrefs.some((h) => h.includes("order")), "omitted pages stay out of published nav");
  for (const item of lastNavUpsert.items) {
    if (item.page_id) {
      assert.ok(blockIds.includes(item.page_id), "nav page_id points at a real materialized page");
      assert.ok(!item.page_id.includes("--"), "internal resolver ids never persisted");
    }
  }

  // Revalidation covers the site root and every emitted page.
  assert.ok(revalidated.includes("/site/acme"));
  assert.ok(revalidated.includes("/site/acme/menu"));
  assert.ok(revalidated.includes("/site/acme/contact"));
  assert.ok(!revalidated.some((p) => p.includes("order")));
});

test("publishContentDraft materializes live Order and Reservations rows and nav from linked business context", async () => {
  reset();
  currentRole = "manager";
  websiteRow.slug = "aldriva-food";
  mockBusiness = {
    country: "United States",
    industry: "Food & Beverage",
    category: "Restaurant",
    business_type: "Full-Service Restaurant",
    offerings: ["online_ordering", "pickup", "table_reservations"],
    created_at: "2026-01-01T00:00:00.000Z",
  };
  mockPages = [{ id: "page-home-live", slug: "home", is_home: true, status: "draft" }];
  draftRow = { content: { ...FULL_V2_CONTENT }, version: 1 };

  const result = await publishContentDraft("website-1", 1);
  assert.equal(result.success, true);
  assert.ok(lastInsertedPages.some((page) => page.slug === "order"));
  assert.ok(lastInsertedPages.some((page) => page.slug === "reservations"));
  for (const slug of ["order", "reservations"]) {
    assert.equal(mockPages.find((page) => page.slug === slug)?.status, "published", `${slug} is published`);
  }
  assert.ok(lastNavUpsert.items.some((item) => item.href === "/site/aldriva-food/order" && item.page_id));
  assert.ok(lastNavUpsert.items.some((item) => item.href === "/site/aldriva-food/reservations" && item.page_id));

  const { resolveTemplateContent } = require("@/lib/website-template-resolver");
  const { buildWebsiteTemplateResolverInputs } = require("@/lib/website-template-site-inputs");
  const publishedSlugs = mockPages.filter((page) => page.status === "published").map((page) => page.slug).sort();
  const publicResolved = resolveTemplateContent("restaurant-table-flame", "1.0.0", FULL_V2_CONTENT, {
    ...buildWebsiteTemplateResolverInputs({
      siteSlug: "aldriva-food",
      linkedBusiness: mockBusiness,
    }),
    includeSamples: false,
    reservationsApproved: true,
    availablePageSlugs: publishedSlugs,
  });
  assert.deepEqual(publicResolved.pages.map((page) => page.slug).sort(), publishedSlugs,
    "publish rows and public renderable pages match for the same fixture");
});

test("publishContentDraft omits Order and Reservations pages and links when offerings are off", async () => {
  reset();
  currentRole = "manager";
  websiteRow.slug = "aldriva-food";
  mockBusiness = {
    country: "United States",
    industry: "Food & Beverage",
    category: "Restaurant",
    business_type: "Full-Service Restaurant",
    offerings: ["pickup"],
    created_at: "2026-01-01T00:00:00.000Z",
  };
  mockPages = [{ id: "page-home-off", slug: "home", is_home: true, status: "draft" }];
  draftRow = { content: { ...FULL_V2_CONTENT }, version: 1 };

  const result = await publishContentDraft("website-1", 1);
  assert.equal(result.success, true);
  assert.ok(!lastInsertedPages.some((page) => ["order", "reservations"].includes(page.slug)));
  assert.ok(!mockPages.some((page) => ["order", "reservations"].includes(page.slug)));
  assert.ok(!lastNavUpsert.items.some((item) => /\/(?:order|reservations)$/.test(item.href)));
});

test("publishContentDraft maps a stale v2 version to STALE_DRAFT before writing", async () => {
  reset();
  currentRole = "manager";
  draftRow = { content: { ...FULL_V2_CONTENT }, version: 2 };
  rpcError = { code: "40001", message: "Content draft version mismatch" };
  const res = await publishContentDraft("website-1", 1);
  assert.equal(res.success, false);
  assert.equal(res.code, "STALE_DRAFT");
  assert.equal(lastInsertedPages.length, 0, "no page rows touched on stale publish");
});

// ── 7. createWebsiteFromV2Template + getBuilderState (Stage 4A) ─────────────

const {
  createWebsiteFromV2Template,
  getBuilderState,
} = require("@/lib/actions/website-v2");
const { NEW_SITE_GALLERY_TEMPLATES } = require("@/lib/website-template-v2");

test("createWebsiteFromV2Template denies wrong roles and bad input", async () => {
  reset();
  currentRole = "editor";
  const denied = await createWebsiteFromV2Template("tenant-1", "restaurant-table-flame");
  assert.equal(denied.success, false);
  assert.equal(lastRpcCall, null);

  reset();
  currentUser = null;
  const anon = await createWebsiteFromV2Template("tenant-1", "restaurant-table-flame");
  assert.equal(anon.success, false);

  reset();
  currentRole = "manager";
  const unknown = await createWebsiteFromV2Template("tenant-1", "business-starter");
  assert.equal(unknown.success, false, "v1 ids are not v2 templates");

  const businessCategories = ["restaurant", "rental", "retail", "salon", "nonprofit", "custom"];
  for (const template of NEW_SITE_GALLERY_TEMPLATES) {
    for (const businessCategory of businessCategories) {
      reset();
      currentRole = "manager";
      const result = await createWebsiteFromV2Template("tenant-1", template.id, {
        websiteCategory: businessCategory,
        creationRequestId: `${template.id}-${businessCategory}`,
      });
      assert.equal(
        result.success,
        true,
        `${template.id} should be creatable for ${businessCategory}: ${result.error ?? ""}`
      );
      assert.equal(lastRpcCall.params.p_metadata.templateId, template.id);
    }
  }
});

test("createWebsiteFromV2Template creates draft site, metadata, and first content draft", async () => {
  reset();
  currentRole = "manager";
  const res = await createWebsiteFromV2Template("tenant-1", "restaurant-table-flame", {
    creationRequestId: "req-1",
  });
  assert.equal(res.success, true);
  assert.equal(res.data.websiteId, "website-new");
  assert.equal(res.data.slug, "acme-diner");

  assert.equal(lastRpcCall.fn, "create_website_from_template");
  assert.equal(lastRpcCall.params.p_status, "draft");
  assert.equal(lastRpcCall.params.p_tenant_id, "tenant-1");
  // Omitted commerce pages never reach the RPC; blocks stay empty (samples
  // are never persisted anywhere).
  assert.deepEqual(
    lastRpcCall.params.p_pages.map((p) => p.slug),
    ["home", "menu", "contact"]
  );
  for (const page of lastRpcCall.params.p_pages) {
    assert.deepEqual(page.blocks, []);
    assert.equal(page.status, "draft");
  }
  for (const item of lastRpcCall.params.p_navigation) {
    if (item.page_id) assert.ok(!item.page_id.includes("--"), "no internal resolver ids in nav");
  }
  assert.deepEqual(lastRpcCall.params.p_metadata, {
    websiteCategory: "restaurant",
    templateId: "restaurant-table-flame",
    templateVersion: "1.0.0",
    brand: { accentId: "terracotta" },
    creationRequestId: "req-1",
    storefront: { currency: "XOF" },
  });
  assert.equal(lastRpcCall.params.p_theme_config.primaryColor, "#c65d3b", "locked theme from the template");

  // Initial content doc: organizer allowlist only, normalized, zero samples.
  assert.deepEqual(Object.keys(lastUpsert.content).sort(), [
    "about_text",
    "business_name",
    "email",
    "logo_url",
  ]);
  assert.equal(lastUpsert.content.business_name, "Acme Diner");
  assert.ok(!JSON.stringify(lastUpsert.content).includes("/placeholders/"));
  assert.equal(lastUpsert.website_id, "website-new");
  assert.equal(lastTenantQuery.col, "slug", "slug uniqueness pre-check runs before the RPC");

  assert.ok(revalidated.includes("/dashboard/org/tenant-1/website"));
});

test("createWebsiteFromV2Template is idempotent on creationRequestId and enforces one site per tenant", async () => {
  reset();
  currentRole = "manager";
  mockCreateConflict = true;
  websiteRow = {
    ...websiteRow,
    metadata: { ...websiteRow.metadata, creationRequestId: "req-1" },
  };
  const replay = await createWebsiteFromV2Template("tenant-1", "restaurant-table-flame", {
    creationRequestId: "req-1",
  });
  assert.equal(replay.success, true);
  assert.equal(replay.data.idempotent, true);
  assert.equal(replay.data.websiteId, "website-1");

  reset();
  currentRole = "manager";
  mockCreateConflict = true;
  websiteRow = {
    ...websiteRow,
    metadata: { ...websiteRow.metadata, creationRequestId: "req-other" },
  };
  const second = await createWebsiteFromV2Template("tenant-1", "restaurant-table-flame", {
    creationRequestId: "req-2",
  });
  assert.equal(second.success, false);
  assert.ok(second.error.includes("already exists"));
});

test("getBuilderState returns preview, readiness, role, and unpublished URL state", async () => {
  reset();
  currentRole = "viewer";
  liveRow = { content: { business_name: "Live" } };
  draftRow = { content: { ...FULL_V2_CONTENT }, version: 4 };
  const res = await getBuilderState("website-1");
  assert.equal(res.success, true);
  assert.equal(res.data.template.id, "restaurant-table-flame");
  assert.equal(res.data.draftVersion, 4);
  assert.equal(res.data.hasDraft, true);
  assert.equal(res.data.contentDraftOrLive.hero_headline, "Welcome", "draft preferred over live");
  assert.equal(res.data.readiness.ready, true);
  assert.equal(res.data.canPublish, false, "viewer cannot publish");
  assert.equal(res.data.userRole, "viewer");
  assert.equal(res.data.isPublished, false);
  assert.match(res.data.publicUrl, /\/site\/acme$/);
  assert.equal(res.data.previewPages.length, 3, "home + menu + contact previewed");
  assert.ok(res.data.previewPages.every((p) => Array.isArray(p.blocks) && p.blocks.length > 0));
  assert.ok(Array.isArray(res.data.sampleFieldsInUse));
  assert.ok(res.data.omittedPages.some((p) => p.slug === "order"));
});

test("getBuilderState marks the public URL live only after publication", async () => {
  reset();
  currentRole = "manager";
  websiteRow = { ...websiteRow, status: "published" };
  draftRow = { content: { ...FULL_V2_CONTENT }, version: 1 };
  const res = await getBuilderState("website-1");
  assert.equal(res.success, true);
  assert.equal(res.data.isPublished, true);
  assert.match(res.data.publicUrl, /\/site\/acme$/);
});

test("getBuilderState rejects sites without a v2 template", async () => {
  reset();
  currentRole = "manager";
  websiteRow = { ...websiteRow, metadata: { templateId: "business-starter" } };
  const res = await getBuilderState("website-1");
  assert.equal(res.success, false);
});
