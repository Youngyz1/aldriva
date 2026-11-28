/**
 * lib/staff/__tests__/photo-validation.test.cjs
 *
 * Pure unit tests for validateStaffPhotoUrl: no I/O, no network, no DB.
 * allowedHost is passed explicitly (second argument) in every test instead
 * of relying on process.env.NEXT_PUBLIC_SUPABASE_URL, so these tests are
 * deterministic regardless of the environment they run in.
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

const { validateStaffPhotoUrl } = require("@/lib/staff/photo-validation.ts");

const HOST = "example-project.supabase.co";
const VALID_URL = `https://${HOST}/storage/v1/object/public/fundraiser-media/staff-photos/abc.jpg`;

describe("validateStaffPhotoUrl", () => {
  test("null and undefined are valid (photo is optional)", () => {
    assert.equal(validateStaffPhotoUrl(null, HOST), null);
    assert.equal(validateStaffPhotoUrl(undefined, HOST), null);
  });

  test("a valid https URL on the allowed host is accepted", () => {
    assert.equal(validateStaffPhotoUrl(VALID_URL, HOST), null);
  });

  test("rejects http:// (not https)", () => {
    const result = validateStaffPhotoUrl(`http://${HOST}/x.jpg`, HOST);
    assert.equal(result.code, "photo_invalid");
  });

  test("rejects javascript: scheme", () => {
    const result = validateStaffPhotoUrl("javascript:alert(1)", HOST);
    assert.equal(result.code, "photo_invalid");
  });

  test("rejects data: URLs", () => {
    const result = validateStaffPhotoUrl("data:image/png;base64,aaaa", HOST);
    assert.equal(result.code, "photo_invalid");
  });

  test("rejects a URL over 500 characters", () => {
    const longPath = "a".repeat(480);
    const longUrl = `https://${HOST}/${longPath}.jpg`;
    assert.ok(longUrl.length > 500, "test fixture must actually exceed 500 chars");
    const result = validateStaffPhotoUrl(longUrl, HOST);
    assert.equal(result.code, "photo_invalid");
  });

  test("accepts a URL at exactly 500 characters", () => {
    const base = `https://${HOST}/`;
    const padding = "a".repeat(500 - base.length);
    const exactUrl = base + padding;
    assert.equal(exactUrl.length, 500);
    assert.equal(validateStaffPhotoUrl(exactUrl, HOST), null);
  });

  test("rejects a URL on a different host than the upload helper produces", () => {
    const result = validateStaffPhotoUrl("https://evil.example.com/x.jpg", HOST);
    assert.equal(result.code, "photo_invalid");
  });

  test("rejects a malformed URL that fails to parse", () => {
    const result = validateStaffPhotoUrl("not a url at all", HOST);
    assert.equal(result.code, "photo_invalid");
  });

  test("when allowedHost is null (env not resolvable), host is not checked -- only scheme/length", () => {
    assert.equal(validateStaffPhotoUrl(VALID_URL, null), null);
    assert.equal(validateStaffPhotoUrl("https://any-host.example.com/x.jpg", null), null);
  });
});
