const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../../..");

function compileTsx(relativePath, mocks = {}) {
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

async function inDom(run) {
  const { JSDOM } = require("jsdom");
  const React = require("react");
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://localhost/dashboard/org/example/kitchen",
  });
  const globalNames = ["window", "document", "navigator", "HTMLElement", "Node", "MutationObserver", "FormData"];
  const previousGlobals = new Map(globalNames.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  Object.defineProperties(globalThis, Object.fromEntries(globalNames.map((key) => [key, {
    configurable: true,
    value: dom.window[key],
  }])));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = require("react-dom/client").createRoot(dom.window.document.getElementById("root"));
  try {
    await run({ dom, React, root });
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

function simpleDialogComponents(React) {
  return {
    Dialog: ({ open, children }) => open ? React.createElement("div", { role: "dialog" }, children) : null,
    DialogContent: ({ children }) => React.createElement("div", null, children),
    DialogDescription: ({ children }) => React.createElement("p", null, children),
    DialogFooter: ({ children }) => React.createElement("div", null, children),
    DialogHeader: ({ children }) => React.createElement("div", null, children),
    DialogTitle: ({ children }) => React.createElement("h2", null, children),
  };
}

function mockButton(React) {
  return {
    Button: ({ children, type = "button", ...props }) => React.createElement("button", { type, ...props }, children),
  };
}

function tablerStubs(React) {
  const Icon = (props) => React.createElement("svg", { "aria-hidden": true, ...props });
  return { IconPlus: Icon, IconChevronDown: Icon };
}

function kitchenClient({ inviteCook, createCourier }) {
  const React = require("react");
  let refreshCalls = 0;
  const router = { refresh() { refreshCalls += 1; } };
  const actions = {
    createKitchen: async () => ({ ok: true }),
    deactivateCook: async () => ({ ok: true }),
    inviteCook,
    regenerateKitchenDisplayLink: async () => ({ ok: true }),
    reactivateWorker: async () => ({ ok: true, token: "token", path: "/kitchen/accept" }),
    resendCookInvitation: async () => ({ ok: true, token: "token", path: "/kitchen/accept" }),
    revokeCookInvitation: async () => ({ ok: true }),
    revokeKitchenDisplayLink: async () => ({ ok: true }),
  };
  const courierActions = {
    createCourier,
    deactivateCourier: async () => ({ ok: true }),
    inviteCourier: async () => ({ ok: true }),
    reactivateCourier: async () => ({ ok: true }),
    resendCourierInvitation: async () => ({ ok: true }),
    revokeCourierInvitation: async () => ({ ok: true }),
  };
  const routerMock = { useRouter: () => router };
  const intlMock = { useTranslations: () => (key) => key };
  const Button = mockButton(React);
  const Dialog = simpleDialogComponents(React);
  const commonMocks = {
    "next/navigation": routerMock,
    "@/components/ui/button": Button,
    "@/components/ui/dialog": Dialog,
    "@/components/ui/confirm-dialog": { ConfirmDialog: () => null },
    "@/components/dashboard/kitchen/CookPerformancePanel": { CookPerformancePanel: () => null },
    "@/components/dashboard/kitchen/CourierPerformancePanel": { CourierPerformancePanel: () => null },
    "@/components/dashboard/kitchen/ExpandablePersonnelRecord": { ExpandablePersonnelRecord: ({ name, status, details, children }) => React.createElement("li", null,
      React.createElement("details", null,
        React.createElement("summary", null, name, " ", status),
        React.createElement("div", null, details.map((detail) => React.createElement("p", { key: detail.label }, detail.label, ": ", detail.value)), children),
      ),
    ) },
    "@/components/dashboard/kitchen/ProgressiveDisclosure": { ProgressiveDisclosure: () => null },
    "@/components/dashboard/kitchen/CourierManagementClient": { CourierManagementClient: () => null },
    "@tabler/icons-react": tablerStubs(React),
    "@/lib/actions/kitchen-management": actions,
    "@/lib/actions/courier-management": courierActions,
  };
  const KitchenManagementClient = compileTsx("components/dashboard/kitchen/KitchenManagementClient.tsx", commonMocks).KitchenManagementClient;
  const CourierManagementClient = compileTsx("components/dashboard/kitchen/CourierManagementClient.tsx", {
    ...commonMocks,
    "next-intl": intlMock,
    "@/components/dashboard/kitchen/ExpandablePersonnelRecord": {
      ExpandablePersonnelRecord: ({ name, status, details, children }) => React.createElement("li", null,
        React.createElement("details", null,
          React.createElement("summary", null, name, " ", status),
          React.createElement("div", null, details.map((detail) => React.createElement("p", { key: detail.label }, detail.label, ": ", detail.value)), children),
        ),
      ),
    },
  }).CourierManagementClient;
  return { KitchenManagementClient, CourierManagementClient, router, getRefreshCalls: () => refreshCalls, React };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("personnel disclosure uses a compact native summary and hides secondary actions by default", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ExpandablePersonnelRecord } = compileTsx("components/dashboard/kitchen/ExpandablePersonnelRecord.tsx");
  const markup = renderToStaticMarkup(React.createElement("ul", null,
    React.createElement(ExpandablePersonnelRecord, {
      name: "Ada Cook",
      status: "Invitation sent",
      details: [{ label: "Phone", value: "+234 800 000 0000" }],
      children: React.createElement("button", { type: "button" }, "Resend invitation"),
    }),
  ));
  const summaryIndex = markup.indexOf("<summary");
  const detailsIndex = markup.indexOf("<details");
  assert.ok(detailsIndex >= 0);
  assert.ok(summaryIndex > detailsIndex);
  assert.ok(markup.includes("Ada Cook"));
  assert.ok(markup.includes("Invitation sent"));
  assert.ok(markup.includes("<summary"), "native summary provides browser keyboard and disclosure semantics");
  assert.ok(!/<details[^>]*\bopen(?:=|\s|>)/i.test(markup), "record starts collapsed");
  assert.ok(markup.includes("+234 800 000 0000"), "contact data remains available inside the collapsed disclosure");
});

test("cook and courier forms open on demand and keep values after recoverable failures", async () => {
  let cookCalls = 0;
  let courierCalls = 0;
  const cookInputs = [];
  const courierInputs = [];
  const { KitchenManagementClient, CourierManagementClient, getRefreshCalls, React } = kitchenClient({
    inviteCook: async (_organizerId, _businessId, input) => {
      cookInputs.push(input);
      cookCalls += 1;
      return cookCalls === 1
        ? { ok: false, error: "invalid_phone" }
        : { ok: true, token: "cook-secret", path: "/kitchen/accept" };
    },
    createCourier: async (input) => {
      courierInputs.push(input);
      courierCalls += 1;
      return courierCalls === 1
        ? { ok: false, error: "invalid_phone" }
        : { ok: true, token: "courier-secret", path: "/courier/accept" };
    },
  });

  await inDom(async ({ dom, root }) => {
    const organizerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const business = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Aldriva Kitchen", kitchen: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", displayLink: null }, cooks: [] };
    const courierBusiness = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Aldriva Kitchen", couriers: [] };

    await React.act(async () => root.render(React.createElement("div", null,
      React.createElement(KitchenManagementClient, { organizerId, businesses: [business], courierBusinesses: [] }),
      React.createElement(CourierManagementClient, { organizerId, businesses: [courierBusiness] }),
    )));

    assert.equal(dom.window.document.querySelectorAll('input[name="fullName"]').length, 0, "creation fields are absent until requested");

    const clickButton = async (label) => React.act(async () => {
      [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes(label)).click();
      await tick();
    });
    const submitForm = async (dialogName) => React.act(async () => {
      const dialog = [...dom.window.document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes(dialogName));
      dialog.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      await tick();
    });
    const fill = (dialogName, values) => {
      const dialog = [...dom.window.document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes(dialogName));
      for (const [name, value] of Object.entries(values)) dialog.querySelector(`[name="${name}"]`).value = value;
      return dialog;
    };

    await clickButton("Add cook");
    let cookDialog = fill("Add a cook", {
      fullName: "Ada Cook",
      phone: "123",
      whatsappNumber: "123",
    });
    await submitForm("Add a cook");
    cookDialog = [...dom.window.document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes("Add a cook"));
    assert.ok(cookDialog, "failed cook submission leaves the dialog open");
    assert.equal(cookDialog.querySelector('[name="fullName"]').value, "Ada Cook");
    assert.ok(cookDialog.querySelector('[role="alert"]'));
    await submitForm("Add a cook");
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null, "successful cook creation closes the form");
    assert.deepEqual(cookInputs[1], { fullName: "Ada Cook", phone: "123", whatsappNumber: "123" });

    await clickButton("Add courier");
    let courierDialog = fill("Add a courier", {
      fullName: "Bea Courier",
      phone: "123",
      whatsappNumber: "123",
    });
    await submitForm("Add a courier");
    courierDialog = [...dom.window.document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes("Add a courier"));
    assert.ok(courierDialog, "failed courier submission leaves the dialog open");
    assert.equal(courierDialog.querySelector('[name="fullName"]').value, "Bea Courier");
    assert.ok(courierDialog.querySelector('[role="alert"]'));
    await submitForm("Add a courier");
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null, "successful courier creation closes the form");
    assert.deepEqual(courierInputs[1], {
      organizerId,
      businessId: courierBusiness.id,
      fullName: "Bea Courier",
      phone: "123",
      whatsappNumber: "123",
    });
    assert.ok(dom.window.document.body.textContent.includes("copy now"), "the one-time invite link remains visible after success");
    assert.equal(getRefreshCalls(), 2, "successful submissions refresh the current page data");
  });
});
