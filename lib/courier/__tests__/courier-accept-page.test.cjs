const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");

function loadCourierAcceptPage() {
  const filename = path.join(ROOT, "app/courier/accept/page.tsx");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, require);
  return compiledModule.exports.default;
}

test("mocked: courier accept captures its fragment once under React.StrictMode", async () => {
  const { JSDOM } = require("jsdom");
  const React = require("react");
  const token = "a".repeat(64);
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: `https://localhost/courier/accept#${token}`,
  });
  const globals = ["window", "document", "navigator", "HTMLElement", "Node"];
  const previousGlobals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const previousFetch = globalThis.fetch;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const calls = [];

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, value: dom.window.Node },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return { ok: true, status: 200, json: async () => ({ role: "courier" }) };
  };

  let root;
  try {
    const { createRoot } = require("react-dom/client");
    const CourierAcceptPage = loadCourierAcceptPage();
    root = createRoot(dom.window.document.getElementById("root"));
    await React.act(async () => {
      root.render(React.createElement(
        React.StrictMode,
        null,
        React.createElement(CourierAcceptPage),
      ));
      await new Promise((resolve) => setImmediate(resolve));
    });

    const bootstrapCalls = calls.filter((call) => call.url === "/api/courier/accept/bootstrap");
    assert.equal(bootstrapCalls.length, 1);
    assert.deepEqual(JSON.parse(bootstrapCalls[0].init.body), { token });
    assert.equal(calls.some((call) => call.url === "/api/courier/session"), false);
    assert.equal(dom.window.location.hash, "");
  } finally {
    if (root) await React.act(async () => root.unmount());
    dom.window.close();
    globalThis.fetch = previousFetch;
    if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("mocked: organizer sidebar and couriers labels have English and French keys", () => {
  for (const locale of ["en", "fr"]) {
    const messages = JSON.parse(fs.readFileSync(path.join(ROOT, `messages/${locale}.json`), "utf8"));
    assert.equal(typeof messages.Organizer.kitchen, "string");
    assert.equal(typeof messages.Organizer.couriers, "string");
  }
});
