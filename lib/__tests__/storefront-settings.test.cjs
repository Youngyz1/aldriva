/**
 * lib/__tests__/storefront-settings.test.cjs
 *
 * Storefront cleanup milestone:
 * - new sites default to USD for every template; explicit currency is kept
 * - currency is never derived from the business country
 * - the settings save accepts valid ISO codes and rejects invalid ones
 * - the Stripe gate follows ONLINE_PAYMENT_CURRENCIES exactly
 * - one Africa/Abidjan timezone fallback for every metadata consumer
 * - closed business: no hours = always open, ASAP schedule, OFF rejects,
 *   chosen out-of-hours time still rejected
 * - translation keys exist in English and French
 */

"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  DEFAULT_ACCEPT_ORDERS_WHEN_CLOSED,
  readStorefrontSettings,
  resolveAcceptOrdersWhenClosed,
  saveStorefrontSettingsWithClient,
  suggestCurrencyForCountry,
} = require("../storefront-settings.ts");
const {
  STOREFRONT_CURRENCIES,
  normalizeStorefrontCurrency,
} = require("../money.ts");
const { resolveStorefrontCurrency } = require("../website-v2-theme.ts");
const { ONLINE_PAYMENT_CURRENCIES, isOnlinePaymentCurrencySupported } = require("../storefront-features.ts");
const {
  DEFAULT_SITE_TIMEZONE,
  resolveWebsiteTimezone,
} = require("../date-timezone.ts");
const { resolveOrderSchedule, validateScheduledOrderTime } = require("../website-hours.ts");
const { buildWebsiteTemplateResolverInputs } = require("../website-template-site-inputs.ts");
const { FLAGSHIP_TEMPLATES } = require("../website-template-v2.ts");

const messages = {
  en: JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8")),
  fr: JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8")),
};

