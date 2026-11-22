const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
const TOKEN = "a".repeat(64);
const GENERIC_REJECTION = "This invitation could not be redeemed. Check the details or request a new invitation.";

function compileTs(relativePath, mocks = {}) {
  const filename = path.join(ROOT, relativePath);
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
  const mockedRequire = (request) => {
    if (request === "react") return React;
    if (request === "react/jsx-runtime") return require("react/jsx-runtime");
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return require(request);
  };
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, mockedRequire);
  return compiledModule.exports;
}

function redeemClient(router) {
  const React = require("react");
  const redeemLink = compileTs("lib/staff/redeem-link.ts");
  const native = (tag) => (props) => React.createElement(tag, props, props.children);
  return compileTs("app/events/team/redeem/RedeemClient.tsx", {
    "next/navigation": { useRouter: () => router },
    "@/components/ui/button": { Button: native("button") },
    "@/components/ui/input": { Input: native("input") },
    "@/components/ui/label": { Label: native("label") },
    "@/lib/staff/redeem-link": redeemLink,
  }).default;
}

async function inDom(run, hash = "") {
  const { JSDOM } = require("jsdom");
  const React = require("react");
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: `https://localhost/events/team/redeem${hash}`,
  });
  const names = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "MutationObserver", "FormData"];
  const previous = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const previousFetch = globalThis.fetch;
  Object.defineProperties(globalThis, Object.fromEntries(names.map((name) => [name, {
    configurable: true,
    value: dom.window[name],
  }])));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = require("react-dom/client").createRoot(dom.window.document.getElementById("root"));
  try {
    await run({ dom, React, root });
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    if (previousAct === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

async function mount({ dom, React, root }, router = { replace() {} }, strict = false) {
  const Client = redeemClient(router);
  const tree = React.createElement(Client);
  await React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, tree) : tree));
  return {
    input: dom.window.document.querySelector("#phone-last-four"),
    button: dom.window.document.querySelector('button[type="submit"]'),
    form: dom.window.document.querySelector("form"),
  };
}

async function typeDigits(dom, React, input, digits) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  for (const digit of digits) {
    await React.act(async () => {
      setter.call(input, input.value + digit);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
}

function setFragment(dom, React, fragment) {
  dom.window.history.pushState(dom.window.history.state, "", `/events/team/redeem${fragment}`);
  return React.act(async () => dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange")));
}

test("captures a same-tab invitation fragment and enables submit only at four controlled digits", async () => {
  await inDom(async ({ dom, React, root }) => {
    const { input, button } = await mount({ dom, React, root });
    assert.equal(button.disabled, true, "missing token keeps submit disabled");

    await setFragment(dom, React, `#token=${TOKEN}`);
    assert.equal(dom.window.location.hash, "", "bearer token fragment is removed from browser history");
    assert.equal(button.disabled, true, "token alone is insufficient");

    await typeDigits(dom, React, input, "123");
    assert.equal(input.value, "123", "controlled input updates after each keystroke");
    assert.equal(button.disabled, true, "three digits keep submit disabled");

    await typeDigits(dom, React, input, "4");
    assert.equal(input.value, "1234");
    assert.equal(button.disabled, false, "four digits and a captured token enable submit");
  });
});

test("keeps the initial token across React Strict Mode effect replay", async () => {
  await inDom(async ({ dom, React, root }) => {
    const { input, button } = await mount({ dom, React, root }, { replace() {} }, true);
    assert.equal(dom.window.location.hash, "", "initial bearer fragment is scrubbed");
    await typeDigits(dom, React, input, "9876");
    assert.equal(button.disabled, false, "Strict Mode replay does not erase the token captured by the first effect");
  }, `#token=${TOKEN}`);
});

test("submits incorrect digits to the server and displays its generic verification error", async () => {
  await inDom(async ({ dom, React, root }) => {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return { ok: false, status: 400, json: async () => ({ error: GENERIC_REJECTION }) };
    };
    const { input, button } = await mount({ dom, React, root });
    await setFragment(dom, React, `#token=${TOKEN}`);
    await typeDigits(dom, React, input, "0000");
    await React.act(async () => button.click());

    assert.equal(request.url, "/api/events/team/redeem");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.cache, "no-store");
    assert.equal(request.options.credentials, "same-origin");
    assert.deepEqual(JSON.parse(request.options.body), { token: TOKEN, phoneLast4: "0000" });
    assert.equal(dom.window.location.hash, "", "token is not left in the referrer URL");
    assert.equal(dom.window.location.search, "", "token is not placed in query parameters");
    assert.equal(dom.window.document.querySelector('[role="alert"]').textContent, GENERIC_REJECTION);
    assert.equal(button.disabled, false, "a rejected attempt does not leave the form loading");
  });
});

test("successful redemption opens only the workspace returned by the server", async () => {
  await inDom(async ({ dom, React, root }) => {
    const router = { destination: "", replace(value) { this.destination = value; } };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ workspaceUrl: "/events/event-1/staff-scanner" }) });
    const { input, button } = await mount({ dom, React, root }, router);
    await setFragment(dom, React, `#token=${TOKEN}`);
    await typeDigits(dom, React, input, "2468");
    await React.act(async () => button.click());
    assert.equal(router.destination, "/events/event-1/staff-scanner");
  });
});

test("failed requests show an error and clear loading state so the member can retry", async () => {
  await inDom(async ({ dom, React, root }) => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) throw new Error("network unavailable");
      return { ok: false, status: 503, json: async () => ({ error: "Invitation redemption is temporarily unavailable. Please try again." }) };
    };
    const { input, button } = await mount({ dom, React, root });
    await setFragment(dom, React, `#token=${TOKEN}`);
    await typeDigits(dom, React, input, "1357");
    await React.act(async () => button.click());
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /temporarily unavailable/);
    assert.equal(button.disabled, false);
    await React.act(async () => button.click());
    assert.equal(calls, 2, "a backend failure can be retried");
    assert.equal(button.disabled, false, "loading state is cleared after backend failure too");
  });
});

test("fragment helper accepts only the generated token shape", () => {
  const { invitationTokenFromFragment, invitationUrlWithoutFragment } = compileTs("lib/staff/redeem-link.ts");
  assert.equal(invitationTokenFromFragment(`#token=${TOKEN}`), TOKEN);
  assert.equal(invitationTokenFromFragment("#token=short"), null);
  assert.equal(invitationTokenFromFragment("#other=value"), null);
  assert.equal(invitationUrlWithoutFragment("/events/team/redeem", "?source=email"), "/events/team/redeem?source=email");
});

test("redemption API keeps inactive invitations generic and creates cookies only after a valid result", () => {
  const route = fs.readFileSync(path.join(ROOT, "app/api/events/team/redeem/route.ts"), "utf8");
  assert.match(route, /const GENERIC_REJECTION = "This invitation could not be redeemed\. Check the details or request a new invitation\."/);
  assert.match(route, /if \(!row[\s\S]*?return json\(requestId, \{ error: GENERIC_REJECTION, code: "invitation_invalid" \}, 400\)/);
  assert.ok(route.indexOf('return json(requestId, { error: GENERIC_REJECTION, code: "invitation_invalid" }, 400)') < route.indexOf("response.cookies.set({"),
    "missing, expired, consumed, revoked, locked, and wrong-phone results cannot receive a session cookie");
  assert.match(route, /Cache-Control[\s\S]*?Referrer-Policy[\s\S]*?no-referrer/);
  assert.doesNotMatch(route, /searchParams\.get\("token"\)/);
  assert.doesNotMatch(route, /console\.(?:log|error|warn)\([^\n]*\btoken\b/i);
});
