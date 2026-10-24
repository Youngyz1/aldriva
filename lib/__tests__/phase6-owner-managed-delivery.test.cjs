/**
 * lib/__tests__/phase6-owner-managed-delivery.test.cjs
 *
 * Phase 6: Owner-managed delivery (delivery fee, delivery statuses, rider details).
 *
 * Covers (hermetic + source-level, no live DB):
 *  1. Delivery settings pure logic: extract defaults/validation/caps,
 *     strict validate bounds, fee calculator (pickup always 0, free threshold).
 *  2. Fulfilment-aware transition graph: pickup can never enter
 *     out_for_delivery/delivered; delivery ready -> out_for_delivery ->
 *     delivered; rider name required; rider phone validated.
 *  3. Payment guards: unpaid on_fulfilment needs collection confirm;
 *     unpaid online can never be manually marked paid; cancelling a paid
 *     online order returns the refund-not-automatic warning.
 *  4. Migration 175 absence resilience: update retry without rider columns;
 *     fetch fallback without 175 columns.
 *  5. Delivery settings save is merge-safe (other metadata keys survive).
 *  6. Server-computed fee on submit: pickup 0, delivery fee, free threshold,
 *     client-supplied fee/total ignored.
 *  7. Online payment amount equals server subtotal + fee (minor units);
 *     webhook validates against the DB total (fee included).
 *  8. WhatsApp builder: no tracking token / ids / payment refs; first name +
 *     phone + address + collect/paid labels; wa.me URL shapes.
 *  9. Waiting-for-courier overdue signal (ready + delivery > 20m).
 * 10. Migration 175 files: forward/rollback/supabase mirror, constraint name
 *     matches migration 171, rollback remaps delivered -> completed and
 *     out_for_delivery -> ready before restoring the old CHECK.
 * 11. i18n parity for new keys (EN/FR Orders timeline + Storefront fee keys).
 * 12. Source-level UI wiring: payment step shows grand total, confirmation
 *     modal carries the fee breakdown, courier dispatch passes the correct
 *     builder shape, tracking hides the estimate on out_for_delivery.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

require.extensions[".ts"] = function compileTs(module, filename) {
  const raw = fs.readFileSync(filename, "utf8").replace(/^import\s+["']server-only["'];?\s*/m, "");
  const output = ts.transpileModule(raw, {
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
  if (request === "server-only") return "server-only";
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
  if (request === "server-only") return {};
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
    return {
      dispatchCustomerOrderStatusEmail: async () => ({ dispatched: true }),
      dispatchOrderNotifications: async () => {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  extractDeliverySettings,
  validateDeliverySettings,
  computeOrderDeliveryFee,
} = require(path.join(ROOT, "lib/delivery-settings.ts"));

const {
  updateOrderStatusWithClient,
  updateRiderDetailsWithClient,
  saveDeliverySettingsWithClient,
} = require(path.join(ROOT, "lib/actions/orders.ts"));

const { computeOrderOverdue } = require(path.join(ROOT, "lib/order-overdue.ts"));

const {
  buildCourierMessage,
  buildCourierWhatsAppUrl,
} = require(path.join(ROOT, "lib/courier/whatsapp-message.ts"));

const { BUILTIN_COURIER_PROVIDERS } = require(path.join(ROOT, "lib/courier/types.ts"));

const { submitOrderRequestWithClient } = require(path.join(ROOT, "lib/order-submit.ts"));

const {
  createOnlineOrderPayment,
  handleStorefrontOrderPaymentSucceeded,
} = require(path.join(ROOT, "lib/storefront-order-payments.ts"));

const { toMinorUnits } = require(path.join(ROOT, "lib/money.ts"));

// ── 1. Delivery settings pure logic ──────────────────────────────────────────

test("Phase 6 settings: extract returns defaults when metadata is missing", () => {
  assert.deepEqual(extractDeliverySettings(null), { fee: 0, free_above: null, courier_whatsapp: null });
  assert.deepEqual(extractDeliverySettings({}), { fee: 0, free_above: null, courier_whatsapp: null });
  assert.deepEqual(extractDeliverySettings({ storefront: null }), { fee: 0, free_above: null, courier_whatsapp: null });
  assert.deepEqual(extractDeliverySettings({ storefront: { delivery: "nope" } }), { fee: 0, free_above: null, courier_whatsapp: null });
});

test("Phase 6 settings: extract validates fee, threshold, and courier phone", () => {
  const got = extractDeliverySettings({
    storefront: { delivery: { fee: 1500.6, free_above: 20000, courier_whatsapp: "+225 0701020304" } },
  });
  assert.equal(got.fee, 1501, "fee rounds to whole XOF");
  assert.equal(got.free_above, 20000);
  assert.equal(got.courier_whatsapp, "+2250701020304");

  assert.equal(extractDeliverySettings({ storefront: { delivery: { fee: -5 } } }).fee, 0, "negative fee falls back to 0");
  assert.equal(extractDeliverySettings({ storefront: { delivery: { free_above: 0 } } }).free_above, null, "non-positive threshold is unset");
  assert.equal(extractDeliverySettings({ storefront: { delivery: { courier_whatsapp: "abc" } } }).courier_whatsapp, null, "invalid phone is dropped");
  assert.ok(extractDeliverySettings({ storefront: { delivery: { fee: 999999999 } } }).fee <= 100000, "fee is capped");
});

test("Phase 6 settings: validate rejects out-of-range input and drops unknown keys", () => {
  assert.equal(validateDeliverySettings({ fee: -1 }).valid, false);
  assert.equal(validateDeliverySettings({ fee: 100001 }).valid, false);
  assert.equal(validateDeliverySettings({ fee: 0, free_above: 0 }).valid, false);
  assert.equal(validateDeliverySettings({ fee: 0, courier_whatsapp: "not-a-phone" }).valid, false);

  const ok = validateDeliverySettings({ fee: 1500, free_above: null, courier_whatsapp: null, bogus: 1 });
  assert.equal(ok.valid, true);
  assert.ok(!("bogus" in ok.settings), "unknown keys are dropped");
});

test("Phase 6 fee: pickup is always 0, delivery honors the free threshold", () => {
  const settings = { fee: 1000, free_above: 10000, courier_whatsapp: null };
  assert.equal(computeOrderDeliveryFee("pickup", 50000, settings), 0);
  assert.equal(computeOrderDeliveryFee("delivery", 5000, settings), 1000);
  assert.equal(computeOrderDeliveryFee("delivery", 10000, settings), 0, "threshold is inclusive");
  assert.equal(computeOrderDeliveryFee("delivery", 5000, { fee: 1000, free_above: null, courier_whatsapp: null }), 1000);
});

// ── Status-update mock ───────────────────────────────────────────────────────

function makeEqChain(terminal) {
  const handler = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "maybeSingle") return terminal;
        if (prop === "select") return () => handler;
        return () => handler;
      },
    }
  );
  return handler;
}

