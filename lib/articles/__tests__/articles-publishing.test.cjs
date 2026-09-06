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

const { sanitizeArticleHtml } = require("@/lib/sanitize-html");
const { ARTICLE_TEMPLATES, getTemplateById } = require("@/lib/article-templates");

test("ARTICLE_TEMPLATES defines all expected editorial templates", () => {
  assert.equal(ARTICLE_TEMPLATES.length, 5);
  const ids = ARTICLE_TEMPLATES.map((t) => t.id);
  assert.deepEqual(ids, [
    "organization_update",
    "fundraising_story",
    "event_recap",
    "impact_story",
    "announcement",
  ]);

  for (const template of ARTICLE_TEMPLATES) {
    assert.ok(template.name.length > 0);
    assert.ok(template.description.length > 0);
    assert.ok(template.defaultCategories.length > 0);
    assert.ok(template.defaultBodyHtml.length > 0);
    assert.ok(Array.isArray(template.defaultTags));
  }
});

test("getTemplateById retrieves correct template and handles missing IDs", () => {
  const t1 = getTemplateById("fundraising_story");
  assert.ok(t1);
  assert.equal(t1.name, "Fundraising Story");

  const tUnknown = getTemplateById("non_existent_template");
  assert.equal(tUnknown, undefined);
});

test("sanitizeArticleHtml allows legitimate publishing tags and entity metadata attributes", () => {
  const rawHtml = `
    <h2>Campaign Story</h2>
    <p>This is a story about our latest community impact.</p>
    <div class="aldriva-callout" data-callout-type="info">Important update notice</div>
    <div class="aldriva-entity-embed" data-entity-type="fundraiser" data-entity-id="f-123" data-entity-slug="clean-water" data-entity-title="Clean Water Initiative">
      <a href="/fundraisers/clean-water">Clean Water Initiative</a>
    </div>
  `;

  const sanitized = sanitizeArticleHtml(rawHtml);
  assert.ok(sanitized.includes('data-entity-type="fundraiser"'));
  assert.ok(sanitized.includes('data-entity-id="f-123"'));
  assert.ok(sanitized.includes('data-entity-slug="clean-water"'));
  assert.ok(sanitized.includes('data-entity-title="Clean Water Initiative"'));
  assert.ok(sanitized.includes('data-callout-type="info"'));
  assert.ok(sanitized.includes('class="aldriva-callout"'));
});

test("sanitizeArticleHtml strips dangerous scripts, event handlers, and javascript URIs", () => {
  const maliciousHtml = `
    <p>Harmless paragraph</p>
    <script>alert('xss')</script>
    <img src="x" onerror="alert(1)" />
    <a href="javascript:alert(1)">Click me</a>
  `;

  const sanitized = sanitizeArticleHtml(maliciousHtml);
  assert.ok(!sanitized.includes("<script>"));
  assert.ok(!sanitized.includes("onerror"));
  assert.ok(!sanitized.includes("javascript:"));
  assert.ok(sanitized.includes("<p>Harmless paragraph</p>"));
});
