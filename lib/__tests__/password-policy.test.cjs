/**
 * P2 F-11 regression tests: signup and reset-password enforce one shared
 * password policy.
 *
 * Previous exposure: signup required 8+ chars with upper/number/special,
 * but reset-password accepted anything 6+ chars — a downgrade path for the
 * credential itself. Both flows now use validatePassword() from
 * lib/password-policy.ts.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

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

const { validatePassword, passwordRules } = require("../password-policy.ts");

test("rejects passwords the old 6-char reset rule would have accepted", () => {
  for (const weak of ["abcdef", "Abcdef", "Abcdef1", "abcdefgh1", "ABCDEFGH", "abc123!!"]) {
    assert.equal(validatePassword(weak).valid, false, `${weak} must be rejected`);
  }
});

test("rejects short, empty, and single-class passwords", () => {
  assert.equal(validatePassword("").valid, false);
  assert.equal(validatePassword("Ab1!").valid, false);
  assert.equal(validatePassword("abcdefgh").valid, false);
  assert.equal(validatePassword("12345678").valid, false);
  assert.equal(validatePassword("!!!!!!!!").valid, false);
});

test("accepts a fully-compliant password", () => {
  const r = validatePassword("Str0ng!Pass");
  assert.equal(r.valid, true);
  assert.equal(r.error, undefined);
});

test("passwordRules exposes the strength-meter flags signup renders", () => {
  const rules = passwordRules("Ab1!");
  assert.equal(rules.isMinLength, false);
  assert.equal(rules.hasCapitalLetter, true);
  assert.equal(rules.hasNumber, true);
  assert.equal(rules.hasSpecialChar, true);
  assert.deepEqual(Object.keys(rules).sort(), [
    "hasCapitalLetter",
    "hasLetter",
    "hasNumber",
    "hasSpecialChar",
    "isMinLength",
  ]);
});

test("both flows use the shared validator (no divergent inline rules)", () => {
  const signup = fs.readFileSync(path.join(ROOT, "app", "signup", "page.tsx"), "utf8");
  const reset = fs.readFileSync(path.join(ROOT, "app", "reset-password", "page.tsx"), "utf8");
  for (const [name, src] of [["signup", signup], ["reset", reset]]) {
    assert.ok(
      src.includes('from "@/lib/password-policy"') && src.includes("validatePassword("),
      `${name} must use the shared validatePassword()`
    );
  }
  assert.ok(!reset.includes("length < 6"), "reset must not keep the old 6-char rule");
  assert.ok(!/password\.length >= 8/.test(signup), "signup must not keep a divergent inline rule");
});
