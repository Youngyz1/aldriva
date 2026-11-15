/**
 * lib/__tests__/evergreen-map-embed.test.cjs
 *
 * Unit tests for buildVenueMapEmbedUrl and buildVenueMapSearchUrl
 * (lib/evergreen-map.ts), added for layer7-step2 as part of the text-only
 * venue address falling back to an embeddable Google Maps iframe in
 * LocationMapBlock (components/invitation/blocks/InvitationPresentationBlocks.tsx).
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

const { buildVenueMapEmbedUrl, buildVenueMapSearchUrl } = require("@/lib/evergreen-map.ts");

describe("buildVenueMapEmbedUrl", () => {
  test("builds an output=embed query URL from a plain venue string", () => {
    assert.strictEqual(
      buildVenueMapEmbedUrl("Saint-Roch Catholic Church, Quebec City"),
      "https://www.google.com/maps?q=Saint-Roch%20Catholic%20Church%2C%20Quebec%20City&output=embed"
    );
  });

  test("URL-encodes special characters (&, #, accents, spaces)", () => {
    const url = buildVenueMapEmbedUrl("Café & Bar #1, Montréal");
    assert.match(url, /^https:\/\/www\.google\.com\/maps\?q=/);
    assert.ok(url.includes(encodeURIComponent("Café & Bar #1, Montréal")));
  });

  test("returns null for empty, whitespace-only, or null input", () => {
    assert.strictEqual(buildVenueMapEmbedUrl(""), null);
    assert.strictEqual(buildVenueMapEmbedUrl("   "), null);
    assert.strictEqual(buildVenueMapEmbedUrl(null), null);
    assert.strictEqual(buildVenueMapEmbedUrl(undefined), null);
  });

  test("trims surrounding whitespace before encoding", () => {
    assert.strictEqual(
      buildVenueMapEmbedUrl("  City Hall  "),
      "https://www.google.com/maps?q=City%20Hall&output=embed"
    );
  });
});

describe("buildVenueMapSearchUrl (link target reused for the Open-in-Maps anchor)", () => {
  test("builds a search URL from a single combined query passed as name, null address", () => {
    assert.strictEqual(
      buildVenueMapSearchUrl("555 Rue Saint-Francois E, Quebec City, Canada", null),
      "https://www.google.com/maps/search/?api=1&query=555%20Rue%20Saint-Francois%20E%2C%20Quebec%20City%2C%20Canada"
    );
  });

  test("returns null when both name and address are empty", () => {
    assert.strictEqual(buildVenueMapSearchUrl("", null), null);
    assert.strictEqual(buildVenueMapSearchUrl(null, null), null);
  });
});
