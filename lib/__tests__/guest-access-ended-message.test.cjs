/**
 * lib/__tests__/guest-access-ended-message.test.cjs
 *
 * F4 (Guest Scanner Fix Round): buildGuestAccessEndedMessage is a pure
 * function (lib/staff/guest-access-ended-message.ts), unit-tested
 * directly — no DOM/IndexedDB/fetch involved.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
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
  buildGuestAccessEndedMessage,
  GUEST_ACCESS_ENDED_BASE_MESSAGE,
} = require("@/lib/staff/guest-access-ended-message.ts");

test("N=0: returns only the base message, with no mention of scans kept on the device", () => {
  const message = buildGuestAccessEndedMessage(0);
  assert.equal(message, GUEST_ACCESS_ENDED_BASE_MESSAGE);
  assert.ok(!message.includes("kept on this device"));
});

test("N>0 (plural): appends the kept-scans note with correct pluralization", () => {
  const message = buildGuestAccessEndedMessage(3);
  assert.ok(message.startsWith(GUEST_ACCESS_ENDED_BASE_MESSAGE));
  assert.match(message, /3 scans are kept on this device\. Ask the organizer to re-invite you to send them\./);
});

test("N=1 (singular): uses 'scan is', not 'scans are'", () => {
  const message = buildGuestAccessEndedMessage(1);
  assert.match(message, /1 scan is kept on this device\./);
  assert.ok(!message.includes("1 scans"));
});

test("negative or non-finite counts are treated as zero (defensive, never a nonsensical message)", () => {
  assert.equal(buildGuestAccessEndedMessage(-1), GUEST_ACCESS_ENDED_BASE_MESSAGE);
  assert.equal(buildGuestAccessEndedMessage(NaN), GUEST_ACCESS_ENDED_BASE_MESSAGE);
});