function makeUpdateEqChain(updateResult) {
  function makeChain() {
    return {
      eq: () => makeChain(),
      select: () => ({ maybeSingle: async () => updateResult }),
      then: (resolve, reject) => Promise.resolve(updateResult).then(resolve, reject),
    };
  }
  return makeChain();
}

function createMockSupabase(orderData, updateBehaviour = "ok") {
  let capturedPayload = null;
  return {
    getUpdatedPayload: () => capturedPayload,
    from: () => ({
      select: () =>
        makeEqChain(async () => {
          if (orderData === null) return { data: null, error: null };
          return { data: { ...orderData }, error: null };
        }),
      update: (payload) => {
        capturedPayload = payload;
        let updateResult;
        if (updateBehaviour === "not_found") {
          updateResult = { data: null, error: null };
        } else if (updateBehaviour === "error") {
          updateResult = { data: null, error: { message: "db error", code: "23505" } };
        } else {
          updateResult = {
            data: { id: "ord-1", status: payload.status, payment_status: payload.payment_status || orderData?.payment_status },
            error: null,
          };
        }
        return makeUpdateEqChain(updateResult);
      },
    }),
  };
}

function deliveryOrder(overrides = {}) {
  return {
    id: "ord-1",
    organizer_id: "org-1",
    order_number: "ORD-001",
    status: "ready",
    payment_method: "on_fulfilment",
    payment_status: "unpaid",
    fulfilment_type: "delivery",
    currency: "XOF",
    total_amount: 6000,
    tracking_token: "tok-abc",
    status_history: [],
    estimated_ready_at: null,
    rider_name: null,
    rider_phone: null,
    ...overrides,
  };
}

function pickupOrder(overrides = {}) {
  return deliveryOrder({ fulfilment_type: "pickup", ...overrides });
}

// ── 2. Fulfilment-aware transition graph ─────────────────────────────────────

test("Phase 6 graph: pickup orders can never enter out_for_delivery or delivered", async () => {
  const client = createMockSupabase(pickupOrder());
  for (const next of ["out_for_delivery", "delivered"]) {
    const res = await updateOrderStatusWithClient(
      { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "ready", nextStatus: next },
      client,
      "usr-1"
    );
    assert.equal(res.success, false, `pickup ready -> ${next} must fail`);
    assert.equal(res.error, "invalid_transition");
  }
  const ok = await updateOrderStatusWithClient(
    { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "ready", nextStatus: "completed", markPaymentCollected: true },
    client,
    "usr-1"
  );
  assert.equal(ok.success, true, "pickup ready -> completed stays valid");
});

test("Phase 6 graph: delivery ready -> out_for_delivery -> delivered", async () => {
  const client = createMockSupabase(deliveryOrder());
  const out = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "out_for_delivery",
      riderName: "Moussa",
      riderPhone: "+22507010203",
    },
    client,
    "usr-1"
  );
  assert.equal(out.success, true);
  assert.equal(client.getUpdatedPayload().rider_name, "Moussa");

  const client2 = createMockSupabase(deliveryOrder({ status: "out_for_delivery", rider_name: "Moussa" }));
  const done = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "out_for_delivery",
      nextStatus: "delivered",
      markPaymentCollected: true,
    },
    client2,
    "usr-1"
  );
  assert.equal(done.success, true);
  assert.equal(done.nextStatus, "delivered");
});

test("Phase 6 rider: name required, phone validated", async () => {
  const noName = await updateOrderStatusWithClient(
    { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "ready", nextStatus: "out_for_delivery", riderName: "  " },
    createMockSupabase(deliveryOrder()),
    "usr-1"
  );
  assert.equal(noName.success, false);
  assert.equal(noName.error, "missing_rider_name");

  const badPhone = await updateOrderStatusWithClient(
    { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "ready", nextStatus: "out_for_delivery", riderName: "Moussa", riderPhone: "12" },
    createMockSupabase(deliveryOrder()),
    "usr-1"
  );
  assert.equal(badPhone.success, false);
  assert.equal(badPhone.error, "invalid_rider_phone");
});

test("Phase 6 terminal: delivered and completed accept no further transitions", async () => {
  for (const status of ["delivered", "completed"]) {
    const res = await updateOrderStatusWithClient(
      { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: status, nextStatus: "cancelled", cancellationReason: "other" },
      createMockSupabase(deliveryOrder({ status, payment_status: "paid" })),
      "usr-1"
    );
    assert.equal(res.success, false, `${status} must be terminal`);
    assert.equal(res.error, "invalid_transition");
  }
});

// ── 3. Payment guards ────────────────────────────────────────────────────────

test("Phase 6 payment: unpaid on_fulfilment needs collection confirm; online can never be manually marked paid", async () => {
  const noConfirm = await updateOrderStatusWithClient(
    { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "out_for_delivery", nextStatus: "delivered" },
    createMockSupabase(deliveryOrder({ status: "out_for_delivery" })),
    "usr-1"
  );
  assert.equal(noConfirm.success, false);
  assert.equal(noConfirm.error, "payment_collection_required");

  const online = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "out_for_delivery",
      nextStatus: "delivered",
      markPaymentCollected: true,
    },
    createMockSupabase(deliveryOrder({ status: "out_for_delivery", payment_method: "online", payment_status: "unpaid" })),
    "usr-1"
  );
  assert.equal(online.success, false);
  assert.equal(online.error, "online_payment_cannot_be_manually_marked_paid");
});

