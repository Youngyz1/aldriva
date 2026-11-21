/**
 * lib/staff/__tests__/role-permission-grouping.test.cjs
 *
 * Pure unit tests for groupPermissionsByDomain / isPrivilegedPlatformRole /
 * isRoleOptionDisabledForCaller: no I/O, no DOM, no DB.
 */
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
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
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

const {
  groupPermissionsByDomain,
  isPrivilegedPlatformRole,
  isRoleOptionDisabledForCaller,
} = require("@/lib/staff/role-permission-grouping.ts");

describe("groupPermissionsByDomain", () => {
  test("groups permissions under their domain", () => {
    const groups = groupPermissionsByDomain([
      { key: "manage_staff", description: null, domain: "staff_management" },
      { key: "view_staff", description: null, domain: "staff_management" },
      { key: "manage_roles", description: null, domain: "role_management" },
    ]);
    const staffGroup = groups.find((g) => g.domain === "staff_management");
    assert.ok(staffGroup);
    assert.equal(staffGroup.permissions.length, 2);
  });

  test("sorts permissions within a domain alphabetically by key", () => {
    const groups = groupPermissionsByDomain([
      { key: "view_staff", description: null, domain: "staff_management" },
      { key: "manage_staff", description: null, domain: "staff_management" },
    ]);
    assert.deepEqual(groups[0].permissions.map((p) => p.key), ["manage_staff", "view_staff"]);
  });

  test("orders domains per the fixed migration_231 order, not alphabetically", () => {
    const groups = groupPermissionsByDomain([
      { key: "view_reports", description: null, domain: "reporting" },
      { key: "view_staff", description: null, domain: "staff_management" },
      { key: "manage_roles", description: null, domain: "role_management" },
    ]);
    assert.deepEqual(groups.map((g) => g.domain), ["staff_management", "role_management", "reporting"]);
  });

  test("an unknown domain is appended after the known ones, not dropped", () => {
    const groups = groupPermissionsByDomain([
      { key: "view_staff", description: null, domain: "staff_management" },
      { key: "do_future_thing", description: null, domain: "future_domain" },
    ]);
    assert.deepEqual(groups.map((g) => g.domain), ["staff_management", "future_domain"]);
  });

  test("empty input returns an empty array", () => {
    assert.deepEqual(groupPermissionsByDomain([]), []);
  });
});

describe("isPrivilegedPlatformRole / isRoleOptionDisabledForCaller", () => {
  test("owner, admin, and manager are privileged; viewer is not", () => {
    assert.equal(isPrivilegedPlatformRole("owner"), true);
    assert.equal(isPrivilegedPlatformRole("admin"), true);
    assert.equal(isPrivilegedPlatformRole("manager"), true);
    assert.equal(isPrivilegedPlatformRole("viewer"), false);
  });

  test("a business-custom role (platformRole null) is never privileged", () => {
    assert.equal(isPrivilegedPlatformRole(null), false);
  });

  test("a branch-manager (staff-scope) caller sees privileged roles disabled", () => {
    assert.equal(isRoleOptionDisabledForCaller("owner", "staff"), true);
    assert.equal(isRoleOptionDisabledForCaller("manager", "staff"), true);
  });

  test("an organizer-scope caller never sees any role disabled, even privileged ones", () => {
    assert.equal(isRoleOptionDisabledForCaller("owner", "organizer"), false);
    assert.equal(isRoleOptionDisabledForCaller("manager", "organizer"), false);
  });

  test("a non-privileged role is never disabled, for either scope", () => {
    assert.equal(isRoleOptionDisabledForCaller("viewer", "staff"), false);
    assert.equal(isRoleOptionDisabledForCaller(null, "staff"), false);
  });
});
