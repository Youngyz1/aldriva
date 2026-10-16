/**
 * lib/__tests__/phase3-order-online-payment.test.cjs
 *
 * Phase 3: online card payment for orders (Stripe PaymentIntent, USD only).
 * Behavior tests with mocked Stripe + Supabase clients; source-text only
 * where DOM/request scope forces it (listed in the final test).
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

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

const Module = require("node:module");
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

let mockRateLimitAllowed = true;
const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === "next/headers") {
    return { headers: async () => ({ get: () => null }) };
  }
  if (request.endsWith("lib/rate-limit") || request.endsWith("lib/rate-limit.ts")) {
    const real = originalLoad.call(this, request, parent, isMain);
    return {
      ...real,
      checkRateLimit: async () =>
        mockRateLimitAllowed
          ? { allowed: true, remaining: 999, retryAfter: 0 }
          : { allowed: false, remaining: 0, retryAfter: 60 },
    };
  }
  if (request.endsWith("lib/order-notifications") || request.endsWith("lib/order-notifications.ts")) {
    return { dispatchOrderNotifications: async () => {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// ── Money helper ─────────────────────────────────────────────────────────────

const { toMinorUnits, fromMinorUnits, isZeroDecimalCurrency } = require(path.join(ROOT, "lib/money.ts"));

test("Phase 3 Money: USD matches today's *100 logic exactly", () => {
  assert.equal(toMinorUnits(10.0, "USD"), 1000);
  assert.equal(toMinorUnits(19.99, "USD"), 1999);
  assert.equal(toMinorUnits(7.5, "usd"), 750);
  assert.equal(toMinorUnits(0, "USD"), 0);
  assert.equal(fromMinorUnits(1999, "USD"), 19.99);
});

test("Phase 3 Money: zero-decimal currencies pass through whole units", () => {
  assert.ok(isZeroDecimalCurrency("XOF"));
  assert.ok(isZeroDecimalCurrency("JPY"));
  assert.ok(!isZeroDecimalCurrency("USD"));
  assert.equal(toMinorUnits(1500, "XOF"), 1500);
  assert.equal(fromMinorUnits(1500, "XOF"), 1500);
});

test("Phase 3 Money: invalid input throws", () => {
  assert.throws(() => toMinorUnits(NaN, "USD"), RangeError);
  assert.throws(() => toMinorUnits(-1, "USD"), RangeError);
  assert.throws(() => toMinorUnits(10, "bogus"), RangeError);
  assert.throws(() => fromMinorUnits(Infinity, "USD"), RangeError);
});

// ── Gating matrix ────────────────────────────────────────────────────────────

const { resolveStorefrontFeatures } = require(path.join(ROOT, "lib/storefront-features.ts"));
const { getCapabilitiesForBusiness } = require(path.join(ROOT, "lib/business-taxonomy.ts"));

const FULL_CAPS = getCapabilitiesForBusiness("", "Restaurant", "Full-Service Restaurant");
const ALL_BUILT = { ordering: true, delivery: true, pickup: true, reservations: false, onlinePayment: true };

test("Phase 3 Gating: USD site with online_payment ticked resolves onlinePayment true", () => {
  const features = resolveStorefrontFeatures({
    capabilities: FULL_CAPS,
    offerings: ["online_ordering", "pickup", "online_payment"],
    built: ALL_BUILT,
    currency: "USD",
  });
  assert.equal(features.onlinePayment, true);
});

test("Phase 3 Gating: USD site without the tick stays off", () => {
  const features = resolveStorefrontFeatures({
    capabilities: FULL_CAPS,
    offerings: ["online_ordering", "pickup"],
    built: ALL_BUILT,
    currency: "USD",
  });
  assert.equal(features.onlinePayment, false);
  assert.equal(features.ordering, true, "ordering itself unaffected");
});

test("Phase 3 Gating: XOF site with the tick stays off (USD only)", () => {
  const features = resolveStorefrontFeatures({
    capabilities: FULL_CAPS,
    offerings: ["online_ordering", "pickup", "online_payment"],
    built: ALL_BUILT,
    currency: "XOF",
  });
  assert.equal(features.onlinePayment, false);
  assert.equal(features.ordering, true, "pay-on-fulfilment unaffected");
});

test("Phase 3 Gating: capability fallback covers ordering-live types", () => {
  // Fast Food lacks ONLINE_ORDERING (ordering false) but carries ONLINE_PAYMENT.
  const fastFood = getCapabilitiesForBusiness("", "Restaurant", "Fast Food / Quick Service");
  assert.ok(!fastFood.includes("ONLINE_ORDERING"));
  const features = resolveStorefrontFeatures({
    capabilities: fastFood,
    offerings: ["online_payment"],
    built: ALL_BUILT,
    currency: "USD",
  });
  assert.equal(features.onlinePayment, true);
});

test("Phase 3 Gating: existing sites unchanged (no tick, no currency)", () => {
  const features = resolveStorefrontFeatures({
    capabilities: FULL_CAPS,
    offerings: ["online_ordering", "pickup"],
    built: ALL_BUILT,
  });
  assert.equal(features.onlinePayment, false);
  assert.equal(features.ordering, true);
});

// ── Online creation (mocked admin + Stripe) ──────────────────────────────────

const { createOnlineOrderPayment, ONLINE_ORDER_PAYMENT_EXPIRY_MINUTES } = require(path.join(ROOT, "lib/storefront-order-payments.ts"));

function makeOrderMock(scenario) {
  const calls = { inserts: 0, updates: [], lastInsert: null, insertedRow: null };
  const builderFor = (table) => {
    const state = { table, insertPayload: null };
    const resolveMaybeSingle = async () => {
      if (table === "tenant_websites") return { data: scenario.website, error: null };
      if (table === "businesses") return { data: scenario.business, error: null };
      if (table === "website_content") return { data: { content: {} }, error: null };
      if (table === "menu_items") return { data: scenario.menuItems, error: null };
      if (table === "orders") {
        if (state.insertPayload) {
          if (scenario.insertError) return { data: null, error: scenario.insertError };
          calls.insertedRow = {
            id: "order-id-1",
            organizer_id: "org-1",
            order_number: state.insertPayload.order_number,
            currency: state.insertPayload.currency,
            total_amount: state.insertPayload.total_amount,
            payment_method: state.insertPayload.payment_method,
            payment_status: "unpaid",
          };
          return {
            data: { id: "order-id-1", order_number: state.insertPayload.order_number, tracking_token: "track", scheduled_for: null },
            error: null,
          };
        }
        if (state.updatePayload) {
          calls.updates.push(state.updatePayload);
          return { data: { id: "order-id-1" }, error: null };
        }
        return { data: calls.insertedRow || scenario.existingOrder || null, error: null };
      }
      return { data: null, error: null };
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      update: (payload) => {
        state.updatePayload = payload;
        return builder;
      },
      insert: (payload) => {
        calls.inserts += 1;
        calls.lastInsert = payload;
        state.insertPayload = payload;
        return builder;
      },
      maybeSingle: resolveMaybeSingle,
      then: (resolve, reject) => {
        if (table === "menu_items") {
          return Promise.resolve({ data: scenario.menuItems, error: null }).then(resolve, reject);
        }
        return resolveMaybeSingle().then(resolve, reject);
      },
    };
    return builder;
  };
  return { calls, admin: { from: (table) => builderFor(table) } };
}

function makeStripeMock() {
  const calls = { creates: [] };
  return {
    calls,
    stripe: {
      paymentIntents: {
        create: async (params, options) => {
          calls.creates.push({ params, options });
          return { id: "pi_test_123", client_secret: "cs_test_123" };
        },
      },
    },
  };
}

const USD_WEBSITE = {
  id: "website-1",
  slug: "sams-abidjan",
  status: "published",
  metadata: { templateId: "restaurant-table-flame", templateVersion: "1.0.0", storefront: { currency: "USD" } },
  tenant_id: "org-1",
};

const USD_BUSINESS = {
  id: "biz-1",
  industry: "",
  category: "Restaurant",
  business_type: "Full-Service Restaurant",
  offerings: ["online_ordering", "pickup", "online_payment"],
  country: "United States",
};

const USD_ITEM = {
  id: "item-1",
  name: "Yassa Poulet",
  price: 12.0,
  promo_price: 9.5,
  is_active: true,
  is_sold_out: false,
  option_groups: [],
  organizer_id: "org-1",
};

function onlineInput(overrides = {}) {
  return {
    slug: "sams-abidjan",
    customerName: "Awa Diallo",
    customerPhone: "+12025551234",
    customerEmail: null,
    fulfilmentType: "pickup",
    deliveryAddress: null,
    customerNote: null,
    items: [{ itemId: "item-1", quantity: 2 }],
    idempotencyKey: "pay-key-1",
    hp: null,
    ...overrides,
  };
}

test("Phase 3 Online creation: reprices from the DB (tampered client price impossible)", async () => {
  const { admin, calls } = makeOrderMock({ website: USD_WEBSITE, business: USD_BUSINESS, menuItems: [USD_ITEM] });
  const stripe = makeStripeMock();
  const result = await createOnlineOrderPayment(onlineInput(), { admin, stripe: stripe.stripe });
  assert.equal(result.success, true);
  // DB promo 9.50 x 2 = 19.00 stored; Stripe intent uses minor units of the DB total.
  assert.equal(calls.lastInsert.total_amount, 19);
  assert.equal(calls.lastInsert.payment_method, "online");
  assert.equal(calls.lastInsert.currency, "USD");
  assert.equal(stripe.calls.creates.length, 1);
  assert.equal(stripe.calls.creates[0].params.amount, 1900);
  assert.equal(stripe.calls.creates[0].params.currency, "usd");
  assert.equal(stripe.calls.creates[0].params.metadata.kind, "storefront_order");
  assert.equal(stripe.calls.creates[0].params.metadata.organizer_id, "org-1");
  assert.equal(result.clientSecret, "cs_test_123");
  const expiry = calls.updates.find((u) => u.payment_expires_at);
  assert.ok(expiry, "provider stamp carries payment_expires_at");
  assert.ok(expiry.provider === "stripe" && expiry.provider_reference === "pi_test_123");
});

test("Phase 3 Online creation: XOF site is refused even with the tick", async () => {
  const xofWebsite = { ...USD_WEBSITE, metadata: { templateId: "restaurant-table-flame", templateVersion: "1.0.0" } };
  const xofBusiness = { ...USD_BUSINESS, country: "Cote d'Ivoire", offerings: ["online_ordering", "pickup", "online_payment"] };
  const { admin } = makeOrderMock({ website: xofWebsite, business: xofBusiness, menuItems: [USD_ITEM] });
  const stripe = makeStripeMock();
  const result = await createOnlineOrderPayment(onlineInput(), { admin, stripe: stripe.stripe });
  assert.equal(result.success, false);
  assert.equal(result.error, "online_unavailable");
  assert.equal(stripe.calls.creates.length, 0, "no Stripe call for unsupported currency");
});

test("Phase 3 Online creation: unticked offering is refused", async () => {
  const { admin } = makeOrderMock({
    website: USD_WEBSITE,
    business: { ...USD_BUSINESS, offerings: ["online_ordering", "pickup"] },
    menuItems: [USD_ITEM],
  });
  const stripe = makeStripeMock();
  const result = await createOnlineOrderPayment(onlineInput(), { admin, stripe: stripe.stripe });
  assert.equal(result.success, false);
  assert.equal(result.error, "online_unavailable");
});

test("Phase 3 Online creation: duplicate idempotency key reuses the order, mints a fresh intent", async () => {
  const existing = {
    id: "order-id-1",
    organizer_id: "org-1",
    order_number: "ORD-260101-1234",
    currency: "USD",
    total_amount: 19,
    payment_method: "online",
    payment_status: "unpaid",
  };
  const { admin, calls } = makeOrderMock({
    website: USD_WEBSITE,
    business: USD_BUSINESS,
    menuItems: [USD_ITEM],
    existingOrder: existing,
  });
  // Re-read by id returns the existing row for the intent step.
  const stripe = makeStripeMock();
  const result = await createOnlineOrderPayment(onlineInput(), { admin, stripe: stripe.stripe });
  assert.equal(result.success, true);
  assert.equal(result.orderId, "order-id-1");
  assert.equal(calls.inserts, 0, "no second order row");
  assert.equal(stripe.calls.creates.length, 1, "fresh intent for the replay");
});

// ── Webhook source of truth (mocked admin, notify/alert spies) ──────────────

const { handleStorefrontOrderPaymentSucceeded } = require(path.join(ROOT, "lib/storefront-order-payments.ts"));

function makeWebhookMock(orderRow) {
  const calls = { updates: [], notified: 0, alerts: [] };
  const admin = {
    from: (table) => {
      assert.equal(table, "orders");
      const state = {};
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: (payload) => {
          state.update = payload;
          return builder;
        },
        maybeSingle: async () => {
          if (state.update) {
            if (orderRow.payment_status !== "unpaid") return { data: null, error: null };
            calls.updates.push(state.update);
            return { data: { id: orderRow.id }, error: null };
          }
          return { data: orderRow.payment_status === "gone" ? null : orderRow, error: null };
        },
      };
      return builder;
    },
  };
  return {
    calls,
    admin,
    notify: async () => {
      calls.notified += 1;
    },
    alert: async (params) => {
      calls.alerts.push(params);
    },
  };
}

const PAID_ROW = {
  id: "order-id-1",
  organizer_id: "org-1",
  order_number: "ORD-260101-1234",
  customer_name: "Awa Diallo",
  customer_phone: "+12025551234",
  customer_email: null,
  fulfilment_type: "pickup",
  delivery_address: null,
  currency: "USD",
  total_amount: 19,
  payment_method: "online",
  payment_status: "unpaid",
  scheduled_for: null,
  items: [],
  provider: "stripe",
  provider_reference: "pi_test_123",
  payment_expires_at: null,
};

function succeededPi(overrides = {}) {
  return {
    id: "pi_test_123",
    amount: 1900,
    currency: "usd",
    metadata: { kind: "storefront_order", organizer_id: "org-1", order_id: "order-id-1", order_number: "ORD-260101-1234" },
    ...overrides,
  };
}

test("Phase 3 Webhook: success marks paid and notifies exactly once", async () => {
  const mock = makeWebhookMock({ ...PAID_ROW });
  const outcome = await handleStorefrontOrderPaymentSucceeded(succeededPi(), mock);
  assert.equal(outcome.handled, true);
  assert.equal(mock.calls.updates.length, 1);
  assert.equal(mock.calls.updates[0].payment_status, "paid");
  assert.equal(mock.calls.notified, 1);
  assert.equal(mock.calls.alerts.length, 0);
});

test("Phase 3 Webhook: replay is idempotent (no second notify)", async () => {
  const mock = makeWebhookMock({ ...PAID_ROW, payment_status: "paid" });
  const outcome = await handleStorefrontOrderPaymentSucceeded(succeededPi(), mock);
  assert.equal(outcome.handled, true);
  assert.equal(outcome.alreadyPaid, true);
  assert.equal(mock.calls.updates.length, 0);
  assert.equal(mock.calls.notified, 0);
});

test("Phase 3 Webhook: wrong amount is rejected and alerted, order stays unpaid", async () => {
  const mock = makeWebhookMock({ ...PAID_ROW });
  const outcome = await handleStorefrontOrderPaymentSucceeded(succeededPi({ amount: 100 }), mock);
  assert.equal(outcome.rejected, "amount_mismatch");
  assert.equal(mock.calls.updates.length, 0);
  assert.equal(mock.calls.notified, 0, "never notify as paid");
  assert.equal(mock.calls.alerts.length, 1);
});

test("Phase 3 Webhook: wrong currency is rejected and alerted", async () => {
  const mock = makeWebhookMock({ ...PAID_ROW });
  const outcome = await handleStorefrontOrderPaymentSucceeded(succeededPi({ currency: "eur" }), mock);
  assert.equal(outcome.rejected, "currency_mismatch");
  assert.equal(mock.calls.notified, 0);
});

test("Phase 3 Webhook: foreign tenant metadata is rejected and alerted", async () => {
  const mock = makeWebhookMock({ ...PAID_ROW });
  const outcome = await handleStorefrontOrderPaymentSucceeded(
    succeededPi({ metadata: { kind: "storefront_order", organizer_id: "org-evil", order_id: "order-id-1" } }),
    mock
  );
  assert.equal(outcome.rejected, "tenant_mismatch");
  assert.equal(mock.calls.notified, 0);
  assert.equal(mock.calls.alerts.length, 1);
});

test("Phase 3 Webhook: unknown payment is rejected without notify", async () => {
  const mock = makeWebhookMock({ ...PAID_ROW, payment_status: "gone" });
  const outcome = await handleStorefrontOrderPaymentSucceeded(succeededPi(), mock);
  assert.equal(outcome.rejected, "not_found");
  assert.equal(mock.calls.notified, 0);
});

// ── Expiry + labels ──────────────────────────────────────────────────────────

test("Phase 3 Expiry: window is 30 minutes", () => {
  assert.equal(ONLINE_ORDER_PAYMENT_EXPIRY_MINUTES, 30);
});

test("Phase 3 Owner labels: paid / awaiting / expired / to-collect", () => {
  const { resolveOrderPaymentLabel } = require(path.join(ROOT, "lib/order-payment-label.ts"));
  assert.equal(resolveOrderPaymentLabel({ payment_method: "online", payment_status: "paid", payment_expires_at: null }), "paid");
  assert.equal(resolveOrderPaymentLabel({ payment_method: "online", payment_status: "unpaid", payment_expires_at: null }), "awaitingPayment");
  assert.equal(
    resolveOrderPaymentLabel({ payment_method: "online", payment_status: "unpaid", payment_expires_at: new Date(Date.now() - 1000).toISOString() }),
    "expired"
  );
  assert.equal(
    resolveOrderPaymentLabel({ payment_method: "online", payment_status: "unpaid", payment_expires_at: new Date(Date.now() + 60000).toISOString() }),
    "awaitingPayment"
  );
  assert.equal(resolveOrderPaymentLabel({ payment_method: "on_fulfilment", payment_status: "unpaid", payment_expires_at: null }), "toCollect");
});

// ── i18n parity ──────────────────────────────────────────────────────────────

test("Phase 3 i18n: new Storefront + Orders keys exist in EN and FR", () => {
  const en = require(path.join(ROOT, "messages/en.json"));
  const fr = require(path.join(ROOT, "messages/fr.json"));
  for (const key of ["paymentMethod", "payOnline", "payingOnline", "onlinePaymentNotice"]) {
    assert.equal(typeof en.Storefront[key], "string", `en Storefront.${key}`);
    assert.equal(typeof fr.Storefront[key], "string", `fr Storefront.${key}`);
  }
  for (const key of ["paid", "awaitingPayment", "expired", "online", "onFulfilment"]) {
    assert.equal(typeof en.Orders[key], "string", `en Orders.${key}`);
    assert.equal(typeof fr.Orders[key], "string", `fr Orders.${key}`);
  }
  assert.equal(typeof en.BusinessOfferings.labels.online_payment, "string");
  assert.equal(typeof fr.BusinessOfferings.labels.online_payment, "string");
});

// ── Migration 173 + data fix (source-text: files only, never applied) ───────

test("Phase 3 Migration 173: payment column, unique index, trigger fix, mirror equality", () => {
  const fwd = fs.readFileSync(path.join(ROOT, "db/migration_173_order_online_payment.sql"), "utf8");
  assert.match(fwd, /ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz NULL/);
  assert.match(fwd, /CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_provider_reference/);
  assert.match(fwd, /WHERE provider IS NOT NULL AND provider_reference IS NOT NULL/);
  assert.doesNotMatch(fwd, /DROP CONSTRAINT IF EXISTS notifications_type_check/, "173 never narrows notification CHECKs");
  assert.match(fwd, /translate\(\s*lower\(trim\(business_row\.name\)\)/, "lowercase runs before accent-fold and strip");
  assert.doesNotMatch(fwd, /lower\(regexp_replace\(trim\(business_row\.name\)\)/, "strip-before-lowercase bug gone");
  const mirror = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261013000000_migration_173_order_online_payment.sql"), "utf8");
  assert.equal(mirror, fwd, "mirror byte-identical");
  const rollback = fs.readFileSync(path.join(ROOT, "db/migration_173_order_online_payment_rollback.sql"), "utf8");
  assert.match(rollback, /DROP INDEX IF EXISTS uq_orders_provider_reference/);
  assert.match(rollback, /DROP COLUMN IF EXISTS payment_expires_at/);
});

test("Phase 3 Data fix: one-off USD backfill, never XOF, not a migration", () => {
  const fix = fs.readFileSync(path.join(ROOT, "db/data_fix_001_backfill_usd_storefront_currency.sql"), "utf8");
  assert.match(fix, /NOT A MIGRATION/);
  assert.match(fix, /'"USD"'/);
  assert.match(fix, /metadata->'storefront'->>'currency' IS NULL/);
  assert.match(fix, /cote d''ivoire/);
  assert.doesNotMatch(fix, /ALTER TABLE|CREATE TABLE|DROP /i, "data fix touches rows only");
});

// ── Remaining source-text ────────────────────────────────────────────────────

test("Phase 3 Source-text remainder: failed payments need no webhook action", () => {
  // payment_intent.payment_failed/canceled have no storefront branch: those
  // orders stay unpaid and read as awaiting/expired. Only succeeded flips.
  const src = fs.readFileSync(path.join(ROOT, "app/api/webhooks/stripe/route.ts"), "utf8");
  assert.match(src, /kind === "storefront_order"/, "succeeded branch exists");
  assert.doesNotMatch(src, /payment_intent\.payment_failed/, "no failed-payment branch in this route");
});

test("Phase 3 Source-text remainder: cart clears only on confirmed payment", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"), "utf8");
  // updateCart([]) runs in the shared onOrderSuccess, which the online path
  // reaches only from PaymentForm onSuccess (post-confirm); the intent step
  // itself never clears.
  assert.match(src, /onSuccess=\{\(\) => \{\s*onOrderSuccess\(/, "PaymentForm success drives onOrderSuccess");
  assert.doesNotMatch(src, /setOnlineSecret\(intentData\.clientSecret\);\s*updateCart/, "intent creation does not clear");
});
