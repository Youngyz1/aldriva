const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const COOKIE_CONSENT_PATH = path.join(ROOT, "components/CookieConsent.tsx");
const WORKER_VALIDATION_PATH = path.join(ROOT, "lib/kitchen/worker-validation.ts");
const CONSENT_KEY = "Aldriva-cookie-consent";
const EN_MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const FR_MESSAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

function loadTypeScript(filePath, mocks = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = new Module(filePath, module);
  loadedModule.filename = filePath;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  const originalLoad = Module._load;

  Module._load = function loadMockedDependency(request, parent, isMain) {
    if (parent?.filename === filePath && Object.hasOwn(mocks, request)) {
      return mocks[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    loadedModule._compile(compiled, filePath);
  } finally {
    Module._load = originalLoad;
  }

  return loadedModule.exports;
}

const workerValidation = loadTypeScript(WORKER_VALIDATION_PATH);

function createCookieConsentRuntime(initialPathname, locale = "en") {
  let pathname = initialPathname;
  let hookIndex = 0;
  let pendingEffects = [];
  const hooks = [];
  const timers = new Map();
  const storage = new Map();
  const storageReads = [];
  const storageWrites = [];
  let now = 0;
  let nextTimerId = 1;

  const localStorage = {
    getItem(key) {
      storageReads.push(key);
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storageWrites.push([key, value]);
      storage.set(key, String(value));
    },
  };

  const originalWindow = global.window;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.window = { localStorage };
  global.setTimeout = (callback, delay = 0) => {
    const id = nextTimerId++;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  global.clearTimeout = (id) => timers.delete(id);

  function useState(initialValue) {
    const index = hookIndex++;
    if (!Object.hasOwn(hooks, index)) {
      hooks[index] = typeof initialValue === "function" ? initialValue() : initialValue;
    }
    const setState = (value) => {
      hooks[index] = typeof value === "function" ? value(hooks[index]) : value;
    };
    return [hooks[index], setState];
  }

  function useEffect(effect, dependencies) {
    const index = hookIndex++;
    const previous = hooks[index];
    const changed = !previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]));
    if (changed) {
      pendingEffects.push(() => {
        previous?.cleanup?.();
        const cleanup = effect();
        hooks[index] = { dependencies: [...dependencies], cleanup };
      });
    }
  }

  const jsxRuntime = {
    Fragment: "Fragment",
    jsx: (type, props, key) => ({ type, props: props ?? {}, key }),
    jsxs: (type, props, key) => ({ type, props: props ?? {}, key }),
  };
  const messages = locale === "fr" ? FR_MESSAGES : EN_MESSAGES;
  const mocks = {
    react: { useEffect, useState },
    "react/jsx-runtime": jsxRuntime,
    "next/link": { __esModule: true, default: "Link" },
    "next/navigation": { usePathname: () => pathname },
    "next-intl": {
      useTranslations: (namespace) => (key) => messages[namespace][key],
    },
    "lucide-react": { Cookie: "CookieIcon" },
    "framer-motion": { motion: { div: "motion.div" }, AnimatePresence: "AnimatePresence" },
    "@/lib/kitchen/worker-validation": workerValidation,
  };
  const CookieConsent = loadTypeScript(COOKIE_CONSENT_PATH, mocks).default;

  function render() {
    let output;
    for (let pass = 0; pass < 2; pass += 1) {
      hookIndex = 0;
      pendingEffects = [];
      output = CookieConsent();
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach((runEffect) => runEffect());
    }
    return output;
  }

  function advance(milliseconds) {
    now += milliseconds;
    const ready = [...timers.entries()]
      .filter(([, timer]) => timer.at <= now)
      .sort((a, b) => a[1].at - b[1].at);
    for (const [id, timer] of ready) {
      timers.delete(id);
      timer.callback();
    }
  }

  function navigate(nextPathname) {
    pathname = nextPathname;
    return render();
  }

  function dispose() {
    for (const hook of hooks) hook?.cleanup?.();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }

  return {
    advance,
    dispose,
    navigate,
    render,
    storageReads,
    storageWrites,
    timerCount: () => timers.size,
  };
}

function hasCookieBanner(node) {
  if (Array.isArray(node)) return node.some(hasCookieBanner);
  if (!node || typeof node !== "object") return false;
  if (node.props?.role === "dialog") return true;
  return hasCookieBanner(node.props?.children);
}

function findNode(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  return findNode(node.props?.children, predicate);
}

function nodeText(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (!node || typeof node !== "object") return "";
  return nodeText(node.props?.children);
}

test("mocked: cookie banner stays hidden without storage access or timers on worker routes", () => {
  const paths = [
    "/courier",
    "/fr/courier",
    "/courier/accept",
    "/kitchen",
    "/kitchen/accept",
    "/kitchen/display",
    "/fr/kitchen",
  ];

  for (const pathname of paths) {
    const runtime = createCookieConsentRuntime(pathname);
    try {
      assert.equal(hasCookieBanner(runtime.render()), false, pathname);
      assert.equal(runtime.timerCount(), 0, pathname);
      assert.deepEqual(runtime.storageReads, [], pathname);
      assert.deepEqual(runtime.storageWrites, [], pathname);
    } finally {
      runtime.dispose();
    }
  }
});

