const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { sanitizeUrl } = require("../sanitize-url.ts");
require("../website-content.ts");

test("URL sanitizer preserves allowed URLs and rejects unsafe schemes", () => {
  for (const value of ["https://example.com", "mailto:hello@example.com", "/events", "#details"]) {
    assert.equal(sanitizeUrl(value), value);
  }

  for (const value of ["javascript:alert(1)", "data:text/html,unsafe", "//evil.example", "/\\evil.example"]) {
    assert.equal(sanitizeUrl(value), "");
  }
  assert.equal(sanitizeUrl("javascript:alert(1)", "/fallback"), "/fallback");
});

test("URL-only sanitizer does not load the HTML parser runtime", () => {
  const loadedRuntimePackages = Object.keys(require.cache).filter((filename) =>
    /[\\/]node_modules[\\/](?:isomorphic-dompurify|jsdom|html-encoding-sniffer|@exodus[\\/]bytes)(?:[\\/]|$)/i.test(filename)
  );
  assert.deepEqual(loadedRuntimePackages, [], "URL sanitization must not load DOMPurify or jsdom");
});
