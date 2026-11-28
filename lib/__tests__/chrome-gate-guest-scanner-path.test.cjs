/**
 * lib/__tests__/chrome-gate-guest-scanner-path.test.cjs
 *
 * F2 (Guest Scanner Fix Round): isGuestScannerPath(pathname) is the pure,
 * exported function ChromeGate uses to decide whether to render nothing
 * (hiding the navbar / compact footer / cookie banner on the account-less
 * guest pages) or its children. Unit-tested directly here; ChromeGate
 * itself (the client component) is covered by source assertions in
 * lib/__tests__/chrome-gate-wiring.test.cjs since it needs usePathname().
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".tsx"] = function compileTsx(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
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

const { isGuestScannerPath } = require("@/components/ChromeGate.tsx");

test("matches the guest staff-scanner page for any event id", () => {
  assert.equal(isGuestScannerPath("/events/11111111-1111-1111-1111-111111111111/staff-scanner"), true);
  assert.equal(isGuestScannerPath("/events/any-slug/staff-scanner"), true);
});

test("matches the guest redeem page", () => {
  assert.equal(isGuestScannerPath("/events/team/redeem"), true);
});

test("is locale-prefix aware (/en, /fr), matching isKitchenPrivatePath's convention", () => {
  assert.equal(isGuestScannerPath("/en/events/evt-1/staff-scanner"), true);
  assert.equal(isGuestScannerPath("/fr/events/team/redeem"), true);
});

test("does not match the organizer dashboard scanner, the events list, or other event sub-pages", () => {
  assert.equal(isGuestScannerPath("/dashboard/events/evt-1/scan"), false);
  assert.equal(isGuestScannerPath("/events"), false);
  assert.equal(isGuestScannerPath("/events/evt-1"), false);
  assert.equal(isGuestScannerPath("/events/evt-1/tickets"), false);
  assert.equal(isGuestScannerPath("/events/team/accept"), false);
});

test("handles null/undefined pathname without throwing", () => {
  assert.equal(isGuestScannerPath(null), false);
  assert.equal(isGuestScannerPath(undefined), false);
});