function metadataClient(initialMetadata) {
  const state = { metadata: initialMetadata, updates: [] };
  function query() {
    let filters = {};
    const api = {
      select() { return api; },
      update(values) { state.updates.push(values); return api; },
      eq(column, value) { filters = { ...filters, [column]: value }; return api; },
      async maybeSingle() {
        if (filters.id !== "website-1") return { data: null, error: null };
        return { data: { id: "website-1", metadata: state.metadata }, error: null };
      },
      then(resolve, reject) {
        // update() resolves through the builder chain
        for (const values of state.updates.slice(-1)) {
          if (values && values.metadata !== undefined && filters.id === "website-1") {
            state.metadata = values.metadata;
          }
        }
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    };
    return api;
  }
  return { state, from: () => query() };
}

describe("storefront currency", () => {
  test("explicit metadata currency wins and country never decides it", () => {
    assert.equal(resolveStorefrontCurrency({ storefront: { currency: "eur" } }, "Cote d'Ivoire"), "EUR");
    assert.equal(resolveStorefrontCurrency({ storefront: { currency: "XOF" } }, "United States"), "XOF");
    assert.equal(resolveStorefrontCurrency({}, "Cote d'Ivoire"), "USD");
    assert.equal(resolveStorefrontCurrency({}, "CI"), "USD");
    assert.equal(resolveStorefrontCurrency({ storefront: { currency: "bogus" } }, "Cote d'Ivoire"), "USD");
    assert.equal(resolveStorefrontCurrency(undefined, undefined), "USD");
  });

  test("every template's new site defaults to USD metadata", () => {
    // The create action stores exactly `normalizeStorefrontCurrency(option) ?? "USD"`.
    const defaults = FLAGSHIP_TEMPLATES.map(() => normalizeStorefrontCurrency(undefined) ?? "USD");
    assert.ok(FLAGSHIP_TEMPLATES.length >= 3);
    assert.ok(defaults.every((code) => code === "USD"));
    const action = fs.readFileSync(path.join(ROOT, "lib/actions/website-v2.ts"), "utf8");
    assert.match(action, /currency:\s*normalizeStorefrontCurrency\(options\?\.currency\)\s*\?\?\s*"USD"/);
  });

  test("country only pre-selects the creation form value", () => {
    assert.equal(suggestCurrencyForCountry("Côte d'Ivoire"), "XOF");
    assert.equal(suggestCurrencyForCountry("senegal"), "XOF");
    assert.equal(suggestCurrencyForCountry("Nigeria"), "NGN");
    assert.equal(suggestCurrencyForCountry("Kenya"), "KES");
    assert.equal(suggestCurrencyForCountry("France"), "EUR");
    assert.equal(suggestCurrencyForCountry(null), "USD");
    // Suggestions are not the stored rule.
    assert.equal(resolveStorefrontCurrency({}, "Senegal"), "USD");
  });

  test("supported list includes the required codes and rejects others", () => {
    for (const code of ["USD", "EUR", "GBP", "XOF", "XAF", "NGN", "GHS", "KES"]) {
      assert.equal(normalizeStorefrontCurrency(code), code);
      assert.ok(STOREFRONT_CURRENCIES.includes(code));
    }
    assert.equal(normalizeStorefrontCurrency("XYZ"), undefined);
    assert.equal(normalizeStorefrontCurrency(""), undefined);
    assert.equal(normalizeStorefrontCurrency(4217), undefined);
  });

  test("the Stripe gate follows ONLINE_PAYMENT_CURRENCIES exactly", () => {
    assert.deepEqual(ONLINE_PAYMENT_CURRENCIES, ["USD"]);
    assert.equal(isOnlinePaymentCurrencySupported("USD"), true);
    // Adding XOF later means adding it to ONLINE_PAYMENT_CURRENCIES only.
    assert.equal(isOnlinePaymentCurrencySupported("XOF"), false);
    assert.equal(isOnlinePaymentCurrencySupported("EUR"), false);
  });

  test("the ordering panel builds payment copy from the shared gate", () => {
    const panel = fs.readFileSync(path.join(ROOT, "components/dashboard/website/v2/OrderingPaymentsPanel.tsx"), "utf8");
    assert.match(panel, /ONLINE_PAYMENT_CURRENCIES/);
    assert.match(panel, /isOnlinePaymentCurrencySupported\(code\)/);
    assert.match(panel, /STOREFRONT_CURRENCIES\.map/);
    assert.doesNotMatch(panel, /USD only|only for USD/);
  });
});

describe("storefront settings save", () => {
  test("reads defaults: USD, Africa/Abidjan, accept-while-closed ON", () => {
    const settings = readStorefrontSettings({});
    assert.equal(settings.currency, "USD");
    assert.equal(settings.timezone, "Africa/Abidjan");
    assert.equal(settings.acceptOrdersWhenClosed, DEFAULT_ACCEPT_ORDERS_WHEN_CLOSED);
    assert.equal(resolveAcceptOrdersWhenClosed(null), true);
    assert.equal(resolveAcceptOrdersWhenClosed({ storefront: { acceptOrdersWhenClosed: false } }), false);
  });

  test("saves currency, timezone and the flag into metadata and verifies the read-back", async () => {
    const admin = metadataClient({ templateId: "store", timezone: "Europe/Paris" });
    const result = await saveStorefrontSettingsWithClient(
      { websiteId: "website-1", currency: "xof", timezone: "Africa/Dakar", acceptOrdersWhenClosed: false },
      admin
    );
    assert.equal(result.success, true);
    assert.equal(result.data.currency, "XOF");
    assert.equal(result.data.timezone, "Africa/Dakar");
    assert.equal(result.data.acceptOrdersWhenClosed, false);
    assert.equal(admin.state.metadata.templateId, "store", "unrelated metadata is preserved");
    assert.equal(admin.state.metadata.storefront.currency, "XOF");
  });

  test("rejects invalid currency and timezone without writing", async () => {
    const admin = metadataClient({});
    const badCurrency = await saveStorefrontSettingsWithClient({ websiteId: "website-1", currency: "XYZ" }, admin);
    assert.equal(badCurrency.success, false);
    assert.equal(badCurrency.code, "validation_error");
    assert.match(badCurrency.error, /Currency must be one of/);

    const badZone = await saveStorefrontSettingsWithClient({ websiteId: "website-1", timezone: "Mars/Olympus" }, admin);
    assert.equal(badZone.success, false);
    assert.equal(badZone.code, "validation_error");

    const badFlag = await saveStorefrontSettingsWithClient({ websiteId: "website-1", acceptOrdersWhenClosed: "yes" }, admin);
    assert.equal(badFlag.success, false);
    assert.equal(badFlag.code, "validation_error");

    assert.equal(admin.state.metadata.storefront, undefined, "nothing was written");
  });

  test("missing website is reported, not silently ignored", async () => {
    const admin = metadataClient({});
    const result = await saveStorefrontSettingsWithClient({ websiteId: "other", currency: "USD" }, admin);
    assert.equal(result.success, false);
    assert.equal(result.code, "not_found");
  });
});

describe("timezone fallback", () => {
  test("one shared helper returns Africa/Abidjan for every missing/invalid value", () => {
    assert.equal(resolveWebsiteTimezone(undefined), "Africa/Abidjan");
    assert.equal(resolveWebsiteTimezone(null), "Africa/Abidjan");
    assert.equal(resolveWebsiteTimezone({}), "Africa/Abidjan");
    assert.equal(resolveWebsiteTimezone({ timezone: "   " }), "Africa/Abidjan");
    assert.equal(resolveWebsiteTimezone({ timezone: "Africa/Abidjan" }), "Africa/Abidjan");
    assert.equal(resolveWebsiteTimezone({ timezone: "Europe/London" }), "Europe/London");
    assert.equal(DEFAULT_SITE_TIMEZONE, "Africa/Abidjan");
    assert.equal(readStorefrontSettings({ timezone: null }).timezone, "Africa/Abidjan");
    assert.equal(
      buildWebsiteTemplateResolverInputs({ siteSlug: "s", metadata: {} }).timeZone,
      "Africa/Abidjan",
      "template resolver inputs use the same fallback"
    );
  });

  test("every metadata.timezone consumer resolves through the shared helper", () => {
    const consumers = [
      "app/site/[slug]/[[...page]]/page.tsx",
      "app/site/[slug]/reservations/[lookup_token]/page.tsx",
      "lib/actions/reservations.ts",
      "lib/actions/website-v2.ts",
      "lib/order-submit.ts",
      "lib/website-template-site-inputs.ts",
      "lib/orders/transition-core.ts",
    ];
    for (const file of consumers) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert.match(source, /resolveWebsiteTimezone/, `${file} must use the shared helper`);
    }
  });

  test("templates no longer ship an America/New_York default", () => {
    const manifest = fs.readFileSync(path.join(ROOT, "lib/website-template-v2.ts"), "utf8");
    assert.doesNotMatch(manifest, /America\/New_York/);
  });
});

