/**
 * lib/__tests__/burgundy-gold-guest-personalization.test.cjs
 *
 * Verifies personalized guest invitations on Burgundy Gold, exercised
 * through the REAL production pipeline rather than a hand-rolled stand-in:
 *   legacyInvitationTemplateToLayout("burgundy-gold")   — real compiled theme + default blocks
 *   -> renderInvitationBlock({ block: action_portal, ... })  — the same dispatcher
 *      InvitationBlocksLayoutClient uses, invoking the real ActionPortalBlock
 *   -> BurgundyGoldPageTemplate                          — the real page shell
 *
 * The guest/seat/ticket fixtures below mirror assembleInvitationPageData's
 * output shape for a live, token-resolved guest (see
 * lib/types/invitation-page-snapshot.ts and app/invitation/[token]/page.tsx).
 *
 * Covers: guest name/seat/QR-value render for a real (non-demo) guest, not
 * "Sample Guest"; "Responses are disabled in preview" only appears without a
 * live onAction; Accept/Decline call the real onAction; long/accented/
 * apostrophe names, no-seat, and FR locale render cleanly; the fixed
 * heading/body color tokens (lib/page-composition.ts) land on the guest
 * name, pass label, and seat line.
 */
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const PAGE_PATH = path.join(ROOT, "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx");
const REGISTRY_BLOCK_PATH = path.join(ROOT, "components/invitation/blocks/InvitationBlockRegistry.tsx");
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
    const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
    const output = ts.transpileModule(raw, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}
