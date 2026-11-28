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

const { buildStaffUiCapabilities, canEditRow, canDeactivateRow } = require("@/lib/staff/staff-capabilities.ts");

const rowB1 = { id: "s-b1", branch_id: "b1" };
const rowB2 = { id: "s-b2", branch_id: "b2" };
const rowNoBranch = { id: "s-none", branch_id: null };

describe("staff UI capabilities", () => {
  test("head office can add, delete, edit and deactivate any row", () => {
    const caps = buildStaffUiCapabilities({ headOffice: true, managedBranchId: null, myStaffId: null });
    assert.equal(caps.canAdd, true);
    assert.equal(caps.canDelete, true);
    for (const r of [rowB1, rowB2, rowNoBranch]) {
      assert.equal(canEditRow(caps, r), true);
      assert.equal(canDeactivateRow(caps, r), true);
    }
  });

  test("branch manager: add yes, delete no, edit and deactivate only own-branch rows", () => {
    const caps = buildStaffUiCapabilities({ headOffice: false, managedBranchId: "b1", myStaffId: "me" });
    assert.equal(caps.canAdd, true);
    assert.equal(caps.canDelete, false);
    assert.equal(canEditRow(caps, rowB1), true);
    assert.equal(canDeactivateRow(caps, rowB1), true);
    assert.equal(canEditRow(caps, rowB2), false);
    assert.equal(canDeactivateRow(caps, rowB2), false);
    assert.equal(canEditRow(caps, rowNoBranch), false);
  });

  test("branch manager can edit but not deactivate their own row", () => {
    const caps = buildStaffUiCapabilities({ headOffice: false, managedBranchId: "b1", myStaffId: "s-b1" });
    assert.equal(canEditRow(caps, rowB1), true);
    assert.equal(canDeactivateRow(caps, rowB1), false);
  });

  test("plain staff: no add, no delete, edit own row only, never deactivate", () => {
    const caps = buildStaffUiCapabilities({ headOffice: false, managedBranchId: null, myStaffId: "s-b1" });
    assert.equal(caps.canAdd, false);
    assert.equal(caps.canDelete, false);
    assert.equal(canEditRow(caps, rowB1), true);
    assert.equal(canEditRow(caps, rowB2), false);
    for (const r of [rowB1, rowB2]) assert.equal(canDeactivateRow(caps, r), false);
  });

  test("no access (editor, finance, outsider): nothing is allowed", () => {
    const caps = buildStaffUiCapabilities({ headOffice: false, managedBranchId: null, myStaffId: null });
    assert.equal(caps.canAdd, false);
    assert.equal(caps.canDelete, false);
    for (const r of [rowB1, rowB2, rowNoBranch]) {
      assert.equal(canEditRow(caps, r), false);
      assert.equal(canDeactivateRow(caps, r), false);
    }
  });
});

describe("staff UI capabilities: staff-layer reach (250)", () => {
  const none = { all: false, branches: [] };
  const everywhere = { all: true, branches: [] };
  const base = { headOffice: false, managedBranchId: null, myStaffId: "me" };

  test("no reach given: behaves exactly as before (fails closed)", () => {
    const caps = buildStaffUiCapabilities(base);
    assert.equal(caps.canAdd, false);
    for (const r of [rowB1, rowB2, rowNoBranch]) {
      assert.equal(canEditRow(caps, r), false);
      assert.equal(canDeactivateRow(caps, r), false);
    }
  });

  test("business-wide update+view: add yes, edit and deactivate every row incl. NULL branch, delete no", () => {
    const caps = buildStaffUiCapabilities({ ...base, reach: { update: everywhere, view: everywhere } });
    assert.equal(caps.canAdd, true);
    assert.equal(caps.canDelete, false);
    for (const r of [rowB1, rowB2, rowNoBranch]) {
      assert.equal(canEditRow(caps, r), true);
      assert.equal(canDeactivateRow(caps, r), true);
    }
  });

  test("branch-scoped reach: only rows on reached branches, never NULL-branch rows", () => {
    const reach = { update: { all: false, branches: ["b1"] }, view: { all: false, branches: ["b1"] } };
    const caps = buildStaffUiCapabilities({ ...base, reach });
    assert.equal(caps.canAdd, true);
    assert.equal(canEditRow(caps, rowB1), true);
    assert.equal(canDeactivateRow(caps, rowB1), true);
    assert.equal(canEditRow(caps, rowB2), false);
    assert.equal(canDeactivateRow(caps, rowB2), false);
    assert.equal(canEditRow(caps, rowNoBranch), false);
  });

  test("update without view is inert (view-before-update)", () => {
    const caps = buildStaffUiCapabilities({ ...base, reach: { update: everywhere, view: none } });
    assert.equal(caps.canAdd, false);
    for (const r of [rowB1, rowB2, rowNoBranch]) {
      assert.equal(canEditRow(caps, r), false);
      assert.equal(canDeactivateRow(caps, r), false);
    }
  });

  test("view without update gives nothing", () => {
    const caps = buildStaffUiCapabilities({ ...base, reach: { update: none, view: everywhere } });
    assert.equal(caps.canAdd, false);
    assert.equal(canEditRow(caps, rowB1), false);
  });

  test("update and view on different branches never combine on one row", () => {
    const reach = { update: { all: false, branches: ["b1"] }, view: { all: false, branches: ["b2"] } };
    const caps = buildStaffUiCapabilities({ ...base, reach });
    assert.equal(caps.canAdd, false);
    assert.equal(canEditRow(caps, rowB1), false);
    assert.equal(canEditRow(caps, rowB2), false);
  });

  test("never deactivate your own row, even with full reach (241 self-edit guard)", () => {
    const caps = buildStaffUiCapabilities({
      headOffice: false,
      managedBranchId: null,
      myStaffId: "s-b1",
      reach: { update: everywhere, view: everywhere },
    });
    assert.equal(canDeactivateRow(caps, rowB1), false);
    assert.equal(canEditRow(caps, rowB1), true);
    assert.equal(canDeactivateRow(caps, rowB2), true);
  });

  test("old rules still win when reach is empty: branch manager unchanged", () => {
    const caps = buildStaffUiCapabilities({
      headOffice: false,
      managedBranchId: "b1",
      myStaffId: "me",
      reach: { update: none, view: none },
    });
    assert.equal(caps.canAdd, true);
    assert.equal(canEditRow(caps, rowB1), true);
    assert.equal(canEditRow(caps, rowB2), false);
  });
});
