// Mocked Stage 3C UI tests; the server action is replaced with deterministic responses.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const { IntlMessageFormat } = require("intl-messageformat");

const ROOT = path.resolve(__dirname, "../../../..");
const COOK_IDS = {
  Ada: "11111111-1111-4111-8111-111111111111",
  Zoe: "22222222-2222-4222-8222-222222222222",
  Inactive: "33333333-3333-4333-8333-333333333333",
  Before: "44444444-4444-4444-8444-444444444444",
  Today: "55555555-5555-4555-8555-555555555555",
};

function loadPanel(getCookPerformancePanelData) {
  const filename = path.join(ROOT, "components/dashboard/kitchen/CookPerformancePanel.tsx");
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
  const React = require("react");
  const messages = require(path.join(ROOT, "messages/en.json")).Organizer.cookPerformance;
  const translate = (key, values = {}) => new IntlMessageFormat(messages[key] ?? key, "en").format(values);
  const mockedRequire = (request) => {
    if (request === "react") return React;
    if (request === "react/jsx-runtime") return require("react/jsx-runtime");
    if (request === "next-intl") return { useTranslations: () => translate, useLocale: () => "en" };
    if (request === "@/lib/actions/cook-performance-panel") return { getCookPerformancePanelData };
    return require(request);
  };
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, mockedRequire);
  return compiledModule.exports.CookPerformancePanel;
}

function makeRow(name, overrides = {}) {
  return {
    cook_worker_id: COOK_IDS[name] ?? COOK_IDS.Ada,
    cook_name: name,
    cook_is_active: true,
    orders_handled: 8,
    accepted_to_preparing_n: 5,
    accepted_to_preparing_median_minutes: 12,
    preparing_to_ready_n: 5,
    preparing_to_ready_median_minutes: 18,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve: (value) => resolve(value) };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function renderPanel(getCookPerformancePanelData, run) {
  const { JSDOM } = require("jsdom");
  const React = require("react");
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://localhost/dashboard/org/organizer/kitchen",
  });
  const globals = ["window", "document", "navigator", "HTMLElement", "Node"];
  const previousGlobals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, value: dom.window.Node },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = require("react-dom/client").createRoot(dom.window.document.getElementById("root"));
  try {
    const Panel = loadPanel(getCookPerformancePanelData);
    await React.act(async () => {
      root.render(React.createElement(Panel, {
        organizerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        businessId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }));
      await tick();
    });
    await run({ document: dom.window.document, React });
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("mocked: defaults to 7 days, switches range, and keeps prior rows while loading", async () => {
  const first = deferred();
  const today = deferred();
  const calls = [];
  const load = (...args) => {
    calls.push(args);
    return calls.length === 1 ? first.promise : today.promise;
  };

  await renderPanel(load, async ({ document, React }) => {
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "7-days",
    ]);
    assert.ok(document.querySelector('[role="status"]'), "initial fetch shows loading");
    assert.equal(document.body.textContent.includes("Before change"), false, "no data before a response");

    await React.act(async () => {
      first.resolve({ ok: true, rows: [makeRow("Before")] });
      await tick();
    });
    assert.ok(document.body.textContent.includes("Before"));

    const todayTab = [...document.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.textContent.trim() === "Today");
    await React.act(async () => { todayTab.click(); await tick(); });

    assert.deepEqual(calls[1], [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "today",
    ]);
    assert.equal(todayTab.getAttribute("aria-selected"), "true");
    assert.ok(document.querySelector('[role="status"]'), "range change shows loading");
    assert.ok(document.body.textContent.includes("Before"), "previous rows remain during loading");
    assert.ok(document.body.textContent.includes("Showing: 7 days"));
    const previousRows = document.querySelector('[aria-label="Cook performance records"]');
    assert.equal(previousRows.getAttribute("aria-busy"), "true");
    assert.ok(previousRows.className.includes("opacity-60"));

    await React.act(async () => {
      today.resolve({ ok: true, rows: [makeRow("Today")] });
      await tick();
    });
    assert.ok(document.body.textContent.includes("Today"));
    assert.equal(document.body.textContent.includes("Before"), false);
    assert.equal(document.body.textContent.includes("Showing: 7 days"), false);
    assert.equal(document.querySelector('[aria-label="Cook performance records"]')?.getAttribute("aria-busy"), "false");
  });
});

test("mocked: suppressed and visible medians retain their sample counts", async () => {
  await renderPanel(async () => ({
    ok: true,
    rows: [makeRow("Ada", {
      accepted_to_preparing_n: 2,
      accepted_to_preparing_median_minutes: null,
      preparing_to_ready_n: 5,
      preparing_to_ready_median_minutes: 12,
    })],
  }), async ({ document }) => {
    assert.ok(document.body.textContent.includes("– · 2 orders"));
    assert.ok(document.body.textContent.includes("12 min · 5 orders"));
    assert.ok(document.body.textContent.includes("– means fewer than 3 orders."));
  });
});