describe("closed business ordering", () => {
  const tuesday = new Date("2026-06-09T10:00:00Z"); // Tuesday 10:00 UTC == Africa/Abidjan

  test("a business with no hours configured is always open", () => {
    assert.equal(resolveOrderSchedule({}, "Africa/Abidjan", tuesday).isOpen, true);
    assert.equal(resolveOrderSchedule(null, "Africa/Abidjan", tuesday).isOpen, true);
    const allClosed = {
      mon: { closed: true }, tue: { closed: true }, wed: { closed: true },
      thu: { closed: true }, fri: { closed: true }, sat: { closed: true }, sun: { closed: true },
    };
    const schedule = resolveOrderSchedule(allClosed, "Africa/Abidjan", tuesday);
    assert.equal(schedule.isOpen, true);
    assert.equal(schedule.blocked, undefined);
    assert.equal(validateScheduledOrderTime("2026-06-09T15:00:00.000Z", allClosed, "Africa/Abidjan", 30, 7, tuesday).valid, true);
  });

  test("closed with ASAP and the setting ON schedules the next opening", () => {
    const hours = { tue: { open: "12:00", close: "20:00" } };
    const schedule = resolveOrderSchedule(hours, "Africa/Abidjan", tuesday);
    assert.equal(schedule.isOpen, false);
    assert.equal(schedule.acceptsWhileClosed, true);
    assert.equal(schedule.nextOpenTime, "12:00");
    assert.equal(schedule.scheduledFor, "2026-06-09T12:00:00.000Z");
  });

  test("closed with the setting OFF rejects with the opens-at message", () => {
    const hours = { tue: { open: "12:00", close: "20:00" } };
    const schedule = resolveOrderSchedule(hours, "Africa/Abidjan", tuesday, { acceptOrdersWhenClosed: false });
    assert.equal(schedule.isOpen, false);
    assert.equal(schedule.blocked, true);
    assert.equal(schedule.closedRejected, true);
    assert.equal(schedule.scheduledFor, null);
    assert.match(schedule.message, /We're closed, opens at 12:00/);
  });

  test("a customer-chosen time outside opening hours is still rejected", () => {
    const hours = { tue: { open: "12:00", close: "20:00" } };
    const outside = validateScheduledOrderTime("2026-06-09T23:00:00.000Z", hours, "Africa/Abidjan", 30, 7, tuesday);
    assert.equal(outside.valid, false);
    assert.equal(outside.error, "outside_opening_hours");

    const past = validateScheduledOrderTime("2026-06-09T08:00:00.000Z", hours, "Africa/Abidjan", 30, 7, tuesday);
    assert.equal(past.valid, false);
    assert.equal(past.error, "lead_time_too_short");
  });

  test("the online payment window never ends before a closed order's scheduled time", () => {
    const source = fs.readFileSync(path.join(ROOT, "lib/storefront-order-payments.ts"), "utf8");
    assert.match(source, /scheduledMs\s*>\s*baseExpiryMs/);
    assert.match(source, /scheduledMs\s*\+\s*ONLINE_ORDER_PAYMENT_EXPIRY_MINUTES/);
  });
});

describe("translations", () => {
  const required = [
    ["BusinessOfferings", "storefrontCurrencyLabel"],
    ["BusinessOfferings", "storefrontCurrencyWarning"],
    ["BusinessOfferings", "storefrontCurrencyOnlineNote"],
    ["BusinessOfferings", "storefrontCurrencyCardOnline"],
    ["BusinessOfferings", "storefrontCurrencyCashOnly"],
    ["BusinessOfferings", "storefrontTimezoneLabel"],
    ["BusinessOfferings", "storefrontTimezoneDefault"],
    ["BusinessOfferings", "acceptOrdersWhenClosedLabel"],
    ["BusinessOfferings", "acceptOrdersWhenClosedHint"],
    ["BusinessOfferings", "orderingPaymentsSaved"],
    ["Storefront", "orderWhileClosed"],
    ["Storefront", "closedOpensAt"],
    ["Storefront", "onlinePaymentUnsupportedCurrency"],
    ["Orders", "orderWhileClosed"],
    ["PublicSite", "storefrontCurrency"],
    ["PublicSite", "storefrontCurrencyHint"],
    ["Organizer", "tables & qr"],
  ];

  for (const [locale, tree] of Object.entries(messages)) {
    test(`${locale} has every storefront key`, () => {
      for (const [namespace, key] of required) {
        assert.ok(tree[namespace], `${locale}: missing namespace ${namespace}`);
        assert.equal(
          typeof tree[namespace][key],
          "string",
          `${locale}: missing ${namespace}.${key}`
        );
      }
    });
  }

  test("English and French keep the same storefront key set", () => {
    for (const [namespace, key] of required) {
      assert.ok(messages.en[namespace][key], `en missing ${namespace}.${key}`);
      assert.ok(messages.fr[namespace][key], `fr missing ${namespace}.${key}`);
    }
    assert.match(messages.en.BusinessOfferings.storefrontCurrencyWarning, /does not convert/i);
    assert.match(messages.fr.BusinessOfferings.storefrontCurrencyWarning, /ne convertit pas/i);
  });
});
