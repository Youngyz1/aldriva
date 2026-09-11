/**
 * Regression tests for uploadGuestPortrait's storage-failure path.
 *
 * Previous bug: when the Supabase Storage upload errored (e.g. the
 * guest-images bucket did not exist), the function returned
 * `{ success: true, imageUrl: "/api/storage/guest-images/..." }` — a URL
 * pointing at a route that does not exist anywhere in the repo, while
 * reporting success. Callers storing that URL ended up with a 404.
 *
 * Fixed: storage errors now return success:false with the error surfaced,
 * so callers can retry or report instead of persisting a dead URL.
 *
 * Uses an injected mock admin client — no network, no production writes.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/supabase-admin") {
    // Import-time only: every test injects its own admin client argument.
    return { createSupabaseAdmin: () => { throw new Error("must inject adminClient"); } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

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

const { uploadGuestPortrait } = require("../image-processing.ts");

// Minimal valid JPEG head (FF D8 FF) — passes validateImageMagicBytes.
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

function mockAdmin(uploadResult) {
  return {
    storage: {
      from: () => ({
        upload: async () => uploadResult,
        getPublicUrl: (filename) => ({ data: { publicUrl: `https://cdn.example/${filename}` } }),
      }),
    },
  };
}

test("storage failure returns success:false, never a phantom URL", async () => {
  const res = await uploadGuestPortrait(
    "event-1",
    "guest-1",
    JPEG_HEAD,
    mockAdmin({ data: null, error: { message: "Bucket not found" } })
  );
  assert.equal(res.success, false);
  assert.ok(res.error, "error must be surfaced to the caller");
  assert.equal(res.imageUrl, undefined, "no URL may be returned for a failed upload");
});

test("successful upload still returns the public URL", async () => {
  const res = await uploadGuestPortrait(
    "event-1",
    "guest-1",
    JPEG_HEAD,
    mockAdmin({ data: { path: "x" }, error: null })
  );
  assert.equal(res.success, true);
  assert.match(res.imageUrl ?? "", /^https:\/\/cdn\.example\//);
});

test("invalid bytes are rejected before any storage call", async () => {
  let uploadCalls = 0;
  const admin = mockAdmin({ data: { path: "x" }, error: null });
  const origFrom = admin.storage.from;
  admin.storage.from = (...args) => {
    uploadCalls += 1;
    return origFrom(...args);
  };
  const res = await uploadGuestPortrait("event-1", "guest-1", Buffer.from("<html>"), admin);
  assert.equal(res.success, false);
  assert.equal(uploadCalls, 0, "rejected bytes must never reach storage");
});