test("Phase 6 cancel: paid online order carries the refund-not-automatic warning", async () => {
  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "cancelled",
      cancellationReason: "out_of_stock",
    },
    createMockSupabase(
      deliveryOrder({ payment_method: "online", payment_status: "paid", provider_reference: "pi_123" })
    ),
    "usr-1"
  );
  assert.equal(res.success, true);
  assert.equal(res.warning, "online_refund_required");
  assert.equal(res.providerReference, "pi_123");
});

// ── 4. Migration 175 absence resilience ──────────────────────────────────────

test("Phase 6 fallback: non-rider transitions still recover when 175 columns are absent", async () => {
  // Resilience is preserved for transitions that do not require rider
  // persistence: accepted -> preparing retries without rider columns.
  const order = deliveryOrder({ status: "accepted" });
  let calls = 0;
  let retried = false;
  const client = {
    from: () => ({
      select: () =>
        makeEqChain(async () => ({ data: { ...order }, error: null })),
      update: (payload) => {
        calls += 1;
        let result;
        if (calls === 1) {
          result = { data: null, error: { code: "42703", message: 'column "rider_name" does not exist' } };
        } else {
          retried = true;
          result = { data: { id: "ord-1", status: payload.status }, error: null };
        }
        return makeUpdateEqChain(result);
      },
    }),
  };
  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "accepted",
      nextStatus: "preparing",
    },
    client,
    "usr-1"
  );
  assert.equal(res.success, true);
  assert.equal(retried, true, "non-rider transition must recover via retry");
});

test("Phase 6 fallback: fetch falls back when 175 columns are absent", async () => {
  const full = deliveryOrder();
  let selects = 0;
  const client = {
    from: () => ({
      select: () =>
        makeEqChain(async () => {
          selects += 1;
          if (selects === 1) return { data: null, error: { code: "42703", message: 'column "rider_name" does not exist' } };
          const rest = { ...full };
          delete rest.rider_name;
          delete rest.rider_phone;
          return { data: rest, error: null };
        }),
      update: (payload) =>
        makeUpdateEqChain({ data: { id: "ord-1", status: payload.status }, error: null }),
    }),
  };
  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "out_for_delivery",
      riderName: "Moussa",
    },
    client,
    "usr-1"
  );
  assert.equal(res.success, true, `expected fallback success, got ${JSON.stringify(res)}`);
  assert.ok(selects >= 2, "must attempt the fallback select");
});

// ── 5. Merge-safe delivery settings save ─────────────────────────────────────

function makeWebsiteAdmin(websiteRow, capture) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: (payload) => {
      capture.payload = payload;
      return builder;
    },
    maybeSingle: async () => ({ data: websiteRow, error: null }),
    then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
  };
  return { from: (table) => {
    assert.equal(table, "tenant_websites");
    return builder;
  } };
}

test("Phase 6 settings save: other tenant_websites.metadata keys survive", async () => {
  const capture = {};
  const admin = makeWebsiteAdmin(
    {
      id: "ws-1",
      organizer_id: "org-1",
      metadata: {
        timezone: "Africa/Abidjan",
        templateId: "restaurant-table-flame",
        storefront: { currency: "XOF", ordering: true, delivery: { fee: 0, free_above: null, courier_whatsapp: null } },
      },
    },
    capture
  );
  const res = await saveDeliverySettingsWithClient(
    { organizerId: "org-1", websiteId: "ws-1", fee: 1500, free_above: 20000, courier_whatsapp: "+22507010203" },
    admin
  );
  assert.equal(res.success, true);
  const meta = capture.payload.metadata;
  assert.equal(meta.timezone, "Africa/Abidjan", "timezone survives");
  assert.equal(meta.templateId, "restaurant-table-flame", "template ref survives");
  assert.equal(meta.storefront.currency, "XOF", "storefront currency survives");
  assert.equal(meta.storefront.ordering, true, "other storefront keys survive");
  assert.deepEqual(meta.storefront.delivery, { fee: 1500, free_above: 20000, courier_whatsapp: "+22507010203" });
});

test("Phase 6 settings save: invalid input fails validation without writing", async () => {
  const capture = {};
  const admin = makeWebsiteAdmin({ id: "ws-1", organizer_id: "org-1", metadata: {} }, capture);
  const res = await saveDeliverySettingsWithClient(
    { organizerId: "org-1", websiteId: "ws-1", fee: -5 },
    admin
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "validation_error");
  assert.equal(capture.payload, undefined, "no DB write on validation failure");
});

// ── 6. Server-computed fee on submit ─────────────────────────────────────────