test("mocked: late response from an earlier range cannot overwrite the newer range", async () => {
  const firstRange = deferred();
  const secondRange = deferred();
  const calls = [];
  const load = (...args) => {
    calls.push(args);
    return calls.length === 1 ? firstRange.promise : secondRange.promise;
  };

  await renderPanel(load, async ({ document, React }) => {
    const todayTab = [...document.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.textContent.trim() === "Today");
    await React.act(async () => { todayTab.click(); await tick(); });
    assert.equal(calls.length, 2);

    await React.act(async () => {
      secondRange.resolve({ ok: true, rows: [makeRow("Today")] });
      await tick();
    });
    assert.ok(document.body.textContent.includes("Today"));

    await React.act(async () => {
      firstRange.resolve({ ok: true, rows: [makeRow("Before")] });
      await tick();
    });
    assert.ok(document.body.textContent.includes("Today"));
    assert.equal(document.body.textContent.includes("Before"), false);
  });
});

test("mocked: successful empty response shows the requested empty state", async () => {
  await renderPanel(async () => ({ ok: true, rows: [] }), async ({ document }) => {
    assert.ok(document.body.textContent.includes("No cook activity in this period"));
    assert.equal(document.querySelector('[role="alert"]'), null);
  });
});

test("mocked: error offers retry and replaces the error after a successful retry", async () => {
  let calls = 0;
  await renderPanel(async () => {
    calls += 1;
    if (calls === 1) return { ok: true, rows: [makeRow("Before")] };
    if (calls === 2) return { ok: false, error: "unavailable" };
    return { ok: true, rows: [makeRow("Ada")] };
  }, async ({ document, React }) => {
    const todayTab = [...document.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.textContent.trim() === "Today");
    await React.act(async () => { todayTab.click(); await tick(); });
    assert.ok(document.querySelector('[role="alert"]'));
    assert.ok(document.body.textContent.includes("Cook performance could not be loaded."));
    assert.equal(document.body.textContent.includes("Before"), false, "error does not leave another period's rows visible");
    const retry = [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Retry");
    await React.act(async () => { retry.click(); await tick(); });
    assert.equal(calls, 3);
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.ok(document.body.textContent.includes("Ada"));
  });
});

test("mocked: component preserves function order and adds no ranking or speed sort", async () => {
  const source = fs.readFileSync(path.join(ROOT, "components/dashboard/kitchen/CookPerformancePanel.tsx"), "utf8");
  assert.doesNotMatch(source, /\.sort\s*\(/);
  assert.doesNotMatch(source, /leaderboard|rank(ed|ing)?/i);
  await renderPanel(async () => ({
    ok: true,
    rows: [
      makeRow("Ada", { preparing_to_ready_median_minutes: 90 }),
      makeRow("Zoe", { preparing_to_ready_median_minutes: 1 }),
    ],
  }), async ({ document }) => {
    const names = [...document.querySelectorAll("[data-cook-name]")].map((node) => node.textContent);
    assert.deepEqual(names, ["Ada", "Zoe"], "the function's alphabetical order is retained despite different speeds");
    assert.equal(/\b#?1\b/.test(document.body.textContent), false, "no ranking number is rendered");
  });
});

test("mocked: deactivated cook gets the neutral Inactive badge", async () => {
  await renderPanel(async () => ({
    ok: true,
    rows: [makeRow("Inactive", { cook_is_active: false })],
  }), async ({ document }) => {
    const card = document.querySelector("[data-cook-row]");
    assert.ok(card);
    assert.ok(card.textContent.includes("Inactive"));
    assert.ok(card.querySelector("span")?.className.includes("text-muted-foreground"));
  });
});

test("mocked: cook performance messages include matching English and French UI keys", () => {
  const en = require(path.join(ROOT, "messages/en.json")).Organizer.cookPerformance;
  const fr = require(path.join(ROOT, "messages/fr.json")).Organizer.cookPerformance;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  assert.equal(en.empty, "No cook activity in this period");
  assert.equal(en.inactive, "Inactive");
  assert.match(en.medianWithOrders, /\{count, plural, one \{# order\} other \{# orders\}\}/);
  assert.match(fr.medianWithOrders, /\{count, plural, one \{# commande\} other \{# commandes\}\}/);
  assert.equal(new IntlMessageFormat(fr.medianWithOrders, "fr").format({ value: "–", count: 0 }), "– · 0 commande");
  assert.ok(en.medianSampleNote.includes("fewer than 3"));
  assert.ok(fr.medianSampleNote.includes("moins de 3"));
  assert.ok(en.showingRange.includes("Showing:"));
  assert.ok(fr.showingRange.includes("Période affichée"));
  assert.ok(en.creditNote.includes("credited"));
  assert.ok(fr.creditNote.includes("crédité"));
});
