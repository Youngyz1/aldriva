/**
 * lib/__tests__/website-page-draft-projection.test.cjs
 *
 * Regression test for draft storage isolation:
 * 1. Working draft blocks are stored exclusively in website_page_drafts, never in website_pages.
 * 2. Public visitors (isTeamMember = false) receive only live published blocks from website_pages.
 * 3. Team members (isTeamMember = true) have working draft blocks overlaid from website_page_drafts for live preview.
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

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
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

// State trackers for mock queries
let capturedPageSelectQuery = null;
let mockIsTeamMember = false;
let mockDraftRow = {
  blocks: [{ id: "b1", type: "hero", content: { headline: "Draft Preview Headline from website_page_drafts" } }],
};

const mockPageRow = {
  id: "page-123",
  website_id: "site-456",
  title: "Home",
  slug: "home",
  is_home: true,
  status: "published",
  blocks: [{ id: "b1", type: "hero", content: { headline: "Live Published Headline" } }],
  sort_order: 0,
  seo_title: "Home Page",
  seo_description: "Welcome",
  seo_og_image: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockWebsiteRow = {
  id: "site-456",
  tenant_id: "tenant-789",
  slug: "test-site",
  site_title: "Test Site",
  status: "published",
};

// Install mocks for supabase-admin and supabase-server
const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === "@/lib/supabase-admin" || request.endsWith("lib/supabase-admin")) {
    return {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "tenant_websites") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockWebsiteRow, error: null }),
                }),
              }),
            };
          }
          if (table === "website_pages") {
            return {
              select: (cols) => {
                capturedPageSelectQuery = cols;
                return {
                  eq: () => ({
                    order: () => ({
                      order: () => ({
                        order: async () => ({ data: [{ ...mockPageRow }], error: null }),
                      }),
                    }),
                  }),
                };
              },
            };
          }
          if (table === "website_page_drafts") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockDraftRow, error: null }),
                }),
              }),
            };
          }
          if (table === "website_navigation") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { items: [] }, error: null }),
                }),
              }),
            };
          }
          return { select: () => ({ eq: () => ({}) }) };
        },
      }),
    };
  }

  if (request === "@/lib/supabase-server" || request.endsWith("lib/supabase-server")) {
    return {
      createSupabaseServer: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: mockIsTeamMember ? { id: "team-user-1" } : null },
            error: null,
          }),
        },
      }),
    };
  }

  if (request === "@/lib/entity-auth" || request.endsWith("lib/entity-auth")) {
    const actual = originalLoad.call(this, request, parent, isMain);
    return {
      ...actual,
      hasEntityAccess: async () => mockIsTeamMember,
    };
  }

  if (request === "@/lib/auth" || request.endsWith("lib/auth")) {
    const actual = originalLoad.call(this, request, parent, isMain);
    return {
      ...actual,
      isAdmin: async () => false,
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { resolveWebsiteAndPage } = require("@/app/site/[slug]/[[...page]]/page");

test("public visitor receives live published blocks and never sees draft blocks", async () => {
  mockIsTeamMember = false;
  capturedPageSelectQuery = null;

  const result = await resolveWebsiteAndPage("test-site", []);

  assert.ok(result.website, "website resolved");
  assert.ok(result.targetPage, "target page resolved");
  assert.equal(result.isTeamMember, false, "visitor is not team member");

  // Verify public visitor receives live published blocks
  assert.equal(
    result.targetPage.blocks[0].content.headline,
    "Live Published Headline",
    "public visitor must receive live blocks from website_pages"
  );
  assert.equal(
    result.targetPage.draft_blocks,
    undefined,
    "targetPage has no draft_blocks attribute"
  );
});

test("authenticated team member receives overlaid draft preview from website_page_drafts", async () => {
  mockIsTeamMember = true;
  capturedPageSelectQuery = null;

  const result = await resolveWebsiteAndPage("test-site", []);

  assert.ok(result.website, "website resolved");
  assert.ok(result.targetPage, "target page resolved");
  assert.equal(result.isTeamMember, true, "visitor is recognized as team member");

  // Verify team member receives overlaid working draft blocks from website_page_drafts
  assert.equal(
    result.targetPage.blocks[0].content.headline,
    "Draft Preview Headline from website_page_drafts",
    "team member preview must load blocks from website_page_drafts"
  );
});