function makeSubmitMock(scenario) {
  const calls = { insertPayload: null, insertCalled: false };
  const builderFor = (table, insertPayload) => {
    const state = { table, insertPayload };
    const resolveMaybeSingle = async () => {
      if (table === "tenant_websites") return { data: scenario.website, error: null };
      if (table === "businesses") return { data: scenario.business, error: null };
      if (table === "website_content") return { data: { content: {} }, error: null };
      if (table === "menu_items") return { data: scenario.menuItems, error: null };
      if (table === "orders") {
        if (state.insertPayload) {
          return {
            data: {
              id: "order-id-1",
              order_number: state.insertPayload.order_number,
              tracking_token: "track-abc",
              scheduled_for: state.insertPayload.scheduled_for ?? null,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      insert: (payload) => {
        calls.insertPayload = payload;
        calls.insertCalled = true;
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
  return { calls, admin: { from: (table) => builderFor(table, null) } };
}

const FEE_WEBSITE = (delivery) => ({
  id: "website-1",
  slug: "table-and-flame",
  status: "published",
  metadata: {
    templateId: "restaurant-table-flame",
    templateVersion: "1.0.0",
    storefront: { delivery },
  },
  tenant_id: "org-1",
});

const FEE_BUSINESS = {
  id: "biz-1",
  industry: "",
  category: "Restaurant",
  business_type: "Full-Service Restaurant",
  offerings: ["online_ordering", "pickup", "delivery"],
  country: "Cote d'Ivoire",
};

const FEE_ITEM = {
  id: "item-1",
  name: "Grilled Fish",
  price: 5000,
  promo_price: null,
  is_active: true,
  is_sold_out: false,
  option_groups: [],
  organizer_id: "org-1",
};

function feeInput(overrides = {}) {
  return {
    slug: "table-and-flame",
    customerName: "Awa Diallo",
    customerPhone: "0701020304",
    customerEmail: null,
    fulfilmentType: "delivery",
    deliveryAddress: "12 Rue des Jardins, Abidjan",
    customerNote: null,
    items: [{ itemId: "item-1", quantity: 1 }],
    idempotencyKey: null,
    hp: null,
    ...overrides,
  };
}

test("Phase 6 submit: delivery fee is server-computed; pickup is always 0", async () => {
  const { admin, calls } = makeSubmitMock({
    website: FEE_WEBSITE({ fee: 1000, free_above: null, courier_whatsapp: null }),
    business: FEE_BUSINESS,
    menuItems: [FEE_ITEM],
  });
  const res = await submitOrderRequestWithClient(feeInput(), admin);
  assert.equal(res.success, true);
  assert.equal(calls.insertPayload.subtotal, 5000);
  assert.equal(calls.insertPayload.delivery_fee, 1000);
  assert.equal(calls.insertPayload.total_amount, 6000);

  const { admin: admin2, calls: calls2 } = makeSubmitMock({
    website: FEE_WEBSITE({ fee: 1000, free_above: null, courier_whatsapp: null }),
    business: FEE_BUSINESS,
    menuItems: [FEE_ITEM],
  });
  const res2 = await submitOrderRequestWithClient(
    feeInput({ fulfilmentType: "pickup", deliveryAddress: null }),
    admin2
  );
  assert.equal(res2.success, true);
  assert.equal(calls2.insertPayload.delivery_fee, 0);
  assert.equal(calls2.insertPayload.total_amount, 5000);
});

test("Phase 6 submit: free-delivery threshold is honored; client fee/total ignored", async () => {
  const { admin, calls } = makeSubmitMock({
    website: FEE_WEBSITE({ fee: 1000, free_above: 4000, courier_whatsapp: null }),
    business: FEE_BUSINESS,
    menuItems: [FEE_ITEM],
  });
  const res = await submitOrderRequestWithClient(
    feeInput({ fee: 1, total: 1, delivery_fee: 1 }),
    admin
  );
  assert.equal(res.success, true);
  assert.equal(calls.insertPayload.subtotal, 5000);
  assert.equal(calls.insertPayload.delivery_fee, 0, "5000 >= 4000 threshold means free delivery");
  assert.equal(calls.insertPayload.total_amount, 5000, "client-supplied fee/total never used");

  const { admin: admin2, calls: calls2 } = makeSubmitMock({
    website: FEE_WEBSITE({ fee: 1000, free_above: 6000, courier_whatsapp: null }),
    business: FEE_BUSINESS,
    menuItems: [FEE_ITEM],
  });
  const res2 = await submitOrderRequestWithClient(feeInput(), admin2);
  assert.equal(res2.success, true);
  assert.equal(calls2.insertPayload.delivery_fee, 1000, "5000 < 6000 threshold keeps the fee");
  assert.equal(calls2.insertPayload.total_amount, 6000);
});

// ── 7. Online payment amount ─────────────────────────────────────────────────

test("Phase 6 online payment: Stripe amount equals server subtotal + fee", async () => {
  const calls = { inserts: 0, updates: [], lastInsert: null, insertedRow: null };
  const website = {
    id: "website-1",
    slug: "sams-abidjan",
    status: "published",
    metadata: {
      templateId: "restaurant-table-flame",
      templateVersion: "1.0.0",
      storefront: { currency: "USD", delivery: { fee: 5, free_above: null, courier_whatsapp: null } },
    },
    tenant_id: "org-1",
  };
  const business = {
    id: "biz-1",
    industry: "",
    category: "Restaurant",
    business_type: "Full-Service Restaurant",
    offerings: ["online_ordering", "pickup", "delivery", "online_payment"],
    country: "United States",
  };
  const item = {
    id: "item-1",
    name: "Yassa Poulet",
    price: 12.0,
    promo_price: null,
    is_active: true,
    is_sold_out: false,
    option_groups: [],
    organizer_id: "org-1",
  };
  const builderFor = (table) => {
    const state = { table, insertPayload: null };
    const resolveMaybeSingle = async () => {
      if (table === "tenant_websites") return { data: website, error: null };
      if (table === "businesses") return { data: business, error: null };
      if (table === "website_content") return { data: { content: {} }, error: null };
      if (table === "menu_items") return { data: [item], error: null };
      if (table === "orders") {
        if (state.insertPayload) {
          calls.insertedRow = {
            id: "order-id-1",
            organizer_id: "org-1",
            order_number: state.insertPayload.order_number,
            currency: state.insertPayload.currency,
            subtotal: state.insertPayload.subtotal,
            delivery_fee: state.insertPayload.delivery_fee,
            total_amount: state.insertPayload.total_amount,
            payment_method: state.insertPayload.payment_method,
            payment_status: "unpaid",
          };
          return {
            data: {
              id: "order-id-1",
              order_number: state.insertPayload.order_number,
              tracking_token: "track",
              scheduled_for: null,
            },
            error: null,
          };
        }
        if (state.updatePayload) {
          calls.updates.push(state.updatePayload);
          return { data: { id: "order-id-1" }, error: null };
        }
        return { data: calls.insertedRow, error: null };
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
          return Promise.resolve({ data: [item], error: null }).then(resolve, reject);
        }
        return resolveMaybeSingle().then(resolve, reject);
      },
    };
    return builder;
  };
  const admin = { from: (table) => builderFor(table) };
  const stripeCalls = [];
  const stripe = {
    paymentIntents: {
      create: async (params, options) => {
        stripeCalls.push({ params, options });
        return { id: "pi_test_6", client_secret: "cs_test_6" };
      },
    },
  };
  const result = await createOnlineOrderPayment(
    {
      slug: "sams-abidjan",
      customerName: "Awa Diallo",
      customerPhone: "+12025551234",
      customerEmail: null,
      fulfilmentType: "delivery",
      deliveryAddress: "12 Main St, Abidjan",
      customerNote: null,
      items: [{ itemId: "item-1", quantity: 2 }],
      idempotencyKey: "phase6-key-1",
      hp: null,
    },
    { admin, stripe }
  );
  assert.equal(result.success, true);
  // Subtotal 24 + fee 5 = 29 USD -> 2900 minor units from the DB row, never the client.
  assert.equal(calls.lastInsert.subtotal, 24);
  assert.equal(calls.lastInsert.delivery_fee, 5);
  assert.equal(calls.lastInsert.total_amount, 29);
  assert.equal(stripeCalls.length, 1);
  assert.equal(stripeCalls[0].params.amount, toMinorUnits(29, "USD"));
  assert.equal(stripeCalls[0].params.amount, 2900);
});

test("Phase 6 webhook: amount check runs against the DB total (fee included)", async () => {
  const order = {
    id: "order-id-1",
    organizer_id: "org-1",
    order_number: "ORD-001",
    customer_name: "Awa Diallo",
    customer_phone: "+12025551234",
    customer_email: null,
    fulfilment_type: "delivery",
    delivery_address: "12 Main St",
    currency: "USD",
    subtotal: 24,
    delivery_fee: 5,
    total_amount: 29,
    status: "pending",
    payment_method: "online",
    payment_status: "unpaid",
    scheduled_for: null,
    items: [],
    provider: "stripe",
    provider_reference: null,
    payment_expires_at: null,
  };
  const mock = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...order }, error: null }) }), maybeSingle: async () => ({ data: { ...order }, error: null }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: "order-id-1" }, error: null }) }) }) }) }),
    }),
  };
  const alerts = [];
  const clients = {
    admin: mock,
    notify: async () => {},
    alert: async (a) => {
      alerts.push(a);
    },
  };
  const good = await handleStorefrontOrderPaymentSucceeded(
    { id: "pi_6", amount: 2900, currency: "usd", metadata: { order_id: "order-id-1", organizer_id: "org-1" } },
    clients
  );
  assert.equal(good.handled, true);
  assert.equal(good.rejected, undefined);

  const bad = await handleStorefrontOrderPaymentSucceeded(
    { id: "pi_6", amount: 2400, currency: "usd", metadata: { order_id: "order-id-1", organizer_id: "org-1" } },
    clients
  );
  assert.equal(bad.rejected, "amount_mismatch", "subtotal-without-fee must be rejected");
});

