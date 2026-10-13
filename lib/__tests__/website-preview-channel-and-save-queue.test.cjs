const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const channel = require("../website-preview-channel.ts");
const { createDraftSaveQueue } = require("../draft-save-queue.ts");

test("website preview channel accepts only the expected message shapes", () => {
  assert.equal(channel.isWebsitePreviewMessage({ source: channel.WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "ready" }), true);
  assert.equal(channel.isWebsitePreviewMessage({ source: channel.WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "page", websiteId: "w1", pageSlug: "home" }), true);
  assert.equal(channel.isWebsitePreviewMessage({ source: channel.WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "draft", websiteId: "w1", pageSlug: "home", content: {} }), true);
  assert.equal(channel.isWebsitePreviewMessage({ source: channel.WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "draft", websiteId: "w1", pageSlug: "home", content: [] }), false);
  assert.equal(channel.isWebsitePreviewMessage({ source: "invitation-preview", kind: "ready" }), false);
  assert.equal(channel.isSameOriginWebsitePreviewMessage("https://app.test", "https://app.test"), true);
  assert.equal(channel.isSameOriginWebsitePreviewMessage("https://evil.test", "https://app.test"), false);
});

test("opt-in stale-draft mode pauses saves and retains the queued local payload until reset", async () => {
  const sent = [];
  let release;
  const firstSave = new Promise((resolve) => { release = resolve; });
  const queue = createDraftSaveQueue(async (payload) => {
    sent.push(payload);
    if (payload === "first") return firstSave;
    return { ok: true };
  }, { pauseOnStaleDraft: true });

  queue.request("first");
  await new Promise((resolve) => setImmediate(resolve));
  queue.request("latest-local-edit");
  release({ ok: false, code: "STALE_DRAFT", error: "conflict" });
  await queue.flush();
  assert.deepEqual(sent, ["first"]);
  assert.equal(queue.getState().paused, true);
  assert.equal(queue.getState().pending, true);
  queue.resetAfterReload();
  assert.deepEqual(queue.getState(), { status: "idle", error: null, pending: false });
  assert.deepEqual(sent, ["first"], "reset must not replay stale local edits");
});

test("draft queue default still drains after an ordinary or stale failure", async () => {
  const sent = [];
  const queue = createDraftSaveQueue(async (payload) => {
    sent.push(payload);
    return payload === "first" ? { ok: false, code: "STALE_DRAFT", error: "conflict" } : { ok: true };
  });
  queue.request("first");
  queue.request("second");
  await queue.flush();
  assert.deepEqual(sent, ["first", "second"]);
  assert.equal(Object.hasOwn(queue.getState(), "paused"), false, "invitation queue state shape stays unchanged by default");
});
