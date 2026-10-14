/**
 * lib/__tests__/phase4-ordering-payments-panel.test.cjs
 *
 * Phase 4 Addendum: "Ordering & payments" panel in builder, plus fulfilment rule.
 *
 * Hermetic tests covering:
 * 1. Toggle writes validated keys via updateBusiness mock
 * 2. Unknown keys rejected by validateBusinessOfferings / updateBusiness
 * 3. Role gating (owner/admin/manager allowed; editor/viewer/unauthenticated rejected)
 * 4. Status reasons (no_fulfilment, no_active_dish, currency_not_supported, feature_not_built, live, off)
 * 5. Fulfilment rule (online_ordering resolves to OFF unless pickup or delivery ticked; unset offerings unchanged; isFulfilmentMissing helper)
 * 6. EN/FR translation parity for all added keys
 * 7. No panel rendered for unbuilt templates (rental-driveline)
 * 8. Render test for OrderingPaymentsPanel (header, toggles, badges, live notice, read-only mode, fulfilment warning)
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

// Transpile .ts
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

// Transpile .tsx
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

// Alias resolution
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "stub-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "stub-service-key";

// Load messages for mock next-intl
const enMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const frMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

function getNestedMessage(obj, keyPath) {
  const parts = keyPath.split(".");
  let cur = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function createTranslator(namespace, messages = enMessages) {
  const nsObj = messages[namespace] || {};
  return function t(key, params) {
    let raw = getNestedMessage(nsObj, key);
    if (!raw) return key;
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params)) {
        raw = raw.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return raw;
  };
}

let mockCurrentUser = { id: "user-owner" };
let mockIsAdmin = false;
let mockTenantRole = "owner";
let mockUpdatedPayload = null;

const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  if (request === "next-intl") {
    return {
      useTranslations: (ns) => createTranslator(ns, enMessages),
    };
  }
  if (request === "next/navigation") {
    return {
      notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
      redirect: (url) => { throw new Error(`NEXT_REDIRECT:${url}`); },
    };
  }
  if (request === "next/cache") {
    return {
      revalidatePath: () => {},
    };
  }
  if (request === "next/headers") {
    return {
      cookies: async () => ({
        get: () => undefined,
        set: () => {},
        getAll: () => [],
      }),
      headers: async () => ({
        get: () => null,
      }),
    };
  }
  if (request.endsWith("lib/supabase-server") || request.endsWith("lib/supabase-server.ts")) {
    return {
      createSupabaseServer: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: mockCurrentUser },
            error: null,
          }),
        },
      }),
    };
  }
  if (request.endsWith("lib/auth") || request.endsWith("lib/auth.ts")) {
    const real = originalLoad.call(this, request, parent, isMain);
    return {
      ...real,
      getCurrentUser: async () => mockCurrentUser,
      isAdmin: async () => mockIsAdmin,
    };
  }
  if (request.endsWith("lib/entity-auth") || request.endsWith("lib/entity-auth.ts")) {
    const real = originalLoad.call(this, request, parent, isMain);
    return {
      ...real,
      checkTenantAccess: async (userId, orgId, allowedRoles) => {
        if (!mockCurrentUser) return { hasAccess: false };
        if (allowedRoles.includes(mockTenantRole)) {
          return { hasAccess: true, role: mockTenantRole };
        }
        return { hasAccess: false, role: mockTenantRole };
      },
    };
  }
  if (request.endsWith("lib/supabase-admin") || request.endsWith("lib/supabase-admin.ts")) {
    return {
      createSupabaseAdmin: () => ({
        from: (table) => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "biz-1",
                  organizer_id: "org-1",
                  owner_id: "user-owner",
                  business_type: "Full-Service Restaurant",
                  category: "Restaurant",
                  industry: "Food & Beverage",
                  offerings: ["pickup"],
                },
                error: null,
              }),
              maybeSingle: async () => ({
                data: {
                  id: "biz-1",
                  organizer_id: "org-1",
                  owner_id: "user-owner",
                  business_type: "Full-Service Restaurant",
                  category: "Restaurant",
                  industry: "Food & Beverage",
                  offerings: ["pickup"],
                },
                error: null,
              }),
            }),
          }),
          update: (payload) => ({
            eq: () => ({
              select: () => ({
                single: async () => {
                  mockUpdatedPayload = payload;
                  return { data: { id: "biz-1", slug: "chez-mama", ...payload }, error: null };
                },
              }),
              single: async () => {
                mockUpdatedPayload = payload;
                return { data: { id: "biz-1", slug: "chez-mama", ...payload }, error: null };
              },
            }),
          }),
        }),
      }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Imports under test
const {
  resolveStorefrontFeatures,
  computeFeatureStatus,
  isFulfilmentMissing,
  STOREFRONT_STATUS_REASONS,
} = require("../storefront-features.ts");

const {
  validateBusinessOfferings,
} = require("../business-offerings.ts");

const {
  updateBusiness,
} = require("../actions/businesses.ts");

const {
  getFlagshipTemplate,
} = require("../website-template-v2.ts");

const {
  OrderingPaymentsPanel,
} = require("../../components/dashboard/website/v2/OrderingPaymentsPanel.tsx");

// ── 1. Toggle writes validated keys via updateBusiness ──────────────────────

test("Phase 4 Addendum: updateBusiness writes validated offerings keys", async () => {
  mockCurrentUser = { id: "user-owner" };
  mockTenantRole = "owner";
  mockUpdatedPayload = null;

  const result = await updateBusiness("biz-1", {
    offerings: ["online_ordering", "pickup", "online_payment"],
  });

  assert.equal(result.success, true);
  assert.ok(mockUpdatedPayload);
  assert.deepEqual(mockUpdatedPayload.offerings, ["online_ordering", "pickup", "online_payment"]);
});

// ── 2. Unknown keys rejected ────────────────────────────────────────────────

test("Phase 4 Addendum: unknown offerings keys are rejected", async () => {
  mockCurrentUser = { id: "user-owner" };
  mockTenantRole = "owner";

  // validateBusinessOfferings rejects unknown key
  const validation = validateBusinessOfferings(["invalid_offering_key"], "Full-Service Restaurant", "Restaurant");
  assert.equal(validation.valid, false);
  assert.match(validation.error || "", /Unknown offering/i);

  // updateBusiness returns failure on unknown keys
  const result = await updateBusiness("biz-1", {
    offerings: ["online_ordering", "fake_bogus_key"],
  });

  assert.equal(result.success, false);
  assert.match(result.error || "", /unknown offering/i);
});

// ── 3. Role gating ──────────────────────────────────────────────────────────

test("Phase 4 Addendum: role gating allows owner, admin, manager; rejects others", async () => {
  mockCurrentUser = { id: "user-owner" };
  mockTenantRole = "owner";
  let res = await updateBusiness("biz-1", { offerings: ["pickup"] });
  assert.equal(res.success, true, "owner allowed");

  mockCurrentUser = { id: "user-admin" };
  mockTenantRole = "admin";
  res = await updateBusiness("biz-1", { offerings: ["pickup"] });
  assert.equal(res.success, true, "admin allowed");

  mockCurrentUser = { id: "user-manager" };
  mockTenantRole = "manager";
  res = await updateBusiness("biz-1", { offerings: ["pickup", "delivery"] });
  assert.equal(res.success, true, "manager allowed");

  mockCurrentUser = { id: "user-editor" };
  mockTenantRole = "editor";
  res = await updateBusiness("biz-1", { offerings: ["pickup"] });
  assert.equal(res.success, false, "editor rejected");
  assert.match(res.error, /Unauthorized/i);

  mockCurrentUser = { id: "user-viewer" };
  mockTenantRole = "viewer";
  res = await updateBusiness("biz-1", { offerings: ["pickup"] });
  assert.equal(res.success, false, "viewer rejected");
  assert.match(res.error, /Unauthorized/i);

  mockCurrentUser = null;
  res = await updateBusiness("biz-1", { offerings: ["pickup"] });
  assert.equal(res.success, false, "unauthenticated rejected");
  assert.match(res.error, /Unauthorized/i);
});

// ── 4. Status reasons ───────────────────────────────────────────────────────

test("Phase 4 Addendum: status reasons identify specific setup requirements", () => {
  const caps = ["ONLINE_ORDERING", "DELIVERY", "PICKUP", "ONLINE_PAYMENT"];
  const built = { ordering: true, delivery: true, pickup: true, reservations: false, onlinePayment: true };

  // 1. no pickup/delivery ticked
  const resNoFulfilment = computeFeatureStatus("ordering", {
    capabilities: caps,
    offerings: ["online_ordering"],
    built,
    currency: "USD",
    hasActiveDish: true,
  });
  assert.equal(resNoFulfilment.status, "needs_setup");
  assert.equal(resNoFulfilment.reason, "no_fulfilment");

  // 2. no active dish
  const resNoDish = computeFeatureStatus("ordering", {
    capabilities: caps,
    offerings: ["online_ordering", "pickup"],
    built,
    currency: "USD",
    hasActiveDish: false,
  });
  assert.equal(resNoDish.status, "needs_setup");
  assert.equal(resNoDish.reason, "no_active_dish");

  // 3. currency not supported for online payment
  const resCurrency = computeFeatureStatus("onlinePayment", {
    capabilities: caps,
    offerings: ["online_payment"],
    built,
    currency: "EUR",
    hasActiveDish: true,
  });
  assert.equal(resCurrency.status, "needs_setup");
  assert.equal(resCurrency.reason, "currency_not_supported");

  // 4. feature not built in this template
  const resNotBuilt = computeFeatureStatus("ordering", {
    capabilities: caps,
    offerings: ["online_ordering", "pickup"],
    built: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
    currency: "USD",
    hasActiveDish: true,
  });
  assert.equal(resNotBuilt.status, "needs_setup");
  assert.equal(resNotBuilt.reason, "feature_not_built");

  // 5. Live when all requirements pass
  const resLive = computeFeatureStatus("ordering", {
    capabilities: caps,
    offerings: ["online_ordering", "pickup"],
    built,
    currency: "USD",
    hasActiveDish: true,
  });
  assert.equal(resLive.status, "live");
  assert.equal(resLive.reason, undefined);

  // 6. Off when unticked
  const resOff = computeFeatureStatus("ordering", {
    capabilities: caps,
    offerings: ["pickup"],
    built,
    currency: "USD",
    hasActiveDish: true,
  });
  assert.equal(resOff.status, "off");
  assert.equal(resOff.reason, "not_ticked");
});

// ── 5. Fulfilment rule ──────────────────────────────────────────────────────

test("Phase 4 Addendum: fulfilment rule resolves ordering to OFF without pickup/delivery", () => {
  const caps = ["ONLINE_ORDERING", "DELIVERY", "PICKUP", "ONLINE_PAYMENT"];
  const built = { ordering: true, delivery: true, pickup: true, reservations: false, onlinePayment: true };

  // A3: ordering ticked + no fulfilment -> false
  const noFulfilment = resolveStorefrontFeatures({
    capabilities: caps,
    offerings: ["online_ordering"],
    built,
    currency: "USD",
  });
  assert.equal(noFulfilment.ordering, false, "online_ordering must be false without pickup or delivery");
  assert.equal(noFulfilment.status.ordering.status, "needs_setup");
  assert.equal(noFulfilment.reasons.ordering, STOREFRONT_STATUS_REASONS.no_fulfilment);

  // ordering ticked + pickup ticked -> true
  const withPickup = resolveStorefrontFeatures({
    capabilities: caps,
    offerings: ["online_ordering", "pickup"],
    built,
    currency: "USD",
  });
  assert.equal(withPickup.ordering, true);
  assert.equal(withPickup.status.ordering.status, "live");

  // ordering ticked + delivery ticked -> true
  const withDelivery = resolveStorefrontFeatures({
    capabilities: caps,
    offerings: ["online_ordering", "delivery"],
    built,
    currency: "USD",
  });
  assert.equal(withDelivery.ordering, true);
  assert.equal(withDelivery.status.ordering.status, "live");

  // Existing sites with offerings unset (undefined or empty) are unchanged
  const unsetOfferings = resolveStorefrontFeatures({
    capabilities: caps,
    offerings: [],
    built,
    currency: "USD",
  });
  assert.equal(unsetOfferings.ordering, false);
  assert.equal(unsetOfferings.status.ordering.status, "off");

  // Helper isFulfilmentMissing
  assert.equal(isFulfilmentMissing(["online_ordering"]), true);
  assert.equal(isFulfilmentMissing(["online_ordering", "pickup"]), false);
  assert.equal(isFulfilmentMissing(["online_ordering", "delivery"]), false);
  assert.equal(isFulfilmentMissing(["pickup"]), false);
  assert.equal(isFulfilmentMissing([]), false);
  assert.equal(isFulfilmentMissing(null), false);
});

// ── 6. Translation parity ───────────────────────────────────────────────────

test("Phase 4 Addendum: EN/FR translation parity for all added keys", () => {
  const requiredOfferingsKeys = [
    "fulfilmentWarningTitle",
    "fulfilmentWarning",
    "orderingPaymentsTitle",
    "orderingPaymentsSummary",
    "orderingPaymentsLiveNotice",
    "orderingPaymentsReadOnly",
    "orderingPaymentsBusinessLabel",
    "statusLive",
    "statusNeedsSetup",
    "statusOff",
    "reasons.no_fulfilment",
    "reasons.no_active_dish",
    "reasons.currency_not_supported",
    "reasons.feature_not_built",
  ];

  for (const key of requiredOfferingsKeys) {
    const enVal = getNestedMessage(enMessages.BusinessOfferings, key);
    const frVal = getNestedMessage(frMessages.BusinessOfferings, key);
    assert.ok(enVal && enVal.length > 0, `en.json missing BusinessOfferings.${key}`);
    assert.ok(frVal && frVal.length > 0, `fr.json missing BusinessOfferings.${key}`);
  }

  // Preview ordering notice in Storefront
  assert.ok(enMessages.Storefront?.previewOrderingNotice, "en.json missing Storefront.previewOrderingNotice");
  assert.ok(frMessages.Storefront?.previewOrderingNotice, "fr.json missing Storefront.previewOrderingNotice");
});

// ── 7. No panel for unbuilt features ────────────────────────────────────────

test("Phase 4 Addendum: no panel rendered for unbuilt templates (rental-driveline)", () => {
  const React = require("react");
  const { renderToString } = require("react-dom/server");

  const rentalTemplate = getFlagshipTemplate("rental-driveline");
  assert.ok(rentalTemplate, "rental-driveline template exists");

  const business = {
    id: "biz-rental",
    name: "Driveline Rentals",
    businessType: "Vehicle Rental",
    category: "Vehicle Rental",
    offerings: ["delivery_to_customer"],
    currency: "USD",
  };

  const html = renderToString(
    React.createElement(OrderingPaymentsPanel, {
      business,
      template: rentalTemplate,
      canManage: true,
      hasActiveDish: false,
      onOfferingsChange: () => {},
      open: true,
      onToggleOpen: () => {},
    })
  );

  assert.equal(html, "", "OrderingPaymentsPanel must return empty string when no catalog features are built in template");
});

// ── 8. Render test for OrderingPaymentsPanel ────────────────────────────────

test("Phase 4 Addendum: render test of OrderingPaymentsPanel component", () => {
  const React = require("react");
  const { renderToString } = require("react-dom/server");

  const restaurantTemplate = getFlagshipTemplate("restaurant-table-flame");
  assert.ok(restaurantTemplate, "restaurant template exists");

  const business = {
    id: "biz-1",
    name: "Chez Mama",
    businessType: "Full-Service Restaurant",
    category: "Restaurant",
    offerings: ["online_ordering"], // missing pickup/delivery -> fulfilment warning
    currency: "USD",
  };

  // Render open panel in manager mode (canManage: true)
  const html = renderToString(
    React.createElement(OrderingPaymentsPanel, {
      business,
      template: restaurantTemplate,
      canManage: true,
      hasActiveDish: true,
      onOfferingsChange: () => {},
      open: true,
      onToggleOpen: () => {},
      index: 8,
    })
  );

  // Checks
  assert.ok(html.includes("Ordering &amp; payments") || html.includes("Ordering & payments"), "has panel title");
  assert.ok(html.includes("Chez Mama"), "identifies linked business name");
  assert.ok(html.includes("Changes in this panel are live immediately"), "has live notice");
  assert.ok(html.includes("role=\"alert\""), "renders fulfilment warning when missing pickup/delivery");
  assert.ok(html.includes("Needs setup"), "shows needs setup badge for unfulfilled ordering");

  // Render closed panel
  const closedHtml = renderToString(
    React.createElement(OrderingPaymentsPanel, {
      business,
      template: restaurantTemplate,
      canManage: true,
      hasActiveDish: true,
      onOfferingsChange: () => {},
      open: false,
      onToggleOpen: () => {},
      index: 8,
    })
  );
  assert.ok(!closedHtml.includes("Changes in this panel are live immediately"), "closed panel does not render inner content");

  // Render read-only mode (canManage: false)
  const readOnlyHtml = renderToString(
    React.createElement(OrderingPaymentsPanel, {
      business,
      template: restaurantTemplate,
      canManage: false,
      hasActiveDish: true,
      onOfferingsChange: () => {},
      open: true,
      onToggleOpen: () => {},
      index: 8,
    })
  );
  assert.ok(readOnlyHtml.includes("Only an owner, admin, or manager can"), "renders read-only notice");
  assert.ok(readOnlyHtml.includes("disabled"), "switches are disabled in read-only mode");
});