// ── 8. WhatsApp builder ──────────────────────────────────────────────────────

function courierInput(overrides = {}) {
  return {
    orderNumber: "ORD-260101-1234",
    businessName: "Table and Flame",
    businessAddress: "12 Rue des Jardins, Abidjan",
    businessPhone: "+22507010000",
    customerName: "Awa Diallo",
    customerPhone: "+22507010203",
    deliveryAddress: "45 Cocody, Abidjan",
    deliveryNote: "Gate code 12",
    itemsCount: 3,
    currency: "XOF",
    totalAmount: 6000,
    deliveryFee: 1000,
    isPaid: false,
    promisedTime: "18:30",
    locale: "en",
    ...overrides,
  };
}

test("Phase 6 courier: message carries dispatch facts, never secrets", () => {
  const msg = buildCourierMessage({
    ...courierInput(),
    trackingToken: "tok-secret-123",
    orderId: "uuid-0000-secret",
    providerReference: "pi_secret_123",
  });
  assert.ok(msg.includes("ORD-260101-1234"));
  assert.ok(msg.includes("Awa"), "courier gets the customer first name");
  assert.ok(!msg.includes("Diallo"), "family name is not shared with the courier");
  assert.ok(msg.includes("+22507010203"));
  assert.ok(msg.includes("45 Cocody, Abidjan"));
  assert.ok(msg.includes("Amount to collect"));
  assert.ok(!msg.includes("tok-secret-123"), "tracking token must never leak");
  assert.ok(!msg.includes("uuid-0000-secret"), "internal ids must never leak");
  assert.ok(!msg.includes("pi_secret_123"), "payment references must never leak");
});

test("Phase 6 courier: paid orders read zero to collect; FR locale supported", () => {
  const paid = buildCourierMessage(courierInput({ isPaid: true }));
  assert.ok(paid.includes("0 to collect"));
  const fr = buildCourierMessage(courierInput({ isPaid: false, locale: "fr" }));
  assert.ok(fr.includes("encaisser") || fr.includes("Encaisser") || fr.includes("À encaisser"));
});

test("Phase 6 courier: wa.me URL shapes for set and unset courier numbers", () => {
  const withNumber = buildCourierWhatsAppUrl(courierInput(), "+225 0701020304");
  assert.ok(withNumber.startsWith("https://wa.me/2250701020304?text="));
  const without = buildCourierWhatsAppUrl(courierInput(), null);
  assert.ok(without.startsWith("https://wa.me/?text="));
  assert.ok(!withNumber.includes("tok-secret"), "URL carries only the encoded message");
});

test("Phase 6 courier: provider seam stays generic (no vendor-specific code)", () => {
  const ids = BUILTIN_COURIER_PROVIDERS.map((p) => p.id);
  assert.ok(ids.includes("owner_rider"));
  assert.ok(ids.includes("manual_whatsapp"));
  for (const p of BUILTIN_COURIER_PROVIDERS) {
    assert.equal(p.isAutomated, false);
    assert.ok(typeof p.name === "string" && p.name.length > 0);
  }
  const src = fs.readFileSync(path.join(ROOT, "lib/courier/types.ts"), "utf8");
  assert.ok(!/yango|glovo|uber|bolt|jumia/i.test(src), "no provider-specific courier code");
});

// ── 9. Waiting-for-courier signal ───────────────────────────────────────────

test("Phase 6 overdue: ready delivery orders flag waiting-for-courier after 20m", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const waiting = computeOrderOverdue(
    {
      status: "ready",
      fulfilment_type: "delivery",
      updated_at: "2026-10-14T11:30:00Z",
      status_history: [{ status: "ready", at: "2026-10-14T11:30:00Z" }],
    },
    now
  );
  assert.equal(waiting.isWaitingForCourier, true);
  assert.ok(waiting.waitingMinutes >= 20);

  const fresh = computeOrderOverdue(
    {
      status: "ready",
      fulfilment_type: "delivery",
      updated_at: "2026-10-14T11:55:00Z",
      status_history: [{ status: "ready", at: "2026-10-14T11:55:00Z" }],
    },
    now
  );
  assert.equal(fresh.isWaitingForCourier, undefined);

  const pickup = computeOrderOverdue(
    {
      status: "ready",
      fulfilment_type: "pickup",
      updated_at: "2026-10-14T11:00:00Z",
      status_history: [{ status: "ready", at: "2026-10-14T11:00:00Z" }],
    },
    now
  );
  assert.equal(pickup.isWaitingForCourier, undefined, "pickup never waits for a courier");
});

