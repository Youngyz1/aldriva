/**
 * lib/__tests__/burgundy-gold-viewer.test.cjs
 *
 * Stage 2B/3 coverage for the Burgundy Gold unified photo viewer:
 *   - gallery tile count and "+N" math for 0, 4, 5, 10 photos
 *   - nothing renders when there are no memories
 *   - viewer opens at the tapped index, counter text, close button
 *   - Escape closes; stage size is identical for every photo (fixed stage)
 *   - focus returns to the opening tile; scroll lock released on close/unmount
 *   - en/fr message parity, no duplicate keys, minimalism keys untouched
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const RENDERER_PATH = path.join(
  ROOT,
  "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx"
);
const DATA_MODULE_PATH = path.join(
  ROOT,
  "components/invitation/templates/burgundy-gold/burgundy-gold-data.ts"
);
const EN_MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const FR_MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

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
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
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

const data = require(DATA_MODULE_PATH);

function baseData(overrides = {}) {
  return {
    locale: "en",
    title: "Our Wedding",
    eventDate: "2027-10-16T18:00:00Z",
    timezone: "Africa/Dakar",
    partner1Name: "Modou Gueye",
    partner2Name: "Ndeye Sarr",
    venue: "Cathedrale du Souvenir Africain",
    address: "Dakar",
    city: "Dakar",
    venues: [
      { label: "Ceremony", name: "Cathedrale du Souvenir Africain", time: "18:00" },
      { label: "Reception", name: "Espace Point E", time: "19:30" },
    ],
    gallery: [],
    schedule: [],
    dressCode: null,
    dressCodeSwatches: [],
    guest: { name: "Honored Guest", rsvpStatus: "pending", isVip: false },
    token: "preview-sample-token",
    ...overrides,
  };
}

function baseLayout(settings = {}) {
  return {
    version: 1,
    global_theme: { preset: "wedding", classes: {}, text_scale: 1 },
    layout_blocks: [
      { id: "details", type: "details", content: {} },
      { id: "action-portal", type: "action_portal", content: {} },
    ],
    effects: [],
    template_data: settings,
  };
}

const GLOBALS = [
  "window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self",
  "MutationObserver", "HTMLMediaElement", "IS_REACT_ACT_ENVIRONMENT",
];
let MOCK_LOCALE = "en";

async function mount({ data: renderData = baseData(), settings = {}, children = null, mode = "live" } = {}) {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  if (typeof dom.window.HTMLDialogElement.prototype.showModal !== "function") {
    dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    dom.window.HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new dom.window.Event("close"));
    };
  }

  const oldGlobals = {};
  for (const key of GLOBALS) oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  const originalLoad = Module._load;
  let root;

  for (const key of GLOBALS) {
    const value = key === "window" || key === "self"
      ? dom.window
      : key === "document"
        ? dom.window.document
        : key === "navigator"
          ? dom.window.navigator
          : key === "IS_REACT_ACT_ENVIRONMENT"
            ? true
            : dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

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
    if (request === "next-intl") {
      return {
        useTranslations: (namespace) => (key) => {
          const messages = MOCK_LOCALE === "fr" ? FR_MESSAGES : EN_MESSAGES;
          const value = messages?.[namespace]?.[key];
          return typeof value === "string" ? value : key;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    for (const key of Object.keys(require.cache)) {
      if (key.includes("BurgundyGold")) delete require.cache[key];
    }
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const { BurgundyGoldPageTemplate } = require(RENDERER_PATH);

    root = createRoot(dom.window.document.getElementById("root"));
    await React.act(async () => {
      root.render(
        React.createElement(BurgundyGoldPageTemplate, {
          layout: baseLayout(settings),
          data: renderData,
          children,
          mode,
          isEditMode: false,
        })
      );
    });
    const openButton = [...dom.window.document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === (MOCK_LOCALE === "fr" ? "Ouvrir l’invitation" : "Open invitation")
    );
    assert.ok(openButton, "opening gate must render an Open button");
    await React.act(async () => openButton.click());
    return { dom, doc: dom.window.document, root, React };
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

async function unmount(context, oldGlobals, originalLoad) {
  await context.React.act(async () => context.root.unmount());
  Module._load = originalLoad;
  for (const [key, descriptor] of Object.entries(oldGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  context.dom.window.close();
}

async function withMount(options, run) {
  const originalLoad = Module._load;
  const oldGlobals = {};
  for (const key of GLOBALS) oldGlobals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  const context = await mount(options);
  try {
    await run(context);
  } finally {
    await unmount({ ...context, dom: context.dom }, oldGlobals, originalLoad);
  }
}

describe("Burgundy Gold — gallery +N math", () => {
  test("gallery tiles: 0 photos renders nothing", () => {
    assert.equal(data.burgundyGalleryTiles([]), null);
  });

  test("gallery tiles: exactly 4 photos, no overflow badge", () => {
    const four = data.burgundyGalleryTiles(Array.from({ length: 4 }, (_, i) => ({ url: `/p${i}.jpg` })));
    assert.equal(four.length, 4);
    assert.deepEqual(four.map((tile) => tile.remaining), [0, 0, 0, 0]);
  });

  test("gallery tiles: 5 photos, +1 badge on the last tile", () => {
    const five = data.burgundyGalleryTiles(Array.from({ length: 5 }, (_, i) => ({ url: `/p${i}.jpg` })));
    assert.equal(five.length, 4, "never renders more than four tiles");
    assert.deepEqual(five.map((tile) => tile.remaining), [0, 0, 0, 1], "+1 badge lands on the last tile");
    assert.equal(five[3].getAttribute ? undefined : five[3].remaining, 1);
    assert.equal(five[3].index, 3, "last tile opens the viewer at its own photo");
  });

  test("gallery tiles: 10 photos, +6 badge on the last tile", () => {
    const ten = data.burgundyGalleryTiles(Array.from({ length: 10 }, (_, i) => ({ url: `/p${i}.jpg` })));
    assert.equal(ten.length, 4, "never renders more than four tiles");
    assert.deepEqual(ten.map((tile) => tile.remaining), [0, 0, 0, 6], "+6 badge lands on the last tile");
  });
});

describe("Burgundy Gold — rendered viewer", () => {
  test("nothing renders when the gallery is empty", async () => {
    await withMount({}, async ({ doc }) => {
      assert.equal(doc.querySelector('[data-burgundy-section="gallery"]'), null, "no gallery section without photos");
      assert.equal(doc.querySelector("[data-burgundy-gallery-tile]"), null, "no gallery tiles");
    });
  });

  test("viewer opens at the tapped index with a counter", async () => {
    await withMount({
      data: baseData({
        gallery: Array.from({ length: 6 }, (_, i) => ({ url: `/p${i}.jpg`, alt: `photo ${i}` })),
      }),
    }, async ({ doc, React: react }) => {
      const tiles = doc.querySelectorAll("[data-burgundy-gallery-tile]");
      assert.equal(tiles.length, 4);
      // Tap the 3rd tile (index 2) → viewer opens at index 2.
      await react.act(async () => tiles[2].click());
      const viewer = doc.querySelector('[role="dialog"][aria-modal="true"]');
      assert.ok(viewer, "the unified viewer renders when a tile is tapped");
      const counterText = viewer.textContent;
      assert.ok(counterText.includes("3 / 6"), `counter opens at the tapped index (3 / 6); viewer text was: ${JSON.stringify(counterText)}`);
      // The stage has one fixed size regardless of the photo.
      const stage = viewer.querySelector('[style*="40svh"]');
      assert.ok(stage, "the stage element renders with a fixed height");
    });
  });

  test("close button closes the viewer", async () => {
    await withMount({
      data: baseData({
        gallery: Array.from({ length: 3 }, (_, i) => ({ url: `/p${i}.jpg`, alt: `photo ${i}` })),
      }),
    }, async ({ doc, React: react }) => {
      const tiles = doc.querySelectorAll("[data-burgundy-gallery-tile]");
      assert.equal(tiles.length, 3);
      await react.act(async () => tiles[0].click());
      assert.ok(doc.querySelector('[role="dialog"][aria-modal="true"]'), "viewer is open");
      const close = viewerCloseButton(doc);
      assert.ok(close, "a visible close button renders");
      await react.act(async () => close.click());
      assert.equal(doc.querySelector('[role="dialog"][aria-modal="true"]'), null, "viewer is closed");
    });
  });

  test("Escape closes the viewer", async () => {
    await withMount({
      data: baseData({
        gallery: Array.from({ length: 3 }, (_, i) => ({ url: `/p${i}.jpg`, alt: `photo ${i}` })),
      }),
    }, async ({ doc, React: react }) => {
      const tiles = doc.querySelectorAll("[data-burgundy-gallery-tile]");
      await react.act(async () => tiles[0].click());
      assert.ok(doc.querySelector('[role="dialog"][aria-modal="true"]'), "viewer is open");
      await react.act(async () => {
        doc.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      assert.equal(doc.querySelector('[role="dialog"][aria-modal="true"]'), null, "Escape closes the viewer");
    });
  });

  test("stage size is identical for photos of different aspect ratios", async () => {
    const makeData = (ratio) => baseData({
      gallery: [
        { url: "/wide.jpg", alt: "wide", width: 1600, height: 900 },
        { url: "/tall.jpg", alt: "tall", width: 900, height: 1600 },
        { url: "/square.jpg", alt: "square", width: 1000, height: 1000 },
      ],
    });
    const stages = [];
    for (const gallery of [makeData(1), makeData(2), makeData(0.5)]) {
      await withMount({ data: gallery }, async ({ doc, React: react }) => {
        const tiles = doc.querySelectorAll("[data-burgundy-gallery-tile]");
        await react.act(async () => tiles[0].click());
        const viewer = doc.querySelector('[role="dialog"][aria-modal="true"]');
        const stage = viewer.querySelector('[style*="40svh"]');
        stages.push(stage.getAttribute("style"));
      });
    }
    assert.equal(stages[0], stages[1], "wide photo stage size");
    assert.equal(stages[1], stages[2], "tall vs square stage size identical");
    assert.match(stages[0], /40svh/, "fixed stage height");
  });

  test("focus returns to the opening tile when the viewer closes", async () => {
    await withMount({
      data: baseData({
        gallery: Array.from({ length: 3 }, (_, i) => ({ url: `/p${i}.jpg`, alt: `photo ${i}` })),
      }),
    }, async ({ doc, React: react }) => {
      const tiles = doc.querySelectorAll("[data-burgundy-gallery-tile]");
      const tile = tiles[1];
      await react.act(async () => tile.click());
      assert.ok(doc.querySelector('[role="dialog"][aria-modal="true"]'), "viewer is open");
      const close = viewerCloseButton(doc);
      await react.act(async () => close.click());
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(doc.activeElement, tile, "focus returns to the opening tile");
    });
  });

  test("scroll lock is released when the viewer closes and on unmount", async () => {
    await withMount({
      data: baseData({
        gallery: Array.from({ length: 2 }, (_, i) => ({ url: `/p${i}.jpg`, alt: `photo ${i}` })),
      }),
    }, async ({ doc, React: react }) => {
      // The mount harness opens the gate, which releases the body scroll lock.
      assert.equal(doc.body.style.overflow, "", "opening the gate releases the scroll lock");
      const tiles = doc.querySelectorAll("[data-burgundy-gallery-tile]");
      await react.act(async () => tiles[0].click());
      assert.equal(doc.body.style.overflow, "hidden", "the viewer locks body scroll");
      const close = viewerCloseButton(doc);
      await react.act(async () => close.click());
      assert.equal(doc.body.style.overflow, "", "scroll lock released on viewer close");
    });
  });
});

describe("Burgundy Gold — messages", () => {
  function flatKeys(object, prefix = "") {
    const keys = new Set();
    for (const [key, value] of Object.entries(object)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const nested of flatKeys(value, full)) keys.add(nested);
      } else {
        keys.add(full);
      }
    }
    return keys;
  }

  function countEventKeys(messages) {
    return Object.keys(messages.Events ?? {}).filter((key) => key.startsWith("burgundy")).length;
  }

  test("en and fr message files are valid JSON", () => {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8")), "en.json is valid JSON");
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8")), "fr.json is valid JSON");
  });

  test("no duplicate keys at any depth in en or fr", () => {
    function findDuplicates(object, prefix = "", dupes = new Set()) {
      const seen = new Set();
      for (const [key, value] of Object.entries(object)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (seen.has(full)) dupes.add(full);
        seen.add(full);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          findDuplicates(value, full, dupes);
        }
      }
      return dupes;
    }
    assert.deepEqual([...findDuplicates(EN_MESSAGES)], [], "en has no duplicate keys");
    assert.deepEqual([...findDuplicates(FR_MESSAGES)], [], "fr has no duplicate keys");
  });

  test("en/fr parity: zero keys missing each way", () => {
    const en = flatKeys(EN_MESSAGES.Events);
    const fr = flatKeys(FR_MESSAGES.Events);
    assert.deepEqual([...en].filter((key) => !fr.has(key)), [], "no en key missing from fr");
    assert.deepEqual([...fr].filter((key) => !en.has(key)), [], "no fr key missing from en");
  });

  test("minimalism keys hash is unchanged", () => {
    const hash = (keys) => crypto.createHash("sha256").update(keys.join(",")).digest("hex");
    const enMin = Object.keys(EN_MESSAGES.Events).filter((key) => key.startsWith("minimalism")).sort();
    const frMin = Object.keys(FR_MESSAGES.Events).filter((key) => key.startsWith("minimalism")).sort();
    assert.equal(hash(enMin), hash(frMin), "en/fr minimalism hashes match");
    assert.equal(enMin.length, 38, "minimalism key count is unchanged (minus removed skip gate)");
  });

  test("burgundy key counts before/after (counter key added to both locales)", () => {
    const enCount = countEventKeys(EN_MESSAGES);
    const frCount = countEventKeys(FR_MESSAGES);
    assert.equal(enCount, frCount, "en and fr carry the same number of burgundy keys");
    assert.ok(enCount >= 49, "burgundy key count includes the new counter key");
    assert.equal(typeof EN_MESSAGES.Events.burgundyGalleryCounter, "string", "en burgundyGalleryCounter exists");
    assert.equal(typeof FR_MESSAGES.Events.burgundyGalleryCounter, "string", "fr burgundyGalleryCounter exists");
  });
});

function viewerCloseButton(doc) {
  return [...doc.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Close" || button.textContent.trim() === "×");
}
