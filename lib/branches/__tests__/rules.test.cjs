/**
 * lib/branches/__tests__/rules.test.cjs
 *
 * Pure unit tests for checkBranchMainGuard: no I/O, no network, no DB.
 * The main-swap-with-rollback and 23505 mapping behavior in
 * lib/actions/business-branches.ts are not covered here -- they require a
 * live Supabase client (this is "as far as the repo pattern allows without
 * a DB": the pure guard rules, extracted to their own module specifically
 * so they're testable this way, same split as lib/staff/errors.ts).
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

const { checkBranchMainGuard, checkNewBranchMainGuard } = require("@/lib/branches/rules.ts");

describe("checkBranchMainGuard", () => {
  test("allows an unrelated field update on the current main branch (no-op on is_main/status)", () => {
    const result = checkBranchMainGuard({ currentIsMain: true, currentStatus: "active" });
    assert.equal(result, null);
  });

  test("allows making a different active branch main", () => {
    const result = checkBranchMainGuard({ currentIsMain: false, currentStatus: "active", nextIsMain: true });
    assert.equal(result, null);
  });

  test("allows archiving a non-main branch", () => {
    const result = checkBranchMainGuard({ currentIsMain: false, currentStatus: "active", nextStatus: "archived" });
    assert.equal(result, null);
  });

  test("allows reactivating an archived, non-main branch", () => {
    const result = checkBranchMainGuard({ currentIsMain: false, currentStatus: "archived", nextStatus: "active" });
    assert.equal(result, null);
  });

  test("rejects directly unsetting the current main (rule 1, code branch_main_required)", () => {
    const result = checkBranchMainGuard({ currentIsMain: true, currentStatus: "active", nextIsMain: false });
    assert.equal(result.code, "branch_main_required");
    assert.equal(result.message, "Pick another branch as main first.");
  });

  test("rejects archiving the current main when is_main is left unchanged (rule 2, code branch_archive_main_denied)", () => {
    const result = checkBranchMainGuard({ currentIsMain: true, currentStatus: "active", nextStatus: "archived" });
    assert.equal(result.code, "branch_archive_main_denied");
    assert.equal(result.message, "Pick another branch as main before archiving this one.");
  });

  test("rejects archiving while simultaneously trying to keep is_main true explicitly (rule 2)", () => {
    const result = checkBranchMainGuard({
      currentIsMain: true,
      currentStatus: "active",
      nextIsMain: true,
      nextStatus: "archived",
    });
    assert.equal(result.code, "branch_archive_main_denied");
  });

  test("rejects setting main on a branch that stays archived (rule 3, code branch_activate_required)", () => {
    const result = checkBranchMainGuard({ currentIsMain: false, currentStatus: "archived", nextIsMain: true });
    assert.equal(result.code, "branch_activate_required");
    assert.equal(result.message, "Reactivate this branch before making it main.");
  });

  test("allows setting main on a branch being reactivated in the same write (status and is_main both changing)", () => {
    const result = checkBranchMainGuard({
      currentIsMain: false,
      currentStatus: "archived",
      nextIsMain: true,
      nextStatus: "active",
    });
    assert.equal(result, null);
  });

  test("rule 1 takes precedence: unsetting main on an archived-and-main branch still gets branch_main_required, not the archive code", () => {
    const result = checkBranchMainGuard({
      currentIsMain: true,
      currentStatus: "active",
      nextIsMain: false,
      nextStatus: "archived",
    });
    assert.equal(result.code, "branch_main_required");
  });

});

describe("checkNewBranchMainGuard", () => {
  test("rejects a new branch that wants main and is archived", () => {
    const result = checkNewBranchMainGuard(true, "archived");
    assert.equal(result.code, "branch_activate_required");
    assert.equal(result.message, "A new branch cannot be both main and archived.");
  });

  test("allows a new active main branch (the first-branch-becomes-main case)", () => {
    assert.equal(checkNewBranchMainGuard(true, "active"), null);
  });

  test("allows a new non-main archived branch", () => {
    assert.equal(checkNewBranchMainGuard(false, "archived"), null);
  });

  test("allows a new non-main active branch", () => {
    assert.equal(checkNewBranchMainGuard(false, "active"), null);
  });
});