// ── 10. Migration 175 files ──────────────────────────────────────────────────

test("mocked: Phase 6 migration files exist and rollback guards delivery statuses", () => {
  const forward = fs.readFileSync(path.join(ROOT, "db/migration_175_owner_managed_delivery.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(ROOT, "db/migration_175_owner_managed_delivery_rollback.sql"), "utf8");
  const mirror = fs.readFileSync(
    path.join(ROOT, "supabase/migrations/20261014043000_migration_175_owner_managed_delivery.sql"),
    "utf8"
  );
  const m171 = fs.readFileSync(path.join(ROOT, "db/migration_171_orders.sql"), "utf8");

  assert.ok(m171.includes("CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'))"));
  assert.ok(forward.includes("orders_status_check"), "175 reuses the 171 constraint name");
  assert.ok(forward.includes("ADD COLUMN IF NOT EXISTS delivery_fee"));
  assert.ok(forward.includes("ADD COLUMN IF NOT EXISTS rider_name"));
  assert.ok(forward.includes("ADD COLUMN IF NOT EXISTS rider_phone"));
  assert.ok(forward.includes("'out_for_delivery'") && forward.includes("'delivered'"));
  assert.ok(mirror.includes("orders_status_check"));

  const rollbackGuard = rollback.indexOf("MIGRATION_175_ROLLBACK_BLOCKED");
  const restoreCheck = rollback.indexOf("ADD CONSTRAINT orders_status_check");
  assert.ok(rollbackGuard !== -1, "rollback refuses while delivery statuses remain in use");
  assert.ok(rollbackGuard < restoreCheck, "status guard runs before the old CHECK is restored");
  assert.ok(!rollback.includes("SET status = 'completed'"), "rollback never rewrites delivered orders");
  assert.ok(!rollback.includes("SET status = 'ready'"), "rollback never rewrites out_for_delivery orders");
  assert.ok(!rollback.includes("'out_for_delivery',\n    'delivered'"), "restored CHECK has no delivery statuses");
  assert.ok(!rollback.includes("DROP COLUMN"), "rollback preserves rider columns and their data");
});

// ── 11. i18n parity ──────────────────────────────────────────────────────────

test("Phase 6 i18n: new Orders + Storefront keys exist in EN and FR", () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));
  for (const key of ["timelineOutForDelivery", "timelineDelivered"]) {
    assert.ok(en.Orders[key], `en Orders.${key}`);
    assert.ok(fr.Orders[key], `fr Orders.${key}`);
  }
  for (const key of ["freeDelivery", "freeDeliveryProgress"]) {
    assert.ok(en.Storefront[key], `en Storefront.${key}`);
    assert.ok(fr.Storefront[key], `fr Storefront.${key}`);
  }
  assert.deepEqual(Object.keys(en.Orders).sort(), Object.keys(fr.Orders).sort(), "Orders namespace stays in parity");
  assert.deepEqual(Object.keys(en.Storefront).sort(), Object.keys(fr.Storefront).sort(), "Storefront namespace stays in parity");
});

// ── 12. Source-level UI wiring ───────────────────────────────────────────────

test("Phase 6 UI: cart payment step and confirmation modal use the server-matching total", () => {
  const src = fs.readFileSync(path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"), "utf8");
  assert.ok(
    src.includes('submitLabel={`${labels.payOnline || "Pay online"} • ${formattedTotal}`}'),
    "online submit label uses the grand total (subtotal + fee)"
  );
  assert.ok(src.includes("freeDeliveryProgress"), "free-delivery progress message is wired");
  assert.ok(src.includes("deliveryFee: displayDeliveryFee"), "confirmation payload carries the fee");
  assert.ok(src.includes("fulfilmentType: fulfilment"), "confirmation payload carries fulfilment type");
});

test("Phase 6 UI: courier dispatch passes the builder shape; tracking hides the estimate out for delivery", () => {
  const card = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8");
  assert.ok(card.includes("itemsCount: items.length"), "dispatch passes itemsCount");
  assert.ok(card.includes("isPaid: isPaidOnline"), "dispatch passes isPaid");
  assert.ok(card.includes("courierWhatsapp ?? null"), "courier number travels as the URL arg, not the message");
  assert.ok(!card.includes("isPrepaid"), "stale builder field is gone");

  const tracking = fs.readFileSync(path.join(ROOT, "components/site/OrderTrackingView.tsx"), "utf8");
  assert.ok(tracking.includes("!isTerminal && !isOutForDelivery"), "estimate banner hidden on out_for_delivery");
  assert.ok(tracking.includes("out_for_delivery") && tracking.includes("delivered"), "delivery stepper covers both statuses");
  assert.ok(tracking.includes("order.deliveryFee > 0"), "fee line renders from the server snapshot");

  const ordersAction = fs.readFileSync(path.join(ROOT, "lib/actions/orders.ts"), "utf8");
  assert.ok(ordersAction.includes('ready: ["completed", "cancelled"]'), "pickup graph ends at completed");
  assert.ok(ordersAction.includes('ready: ["out_for_delivery", "cancelled"]'), "delivery graph routes via the rider");

  const payments = fs.readFileSync(path.join(ROOT, "lib/storefront-order-payments.ts"), "utf8");
  assert.ok(payments.includes("toMinorUnits(Number(order.total_amount)"), "PaymentIntent amount comes from the DB total");
});

// ── 13. Rider-save bugfix: exact error, no silent success, happy path ────────

test("Phase 6 rider bug: completed order edit returns invalid_status (never silent)", async () => {
  const res = await updateRiderDetailsWithClient(
    { orderId: "ord-1", organizerId: "org-1", riderName: "Moussa", riderPhone: "+22507010203" },
    createMockSupabase(deliveryOrder({ status: "completed", payment_status: "paid" })),
    "usr-1"
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "invalid_status");
  assert.ok((res.message || "").length > 0, "a message is returned for dialog display");
});

test("Phase 6 rider bug: 175-column failure on out_for_delivery reports db_error, never success", async () => {
  const client = {
    from: () => ({
      select: () =>
        makeEqChain(async () => ({ data: { ...deliveryOrder() }, error: null })),
      update: () =>
        makeUpdateEqChain({ data: null, error: { code: "42703", message: 'column "rider_name" does not exist' } }),
    }),
  };
  const res = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "out_for_delivery",
      riderName: "Moussa",
    },
    client,
    "usr-1"
  );
  assert.equal(res.success, false, "a save that did not persist rider details must never report success");
  assert.equal(res.error, "db_error");
});

