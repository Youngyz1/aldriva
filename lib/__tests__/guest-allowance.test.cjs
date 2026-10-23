const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
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

const { escapeSpreadsheetFormulaCell, validateGuestAllowance } = require("../guest-allowance.ts");
const { isMissingGuestInvitationColumnsError } = require("../guest-invitation-columns.ts");

test("guest allowance accepts null and integer bounds 1 through 20", () => {
  assert.deepEqual(validateGuestAllowance(null), { valid: true, value: null });
  assert.deepEqual(validateGuestAllowance(undefined), { valid: true, value: null });
  assert.deepEqual(validateGuestAllowance(1), { valid: true, value: 1 });
  assert.deepEqual(validateGuestAllowance(20), { valid: true, value: 20 });
});

test("guest allowance rejects non-integers and values outside 1 through 20", () => {
  for (const value of [0, 21, -1, 1.5, "2", true, {}, []]) {
    assert.equal(validateGuestAllowance(value).valid, false, `expected ${String(value)} to be invalid`);
  }
});

test("spreadsheet cells beginning with formula characters are escaped", () => {
  assert.equal(escapeSpreadsheetFormulaCell("=1+1"), "'=1+1");
  assert.equal(escapeSpreadsheetFormulaCell("+SUM(A1:A2)"), "'+SUM(A1:A2)");
  assert.equal(escapeSpreadsheetFormulaCell("-2+3"), "'-2+3");
  assert.equal(escapeSpreadsheetFormulaCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(escapeSpreadsheetFormulaCell("Guest name"), "Guest name");
  assert.equal(escapeSpreadsheetFormulaCell(null), "");
});

test("pre-migration schema detection is limited to missing optional invitation columns", () => {
  assert.equal(isMissingGuestInvitationColumnsError({
    code: "PGRST204",
    message: "Could not find the 'guest_allowance' column in the schema cache.",
  }), true);
  assert.equal(isMissingGuestInvitationColumnsError({
    code: "42703",
    message: "column event_invitations.rsvp_message does not exist",
  }), true);
  assert.equal(isMissingGuestInvitationColumnsError({
    code: "23505",
    message: "duplicate key violates unique constraint guest_allowance",
  }), false);
});
