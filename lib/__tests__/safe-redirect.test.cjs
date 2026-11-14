/**
 * lib/__tests__/safe-redirect.test.cjs
 *
 * Unit tests for resolveSafeNextPath (lib/safe-redirect.ts), added for
 * layer6-step8 as part of the Phase 6 promotion handoff — this is the same
 * function the OAuth callback route (app/auth/callback/route.ts) already
 * uses to validate `next`, and that app/login/page.tsx's "Sign up free"
 * link and app/signup/page.tsx's Google/email redirect now rely on
 * carrying an /invitations/promote?draftId=...&template=... URL through
 * safely.
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { resolveSafeNextPath } = require("@/lib/safe-redirect.ts");

const ORIGIN = "https://aldriva.example";

describe("resolveSafeNextPath", () => {
  test("accepts /invitations/promote?draftId=x&template=y after an encode/decode round trip", () => {
    const target = "/invitations/promote?draftId=x&template=y";
    const encoded = encodeURIComponent(target);
    const decoded = decodeURIComponent(encoded);
    assert.strictEqual(decoded, target, "sanity: encode/decode round trip must be lossless");
    assert.strictEqual(resolveSafeNextPath(decoded, ORIGIN), target);
  });

  test("accepts a draftId that is a real UUID, query string intact", () => {
    const target = "/invitations/promote?draftId=34eeff2a-c81e-40f8-871b-51ec3ea96abc&template=minimalism-dark-blue";
    assert.strictEqual(resolveSafeNextPath(target, ORIGIN), target);
  });

  test("rejects an absolute external URL (https://evil.com)", () => {
    assert.strictEqual(resolveSafeNextPath("https://evil.com", ORIGIN), "/");
    assert.strictEqual(resolveSafeNextPath("https://evil.com/invitations/promote", ORIGIN), "/");
  });

  test("rejects a protocol-relative URL (//evil.com)", () => {
    assert.strictEqual(resolveSafeNextPath("//evil.com", ORIGIN), "/");
    assert.strictEqual(resolveSafeNextPath("//evil.com/invitations/promote", ORIGIN), "/");
  });

  test("rejects a javascript: value", () => {
    assert.strictEqual(resolveSafeNextPath("javascript:alert(1)", ORIGIN), "/");
  });

  test("rejects a backslash-prefixed value (/\\evil.com, a classic open-redirect bypass)", () => {
    assert.strictEqual(resolveSafeNextPath("/\\evil.com", ORIGIN), "/");
  });

  test("null, empty, or non-path input falls back to /", () => {
    assert.strictEqual(resolveSafeNextPath(null, ORIGIN), "/");
    assert.strictEqual(resolveSafeNextPath("", ORIGIN), "/");
    assert.strictEqual(resolveSafeNextPath("not-a-path", ORIGIN), "/");
  });

  test("a plain same-origin path with no query string still passes through", () => {
    assert.strictEqual(resolveSafeNextPath("/dashboard", ORIGIN), "/dashboard");
  });
});