test("Phase 6 rider happy path: ready -> out_for_delivery persists rider; edit appends history", async () => {
  // Step 1: assign on the ready -> out_for_delivery transition
  const client = createMockSupabase(deliveryOrder());
  const out = await updateOrderStatusWithClient(
    {
      orderId: "ord-1",
      organizerId: "org-1",
      expectedCurrentStatus: "ready",
      nextStatus: "out_for_delivery",
      riderName: "Moussa K.",
      riderPhone: "+22507010203",
    },
    client,
    "usr-1"
  );
  assert.equal(out.success, true);
  const payload = client.getUpdatedPayload();
  assert.equal(payload.rider_name, "Moussa K.", "row contains the rider name");
  assert.equal(payload.rider_phone, "+22507010203", "row contains the rider phone");
  assert.ok(
    payload.status_history.some((h) => h.rider_name === "Moussa K."),
    "transition is recorded in status_history"
  );

  // Step 2: edit while out_for_delivery persists the new details + history
  const history = [{ status: "out_for_delivery", at: new Date().toISOString(), rider_name: "Moussa K.", rider_phone: "+22507010203" }];
  const client2 = createMockSupabase(
    deliveryOrder({ status: "out_for_delivery", rider_name: "Moussa K.", rider_phone: "+22507010203", status_history: history })
  );
  const edit = await updateRiderDetailsWithClient(
    { orderId: "ord-1", organizerId: "org-1", riderName: "Awa D.", riderPhone: "+22505040404" },
    client2,
    "usr-1"
  );
  assert.equal(edit.success, true);
  assert.equal(edit.riderName, "Awa D.");
  assert.equal(edit.riderPhone, "+22505040404");
  const payload2 = client2.getUpdatedPayload();
  assert.equal(payload2.rider_name, "Awa D.");
  assert.equal(payload2.rider_phone, "+22505040404");
  assert.equal(payload2.status_history.length, history.length + 1, "edit appends to status_history");
  assert.equal(payload2.status_history[payload2.status_history.length - 1].note, "Updated rider details");
});

test("Phase 6 legacy: completed delivery orders render no rider UI and reject rider writes", async () => {
  const card = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8");
  // Header rider pill requires the out_for_delivery state
  assert.ok(
    card.includes('order.status === "out_for_delivery" &&\n              order.rider_name'),
    "header rider pill renders only while out for delivery"
  );
  // Expanded rider card is limited to actionable states (ready / out_for_delivery)
  assert.ok(
    card.includes('(order.status === "ready" || order.status === "out_for_delivery")'),
    "rider section never renders on completed/delivered/cancelled/pickup"
  );
  // The edit affordance reads Edit rider only in the out_for_delivery state
  assert.ok(
    card.includes('order.status === "out_for_delivery" ? t("editRider") : t("assignRider")'),
    "Edit rider text appears only while out for delivery"
  );

  // Server rejects every rider write path on a completed order
  const editRes = await updateRiderDetailsWithClient(
    { orderId: "ord-1", organizerId: "org-1", riderName: "Moussa" },
    createMockSupabase(deliveryOrder({ status: "completed", payment_status: "paid" })),
    "usr-1"
  );
  assert.equal(editRes.error, "invalid_status");
  const transRes = await updateOrderStatusWithClient(
    { orderId: "ord-1", organizerId: "org-1", expectedCurrentStatus: "completed", nextStatus: "out_for_delivery", riderName: "Moussa" },
    createMockSupabase(deliveryOrder({ status: "completed", payment_status: "paid" })),
    "usr-1"
  );
  assert.equal(transRes.success, false);
  assert.equal(transRes.error, "invalid_transition");
});

test("Phase 6 dialog: typed rider errors render inside the dialog (EN/FR); dialog stays open on failure", () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));
  for (const key of ["riderNameRequired", "riderPhoneInvalid", "riderWrongStatus", "orderAlreadyUpdated", "riderNotAllowed", "riderSaveFailed"]) {
    assert.ok(en.Orders[key], `en Orders.${key}`);
    assert.ok(fr.Orders[key], `fr Orders.${key}`);
    assert.ok(String(fr.Orders[key]) !== String(en.Orders[key]), `fr Orders.${key} is translated`);
  }

  const card = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8");
  // In-dialog error region
  assert.ok(card.includes('{riderError && ('), "dialog renders its own error block");
  assert.ok(card.includes('role="alert"'), "dialog error is announced to assistive tech");
  // Every failure path writes riderError (in-dialog), never the card-level banner
  assert.ok(card.includes('setRiderError(riderErrorMessage(res.error, res.message))'), "typed errors map to localized dialog strings");
  assert.ok(card.includes('if (order.status !== "ready" && order.status !== "out_for_delivery")'), "wrong-status saves fail inside the dialog");
  // Dialog closes only on success: both success branches close the modal
  // (plus the explicit Close button). No close happens on any failure path.
  const successCloses = (card.match(/setShowRiderModal\(false\);\s*\n\s*onRefresh/g) || []).length;
  assert.equal(successCloses, 2, "modal closes only on the two success paths");
});

test("Phase 3 tracking: assigned rider name is visible early and phone only after pickup", () => {
  const route = fs.readFileSync(path.join(ROOT, "app/site/[slug]/orders/[tracking_token]/page.tsx"), "utf8");
  assert.ok(
    route.includes("Boolean(orderRow.courier_worker_id)") &&
      route.includes('["accepted", "preparing", "ready", "picked_up", "out_for_delivery"]'),
    "route gates rider details on a registered active assignment"
  );
  assert.ok(route.includes("riderName: isActiveCourierAssignment && orderRow.rider_name"));
  assert.ok(route.includes('["picked_up", "out_for_delivery"].includes(String(orderRow.status))'));
  assert.ok(route.includes("riderPhone: courierContactAvailable && orderRow.rider_phone"));

  const view = fs.readFileSync(path.join(ROOT, "components/site/OrderTrackingView.tsx"), "utf8");
  assert.ok(view.includes("canTrackCourier && order.riderName && ("), "rider details render only for the active assigned job");
  assert.ok(view.includes("order.riderName.split(/\\s+/)[0]"), "only the rider first name is displayed");
});

