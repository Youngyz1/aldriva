const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { resolveRolesAccess } = require("@/lib/staff/roles-access.ts");

const none = { organizerScope: false, headOffice: false, hasManage: false, hasView: false };

describe("resolveRolesAccess", () => {
  test("head office can manage and view", () => {
    assert.deepEqual(resolveRolesAccess({ ...none, organizerScope: true, headOffice: true }), { canManage: true, canView: true });
  });
  test("staff-layer roles.manage holder can manage and view", () => {
    assert.deepEqual(resolveRolesAccess({ ...none, hasManage: true }), { canManage: true, canView: true });
  });
  test("entity editor (organizer scope, no head office, no key) can view but not manage", () => {
    assert.deepEqual(resolveRolesAccess({ ...none, organizerScope: true }), { canManage: false, canView: true });
  });
  test("roles.view holder can view but not manage", () => {
    assert.deepEqual(resolveRolesAccess({ ...none, hasView: true }), { canManage: false, canView: true });
  });
  test("plain staff with no role keys can do neither", () => {
    assert.deepEqual(resolveRolesAccess(none), { canManage: false, canView: false });
  });
});
