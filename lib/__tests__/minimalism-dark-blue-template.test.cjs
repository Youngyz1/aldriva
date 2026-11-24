/**
 * lib/__tests__/minimalism-dark-blue-template.test.cjs
 *
 * Harness for MinimalismDarkBluePageTemplate (Step 4 of the
 * minimalism-dark-blue contract pass): mounts the real component at
 * 390/768/1100/1440 and asserts the scroll-lock rule this codebase has
 * already been bitten by once (commit ff7157ec5, "scope envelope scroll
 * lock to preview pane in local builder"): document.body and
 * document.documentElement must never be left with a mutated inline style,
 * the lock must scope to the device-frame's own `[data-testid="invitation-preview"]`
 * container when present, and cleanup must run on unmount even mid-gate.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8").replace(/^import ["']server-only["'];?\s*/m, "");
    const output = ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}
require.extensions[".tsx"] = function compileTsx(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const VIEWPORTS = [390, 768, 1100, 1440];

function baseLayout() {
  return {
    version: 1,
    global_theme: { preset: "wedding", classes: {}, text_scale: 1 },
    layout_blocks: [
      { id: "gate", type: "interactive_envelope", content: {} },
      { id: "hero", type: "romantic_hero", content: {} },
    ],
    effects: [{ type: "envelope-reveal", enabled: true, transitionDurationMs: 300 }],
    template_data: {},
  };
}

function baseData() {
  return {
    title: "Vincent & Marie-Ève",
    eventDate: "2027-04-07T19:00:00Z",
    locale: "en",
    timezone: "America/Toronto",
    partner1Name: "Vincent",
    partner2Name: "Marie-Ève",
    guest: { name: "", rsvpStatus: "pending" },
    token: "x".repeat(64),
  };
}

async function mountInJsdom({ width, withPreviewPane, mode }) {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    withPreviewPane
      ? `<!doctype html><html><body><div id="frame"><div data-testid="invitation-preview"><div id="root"></div></div></div></body></html>`
      : `<!doctype html><html><body><div id="root"></div></body></html>`,
    { pretendToBeVisual: true, url: "http://localhost/" }
  );
  dom.window.innerWidth = width;
  dom.window.matchMedia = dom.window.matchMedia || ((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));

  const oldGlobals = {};
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self", "IS_REACT_ACT_ENVIRONMENT"]) {
    oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  }
  const originalLoad = Module._load;
  let root;

  try {
    Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: dom.window });
    Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: dom.window.navigator });
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, writable: true, value: dom.window.HTMLElement });
    Object.defineProperty(globalThis, "Element", { configurable: true, writable: true, value: dom.window.Element });
    Object.defineProperty(globalThis, "Node", { configurable: true, writable: true, value: dom.window.Node });
    Object.defineProperty(globalThis, "Event", { configurable: true, writable: true, value: dom.window.Event });
    Object.defineProperty(globalThis, "self", { configurable: true, writable: true, value: dom.window });
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });

    Module._load = function mockModules(request, parent, isMain) {
      if (request === "next-intl") {
        return {
          useTranslations: () => (key, values) => {
            if (!values) return key;
            return Object.entries(values).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), key);
          },
        };
      }
      if (request === "next/font/google") {
        // next/font/google only works through Next's real SWC build pipeline; outside
        // it the raw package export throws. Stub every named export as a function
        // returning a plausible font config object, same shape the real loader gives.
        return new Proxy(
          {},
          {
            get: (_target, fontName) => (options = {}) => ({
              className: `mock-font-${String(fontName)}`,
              variable: options.variable ?? `--font-mock-${String(fontName)}`,
              style: { fontFamily: String(fontName) },
            }),
          }
        );
      }
      if (request === "next/image") {
        return {
          __esModule: true,
          default: (props) => require("react").createElement("img", { ...props, alt: props.alt ?? "" }),
        };
      }
      if (request === "motion/react" || request === "motion") {
        const React = require("react");
        const motionDiv = (props) => React.createElement("div", props);
        return {
          __esModule: true,
          motion: { div: motionDiv },
          useReducedMotion: () => false,
          default: { div: motionDiv },
        };
      }
      if (request === "react-wrap-balancer") {
        const React = require("react");
        const Balancer = (props) => React.createElement(React.Fragment, null, props.children);
        return {
          __esModule: true,
          default: Balancer,
          Balancer,
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const React = require("react");
    const { createRoot } = require("react-dom/client");
    // Clear cached component/motion modules so the Module._load mock below is
    // actually consulted (a prior test in the same process may have cached them).
    for (const key of Object.keys(require.cache)) {
      if (key.includes("MinimalismDarkBluePageTemplate") ||
          key.includes("MinimalismHero") ||
          key.includes("HeroCollage") ||
          key.includes("motion") ||
          key.includes("react-wrap-balancer")) {
        delete require.cache[key];
      }
    }
    const { MinimalismDarkBluePageTemplate } = require(
      path.join(ROOT, "components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx")
    );

    root = createRoot(dom.window.document.getElementById("root"));
    await React.act(async () => {
      root.render(
        React.createElement(MinimalismDarkBluePageTemplate, {
          layout: baseLayout(),
          data: baseData(),
          children: null,
          mode: mode ?? "live",
          isEditMode: false,
        })
      );
    });

    return { dom, root, React };
  } catch (error) {
    if (root) await require("react").act(async () => root.unmount());
    Module._load = originalLoad;
    for (const [key, descriptor] of Object.entries(oldGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    throw error;
  }
}

function restoreGlobals(oldGlobals, originalLoad, dom) {
  Module._load = originalLoad;
  for (const [key, descriptor] of Object.entries(oldGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  dom.window.close();
}

describe("MinimalismDarkBluePageTemplate — scroll lock, cleanup, and gate at every viewport", () => {
  for (const width of VIEWPORTS) {
    test(`at ${width}px: lock scopes to the preview pane, never document.body/html, and releases on Open`, async () => {
      const oldGlobals = {};
      for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self", "IS_REACT_ACT_ENVIRONMENT"]) {
        oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
      }
      const originalLoad = Module._load;
      const { dom, root, React } = await mountInJsdom({ width, withPreviewPane: true, mode: "preview" });

      try {
        const doc = dom.window.document;
        const previewPane = doc.querySelector('[data-testid="invitation-preview"]');

        assert.equal(doc.body.style.overflow, "", "document.body must be untouched when a preview-pane ancestor exists");
        assert.equal(doc.documentElement.style.overflow, "", "document.documentElement must never be touched");
        assert.equal(previewPane.style.overflow, "hidden", "the preview pane itself is the scroll-lock target while the gate is showing");

        const openButton = Array.from(doc.querySelectorAll("button")).find((el) => el.textContent === "minimalismOpenButton");
        assert.ok(openButton, "Open button renders");
        await React.act(async () => {
          openButton.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
        });
        // Open triggers the fly-away animation (spec §3.1) before the gate actually closes — wait it out.
        await React.act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 650));
        });

        assert.equal(previewPane.style.overflow, "", "lock releases once the gate is opened");
        assert.equal(doc.body.style.overflow, "", "document.body remains untouched after opening");

        const skipGate = Array.from(doc.querySelectorAll("button")).find((el) => el.textContent === "minimalismSkipGate");
        assert.equal(skipGate, undefined, "skip-gate control is gone once the gate is already open");
      } finally {
        await React.act(async () => root.unmount());
        restoreGlobals(oldGlobals, originalLoad, dom);
      }
    });

    test(`at ${width}px: unmounting mid-gate still releases the lock (cleanup runs on unmount)`, async () => {
      const oldGlobals = {};
      for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self", "IS_REACT_ACT_ENVIRONMENT"]) {
        oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
      }
      const originalLoad = Module._load;
      const { dom, root, React } = await mountInJsdom({ width, withPreviewPane: true, mode: "preview" });

      try {
        const doc = dom.window.document;
        const previewPane = doc.querySelector('[data-testid="invitation-preview"]');
        assert.equal(previewPane.style.overflow, "hidden", "sanity check: lock is applied before unmount");

        await React.act(async () => root.unmount());
        assert.equal(previewPane.style.overflow, "", "unmounting while the gate is still showing must still release the lock");
        assert.equal(doc.body.style.overflow, "", "document.body stays untouched through an unmount mid-gate");
      } finally {
        restoreGlobals(oldGlobals, originalLoad, dom);
      }
    });

    test(`at ${width}px: falls back to document.body only when no preview-pane ancestor exists (real guest page)`, async () => {
      const oldGlobals = {};
      for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self", "IS_REACT_ACT_ENVIRONMENT"]) {
        oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
      }
      const originalLoad = Module._load;
      const { dom, root, React } = await mountInJsdom({ width, withPreviewPane: false, mode: "live" });

      try {
        const doc = dom.window.document;
        assert.equal(doc.body.style.overflow, "hidden", "document.body is the correct fallback target on the real guest page (no preview pane)");
        assert.equal(doc.documentElement.style.overflow, "", "document.documentElement is still never touched");

        const skipGate = Array.from(doc.querySelectorAll("button")).find((el) => el.textContent === "minimalismSkipGate");
        assert.equal(skipGate, undefined, "skip-gate control never renders outside preview mode");

        await React.act(async () => root.unmount());
        assert.equal(doc.body.style.overflow, "", "document.body is restored after unmount");
      } finally {
        restoreGlobals(oldGlobals, originalLoad, dom);
      }
    });
  }
});
