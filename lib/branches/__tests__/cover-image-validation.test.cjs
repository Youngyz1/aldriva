/**
 * lib/branches/__tests__/cover-image-validation.test.cjs
 *
 * Pure unit tests for validateBranchCoverImageUrl: no I/O, no network, no
 * DB. allowedHost is controlled via NEXT_PUBLIC_SUPABASE_URL (restored
 * after each test) since validateBranchCoverImageUrl delegates to
 * validateStaffPhotoUrl's default parameter rather than taking a host
 * argument itself.
 */
const { test, describe, before, after } = require("node:test");
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

const HOST = "example-project.supabase.co";
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

before(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${HOST}`;
});

after(() => {
  if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
});

const { validateBranchCoverImageUrl } = require("@/lib/branches/cover-image-validation.ts");

const VALID_URL = `https://${HOST}/storage/v1/object/public/fundraiser-media/branch-covers/abc.jpg`;

describe("validateBranchCoverImageUrl", () => {
  test("a valid https URL on the allowed host is accepted", () => {
    const result = validateBranchCoverImageUrl(VALID_URL);
    assert.equal(result.error, null);
    assert.equal(result.value, VALID_URL);
  });

  test("rejects http:// (not https)", () => {
    const result = validateBranchCoverImageUrl(`http://${HOST}/x.jpg`);
    assert.ok(result.error);
    assert.equal(result.error.code, "photo_invalid");
    assert.equal(result.value, null);
  });

  test("rejects a URL on a different host than the upload helper produces", () => {
    const result = validateBranchCoverImageUrl("https://evil.example.com/x.jpg");
    assert.ok(result.error);
    assert.equal(result.error.code, "photo_invalid");
  });

  test("rejects a URL over 500 characters", () => {
    const longPath = "a".repeat(480);
    const longUrl = `https://${HOST}/${longPath}.jpg`;
    assert.ok(longUrl.length > 500, "test fixture must actually exceed 500 chars");
    const result = validateBranchCoverImageUrl(longUrl);
    assert.ok(result.error);
    assert.equal(result.error.code, "photo_invalid");
  });

  test("rejects plain text that isn't a URL at all", () => {
    const result = validateBranchCoverImageUrl("not a url at all");
    assert.ok(result.error);
    assert.equal(result.error.code, "photo_invalid");
  });

  test("an empty string normalizes to null and is accepted (no cover image)", () => {
    const result = validateBranchCoverImageUrl("");
    assert.equal(result.error, null);
    assert.equal(result.value, null);
  });

  test("a whitespace-only string also normalizes to null", () => {
    const result = validateBranchCoverImageUrl("   ");
    assert.equal(result.error, null);
    assert.equal(result.value, null);
  });

  test("null (the remove control's payload) is accepted and stays null", () => {
    const result = validateBranchCoverImageUrl(null);
    assert.equal(result.error, null);
    assert.equal(result.value, null);
  });

  test("undefined is accepted and normalizes to null", () => {
    const result = validateBranchCoverImageUrl(undefined);
    assert.equal(result.error, null);
    assert.equal(result.value, null);
  });
});