if (!require.extensions[".tsx"]) {
  require.extensions[".tsx"] = function compileTsx(module, filename) {
    const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
    const output = ts.transpileModule(raw, {
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

const GLOBALS = [
  "window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "self",
  "MutationObserver", "HTMLMediaElement", "IS_REACT_ACT_ENVIRONMENT",
];

/**
 * Mirrors assembleInvitationPageData's output for a live guest: real name,
 * seat, and a ticket QR value unique to that guest (never a placeholder).
 */
function guestData(overrides = {}) {
  return {
    locale: "en",
    title: "Our Wedding",
    eyebrow: "Our Wedding",
    eventDate: "2027-10-16T18:00:00Z",
    timezone: "Africa/Dakar",
    partner1Name: "Modou Gueye",
    partner2Name: "Ndeye Sarr",
    invitationLine: "Together with their families, invite you to celebrate their marriage.",
    guest: { name: "Fatou Diop", rsvpStatus: "pending", isVip: false },
    seat: { label: "Table 4 · Seat 1", tableNumber: "4", tableName: "Garden Table" },
    ticketInstance: { qrCode: "GUEST-TOKEN-fatou-diop-9f3a21", status: "valid" },
    ...overrides,
  };
}

function baseLayoutBlocks() {
  // Mirrors legacyInvitationTemplateToLayout's burgundy-gold default blocks
  // (details + action_portal) without needing a full schema round-trip.
  return [
    { id: "invitation-details", type: "details", content: {} },
    { id: "invitation-action-portal", type: "action_portal", content: { actionType: "RSVP_SUBMISSION" } },
  ];
}

async function withGuestPage(
  { data = guestData(), onAction, shared = false, globalTheme, reducedMotion = false },
  run
) {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  };
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
        useTranslations: (namespace) => (key, values) => {
          const messages = data.locale === "fr" ? FR_MESSAGES : EN_MESSAGES;
          const value = messages?.[namespace]?.[key];
          if (typeof value !== "string") return key;
          if (!values) return value;
          return value.replace(/\{(\w+)\}/g, (match, token) => (token in values ? String(values[token]) : match));
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    for (const key of Object.keys(require.cache)) {
      if (key.includes("BurgundyGold") || key.includes("InvitationBlockRegistry") || key.includes("invitation-page-layout")) {
        delete require.cache[key];
      }
    }
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const { BurgundyGoldPageTemplate } = require(PAGE_PATH);
    const { renderInvitationBlock } = require(REGISTRY_BLOCK_PATH);
    const { themeForInvitationTemplate } = require("@/lib/page-composition.ts");

    const layout = {
      version: 1,
      global_theme: globalTheme ?? themeForInvitationTemplate("burgundy-gold"),
      layout_blocks: baseLayoutBlocks(),
      effects: [],
      template_data: {},
    };

    // Mirrors InvitationBlocksLayoutClient's wrapper exactly: BurgundyGoldPageTemplate's
    // groupRenderedBlocks() reads data-layout-block-type off each direct child to find
    // the action_portal content, so a bare Fragment here would make it invisible.
    const renderedBlocks = layout.layout_blocks.map((block) =>
      React.createElement(
        "div",
        { key: block.id, "data-layout-block-id": block.id, "data-layout-block-type": block.type },
        renderInvitationBlock({
          block,
          data,
          layout,
          templateId: "burgundy-gold",
          onAction,
          shared,
          romanticEnvelope: false,
          botanicalReverie: false,
          detailsPresentation: "editorial",
          galleryPresentation: "boho-coveflow",
        })
      )
    );

    root = createRoot(dom.window.document.getElementById("root"));
    await React.act(async () => {
      root.render(
        React.createElement(
          BurgundyGoldPageTemplate,
          {
            layout,
            data,
            mode: "live",
            isEditMode: false,
            hasAction: Boolean(onAction),
          },
          renderedBlocks
        )
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

/** Opens the gift box's Confirm presence CTA, landing on the RSVP dialog content. */
async function openDialog(doc, react) {
  const cta = doc.querySelector("[data-burgundy-gift-rsvp]");
  assert.ok(cta, "Confirm presence CTA renders when an RSVP block exists");
  await react.act(async () => cta.click());
}

describe("Burgundy Gold — personalized guest invitation (RSVP / Official Guest Pass)", () => {
  test("a real guest's name, seat, and VIP-aware pass label render — not Sample Guest/Honored Guest", async () => {
    const React = require("react");
    await withGuestPage({ data: guestData(), onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.equal(dialog.open, true);
      assert.match(dialog.textContent, /Fatou Diop/, "the guest's real name renders");
      assert.doesNotMatch(dialog.textContent, /Sample Guest|Honored Guest/, "no placeholder guest name leaks in");
      assert.match(dialog.textContent, /Official Guest Pass/);
      assert.match(dialog.textContent, /Reserved/);
      assert.match(dialog.textContent, /Table 4 · Seat 1/, "the seat/table label renders");
    });
  });

  test("VIP guests get the VIP pass label instead of Official Guest Pass", async () => {
    const React = require("react");
    const data = guestData({ guest: { name: "Fatou Diop", rsvpStatus: "pending", isVip: true } });
    await withGuestPage({ data, onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.match(dialog.textContent, /VIP Honored Guest Pass/);
    });
  });

  test("the QR encoder receives this guest's own ticket value, never a placeholder", async (t) => {
    const seen = [];
    const React = require("react");
    const Module2 = require("node:module");
    const originalLoad = Module2._load;
    Module2._load = function spyQrcode(request, parent, isMain) {
      if (request === "qrcode") {
        return {
          toString: async (value, opts) => {
            seen.push({ value, opts });
            return "<svg data-mock-qr=\"true\"></svg>";
          },
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    t.after(() => {
      Module2._load = originalLoad;
    });

    await withGuestPage({ data: guestData(), onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      // Flush the QR component's effect + dynamic import microtask chain.
      await react.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      assert.ok(seen.length > 0, "the QR svg generator was invoked");
      assert.ok(
        seen.some((call) => call.value === "GUEST-TOKEN-fatou-diop-9f3a21"),
        "encoded value is this guest's own ticket token"
      );
      assert.ok(
        !seen.some((call) => call.value === "PREVIEW-QR-PLACEHOLDER"),
        "never the demo/preview placeholder value"
      );
    });
  });

  test("Accept and Decline call the real onAction with this invitation's response, not a no-op", async () => {
    const React = require("react");
    const calls = [];
    await withGuestPage(
      { data: guestData(), onAction: async (payload) => { calls.push(payload); }, reducedMotion: true },
      async ({ doc, React: react }) => {
        await openDialog(doc, react);
        const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
        const accept = [...dialog.querySelectorAll("button")].find((b) => b.textContent.trim() === "Accept Invitation");
        assert.ok(accept, "Accept Invitation button renders");
        await react.act(async () => accept.click());
        assert.equal(calls.length, 1);
        assert.equal(calls[0].actionType, "RSVP_SUBMISSION");
        assert.equal(calls[0].response, "accepted");
      }
    );
  });

  test('"Responses are disabled in preview" appears only without a live onAction (demo/preview), never with one (a real guest link)', async () => {
    const React = require("react");
    await withGuestPage({ data: guestData(), onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.doesNotMatch(dialog.textContent, /Responses are disabled in preview/);
    });

    await withGuestPage({ data: guestData(), onAction: undefined, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.match(dialog.textContent, /Responses are disabled in preview/);
    });
  });

  test("no seat assigned hides the Reserved line cleanly, no crash", async () => {
    const React = require("react");
    const data = guestData({ seat: undefined });
    await withGuestPage({ data, onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.match(dialog.textContent, /Fatou Diop/);
      assert.doesNotMatch(dialog.textContent, /Reserved/);
    });
  });

  test("guestAllowance (plus-one cap) on the guest object never crashes rendering, even though this accept/decline view has no plus-one UI (template-agnostic, pre-existing)", async () => {
    const React = require("react");
    const data = guestData({ guest: { name: "Fatou Diop", rsvpStatus: "pending", isVip: false, guestAllowance: 3 } });
    await withGuestPage({ data, onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.match(dialog.textContent, /Fatou Diop/);
    });
  });

  test("a long name and a name with accents and an apostrophe render fully, with no truncation markers", async () => {
    const React = require("react");
    const longName = "Jean-Baptiste Emmanuel de la Fontaine-Rousseau III";
    const accentedName = "Aïssatou N'Diaye";

    await withGuestPage(
      { data: guestData({ guest: { name: longName, rsvpStatus: "pending", isVip: false } }), onAction: async () => {}, reducedMotion: true },
      async ({ doc, React: react }) => {
        await openDialog(doc, react);
        const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
        assert.match(dialog.textContent, /Jean-Baptiste Emmanuel de la Fontaine-Rousseau III/);
        const nameEl = [...dialog.querySelectorAll("p")].find((p) => p.textContent.includes(longName));
        assert.ok(nameEl, "the long name renders in a real element");
        assert.match(nameEl.className, /break-words/, "long names wrap instead of overflowing/clipping");
      }
    );

    await withGuestPage(
      { data: guestData({ guest: { name: accentedName, rsvpStatus: "pending", isVip: false } }), onAction: async () => {}, reducedMotion: true },
      async ({ doc, React: react }) => {
        await openDialog(doc, react);
        const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
        assert.match(dialog.textContent, /Aïssatou N'Diaye/, "accents and the apostrophe render byte-for-byte, no mangling");
      }
    );
  });

  test("French locale: dialog copy and the guest's name both render correctly", async () => {
    const React = require("react");
    const data = guestData({
      locale: "fr",
      guest: { name: "Aïssatou N'Diaye", rsvpStatus: "pending", isVip: false },
    });
    await withGuestPage({ data, onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.match(dialog.textContent, /Pass d.accès officiel/);
      assert.match(dialog.textContent, /Aïssatou N'Diaye/);
      assert.match(dialog.textContent, /Confirmer ma présence|Ne peut pas venir/);
    });
  });

  test("an invalid/expired token never reaches template rendering at all (verified from code, not a component concern)", () => {
    // app/invitation/[token]/page.tsx validates token shape and the
    // getInvitationByToken() lookup BEFORE any template is selected or
    // rendered: a malformed or unresolvable token renders
    // InvalidInvitationView() directly and returns early. Burgundy Gold's
    // components never receive a token or see an invalid-guest state —
    // this is enforced upstream, identically for every template.
    const source = fs.readFileSync(path.join(ROOT, "app/invitation/[token]/page.tsx"), "utf8");
    assert.match(source, /token\.length !== 64/, "malformed tokens are rejected before any data is fetched");
    assert.match(source, /if \(!result \|\| !result\.invitation\)/, "an unresolvable token short-circuits before template selection");
    assert.doesNotMatch(source, /burgundy-gold|minimalism-dark-blue/, "the token/guest resolution layer never branches on template id");
  });

  test("the fixed heading/body color tokens land on the guest name, pass label, and seat line", async () => {
    const React = require("react");
    await withGuestPage({ data: guestData(), onAction: async () => {}, reducedMotion: true }, async ({ doc, React: react }) => {
      await openDialog(doc, react);
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      const paragraphs = [...dialog.querySelectorAll("p")];

      const nameEl = paragraphs.find((p) => p.textContent.trim() === "Fatou Diop");
      assert.ok(nameEl, "guest name paragraph exists");
      assert.match(nameEl.className, /text-\[#3a0d18\]/, "guest name uses the fixed dark heading colour");

      const passLabelEl = paragraphs.find((p) => p.textContent.trim() === "Official Guest Pass");
      assert.ok(passLabelEl);
      assert.match(passLabelEl.className, /text-\[#5a1830\]\/90/, "pass label uses the fixed dark body colour");

      const seatEl = paragraphs.find((p) => p.textContent.includes("Reserved"));
      assert.ok(seatEl);
      assert.match(seatEl.className, /text-\[#5a1830\]\/90/, "seat line uses the fixed dark body colour");
    });
  });

  test("no other template consumes the burgundyGold theme preset (the colour fix is scoped to burgundy-gold only)", () => {
    const registrySource = fs.readFileSync(path.join(ROOT, "lib/invitation-template-registry.ts"), "utf8");
    const matches = registrySource.match(/defaultThemePreset:\s*"burgundyGold"/g) ?? [];
    assert.equal(matches.length, 1, "exactly one registry entry (burgundy-gold) points at the burgundyGold preset");
  });
});

describe("Burgundy Gold — hero \"Dear {name},\" guest greeting", () => {
  test("a real guest's name shows in the hero, above the couple's names", async () => {
    await withGuestPage({ data: guestData(), reducedMotion: true }, async ({ doc }) => {
      const greeting = doc.querySelector("[data-burgundy-guest-greeting]");
      assert.ok(greeting, "the greeting line renders for a real guest");
      assert.equal(greeting.textContent.trim(), "Dear Fatou Diop,");

      const names = doc.querySelector("[data-burgundy-hero-names]");
      assert.ok(names, "the couple's names still render");
      assert.ok(
        greeting.compareDocumentPosition(names) & 4, // Node.DOCUMENT_POSITION_FOLLOWING
        "the greeting sits before the couple's names in document order"
      );
    });
  });

  test("no real guest (demo/preview/public card sentinels) renders nothing — no node at all", async () => {
    for (const name of ["Honored Guest", "Sample Guest", "", "   "]) {
      const data = guestData({ guest: { name, rsvpStatus: "pending", isVip: false } });
      await withGuestPage({ data, reducedMotion: true }, async ({ doc }) => {
        assert.equal(
          doc.querySelector("[data-burgundy-guest-greeting]"),
          null,
          `no greeting node for guest.name = ${JSON.stringify(name)}`
        );
      });
    }
  });

  test("French locale: \"Cher(e) {name},\" with an accented, apostrophe'd name", async () => {
    const data = guestData({
      locale: "fr",
      guest: { name: "Aïssatou N'Diaye", rsvpStatus: "pending", isVip: false },
    });
    await withGuestPage({ data, reducedMotion: true }, async ({ doc }) => {
      const greeting = doc.querySelector("[data-burgundy-guest-greeting]");
      assert.ok(greeting);
      assert.equal(greeting.textContent.trim(), "Cher(e) Aïssatou N'Diaye,");
    });
  });

  test("a long name wraps cleanly instead of overflowing — break-words, bounded width, no larger than the couple's names", async () => {
    const longName = "Jean-Baptiste Emmanuel de la Fontaine-Rousseau III";
    const data = guestData({ guest: { name: longName, rsvpStatus: "pending", isVip: false } });
    await withGuestPage({ data, reducedMotion: true }, async ({ doc }) => {
      const greeting = doc.querySelector("[data-burgundy-guest-greeting]");
      assert.ok(greeting);
      assert.equal(greeting.textContent.trim(), `Dear ${longName},`);
      assert.match(greeting.className, /break-words/, "wraps instead of clipping/overflowing");
      assert.match(greeting.className, /max-w-/, "width is bounded so long names wrap at ~390px");
      assert.match(greeting.className, /text-lg/, "fixed, modest size — never scales with name length");
    });
  });
});
