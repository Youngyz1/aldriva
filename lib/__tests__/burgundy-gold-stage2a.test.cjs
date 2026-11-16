/**
 * lib/__tests__/burgundy-gold-stage2a.test.cjs
 *
 * Stage 2A coverage for the Burgundy Gold renderer: byte-identical asset
 * intake, template-root-scoped backdrop, scroll-locked opening gate, the
 * Africa/Dakar date block, and image-alt hygiene.
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const ASSET_DIR = path.join(ROOT, "public/images/invitations/burgundy-gold");
const RENDERER_PATH = path.join(
  ROOT,
  "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx"
);
const RENDERER_SOURCE = fs.readFileSync(RENDERER_PATH, "utf8");
const SOURCES_PATH = path.join(ASSET_DIR, "SOURCES.md");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

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
if (!require.extensions[".tsx"]) {
  require.extensions[".tsx"] = function compileTsx(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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
}

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function baseLayout() {
  return {
    version: 1,
    global_theme: { preset: "wedding", classes: {}, text_scale: 1 },
    layout_blocks: [{ id: "details", type: "details", content: {} }],
    effects: [],
    template_data: {},
  };
}

function baseData() {
  return {
    locale: "en",
    title: "Our Wedding",
    eyebrow: "The wedding of",
    eventDate: "2027-10-16T18:00:00Z",
    timezone: "Africa/Dakar",
    partner1Name: "Modou Gueye",
    partner2Name: "Ndeye Sarr",
    invitationLine: "Together with their families, invite you to celebrate their marriage.",
    openingMessage: "Welcome to our celebration.",
    openingPhoto: "/images/invitations/burgundy-gold/demo/opening-photo.jpg",
    parentOneLabel: "Mr. and Mrs.",
    parentOneNameOne: "Abdoulaye Gueye",
    parentOneNameTwo: "Fatou Gueye",
    parentTwoLabel: "Mr. and Mrs.",
    parentTwoNameOne: "Ousmane Sarr",
    parentTwoNameTwo: "Aminata Sarr",
    venue: "Cathedrale du Souvenir Africain",
    address: "Dakar",
    city: "Dakar",
    venues: [
      { label: "Ceremony", name: "Cathedrale du Souvenir Africain", time: "18:00" },
      { label: "Reception", name: "Espace Point E", time: "19:30" },
    ],
    guest: { name: "Honored Guest", rsvpStatus: "pending", isVip: false },
    token: "preview-sample-token",
  };
}

async function mountInJsdom({ withPreviewPane = false } = {}) {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    withPreviewPane
      ? `<!doctype html><html><body><div data-testid="invitation-preview"><div id="root"></div></div></body></html>`
      : `<!doctype html><html><body><div id="root"></div></body></html>`,
    { pretendToBeVisual: true, url: "http://localhost/" }
  );

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
      if (request === "next/font/google") {
        return new Proxy({}, {
          get: (_target, fontName) => (options = {}) => ({
            className: `mock-font-${String(fontName)}`,
            variable: options.variable ?? `--font-mock-${String(fontName)}`,
            style: { fontFamily: String(fontName) },
          }),
        });
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    for (const key of Object.keys(require.cache)) {
      if (key.includes("BurgundyGoldPageTemplate") || key.includes("BurgundyGoldOrnaments")) {
        delete require.cache[key];
      }
    }

    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const { BurgundyGoldPageTemplate } = require(RENDERER_PATH);

    root = createRoot(dom.window.document.getElementById("root"));
    await React.act(async () => {
      root.render(
        React.createElement(BurgundyGoldPageTemplate, {
          layout: baseLayout(),
          data: baseData(),
          children: null,
          mode: "live",
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

describe("Burgundy Gold — supplied assets", () => {
  test("every served SOURCES.md row exists byte-identically with the recorded SHA-256", () => {
    const sources = fs.readFileSync(SOURCES_PATH, "utf8");
    const served = sources.split(/^##\s+/m).find((section) => section.startsWith("Served assets"));
    assert.ok(served, "SOURCES.md declares a served-assets section");
    const rows = [...served.matchAll(/^\| `([^`]+)` \| (\d+) \| [^|]+ \| `([A-Fa-f0-9]{64})` \|/gm)];
    assert.equal(rows.length, 1, "only the demo placeholder may be served from public/");

    for (const [, name, sizeText, expectedHash] of rows) {
      const filePath = path.join(ASSET_DIR, name);
      assert.ok(fs.existsSync(filePath), `${name} exists in public/`);
      assert.equal(fs.statSync(filePath).size, Number(sizeText), `${name} byte size matches SOURCES.md`);
      assert.equal(sha256(filePath), expectedHash.toUpperCase(), `${name} SHA-256 matches SOURCES.md`);
    }
  });

  test("the eight reference captures are documented as reference-only, not served", () => {
    const sources = fs.readFileSync(SOURCES_PATH, "utf8");
    const reference = sources.split(/^##\s+/m).find((section) => section.startsWith("Supplied reference captures"));
    assert.ok(reference, "SOURCES.md documents the reference captures separately");
    const names = [...reference.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
    assert.equal(names.length, 8, "all eight owner-supplied captures are recorded");
    assert.match(reference, /NOT served/i);
  });

  test("the supplied reference captures are not used as visible page imagery", () => {
    const code = withoutComments(RENDERER_SOURCE);
    assert.doesNotMatch(code, /iphone\.png|Screenshot 2026-11-15/);
    assert.doesNotMatch(code, /invitation\.png/);
  });
});

describe("Burgundy Gold — scoped backdrop and text-only ornaments", () => {
  test("backdrop lives inside the template root and never touches document/body backgrounds", () => {
    const start = RENDERER_SOURCE.indexOf("data-burgundy-backdrop");
    assert.notEqual(start, -1, "the renderer declares a backdrop layer");
    const end = RENDERER_SOURCE.indexOf("/>", start);
    const block = RENDERER_SOURCE.slice(start, end + 2);

    assert.match(block, /absolute/, "backdrop is an absolute layer");
    assert.match(block, /inset-0/, "backdrop spans the root");
    assert.doesNotMatch(block, /document\./, "backdrop never touches document.*");
    assert.doesNotMatch(block, /backgroundAttachment/i, "no fixed attachment");
    assert.doesNotMatch(block, /100vh|100dvh|h-screen/i, "no viewport/screen height trap");

    const code = withoutComments(RENDERER_SOURCE);
    const bodyUses = code.match(/document\.body/g) ?? [];
    assert.equal(bodyUses.length, 1, "document.body appears only in the scroll-lock fallback");
    assert.match(code, /\?\?\s*document\.body\b/);
    assert.doesNotMatch(code, /document\.documentElement/);
    assert.doesNotMatch(code, /document\.body\.style\.(?:background|backgroundColor|backgroundImage|backgroundAttachment)/);

    const rootIndex = RENDERER_SOURCE.indexOf("data-burgundy-page");
    const backdropIndex = RENDERER_SOURCE.indexOf("data-burgundy-backdrop");
    const headerIndex = RENDERER_SOURCE.indexOf("<header");
    assert.ok(rootIndex >= 0 && backdropIndex > rootIndex && headerIndex > backdropIndex);
  });

  test("images carry no visible copy and there is no translate suppression", () => {
    const code = withoutComments(RENDERER_SOURCE);
    assert.doesNotMatch(code, /translate=/);
    assert.match(code, /data\.openingPhoto/);

    const imgTags = code.match(/<img\b[\s\S]*?\/>/g) ?? [];
    assert.equal(imgTags.length, 1, "the opening gate has exactly one image");
    for (const tag of imgTags) {
      assert.match(tag, /\balt=""/, "every image has an empty alt");
      assert.doesNotMatch(tag, /\balt="[^"]+"/, "no image alt carries visible copy");
    }
  });
});

describe("Burgundy Gold — opening gate and date block", () => {
  test("body scroll is locked while closed, released on open, and released on unmount", async () => {
    const oldGlobals = {};
    for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self", "IS_REACT_ACT_ENVIRONMENT"]) {
      oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }
    const originalLoad = Module._load;
    const { dom, root, React } = await mountInJsdom();

    try {
      const doc = dom.window.document;
      assert.equal(doc.body.style.overflow, "hidden", "closed opening gate locks body scroll");

      const openButton = Array.from(doc.querySelectorAll("button")).find((el) => el.textContent === "Open invitation");
      assert.ok(openButton, "Open invitation button renders");
      await React.act(async () => {
        openButton.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });

      assert.equal(doc.body.style.overflow, "", "opening releases the scroll lock");
      assert.ok(doc.querySelector("[data-burgundy-main]"), "the invitation body renders after opening");
    } finally {
      await React.act(async () => root.unmount());
      assert.equal(dom.window.document.body.style.overflow, "", "unmount leaves the body unlocked");
      restoreGlobals(oldGlobals, originalLoad, dom);
    }
  });

  test("unmounting mid-gate releases the lock", async () => {
    const oldGlobals = {};
    for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self", "IS_REACT_ACT_ENVIRONMENT"]) {
      oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }
    const originalLoad = Module._load;
    const { dom, root, React } = await mountInJsdom();

    try {
      assert.equal(dom.window.document.body.style.overflow, "hidden", "sanity: gate is locked");
    } finally {
      await React.act(async () => root.unmount());
      assert.equal(dom.window.document.body.style.overflow, "", "unmount mid-gate restores body scroll");
      restoreGlobals(oldGlobals, originalLoad, dom);
    }
  });

  test("2027-10-16 in Africa/Dakar renders the weekday | day | month year block", async () => {
    const oldGlobals = {};
    for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self", "IS_REACT_ACT_ENVIRONMENT"]) {
      oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }
    const originalLoad = Module._load;
    const { dom, root, React } = await mountInJsdom();

    try {
      const doc = dom.window.document;
      const openButton = Array.from(doc.querySelectorAll("button")).find((el) => el.textContent === "Open invitation");
      await React.act(async () => {
        openButton.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });

      const blocks = Array.from(doc.querySelectorAll("[data-burgundy-date-block]"));
      assert.ok(blocks.length >= 1, "at least one date block renders");

      const weekday = blocks[0].querySelector("[data-burgundy-date-weekday]");
      const day = blocks[0].querySelector("[data-burgundy-date-day]");
      const month = blocks[0].querySelector("[data-burgundy-date-month]");
      const year = blocks[0].querySelector("[data-burgundy-date-year]");
      assert.ok(weekday && day && month && year, "each date part renders in its own attributed element");
      assert.equal(weekday.textContent, "SATURDAY");
      assert.equal(day.textContent, "16");
      assert.equal(month.textContent, "OCTOBER");
      assert.equal(year.textContent, "2027");
      assert.equal(weekday.getAttribute("data-burgundy-date-weekday"), "SATURDAY");
      assert.equal(day.getAttribute("data-burgundy-date-day"), "16");
      assert.equal(month.getAttribute("data-burgundy-date-month"), "OCTOBER");
      assert.equal(year.getAttribute("data-burgundy-date-year"), "2027");

      const text = blocks[0].textContent;
      assert.doesNotMatch(text, /SATURDAY16|16OCTOBER|OCTOBER2027/, "date parts must not concatenate in textContent");
      assert.match(text, /SATURDAY\s+16\s+OCTOBER\s+2027/, "date parts stay space-separated");
    } finally {
      await React.act(async () => root.unmount());
      restoreGlobals(oldGlobals, originalLoad, dom);
    }
  });
});