test("mocked: cookie banner appears after 800 ms on public routes", () => {
  for (const pathname of ["/", "/events/example", "/dashboard/org/example/kitchen"]) {
    const runtime = createCookieConsentRuntime(pathname);
    try {
      assert.equal(hasCookieBanner(runtime.render()), false, pathname);
      assert.equal(runtime.timerCount(), 1, pathname);
      runtime.advance(799);
      assert.equal(hasCookieBanner(runtime.render()), false, pathname);
      runtime.advance(1);
      assert.equal(hasCookieBanner(runtime.render()), true, pathname);
      assert.deepEqual(runtime.storageReads, [CONSENT_KEY], pathname);
    } finally {
      runtime.dispose();
    }
  }
});

test("mocked: segment boundaries leave kitchenware and courier-services public", () => {
  for (const pathname of ["/kitchenware", "/courier-services"]) {
    const runtime = createCookieConsentRuntime(pathname);
    try {
      runtime.render();
      runtime.advance(800);
      assert.equal(hasCookieBanner(runtime.render()), true, pathname);
      assert.deepEqual(runtime.storageReads, [CONSENT_KEY], pathname);
    } finally {
      runtime.dispose();
    }
  }
});

test("mocked: client navigation hides on worker paths and restores delayed public visibility", () => {
  const runtime = createCookieConsentRuntime("/");
  try {
    runtime.render();
    runtime.advance(800);
    assert.equal(hasCookieBanner(runtime.render()), true);

    assert.equal(hasCookieBanner(runtime.navigate("/courier")), false);
    assert.equal(runtime.timerCount(), 0);
    assert.deepEqual(runtime.storageWrites, []);

    assert.equal(hasCookieBanner(runtime.navigate("/events/example")), false);
    assert.equal(runtime.timerCount(), 1);
    runtime.advance(799);
    assert.equal(hasCookieBanner(runtime.render()), false);
    runtime.advance(1);
    assert.equal(hasCookieBanner(runtime.render()), true);
    assert.deepEqual(runtime.storageWrites, []);
  } finally {
    runtime.dispose();
  }
});

test("mocked: null pathname stays hidden without starting a timer or reading storage", () => {
  const runtime = createCookieConsentRuntime(null);
  try {
    assert.equal(hasCookieBanner(runtime.render()), false);
    assert.equal(runtime.timerCount(), 0);
    assert.deepEqual(runtime.storageReads, []);
    assert.deepEqual(runtime.storageWrites, []);
  } finally {
    runtime.dispose();
  }
});

test("mocked: invitation and website preview routes keep the compact banner", () => {
  for (const pathname of ["/invitation/example", "/website-preview/example"]) {
    const runtime = createCookieConsentRuntime(pathname);
    try {
      runtime.render();
      runtime.advance(800);
      const output = runtime.render();
      const findBanner = (node) => {
        if (Array.isArray(node)) return node.map(findBanner).find(Boolean);
        if (!node || typeof node !== "object") return null;
        if (node.props?.role === "dialog") return node;
        return findBanner(node.props?.children);
      };
      assert.match(findBanner(output)?.props?.className ?? "", /fixed bottom-4 left-4/);
    } finally {
      runtime.dispose();
    }
  }
});

test("mocked: banner copy, labels, and aria-label render from EN and FR messages", () => {
  for (const [locale, messages] of [["en", EN_MESSAGES], ["fr", FR_MESSAGES]]) {
    const runtime = createCookieConsentRuntime("/", locale);
    try {
      runtime.render();
      runtime.advance(800);
      const output = runtime.render();
      const banner = findNode(output, (node) => node.props?.role === "dialog");
      const decline = findNode(output, (node) => node.props?.id === "cookie-decline");
      const accept = findNode(output, (node) => node.props?.id === "cookie-accept");

      assert.ok(banner, locale);
      assert.ok(
        nodeText(banner).includes(messages.Common.cookieBannerDescription),
        `${locale}: ${JSON.stringify(nodeText(banner))}`,
      );
      assert.equal(banner.props["aria-label"], messages.Common.cookieBannerAriaLabel);
      assert.equal(decline?.props?.children, messages.Common.cookieBannerDecline);
      assert.equal(accept?.props?.children, messages.Common.cookieBannerAccept);
      assert.ok(nodeText(banner).includes(messages.Common.cookies), locale);
    } finally {
      runtime.dispose();
    }
  }
});

test("mocked: banner copy contains no invitation-specific wording on public and invitation routes", () => {
  for (const pathname of ["/", "/events/example", "/invitation/example"]) {
    const runtime = createCookieConsentRuntime(pathname);
    try {
      runtime.render();
      runtime.advance(800);
      const banner = findNode(runtime.render(), (node) => node.props?.role === "dialog");
      assert.ok(banner, pathname);
      assert.doesNotMatch(nodeText(banner), /invitation/i, pathname);
    } finally {
      runtime.dispose();
    }
  }
});

test("mocked: Accept and Decline save their respective consent choices", () => {
  for (const [id, choice] of [["cookie-accept", "accepted"], ["cookie-decline", "declined"]]) {
    const runtime = createCookieConsentRuntime("/");
    try {
      runtime.render();
      runtime.advance(800);
      const button = findNode(runtime.render(), (node) => node.props?.id === id);
      assert.ok(button, id);
      button.props.onClick();
      assert.deepEqual(runtime.storageWrites, [[CONSENT_KEY, choice]]);
      assert.equal(hasCookieBanner(runtime.render()), false);
    } finally {
      runtime.dispose();
    }
  }
});
