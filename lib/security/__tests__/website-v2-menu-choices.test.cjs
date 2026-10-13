const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

let currentUser = { id: "user-1" };
let role = "editor";
let authorizedTenant = "tenant-a";
let menuTableReads = [];
const rows = {
  tenant_websites: [{ id: "website-a", tenant_id: "tenant-a", metadata: { templateId: "restaurant-table-flame" } }],
  menu_sections: [
    { id: "section-a", organizer_id: "tenant-a", name: "Dinner", position: 0 },
    { id: "section-b", organizer_id: "tenant-b", name: "Other tenant", position: 0 },
  ],
  menu_items: [
    { id: "item-a", organizer_id: "tenant-a", section_id: "section-a", name: "Soup", price: 12, is_active: true, position: 0 },
    { id: "item-b", organizer_id: "tenant-b", section_id: "section-b", name: "Secret", price: 99, is_active: true, position: 0 },
    { id: "item-disabled", organizer_id: "tenant-a", section_id: "section-a", name: "Hidden", price: 1, is_active: false, position: 1 },
  ],
};

const originalLoad = Module._load;
Module._load = function mockActionDependencies(request, parent, isMain) {
  if (request === "@/lib/auth" || request === path.join(ROOT, "lib/auth.ts")) {
    return { getCurrentUser: async () => currentUser, isAdmin: async () => false };
  }
  if (request === "@/lib/entity-auth" || request === path.join(ROOT, "lib/entity-auth.ts")) {
    return {
      ENTITY_ROLES_MANAGE: ["owner", "admin", "manager"],
      checkTenantAccess: async (_userId, tenantId, allowedRoles) => ({
        hasAccess: tenantId === authorizedTenant && allowedRoles.includes(role),
        role: tenantId === authorizedTenant ? role : null,
        isDirectOwner: false,
      }),
    };
  }
  if (request === "@/lib/actions/website-content" || request === path.join(ROOT, "lib/actions/website-content.ts")) return { getContentForBuilder: async () => ({ success: false }) };
  if (request === "@/lib/slug" || request === path.join(ROOT, "lib/slug.ts")) return { createSlug: (value) => value };
  if (request === "next/cache") return { revalidatePath() {} };
  if (request === "@/lib/supabase-admin" || request === path.join(ROOT, "lib/supabase-admin.ts")) {
    return { createSupabaseAdmin: () => ({
      from(table) {
        if (table === "menu_sections" || table === "menu_items") menuTableReads.push(table);
        const filters = [];
        const builder = {
          select() { return builder; },
          eq(column, value) { filters.push([column, value]); return builder; },
          in(column, value) { filters.push([column, value]); return builder; },
          order() { return builder; },
          maybeSingle() {
            const result = execute();
            return Promise.resolve({ data: result.data[0] ?? null, error: null });
          },
          then(resolve, reject) { return Promise.resolve({ data: execute().data, error: null }).then(resolve, reject); },
        };
        function execute() {
          let data = [...(rows[table] ?? [])];
          for (const [column, expected] of filters) {
            data = data.filter((row) => Array.isArray(expected) ? expected.includes(row[column]) : row[column] === expected);
          }
          return { data };
        }
        return builder;
      },
    }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { getV2MenuItemChoices } = require("../../actions/website-v2.ts");

test("menu choices derive tenant from website and reject a cross-tenant member", async () => {
  currentUser = { id: "user-1" };
  role = "editor";
  authorizedTenant = "tenant-b";
  menuTableReads = [];
  const result = await getV2MenuItemChoices("website-a");
  assert.equal(result.success, false);
  assert.match(result.error, /Forbidden/);
  assert.deepEqual(menuTableReads, [], "no catalog query runs after tenant access is denied");
});

test("menu choices deny roles outside the website editor access set", async () => {
  currentUser = { id: "user-1" };
  role = "viewer";
  authorizedTenant = "tenant-a";
  menuTableReads = [];
  const result = await getV2MenuItemChoices("website-a");
  assert.equal(result.success, false);
  assert.match(result.error, /Forbidden/);
  assert.deepEqual(menuTableReads, []);
});

test("authorized menu choices stay scoped to the stored tenant and active sections", async () => {
  currentUser = { id: "user-1" };
  role = "editor";
  authorizedTenant = "tenant-a";
  menuTableReads = [];
  const result = await getV2MenuItemChoices("website-a");
  assert.equal(result.success, true);
  assert.deepEqual(result.data, [{ id: "item-a", name: "Soup", description: undefined, price: 12, imageUrl: undefined, sectionName: "Dinner" }]);
  assert.deepEqual(menuTableReads, ["menu_sections", "menu_items"]);
});
