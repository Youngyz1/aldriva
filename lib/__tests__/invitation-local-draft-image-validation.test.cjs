/**
 * lib/__tests__/invitation-local-draft-image-validation.test.cjs
 *
 * Unit tests for validateLocalImageFile (lib/invitation-local-draft.ts),
 * added for layer8-step2: add-time type/size validation before a file
 * enters the anonymous builder's local-draft blob map
 * (components/invitation/useLocalInvitationBuilderAdapters.ts).
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

const { validateLocalImageFile } = require("@/lib/invitation-local-draft.ts");
const { MAX_ORIGINAL_BYTES, ALLOWED_IMAGE_TYPES } = require("@/lib/imageCompression.ts");

describe("validateLocalImageFile", () => {
  test("accepts a valid JPEG within the size limit", () => {
    assert.strictEqual(validateLocalImageFile({ type: "image/jpeg", size: 1024 * 1024 }), null);
  });

  test("accepts every allowed MIME type", () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      assert.strictEqual(validateLocalImageFile({ type, size: 1024 }), null);
    }
  });

  test("rejects an unsupported type (gif)", () => {
    assert.strictEqual(validateLocalImageFile({ type: "image/gif", size: 1024 }), "invalid_type");
  });

  test("rejects a file over MAX_ORIGINAL_BYTES", () => {
    assert.strictEqual(
      validateLocalImageFile({ type: "image/jpeg", size: MAX_ORIGINAL_BYTES + 1 }),
      "too_large"
    );
  });

  test("boundary: exactly MAX_ORIGINAL_BYTES is accepted", () => {
    assert.strictEqual(validateLocalImageFile({ type: "image/jpeg", size: MAX_ORIGINAL_BYTES }), null);
  });

  test("boundary: one byte over MAX_ORIGINAL_BYTES is rejected", () => {
    assert.strictEqual(
      validateLocalImageFile({ type: "image/png", size: MAX_ORIGINAL_BYTES + 1 }),
      "too_large"
    );
  });

  test("type check runs before size check (wrong type AND oversized -> invalid_type)", () => {
    assert.strictEqual(
      validateLocalImageFile({ type: "image/gif", size: MAX_ORIGINAL_BYTES + 1 }),
      "invalid_type"
    );
  });
});
