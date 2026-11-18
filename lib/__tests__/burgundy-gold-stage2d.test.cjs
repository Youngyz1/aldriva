/**
 * lib/__tests__/burgundy-gold-stage2d.test.cjs
 *
 * Stage 2D: the gift box at the end of the Burgundy Gold page.
 *   - it is a real button with an accessible name and no drawn text
 *   - tapping it opens the SAME dialog node "Confirm presence" opens
 *   - reduced motion skips the lid animation delay and opens immediately
 *   - the section hides when the invitation has no RSVP block
 *   - closing the dialog resets the box and returns focus to it
 *   - EN/FR message parity for the gift copy
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const RENDERER_PATH = path.join(
  ROOT,
  "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx"
);
const ART_PATH = path.join(
  ROOT,
  "components/invitation/templates/burgundy-gold/burgundy-gold-art.tsx"
);
const ART_SOURCE = fs.readFileSync(ART_PATH, "utf8");
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

function baseLayout() {
  return {
    version: 1,
    global_theme: { preset: "wedding", classes: {}, text_scale: 1 },
    layout_blocks: [{ id: "details", type: "details", content: {} }],
    effects: [],
    template_data: {},
  };
}

function baseData(overrides = {}) {
  return {
    locale: "en",
    title: "Our Wedding",
    eyebrow: "Our Wedding",
    eventDate: "2027-10-16T18:00:00Z",
    timezone: "Africa/Dakar",
    partner1Name: "Modou Gueye",
    partner2Name: "Ndeye Sarr",
    invitationLine: "Together with their families, invite you to celebrate their marriage.",
    venue: "Cathedrale du Souvenir Africain",
    address: "Dakar",
    city: "Dakar",
    venues: [
      { label: "Ceremony", name: "Cathedrale du Souvenir Africain", time: "18:00" },
      { label: "Reception", name: "Espace Point E", time: "19:30" },
    ],
    schedule: [{ time: "17:00", title: "Guest welcome", icon: "cocktail" }],
    guest: { name: "Honored Guest", rsvpStatus: "pending", isVip: false },
    token: "preview-sample-token",
    ...overrides,
  };
}

const GLOBALS = [
  "window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self",
  "MutationObserver", "HTMLMediaElement", "IS_REACT_ACT_ENVIRONMENT",
];

async function withPage({ reducedMotion = false, children = null, data = baseData(), mode = "live" }, run) {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  // jsdom has the <dialog> element but not the modal methods.
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  };
  // jsdom has no matchMedia; the reduced-motion branch reads it on tap.
  dom.window.matchMedia = (query) => ({
    matches: reducedMotion && String(query).includes("prefers-reduced-motion"),
    media: String(query),
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });

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
          const messages = data.locale === "fr" ? FR_MESSAGES : EN_MESSAGES;
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
          layout: baseLayout(),
          data,
          children,
          mode,
          isEditMode: false,
        })
      );
    });
    const openButton = [...dom.window.document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === (data.locale === "fr" ? "Ouvrir l’invitation" : "Open invitation")
    );
    assert.ok(openButton, "opening gate renders its button");
    await React.act(async () => openButton.click());

    await run({ dom, doc: dom.window.document, React });
  } finally {
    if (root) await require("react").act(async () => root.unmount());
    Module._load = originalLoad;
    for (const [key, descriptor] of Object.entries(oldGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
}

function rsvpChildren(React) {
  return React.createElement(
    "div",
    { "data-layout-block-type": "action_portal" },
    React.createElement("p", null, "RSVP FORM BODY")
  );
}

describe("Burgundy Gold — gift box", () => {
  test("the box is a button with an accessible name and no text of its own", async () => {
    const React = require("react");
    await withPage({ children: rsvpChildren(React) }, async ({ doc }) => {
      const box = doc.querySelector("[data-burgundy-gift-open]");
      assert.ok(box, "the gift box renders");
      assert.equal(box.tagName, "BUTTON", "the box is a real button");
      assert.equal(box.getAttribute("aria-label"), EN_MESSAGES.Events.burgundyGiftOpenLabel);
      assert.equal(box.getAttribute("aria-haspopup"), "dialog");
      assert.equal(box.textContent.trim(), "", "no text inside the gift box drawing");

      const section = doc.querySelector('[data-burgundy-section="gift"]');
      assert.match(section.textContent, /Gift box/);
      assert.match(section.textContent, /Tap to open/);
      assert.match(section.textContent, /best gift of all/);
      assert.match(ART_SOURCE, /data-burgundy-gift-open="true"/, "the drawing owns the button");
    });
  });

  test("the gift section sits after the guestbook and the memories", async () => {
    const React = require("react");
    await withPage({ children: rsvpChildren(React) }, async ({ doc }) => {
      const order = [...doc.querySelectorAll("[data-burgundy-section]")].map((node) =>
        node.getAttribute("data-burgundy-section")
      );
      const gift = order.indexOf("gift");
      assert.ok(gift > order.indexOf("guestbook"), "after the guestbook");
      assert.ok(gift > order.indexOf("memories"), "after the memories");
    });
  });

  test("tapping the gift box opens the RSVP dialog (the only RSVP trigger)", async () => {
    const React = require("react");
    await withPage({ children: rsvpChildren(React) }, async ({ doc, React: react }) => {
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      const box = doc.querySelector("[data-burgundy-gift-open]");
      assert.ok(box && dialog, "gift box and its dialog render");
      assert.equal(dialog.open, false);

      await react.act(async () => box.click());
      assert.equal(box.getAttribute("data-gift-open"), "true", "the lid is lifted while waiting");
      assert.equal(dialog.open, false, "the dialog waits for the lid animation");
      assert.equal(
        doc.querySelectorAll("[data-burgundy-rsvp-dialog]").length,
        1,
        "only one dialog node exists"
      );

      await react.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 850));
      });
      assert.equal(dialog.open, true, "the dialog opens after the lid animation");
    });
  });

  test("reduced motion opens the dialog immediately", async () => {
    const React = require("react");
    await withPage({ children: rsvpChildren(React), reducedMotion: true }, async ({ doc, React: react }) => {
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      const box = doc.querySelector("[data-burgundy-gift-open]");
      await react.act(async () => box.click());
      assert.equal(dialog.open, true, "no 700 ms delay under reduced motion");
    });
  });

  test("closing the dialog resets the box and restores focus to it", async () => {
    const React = require("react");
    await withPage({ children: rsvpChildren(React), reducedMotion: true }, async ({ doc, React: react }) => {
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      const box = doc.querySelector("[data-burgundy-gift-open]");
      await react.act(async () => box.click());
      assert.equal(dialog.open, true);
      assert.equal(box.getAttribute("data-gift-open"), "true");

      await react.act(async () => dialog.close());
      assert.equal(box.getAttribute("data-gift-open"), "false", "the box returns to closed");
      assert.equal(doc.activeElement, box, "focus lands back on the gift box");
    });
  });

  test("the section hides itself when the invitation has no RSVP", async () => {
    await withPage({ children: null }, async ({ doc }) => {
      assert.equal(doc.querySelector('[data-burgundy-section="gift"]'), null, "no gift section");
      assert.equal(doc.querySelector("[data-burgundy-gift-open]"), null, "no gift button");
    });
  });

  test("reduced motion removes the float and sparkle animations in CSS", () => {
    assert.match(ART_SOURCE, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(ART_SOURCE, /\.bgg-float, \.bgg-spark \{ animation: none \}/);
  });
});

describe("Burgundy Gold — gift messages", () => {
  const KEYS = ["burgundyGiftTitle", "burgundyGiftHint", "burgundyGiftClosing", "burgundyGiftOpenLabel"];

  test("every gift key exists in both locales with the same shape", () => {
    for (const key of KEYS) {
      const en = EN_MESSAGES.Events[key];
      const fr = FR_MESSAGES.Events[key];
      assert.equal(typeof en, "string", `EN ${key}`);
      assert.equal(typeof fr, "string", `FR ${key}`);
      assert.ok(en.trim().length > 0 && fr.trim().length > 0, `${key} is not empty`);
    }
    assert.equal(EN_MESSAGES.Events.burgundyGiftTitle, "Gift box");
    assert.equal(FR_MESSAGES.Events.burgundyGiftTitle, "Boîte cadeau");
    assert.equal(FR_MESSAGES.Events.burgundyGiftHint, "Appuyez pour ouvrir");
    assert.match(FR_MESSAGES.Events.burgundyGiftClosing, /plus beau des cadeaux/);
    assert.notEqual(EN_MESSAGES.Events.burgundyGiftClosing, FR_MESSAGES.Events.burgundyGiftClosing);
  });

  test("no gift copy is hardcoded in the renderer", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldSections.tsx"),
      "utf8"
    );
    for (const key of KEYS) {
      assert.match(source, new RegExp(`t\\("${key}"\\)`), `${key} comes from messages`);
    }
    assert.doesNotMatch(source, /Tap to open|Appuyez pour ouvrir|best gift of all/);
  });
});
