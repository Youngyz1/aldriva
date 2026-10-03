/**
 * Stage 6 follow-up hermetic test: approval evidence write-time hygiene.
 *
 * sanitizeEvidenceArgs() (lib/ai/approvals.ts) must redact the raw JSON-arg
 * slice the orchestrator passes, using the same redactArgs() key allowlist
 * as the tool-invocation audit log. No database, no network.
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
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
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

const { sanitizeEvidenceArgs } = require("../approvals");

test("secret-shaped keys redacted, safe keys preserved", () => {
  const out = sanitizeEvidenceArgs({
    tool: "notifyOwner",
    args: JSON.stringify({ type: "x", title: "hi", api_key: "SECRET", password: "pw", limit: 5 }),
  });
  assert.equal(out.tool, "notifyOwner");
  assert.equal(out.args.api_key, "[redacted]");
  assert.equal(out.args.password, "[redacted]");
  assert.equal(out.args.type, "x");
  assert.equal(out.args.limit, 5);
});

test("long strings truncated, unparseable degrades to descriptor", () => {
  const long = "v".repeat(500);
  const out = sanitizeEvidenceArgs({ tool: "t", args: JSON.stringify({ q: long }) });
  assert.ok(out.args.q.length < 500 && out.args.q.includes("[truncated]"), "truncated, not raw");
  const bad = sanitizeEvidenceArgs({ tool: "t", args: "{not-json" });
  assert.ok(String(bad.args).startsWith("[unparseable args,"), "descriptor, never raw text");
});

test("missing/non-string args pass through untouched", () => {
  assert.deepEqual(sanitizeEvidenceArgs(undefined), {});
  assert.deepEqual(sanitizeEvidenceArgs({ tool: "t" }), { tool: "t" });
  const structured = { tool: "t", args: { already: "structured" } };
  assert.deepEqual(sanitizeEvidenceArgs(structured), structured);
});
