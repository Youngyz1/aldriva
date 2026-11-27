/**
 * components/nav/__tests__/nav-active.test.cjs
 *
 * Pure unit tests for isNavItemActive / isNavItemOrChildActive /
 * computeSharedBases: no I/O, no DOM, no DB. These are the exact functions
 * OrgDashboardSidebar.tsx and DashboardMoreSheet.tsx both call to decide a
 * Workforce-style group's highlight and expand-by-default state --
 * fixtures below mirror that exact shape (a parent item with Branches/Staff
 * children) to lock in the auto-expand-on-/workforce fix.
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

const { isNavItemActive, isNavItemOrChildActive, computeSharedBases } = require("@/components/nav/nav-active.ts");

const base = "/dashboard/org/org-1";
const workforceItem = {
  label: "Workforce",
  href: `${base}/workforce`,
  icon: "Briefcase",
  children: [
    { label: "Branches", href: `${base}/branches`, icon: "MapPin" },
    { label: "Staff", href: `${base}/staff`, icon: "UserCog" },
  ],
};
const sharedBases = computeSharedBases([{ items: [workforceItem] }]);

describe("isNavItemActive / isNavItemOrChildActive (Workforce grouping)", () => {
  test("own route (/workforce) is active via isNavItemActive", () => {
    assert.equal(isNavItemActive(`${base}/workforce`, null, workforceItem, sharedBases), true);
  });

  test("own route with a sub-path is active (prefix match)", () => {
    assert.equal(isNavItemActive(`${base}/workforce/settings`, null, workforceItem, sharedBases), true);
  });

  test("a child route (/branches) is NOT active via isNavItemActive on the parent", () => {
    assert.equal(isNavItemActive(`${base}/branches`, null, workforceItem, sharedBases), false);
  });

  test("an unrelated route is not active", () => {
    assert.equal(isNavItemActive(`${base}/events`, null, workforceItem, sharedBases), false);
  });

  test("isNavItemOrChildActive is true on the parent's own route (/workforce)", () => {
    assert.equal(isNavItemOrChildActive(`${base}/workforce`, null, workforceItem, sharedBases), true);
  });

  test("isNavItemOrChildActive is true on a child route (/branches)", () => {
    assert.equal(isNavItemOrChildActive(`${base}/branches`, null, workforceItem, sharedBases), true);
  });

  test("isNavItemOrChildActive is true on the other child route (/staff)", () => {
    assert.equal(isNavItemOrChildActive(`${base}/staff`, null, workforceItem, sharedBases), true);
  });

  test("isNavItemOrChildActive is false on an unrelated route", () => {
    assert.equal(isNavItemOrChildActive(`${base}/events`, null, workforceItem, sharedBases), false);
  });

  // Mirrors the exact expression both OrgDashboardSidebar.tsx and
  // DashboardMoreSheet.tsx use: `manuallyToggled[item.href] ?? active`,
  // where `active = isNavItemOrChildActive(...)`. A defined manual value
  // always wins; an undefined one falls through to route-derived active.
  test("auto-expand default (no manual toggle) is true on /workforce, /branches, and /staff", () => {
    for (const pathname of [`${base}/workforce`, `${base}/branches`, `${base}/staff`]) {
      const active = isNavItemOrChildActive(pathname, null, workforceItem, sharedBases);
      const manualOverride = undefined;
      const expanded = manualOverride ?? active;
      assert.equal(expanded, true, `expected auto-expand on ${pathname}`);
    }
  });

  test("auto-expand default (no manual toggle) is false on an unrelated route", () => {
    const active = isNavItemOrChildActive(`${base}/events`, null, workforceItem, sharedBases);
    const manualOverride = undefined;
    const expanded = manualOverride ?? active;
    assert.equal(expanded, false);
  });

  test("a manual override of false collapses the group even while /workforce is active", () => {
    const active = isNavItemOrChildActive(`${base}/workforce`, null, workforceItem, sharedBases);
    const manualOverride = false;
    const expanded = manualOverride ?? active;
    assert.equal(active, true);
    assert.equal(expanded, false);
  });

  test("a manual override of true expands the group even on an unrelated route", () => {
    const active = isNavItemOrChildActive(`${base}/events`, null, workforceItem, sharedBases);
    const manualOverride = true;
    const expanded = manualOverride ?? active;
    assert.equal(active, false);
    assert.equal(expanded, true);
  });
});