// ── 14. Delivery-settings lookup: tenant_id scoping (Aldriva Food save bug) ───

function makeTenantCaptureAdmin(websiteRow, capture) {
  const builder = {
    select: (cols) => {
      capture.select = cols;
      return builder;
    },
    eq: (col, val) => {
      capture.eq.push([col, val]);
      return builder;
    },
    update: (payload) => {
      capture.update = payload;
      return builder;
    },
    maybeSingle: async () => ({ data: websiteRow, error: null }),
    then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
  };
  return {
    from: (table) => {
      assert.equal(table, "tenant_websites");
      return builder;
    },
  };
}

test("Phase 6 settings lookup: scopes tenant_websites by tenant_id, never organizer_id", async () => {
  const capture = { eq: [] };
  const admin = makeTenantCaptureAdmin(
    {
      id: "ws-1",
      tenant_id: "org-1",
      metadata: {
        timezone: "Africa/Abidjan",
        storefront: { currency: "XOF", delivery: { fee: 0, free_above: null, courier_whatsapp: null } },
      },
    },
    capture
  );
  const res = await saveDeliverySettingsWithClient(
    { organizerId: "org-1", websiteId: "ws-1", fee: 500, free_above: 10000, courier_whatsapp: "+22507010203" },
    admin
  );
  assert.equal(res.success, true);
  const cols = capture.eq.map(([c]) => c);
  assert.ok(cols.includes("tenant_id"), "lookup filters by the canonical tenant column");
  assert.ok(!cols.includes("organizer_id"), "organizer_id is not a tenant_websites column — it missed every org");
  assert.ok(!String(capture.select).includes("organizer_id"), "projection never references the missing column");
  assert.deepEqual(
    capture.eq.find(([c]) => c === "tenant_id"),
    ["tenant_id", "org-1"],
    "tenant scope carries the organizer id"
  );
  assert.deepEqual(capture.eq.find(([c]) => c === "id"), ["id", "ws-1"], "website id from the dialog is honored");
  // Merge-safe on the same write
  assert.equal(capture.update.metadata.timezone, "Africa/Abidjan");
  assert.equal(capture.update.metadata.storefront.currency, "XOF");
  assert.deepEqual(capture.update.metadata.storefront.delivery, { fee: 500, free_above: 10000, courier_whatsapp: "+22507010203" });
});

test("Phase 6 settings lookup: missing website row returns typed no_website (create-first)", async () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
  };
  const res = await saveDeliverySettingsWithClient(
    { organizerId: "org-1", websiteId: "ws-1", fee: 500 },
    { from: () => builder }
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "no_website");
  assert.ok((res.message || "").length > 0);
});

test("Phase 6 settings lookup: fetch failure is db_error, never a false not-found", async () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => ({ data: null, error: { code: "XX000", message: "boom" } }),
    then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
  };
  const res = await saveDeliverySettingsWithClient(
    { organizerId: "org-1", websiteId: "ws-1", fee: 500 },
    { from: () => builder }
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "db_error");
});

test("Phase 6 settings round-trip: saved values drive the cart fee and the courier URL", () => {
  // Observed dialog values: fee 500, free above 10000, courier WhatsApp set.
  const validated = validateDeliverySettings({ fee: 500, free_above: 10000, courier_whatsapp: "+225 0701020304" });
  assert.equal(validated.valid, true);
  const stored = { storefront: { currency: "XOF", delivery: { ...validated.settings } } };
  const settings = extractDeliverySettings(stored);
  assert.deepEqual(settings, { fee: 500, free_above: 10000, courier_whatsapp: "+2250701020304" });
  assert.equal(computeOrderDeliveryFee("delivery", 2000, settings), 500, "cart below the threshold reads the new fee");
  assert.equal(computeOrderDeliveryFee("delivery", 12000, settings), 0, "cart above the threshold reads free");
  assert.equal(computeOrderDeliveryFee("pickup", 2000, settings), 0);
  const url = buildCourierWhatsAppUrl(
    {
      orderNumber: "ORD-1",
      businessName: "Aldriva Food",
      customerName: "Awa Diallo",
      customerPhone: "+22507010203",
      deliveryAddress: "12 Rue des Jardins",
      itemsCount: 2,
      currency: "XOF",
      totalAmount: 2500,
      deliveryFee: 500,
      isPaid: false,
      locale: "en",
    },
    settings.courier_whatsapp
  );
  assert.ok(url.startsWith("https://wa.me/2250701020304?text="), "saved courier number reaches the WhatsApp builder");
});

test("Phase 6 settings wiring: orders page, site cart, dialog create-first path", () => {
  const ordersPage = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/orders/page.tsx"), "utf8");
  assert.ok(ordersPage.includes('.eq("tenant_id", organizerId)'), "orders page resolves the website by tenant_id");
  assert.ok(ordersPage.includes("courierWhatsapp={deliverySettings.courier_whatsapp}"), "courier number flows to the owner card");

  const sitePage = fs.readFileSync(path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"), "utf8");
  assert.ok(sitePage.includes("deliveryFee: deliverySettings.fee"), "storefront cart reads the saved fee");
  assert.ok(sitePage.includes("freeDeliveryAbove: deliverySettings.free_above"), "storefront cart reads the saved threshold");

  const dialog = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/DeliverySettingsDialog.tsx"), "utf8");
  assert.ok(dialog.includes('res.error === "no_website"'), "dialog maps the typed no_website error");
  assert.ok(dialog.includes("/dashboard/org/${organizerId}/website/new"), "dialog links to the website builder");
  assert.ok(dialog.includes('t("createWebsiteFirst")'), "dialog shows the localized create-first message");

  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const fr = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));
  for (const key of ["createWebsiteFirst", "goToWebsiteBuilder"]) {
    assert.ok(en.Orders[key], `en Orders.${key}`);
    assert.ok(fr.Orders[key], `fr Orders.${key}`);
  }
});
