/**
 * lib/__tests__/burgundy-gold-stage2b.test.cjs
 *
 * Stage 2B coverage for Burgundy Gold: section data mapping, empty-state
 * hiding, the "+N" gallery badge, countdown target, calendar heart day,
 * "Confirm presence" opening the RSVP dialog, guestbook typing in the demo,
 * and en/fr message parity.
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
const DATA_MODULE_PATH = path.join(
  ROOT,
  "components/invitation/templates/burgundy-gold/burgundy-gold-data.ts"
);

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

const EN_MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const FR_MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

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
      { label: "Guest welcome", name: "Cathedrale du Souvenir Africain", time: "17:30" },
      { label: "Reception", name: "Espace Point E", time: "19:30" },
    ],
    gallery: Array.from({ length: 6 }, (_, index) => ({
      url: `/images/invitations/minimalism-dark-blue/demo/gallery-0${index + 1}.jpg`,
      alt: `photo ${index + 1}`,
    })),
    schedule: [
      { time: "17:30", title: "Guest welcome" },
      { time: "18:00", title: "Ceremony" },
    ],
    dressCode: "Black tie",
    dressCodeSwatches: [
      { name: "Burgundy", hex: "#4a0d1c" },
      { name: "Gold", hex: "#cdb073" },
      { name: "Broken", hex: "not-a-color" },
    ],
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

describe("Burgundy Gold stage 2B — data mapping", () => {
  test("gallery tiles: four tiles max with the overflow count on the last one", () => {
    assert.equal(data.burgundyGalleryTiles([]), null);
    assert.equal(data.burgundyGalleryTiles([{ url: "   " }]), null);

    const four = data.burgundyGalleryTiles(Array.from({ length: 4 }, (_, i) => ({ url: `/p${i}.jpg` })));
    assert.equal(four.length, 4);
    assert.deepEqual(four.map((tile) => tile.remaining), [0, 0, 0, 0]);

    const six = data.burgundyGalleryTiles(Array.from({ length: 6 }, (_, i) => ({ url: `/p${i}.jpg` })));
    assert.equal(six.length, 4, "never renders more than four tiles");
    assert.deepEqual(six.map((tile) => tile.remaining), [0, 0, 0, 2], "+2 badge lands on the last tile");
    assert.equal(six[3].index, 3, "last tile opens the viewer at its own photo");

    const nine = data.burgundyGalleryTiles(
      Array.from({ length: 9 }, (_, i) => ({ url: `/p${i}.jpg`, alt: ` alt ${i} ` }))
    );
    assert.equal(nine[3].remaining, 5);
    assert.equal(nine[0].alt, "alt 0");
  });

  test("programme entries: requires time + title, caps at 15", () => {
    assert.equal(data.burgundyScheduleEntries([]), null);
    assert.equal(data.burgundyScheduleEntries([{ time: "", title: "X" }, { time: "10:00", title: " " }]), null);

    const entries = data.burgundyScheduleEntries([
      { time: " 10:00 ", title: " Ceremony " },
      { time: "11:00", label: "Lunch" },
    ]);
    assert.deepEqual(entries, [
      { time: "10:00", title: "Ceremony" },
      { time: "11:00", title: "Lunch" },
    ]);

    const many = data.burgundyScheduleEntries(
      Array.from({ length: 20 }, (_, i) => ({ time: `${i}:00`, title: `Item ${i}` }))
    );
    assert.equal(many.length, 15);
    assert.equal(data.BURGUNDY_SCHEDULE_MAX, 15);
  });

  test("reception times: label match first, then venue order", () => {
    const labelled = data.burgundyReceptionTimes([
      { label: "Reception", time: "19:30" },
      { label: "Guest welcome", time: "17:30" },
    ]);
    assert.equal(labelled.welcome, "17:30");
    assert.equal(labelled.reception, "19:30");

    const ordered = data.burgundyReceptionTimes([
      { label: "Ceremony", time: "18:00" },
      { label: "Dinner", time: "20:00" },
    ]);
    assert.equal(ordered.welcome, "18:00");
    assert.equal(ordered.reception, "20:00");

    const welcomeOnly = data.burgundyReceptionTimes([{ label: "Accueil des invités", time: "17:30" }]);
    assert.equal(welcomeOnly.welcome, "17:30");
    assert.equal(welcomeOnly.reception, null);

    assert.equal(data.burgundyReceptionTimes([]), null);
    assert.equal(data.burgundyReceptionTimes([{ label: "Reception", time: "  " }]), null);
  });

  test("dress-code swatches drop invalid hex values", () => {
    assert.equal(data.burgundyDressSwatches([]), null);
    const swatches = data.burgundyDressSwatches([
      { name: " Burgundy ", hex: " #4a0d1c " },
      { hex: "#fff" },
      { name: "Broken", hex: "not-a-color" },
    ]);
    assert.deepEqual(swatches, [{ name: "Burgundy", hex: "#4a0d1c" }, { name: undefined, hex: "#fff" }]);
  });

  test("venue: coordinates win, name/address fall back to an encoded query, nothing hides", () => {
    const withCoords = data.burgundyVenue(
      baseData({ latitude: 14.6928, longitude: -17.4467, venue: "Cathedrale", address: "Dakar", city: "Dakar" })
    );
    assert.match(withCoords.embedUrl, /q=14\.6928%2C-17\.4467/);
    assert.match(withCoords.mapUrl, /query=14\.6928%2C-17\.4467/);
    assert.match(withCoords.directionsUrl, /dir\/\?api=1&destination=14\.6928%2C-17\.4467/);

    const queryOnly = data.burgundyVenue(baseData({ venue: "Espace Point E", address: "Rue 1", city: "Dakar" }));
    assert.match(queryOnly.embedUrl, /output=embed/);
    assert.match(queryOnly.mapUrl, /Espace%20Point%20E/);
    assert.match(queryOnly.directionsUrl, /destination=Espace%20Point%20E/);

    assert.equal(data.burgundyVenue({ eventDate: "2027-10-16T18:00:00Z" }), null);
  });

  test("calendar: heart lands on the event day in the event timezone", () => {
    const calendar = data.burgundyMonthCalendar("2027-10-16T18:00:00Z", "Africa/Dakar");
    assert.equal(calendar.year, 2027);
    assert.equal(calendar.monthIndex, 9);
    assert.equal(calendar.eventDay, 16);
    const flat = calendar.weeks.flat();
    assert.ok(calendar.weeks.every((week) => week.length === 7), "every week has seven cells");
    assert.deepEqual(flat.filter((cell) => cell.isEventDay).map((cell) => cell.date), [16]);
    assert.equal(flat.filter((cell) => cell.date !== null).length, 31, "October has 31 days");

    // 23:30 UTC on the 16th is already the 17th in Tokyo.
    const tokyo = data.burgundyMonthCalendar("2027-10-16T23:30:00Z", "Asia/Tokyo");
    assert.equal(tokyo.eventDay, 17);
    assert.ok(tokyo.weeks.flat().some((cell) => cell.date === 17 && cell.isEventDay));

    assert.equal(data.burgundyMonthCalendar(null), null);
    assert.equal(data.burgundyMonthCalendar("not-a-date"), null);
  });

  test("countdown target and memories/music/guestbook gates", () => {
    assert.equal(data.burgundyCountdownTarget(null), null);
    assert.equal(data.burgundyCountdownTarget("nope"), null);
    assert.equal(data.burgundyCountdownTarget("2027-10-16T18:00:00Z"), Date.parse("2027-10-16T18:00:00Z"));

    assert.equal(data.burgundyShowMemories({}, baseData()), false);
    assert.equal(data.burgundyShowMemories({ mf_show_memories: true }, baseData({ memoriesCount: 0 })), false);
    assert.equal(data.burgundyShowMemories({ mf_show_memories: true }, baseData({ memoriesCount: 3 })), false, "count without token hides");
    assert.equal(
      data.burgundyShowMemories({ mf_show_memories: true }, baseData({ memoriesCount: 3, memoriesToken: "t" })),
      true
    );
    assert.equal(data.burgundyShowMemories({ mf_show_memories: true }, baseData({ memoriesSample: true })), true);

    assert.equal(data.burgundyHasMusic(baseData()), false);
    assert.equal(data.burgundyHasMusic(baseData({ musicAudioUrl: "/a.mp3" })), true);
    assert.equal(data.burgundyHasMusic(baseData({ musicLinks: [{ url: "https://x" }] })), true);

    assert.equal(data.burgundyShowGuestbook({}), true);
    assert.equal(data.burgundyShowGuestbook({ show_guestbook: false }), false);
  });

  test("weekday headers come from Intl for the locale", () => {
    const en = data.burgundyWeekdayHeaders("en-US");
    const fr = data.burgundyWeekdayHeaders("fr-FR");
    assert.equal(en.length, 7);
    assert.equal(fr.length, 7);
    assert.equal(en[0], "Sun");
    assert.notDeepEqual(en, fr, "weekday labels are localized, not hardcoded");
  });
});

// ── jsdom render harness ──────────────────────────────────────────────────────
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
  // jsdom ships <dialog> markup but not the modal methods.
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

function setField(doc, element, value) {
  const proto = element.tagName === "TEXTAREA"
    ? doc.defaultView.HTMLTextAreaElement.prototype
    : doc.defaultView.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
}

describe("Burgundy Gold stage 2B — rendered sections", () => {
  test("gallery renders four tiles with a +2 badge on the last tile", async () => {
    await withMount({}, async ({ doc }) => {
      const tiles = doc.querySelectorAll("[data-burgundy-gallery-tile]");
      assert.equal(tiles.length, 4);
      const badges = doc.querySelectorAll("[data-burgundy-gallery-more]");
      assert.equal(badges.length, 1);
      assert.equal(badges[0].getAttribute("data-burgundy-gallery-more"), "2");
      assert.equal(badges[0].textContent.trim(), "+2");
    });
  });

  test("reception shows welcome/reception times, countdown and the calendar heart on day 16", async () => {
    await withMount({}, async ({ doc }) => {
      const reception = doc.querySelector('[data-burgundy-section="reception"]');
      assert.ok(reception, "reception section renders when it has data");
      assert.match(reception.textContent, /Guest welcome/);
      assert.match(reception.textContent, /17:30/);
      assert.match(reception.textContent, /19:30/);
      assert.ok(doc.querySelector('[data-burgundy-section="countdown"]'), "countdown renders");
      const heart = doc.querySelector("[data-burgundy-calendar-heart]");
      assert.ok(heart, "event day is marked with a heart");
      assert.equal(heart.getAttribute("data-burgundy-calendar-heart"), "16");
      assert.equal(doc.querySelector('[data-burgundy-section="month-calendar"]').getAttribute("data-burgundy-calendar-day"), "16");
    });
  });

  test("\"Confirm presence\" opens the RSVP dialog", async () => {
    const React = require("react");
    const children = React.createElement(
      "div",
      { "data-layout-block-type": "action_portal" },
      React.createElement("p", null, "RSVP FORM BODY")
    );
    await withMount({ children }, async ({ doc, React: react }) => {
      const trigger = doc.querySelector("[data-burgundy-confirm-presence]");
      assert.ok(trigger, "confirm presence button renders when action_portal exists");
      const dialog = doc.querySelector("[data-burgundy-rsvp-dialog]");
      assert.equal(dialog.open, false);
      await react.act(async () => trigger.click());
      assert.equal(dialog.open, true, "dialog is open after the click");
      assert.match(dialog.textContent, /RSVP FORM BODY/, "dialog hosts the action_portal block");
    });
  });

  test("guestbook is typeable in the demo and appends to the feed", async () => {
    await withMount({ mode: "live" }, async ({ doc, React: react }) => {
      const name = doc.querySelector('[data-burgundy-guestbook-field="name"]');
      const message = doc.querySelector('[data-burgundy-guestbook-field="message"]');
      assert.equal(name.disabled, false, "name input is typeable");
      assert.equal(message.disabled, false, "message input is typeable");
      await react.act(async () => {
        setField(doc, name, "Awa");
        setField(doc, message, "Congratulations!");
      });
      const send = doc.querySelector("[data-burgundy-guestbook-send]");
      await react.act(async () => send.click());
      const feed = doc.querySelector('[data-burgundy-guestbook-feed="true"]');
      assert.match(feed.textContent, /Awa/);
      assert.match(feed.textContent, /Congratulations!/);
      assert.ok(feed.className.includes("overflow-y-auto"), "feed scrolls");
      assert.doesNotMatch(feed.className, /\d(vh|dvh|vw)/, "feed height never uses viewport units");
    });
  });

  test("venue renders an embed plus View on map and Itinerary links", async () => {
    await withMount({ data: baseData({ latitude: 14.6928, longitude: -17.4467 }) }, async ({ doc }) => {
      const venue = doc.querySelector('[data-burgundy-section="venue"]');
      assert.ok(venue);
      assert.ok(venue.querySelector("iframe"), "map embed renders");
      const map = venue.querySelector('[data-burgundy-venue-link="map"]');
      const itinerary = venue.querySelector('[data-burgundy-venue-link="itinerary"]');
      assert.match(map.getAttribute("href"), /google\.com\/maps/);
      assert.match(itinerary.getAttribute("href"), /dir/);
    });
  });

  test("dress code renders the theme line and only the valid swatches", async () => {
    await withMount({}, async ({ doc }) => {
      const section = doc.querySelector('[data-burgundy-section="dress-code"]');
      assert.ok(section);
      assert.match(section.textContent, /Black tie/);
      assert.equal(section.querySelector("[data-burgundy-swatches]").getAttribute("data-burgundy-swatches"), "2");
      assert.doesNotMatch(section.textContent, /Broken/);
    });
  });

  test("programme renders the timeline entries", async () => {
    await withMount({}, async ({ doc }) => {
      const section = doc.querySelector('[data-burgundy-section="programme"]');
      assert.ok(section);
      const items = section.querySelectorAll("ol > li");
      assert.equal(items.length, 2);
      assert.match(items[0].textContent, /17:30/);
      assert.match(items[0].textContent, /Guest welcome/);
    });
  });

  test("memories and music stay hidden until they have data", async () => {
    await withMount({ settings: { mf_show_memories: true }, data: baseData({ memoriesSample: true }) }, async ({ doc }) => {
      assert.ok(doc.querySelector('[data-burgundy-section="memories"]'), "memories render for the sample set");
      assert.equal(doc.querySelector('[data-burgundy-section="music"]'), null, "no music without a track");
    });

    await withMount({ data: baseData({ memoriesSample: false, memoriesCount: 0 }) }, async ({ doc }) => {
      assert.equal(doc.querySelector('[data-burgundy-section="memories"]'), null, "memories stay hidden when the layout switch is off");
    });

    await withMount({ data: baseData({ musicAudioUrl: "/audio/demo.mp3" }) }, async ({ doc }) => {
      assert.ok(doc.querySelector('[data-burgundy-section="music"]'), "music control renders when a track exists");
    });
  });

  test("every section hides itself when the data is empty", async () => {
    const empty = {
      locale: "en",
      title: "Our Wedding",
      guest: { name: "Guest", rsvpStatus: "pending", isVip: false },
      token: "t",
    };
    await withMount({ data: empty }, async ({ doc }) => {
      for (const section of ["gallery", "reception", "venue", "dress-code", "programme", "memories", "music"]) {
        assert.equal(
          doc.querySelector(`[data-burgundy-section="${section}"]`),
          null,
          `${section} must not render without data`
        );
      }
      assert.equal(doc.querySelector("[data-burgundy-confirm-presence]"), null, "no RSVP button without an RSVP block");
    });
  });

  test("guestbook honors show_guestbook=false", async () => {
    await withMount({ settings: { show_guestbook: false } }, async ({ doc }) => {
      assert.equal(doc.querySelector('[data-burgundy-section="guestbook"]'), null);
    });
  });

  test("French locale renders French copy and a lang attribute", async () => {
    MOCK_LOCALE = "fr";
    try {
      const React = require("react");
      const children = React.createElement("div", { "data-layout-block-type": "action_portal" }, "FR RSVP");
      await withMount({ data: baseData({ locale: "fr" }), children }, async ({ doc }) => {
        const page = doc.querySelector("[data-burgundy-page]");
        assert.equal(page.getAttribute("lang"), "fr", "lang follows the locale");
        assert.match(doc.body.textContent, /Galerie photos/);
        assert.match(doc.body.textContent, /Confirmer ma présence/);
        assert.doesNotMatch(doc.body.textContent, /Photo gallery/);
      });
    } finally {
      MOCK_LOCALE = "en";
    }
  });
});

describe("Burgundy Gold stage 2B — messages", () => {
  test("en and fr message files are valid, duplicate-free and at parity", () => {
    const en = flatKeys(EN_MESSAGES);
    const fr = flatKeys(FR_MESSAGES);
    assert.deepEqual([...en].filter((key) => !fr.has(key)), [], "no en key missing from fr");
    assert.deepEqual([...fr].filter((key) => !en.has(key)), [], "no fr key missing from en");

    // Both files keep the Events namespace and the burgundy prefix.
    for (const [file, parsed] of [["messages/en.json", EN_MESSAGES], ["messages/fr.json", FR_MESSAGES]]) {
      assert.ok(parsed.Events, `${file} keeps the Events namespace`);
      assert.ok(
        Object.keys(parsed.Events).filter((key) => key.startsWith("burgundy")).length >= 48,
        `${file} carries the burgundy keys`
      );
    }
  });

  test("every burgundy key used by the renderers exists in both locales under Events", () => {
    const sources = [
      "components/invitation/templates/burgundy-gold/BurgundyGoldPageTemplate.tsx",
      "components/invitation/templates/burgundy-gold/BurgundyGoldSections.tsx",
    ].map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"));
    const used = new Set();
    for (const source of sources) {
      for (const match of source.matchAll(/t\("(burgundy[A-Za-z0-9]+)"\)/g)) used.add(match[1]);
    }
    assert.ok(used.size > 0, "the renderers use burgundy message keys");
    for (const key of used) {
      assert.equal(typeof EN_MESSAGES.Events[key], "string", `missing en Events.${key}`);
      assert.equal(typeof FR_MESSAGES.Events[key], "string", `missing fr Events.${key}`);
    }
    // No inline EN/FR copy ternaries left in the renderers: any locale ternary
    // branch holding a sentence (whitespace-separated words) is copy.
    for (const source of sources) {
      assert.doesNotMatch(
        source,
        /locale === "fr"\s*\?\s*"[^"]*\s[^"]*"\s*:/,
        "copy must come from messages"
      );
    }
  });

  test("minimalism keys are untouched", () => {
    const en = Object.keys(EN_MESSAGES.Events).filter((key) => key.startsWith("minimalism"));
    const fr = Object.keys(FR_MESSAGES.Events).filter((key) => key.startsWith("minimalism"));
    assert.equal(en.length, 39);
    assert.deepEqual(en, fr);
  });
});
