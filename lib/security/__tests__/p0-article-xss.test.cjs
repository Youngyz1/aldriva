/**
 * P0 F-02 regression tests: shared article HTML sanitizer.
 *
 * Previous exposure: ArticleContentRenderer rendered stored article bodies
 * via dangerouslySetInnerHTML with no sanitization, and the write path
 * persisted raw HTML — any authenticated user could store executable markup
 * that ran in every reader's (and reviewer's) browser.
 * Fixed: lib/sanitize-html.ts (used at write time in lib/actions/articles.ts
 * and defensively at render time in ArticleContentRenderer).
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
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

const { sanitizeArticleHtml } = require("../../../lib/sanitize-html.ts");

test("img onerror payload cannot execute", () => {
  const out = sanitizeArticleHtml('<p>Hello</p><img src=x onerror=alert(1)>');
  assert.ok(!out.includes("onerror"), "event handler must be stripped");
  assert.ok(out.includes("Hello"), "benign text must survive");
});

test("svg onload payload cannot execute", () => {
  const out = sanitizeArticleHtml('<svg onload=alert(1)><circle r=10 /></svg>');
  assert.ok(!out.toLowerCase().includes("<svg"), "svg must be stripped");
  assert.ok(!out.includes("onload"), "event handler must be stripped");
});

test("script tags are removed", () => {
  const out = sanitizeArticleHtml('<p>Story</p><script>alert(1)</script>');
  assert.ok(!out.toLowerCase().includes("<script"), "script must be stripped");
  assert.ok(!out.includes("alert(1)"), "script body must be stripped");
  assert.ok(out.includes("Story"), "benign text must survive");
});

test("javascript: link URLs are neutralized", () => {
  const out = sanitizeArticleHtml('<a href="javascript:alert(1)">test</a>');
  assert.ok(!out.includes("javascript:"), "dangerous scheme must be stripped");
});

test("iframe/object/embed abuse is removed", () => {
  const out = sanitizeArticleHtml(
    '<p>Body</p><iframe src="https://evil.example"></iframe><object data="x"></object><embed src="y">'
  );
  assert.ok(!out.toLowerCase().includes("<iframe"), "iframe must be stripped");
  assert.ok(!out.toLowerCase().includes("<object"), "object must be stripped");
  assert.ok(!out.toLowerCase().includes("<embed"), "embed must be stripped");
  assert.ok(out.includes("Body"), "benign text must survive");
});

test("legitimate article formatting is preserved", () => {
  const input =
    '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text with ' +
    '<a href="https://example.com">a link</a>.</p><ul><li>one</li><li>two</li></ul>' +
    '<blockquote>quote</blockquote><img src="https://example.com/pic.jpg" alt="pic">';
  const out = sanitizeArticleHtml(input);
  for (const tag of ["<h2>", "<strong>", "<em>", "<ul>", "<blockquote>", "<img"]) {
    assert.ok(out.includes(tag), `expected ${tag} to survive`);
  }
  assert.ok(out.includes('href="https://example.com"'), "safe link must survive");
});

test("data-paragraph-index annotation survives sanitization", () => {
  const out = sanitizeArticleHtml('<p data-paragraph-index="3">spoken</p>');
  assert.ok(out.includes('data-paragraph-index="3"'), "renderer annotation must survive");
  assert.ok(out.includes("spoken"), "text must survive");
});

test("non-string input fails closed to empty string", () => {
  assert.equal(sanitizeArticleHtml(null), "");
  assert.equal(sanitizeArticleHtml(undefined), "");
  assert.equal(sanitizeArticleHtml(42), "");
});
