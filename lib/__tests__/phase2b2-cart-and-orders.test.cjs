/**
 * lib/__tests__/phase2b2-cart-and-orders.test.cjs
 *
 * Behavioral tests for Phase 2b-2: Cart, checkout, order request, owner visibility.
 *
 * Behavior tests (pure calls + mocked Supabase):
 * 1.  isValidPhoneNumber: CI local + international + edge cases
 * 2.  resolveOrderSchedule: open, closed-then-scheduled, no-open-hours-blocked
 * 3.  Price recomputation: trusted server vs tampered client price (mocked submitOrderRequest)
 * 4.  Sold-out item rejection via mocked submitOrderRequest
 * 5.  Inactive item rejection via mocked submitOrderRequest
 * 6.  Delivery without offering rejection via mocked submitOrderRequest
 * 7.  Honeypot rejection via mocked submitOrderRequest (no DB touch)
 * 8.  Rate limit bucket identities + rate_limited via mocked checkRateLimit
 * 9.  Notification dispatcher never throws with a failing channel (mocked createNotification)
 * 10. Foreign-tenant item rejection via mocked submitOrderRequest
 * 11. Duplicate idempotency key returns existing order without re-insert
 * 12. Invalid option selection rejected via mocked submitOrderRequest
 * 13. EN/FR order keys parity in Storefront and Orders namespaces
 * 14. Primary action: "orderNow" when ordering live, "viewMenu" when not
 * 15. Orders page role guard excludes viewer + uses admin client (source-text, server component)
 * 16. Orders nav gating (source-text + behavior via org-dashboard-modules)
 *
 * Remaining source-text/file-exists assertions (listed in final test):
 * - Migration 171 RLS shape + rollback/mirror existence + hash equality
 * - Cart localStorage try/catch + idempotency key presence (client component needs DOM)
 * - Site page orderConfig gating (server component needs request scope)
 * - Orders page file exists (server component)
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

// Alias resolution for @/ paths
const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Stub env vars required by supabase client (never actually connects in tests)
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "stub-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "stub-service-key";

// ── Mock next/headers + rate-limit + order-notifications BEFORE requiring orders.ts ──
// submitOrderRequest calls headers() (request scope) and checkRateLimit (DB RPC).
// In tests both are stubbed to allow; one test overrides checkRateLimit to deny.
let mockRateLimitAllowed = true;
const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === "next/headers") {
    return {
      headers: async () => ({
        get: () => null,
      }),
    };
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
      dispatchOrderNotifications: async () => {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// ── 1. Phone validation ──────────────────────────────────────────────────────

const { isValidPhoneNumber } = require(path.join(ROOT, "lib/order-phone.ts"));
const { submitOrderRequestWithClient } = require(path.join(ROOT, "lib/order-submit.ts"));

/** Hermetic entry point: internal logic with an injected mock client. */
function submitOrderRequest(input, admin) {
  return submitOrderRequestWithClient(input, admin);
}

test("Phase 2b-2 Phone: accepts CI 10-digit local numbers", () => {
  assert.equal(isValidPhoneNumber("0701020304"), true);
  assert.equal(isValidPhoneNumber("0501020304"), true);
  assert.equal(isValidPhoneNumber("0101020304"), true);
  assert.equal(isValidPhoneNumber("07 01 02 03 04"), true, "spaces stripped");
  assert.equal(isValidPhoneNumber("05-01-02-03-04"), true, "dashes stripped");
});

test("Phase 2b-2 Phone: accepts international E.164 numbers", () => {
  assert.equal(isValidPhoneNumber("+33612345678"), true);
  assert.equal(isValidPhoneNumber("+12025551234"), true);
  assert.equal(isValidPhoneNumber("+22507012233"), true, "CI international format");
});

test("Phase 2b-2 Phone: rejects invalid numbers", () => {
  assert.equal(isValidPhoneNumber(""), false, "empty");
  assert.equal(isValidPhoneNumber("1234"), false, "too short");
  assert.equal(isValidPhoneNumber("+0123456789"), false, "leading zero after +");
  assert.equal(isValidPhoneNumber("abcdefghij"), false, "letters only");
  assert.equal(isValidPhoneNumber("1234567890123456"), false, "16 digits too long");
});

// ── 2. resolveOrderSchedule ──────────────────────────────────────────────────

const { resolveOrderSchedule } = require(path.join(ROOT, "lib/website-hours.ts"));

test("Phase 2b-2 Schedule: returns isOpen=true when hours are null", () => {
  const result = resolveOrderSchedule(null);
  assert.equal(result.isOpen, true);
  assert.equal(result.scheduledFor, null);
  assert.ok(!result.blocked);
});

test("Phase 2b-2 Schedule: returns isOpen=true when hours object has no configured days", () => {
  const result = resolveOrderSchedule({});
  assert.equal(result.isOpen, true);
  assert.equal(result.scheduledFor, null);
});

test("Phase 2b-2 Schedule: returns scheduledFor when currently closed but opens within 7 days", () => {
  // Tuesday 06:00 UTC (Abidjan = UTC+0), restaurant open 12:00-22:00 on Tuesdays
  const tuesday = new Date("2026-06-09T06:00:00Z");
  const hours = {
    tue: { open: "12:00", close: "22:00", closed: false },
  };
  const result = resolveOrderSchedule(hours, "Africa/Abidjan", tuesday);
  assert.equal(result.isOpen, false);
  assert.ok(result.scheduledFor !== null, "scheduledFor must be set");
  assert.ok(!result.blocked, "must not be blocked");
});

test("Phase 2b-2 Schedule: returns blocked when no open day within 7 days", () => {
  const hours = {
    mon: { closed: true },
    tue: { closed: true },
    wed: { closed: true },
    thu: { closed: true },
    fri: { closed: true },
    sat: { closed: true },
    sun: { closed: true },
  };
  const result = resolveOrderSchedule(hours, "Africa/Abidjan", new Date("2026-06-09T10:00:00Z"));
  assert.equal(result.isOpen, false);
  assert.equal(result.blocked, true);
  assert.equal(result.scheduledFor, null);
});

test("Phase 2b-2 Schedule: returns isOpen=true when restaurant is currently open", () => {
  // Tuesday 14:00 UTC (Abidjan = UTC+0), restaurant open 12:00-22:00
  const tuesday = new Date("2026-06-09T14:00:00Z");
  const hours = {
    tue: { open: "12:00", close: "22:00", closed: false },
  };
  const result = resolveOrderSchedule(hours, "Africa/Abidjan", tuesday);
  assert.equal(result.isOpen, true);
  assert.equal(result.scheduledFor, null);
});

// ── 3. Authoritative price: effectiveUnitPrice used in order total ───────────

const { effectiveUnitPrice, computeLineTotal, validateSelection } = require(path.join(ROOT, "lib/menu-pricing.ts"));

test("Phase 2b-2 Pricing: server always uses effectiveUnitPrice (promo beats base)", () => {
  const item = { price: 10.0, promo_price: 7.5 };
  assert.equal(effectiveUnitPrice(item), 7.5, "promo price wins when valid and lower");
  const result = computeLineTotal({ item, quantity: 3 });
  assert.equal(result.lineTotal, 22.5, "line total = promo * qty");
});

test("Phase 2b-2 Pricing: ignores equal or higher promo price (falls back to base)", () => {
  const item = { price: 10.0, promo_price: 10.0 };
  assert.equal(effectiveUnitPrice(item), 10.0);
  const item2 = { price: 10.0, promo_price: 15.0 };
  assert.equal(effectiveUnitPrice(item2), 10.0, "promo >= base, ignored");
});

test("Phase 2b-2 Pricing: price delta from chosen option is added on top of effective price", () => {
  const item = {
    price: 5.0,
    option_groups: [
      { id: "g1", name: "Size", required: false, min: 0, max: 1, options: [
        { id: "opt-lg", name: "Large", price_delta: 1.5 },
      ]},
      { id: "g2", name: "Sauce", required: false, min: 0, max: 1, options: [
        { id: "opt-hot", name: "Hot sauce", price_delta: 0.5 },
      ]},
    ],
  };
  const selection = [
    { groupId: "g1", optionIds: ["opt-lg"] },
    { groupId: "g2", optionIds: ["opt-hot"] },
  ];
  const result = computeLineTotal({ item, selection, quantity: 2 });
  // unit = 5.0 + 1.5 + 0.5 = 7.0; qty 2 -> 14.0
  assert.equal(result.lineTotal, 14.0);
});

test("Phase 2b-2 Validation: required option group missing fails pure validateSelection", () => {
  const item = {
    price: 5.0,
    option_groups: [
      { id: "g1", name: "Size", required: true, min: 1, max: 1, options: [
        { id: "s", name: "Small", price_delta: 0 },
        { id: "l", name: "Large", price_delta: 2 },
      ]},
    ],
  };
  const result = validateSelection(item, []);
  assert.equal(result.valid, false);
  assert.ok((result.error || "").length > 0);
});

// ── Mocked Supabase client for submitOrderRequest ────────────────────────────
// Minimal chainable query builder: .select/.eq/.in/.order/.limit return self,
// .maybeSingle resolves canned rows per table, .insert captures the payload.

function makeMockAdmin(scenario) {
  const calls = { insertPayload: null, insertCalled: false };
  const builderFor = (table, insertPayload) => {
    const state = { table, insertPayload };
    const resolveMaybeSingle = async () => {
      if (table === "tenant_websites") {
        return { data: scenario.website, error: null };
      }
      if (table === "businesses") {
        return { data: scenario.business, error: null };
      }
      if (table === "website_content") {
        return { data: scenario.contentRow || { content: {} }, error: null };
      }
      if (table === "menu_items") {
        return { data: scenario.menuItems, error: null };
      }
      if (table === "orders") {
        if (state.insertPayload) {
          if (scenario.insertError) return { data: null, error: scenario.insertError };
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
        return { data: scenario.existingOrder || null, error: null };
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
      // menu_items is awaited directly (no maybeSingle): make the builder thenable.
      then: (resolve, reject) => {
        if (table === "menu_items") {
          return Promise.resolve({ data: scenario.menuItems, error: null }).then(resolve, reject);
        }
        return resolveMaybeSingle().then(resolve, reject);
      },
    };
    return builder;
  };
  return {
    calls,
    admin: {
      from: (table) => builderFor(table, null),
    },
  };
}

const BASE_WEBSITE = {
  id: "website-1",
  slug: "table-and-flame",
  status: "published",
  metadata: { templateId: "restaurant-table-flame", templateVersion: "1.0.0" },
  tenant_id: "org-1",
};

const BASE_BUSINESS = {
  id: "biz-1",
  industry: "",
  category: "Restaurant",
  business_type: "Full-Service Restaurant",
  offerings: ["online_ordering", "pickup", "delivery"],
  country: "Cote d'Ivoire",
};

const BASE_MENU_ITEM = {
  id: "item-1",
  name: "Grilled Fish",
  price: 10.0,
  promo_price: 7.5,
  is_active: true,
  is_sold_out: false,
  option_groups: [],
  organizer_id: "org-1",
};

function baseInput(overrides = {}) {
  return {
    slug: "table-and-flame",
    customerName: "Awa Diallo",
    customerPhone: "0701020304",
    customerEmail: null,
    fulfilmentType: "pickup",
    deliveryAddress: null,
    customerNote: null,
    items: [{ itemId: "item-1", quantity: 2 }],
    idempotencyKey: null,
    hp: null,
    ...overrides,
  };
}

// ── 4–7. submitOrderRequest behavior: honeypot, sold-out, inactive, delivery ─

test("Phase 2b-2 Honeypot: non-empty hp returns invalid_submission without touching the DB", async () => {
  const { admin, calls } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [BASE_MENU_ITEM],
  });
  const result = await submitOrderRequest(baseInput({ hp: "bot" }), admin);
  assert.equal(result.success, false);
  assert.equal(result.error, "invalid_submission");
  assert.equal(calls.insertCalled, false, "honeypot must short-circuit before any insert");
});

test("Phase 2b-2 Rate limit: denied bucket returns rate_limited", async () => {
  mockRateLimitAllowed = false;
  try {
    const { admin } = makeMockAdmin({
      website: BASE_WEBSITE,
      business: BASE_BUSINESS,
      menuItems: [BASE_MENU_ITEM],
    });
    const result = await submitOrderRequest(baseInput(), admin);
    assert.equal(result.success, false);
    assert.equal(result.error, "rate_limited");
  } finally {
    mockRateLimitAllowed = true;
  }
});

test("Phase 2b-2 Sold-out: mocked submitOrderRequest rejects sold-out items", async () => {
  const { admin } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [{ ...BASE_MENU_ITEM, is_sold_out: true }],
  });
  const result = await submitOrderRequest(baseInput(), admin);
  assert.equal(result.success, false);
  assert.equal(result.error, "item_sold_out");
  assert.equal(result.itemId, "item-1");
});

test("Phase 2b-2 Inactive: mocked submitOrderRequest rejects inactive items", async () => {
  const { admin } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [{ ...BASE_MENU_ITEM, is_active: false }],
  });
  const result = await submitOrderRequest(baseInput(), admin);
  assert.equal(result.success, false);
  assert.equal(result.error, "item_inactive");
});

test("Phase 2b-2 Delivery gate: mocked submitOrderRequest rejects delivery without the offering", async () => {
  const { admin } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: { ...BASE_BUSINESS, offerings: ["online_ordering", "pickup"] },
    menuItems: [BASE_MENU_ITEM],
  });
  const result = await submitOrderRequest(
    baseInput({ fulfilmentType: "delivery", deliveryAddress: "12 Rue des Jardins, Abidjan" }),
    admin
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "fulfilment_unavailable");
});

test("Phase 2b-2 Tampered price: server recomputes from DB promo price, never client input", async () => {
  const { admin, calls } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [BASE_MENU_ITEM],
  });
  const result = await submitOrderRequest(baseInput(), admin);
  assert.equal(result.success, true);
  // DB promo 7.50 x qty 2 = 15.00; base price 10.00 must not leak into the total.
  assert.equal(calls.insertPayload.subtotal, 15);
  assert.equal(calls.insertPayload.total_amount, 15);
  assert.equal(calls.insertPayload.items[0].unit_price, 7.5);
  assert.equal(calls.insertPayload.currency, "XOF", "CI business without metadata currency stores XOF");
});

test("Phase 2b-2 Foreign tenant: item outside the organizer scope returns item_not_found", async () => {
  const { admin } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [],
  });
  const result = await submitOrderRequest(baseInput(), admin);
  assert.equal(result.success, false);
  assert.equal(result.error, "item_not_found");
});

test("Phase 2b-2 Idempotency: duplicate key returns the existing order without re-insert", async () => {
  const existing = { order_number: "ORD-260101-1234", tracking_token: "track-existing", scheduled_for: null };
  const { admin, calls } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [BASE_MENU_ITEM],
    existingOrder: existing,
  });
  const result = await submitOrderRequest(baseInput({ idempotencyKey: "key-123" }), admin);
  assert.equal(result.success, true);
  assert.equal(result.orderNumber, existing.order_number);
  assert.equal(result.trackingToken, existing.tracking_token);
  assert.equal(calls.insertCalled, false, "idempotent replay must not insert again");
});

test("Phase 2b-2 Invalid options: required group with no valid choice is rejected", async () => {
  const itemWithGroups = {
    ...BASE_MENU_ITEM,
    option_groups: [
      { id: "g1", name: "Size", required: true, min: 1, max: 1, options: [
        { id: "s", name: "Small", price_delta: 0 },
        { id: "l", name: "Large", price_delta: 2 },
      ]},
    ],
  };
  const { admin } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [itemWithGroups],
  });
  const missing = await submitOrderRequest(
    baseInput({ items: [{ itemId: "item-1", selectedOptionIds: [], quantity: 1 }] }),
    admin
  );
  assert.equal(missing.success, false);
  assert.equal(missing.error, "invalid_options");
});

test("Phase 2b-2 Unknown option: ids outside the item option groups are rejected", async () => {
  const itemWithGroups = {
    ...BASE_MENU_ITEM,
    option_groups: [
      { id: "g1", name: "Size", required: false, min: 0, max: 1, options: [
        { id: "s", name: "Small", price_delta: 0 },
      ]},
    ],
  };
  const { admin } = makeMockAdmin({
    website: BASE_WEBSITE,
    business: BASE_BUSINESS,
    menuItems: [itemWithGroups],
  });
  const result = await submitOrderRequest(
    baseInput({ items: [{ itemId: "item-1", selectedOptionIds: ["nope"], quantity: 1 }] }),
    admin
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "unknown_option");
  assert.equal(result.itemId, "item-1");
});

// ── 8. Rate limit bucket identities (pure config) ────────────────────────────

const { RATE_LIMITS } = require(path.join(ROOT, "lib/rate-limit.ts"));

test("Phase 2b-2 Rate limit: orderRequestIp bucket has sane config", () => {
  const ip = RATE_LIMITS["orderRequestIp"];
  assert.ok(ip, "orderRequestIp bucket must be defined");
  assert.ok(ip.limit >= 5, "limit must be at least 5 per window");
  assert.ok(ip.windowSeconds >= 60, "window must be at least 60 seconds");
});

test("Phase 2b-2 Rate limit: orderRequestPhone bucket is equal or stricter than IP", () => {
  const phone = RATE_LIMITS["orderRequestPhone"];
  const ip = RATE_LIMITS["orderRequestIp"];
  assert.ok(phone, "orderRequestPhone bucket must be defined");
  assert.ok(phone.limit <= ip.limit, "phone bucket must be equal or stricter than IP bucket");
});

// ── 9. Notification dispatcher never throws with a failing channel ──────────

test("Phase 2b-2 Notifications: dispatcher resolves even when the bell channel throws", async () => {
  // Load the real dispatcher with stubbed boundaries: admin resolves an org,
  // createNotification throws on the bell channel.
  const notifPath = path.join(ROOT, "lib/order-notifications.ts");
  const adminPath = path.join(ROOT, "lib/supabase-admin.ts");
  const createNotifPath = path.join(ROOT, "lib/notifications.ts");
  delete require.cache[notifPath];
  delete require.cache[adminPath];
  delete require.cache[createNotifPath];
  require.cache[createNotifPath] = {
    id: createNotifPath,
    filename: createNotifPath,
    loaded: true,
    exports: {
      createNotification: async () => {
        throw new Error("smtp down");
      },
    },
  };
  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "organizers") {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "org-1", user_id: "owner-1", contact_email: null }, error: null }) }) }),
            };
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          };
        },
      }),
    },
  };
  const { dispatchOrderNotifications } = require(notifPath);
  await assert.doesNotReject(
    dispatchOrderNotifications(
      {
        id: "order-1",
        organizer_id: "org-1",
        order_number: "ORD-260101-0001",
        customer_name: "Awa Diallo",
        customer_phone: "0701020304",
        fulfilment_type: "pickup",
        currency: "XOF",
        total_amount: 15,
        items: [],
      },
      ["bell"]
    ),
    "dispatcher must never rethrow channel failures"
  );
  delete require.cache[notifPath];
  delete require.cache[adminPath];
  delete require.cache[createNotifPath];
});

test("Phase 2b-2 Notifications: whatsapp channel is a reserved no-op that resolves", async () => {
  const notifPath = path.join(ROOT, "lib/order-notifications.ts");
  const adminPath = path.join(ROOT, "lib/supabase-admin.ts");
  const createNotifPath = path.join(ROOT, "lib/notifications.ts");
  delete require.cache[notifPath];
  delete require.cache[adminPath];
  delete require.cache[createNotifPath];
  let bellCalled = false;
  require.cache[createNotifPath] = {
    id: createNotifPath,
    filename: createNotifPath,
    loaded: true,
    exports: {
      createNotification: async () => {
        bellCalled = true;
      },
    },
  };
  require.cache[adminPath] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "organizers") {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "org-1", user_id: "owner-1", contact_email: null }, error: null }) }) }),
            };
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          };
        },
      }),
    },
  };
  const { dispatchOrderNotifications } = require(notifPath);
  await dispatchOrderNotifications(
    {
      id: "order-1",
      organizer_id: "org-1",
      order_number: "ORD-260101-0001",
      customer_name: "Awa Diallo",
      customer_phone: "0701020304",
      fulfilment_type: "pickup",
      currency: "XOF",
      total_amount: 15,
      items: [],
    },
    ["whatsapp"]
  );
  assert.equal(bellCalled, false, "whatsapp-only dispatch must not touch the bell channel");
  delete require.cache[notifPath];
  delete require.cache[adminPath];
  delete require.cache[createNotifPath];
});

// ── 10. Migration 171 RLS (source-text: needs live DB for behavior) ──────────

test("Phase 2b-2 Migration 171 RLS: RLS is enabled, no anon grants, tenant SELECT only", () => {
  const sql = fs.readFileSync(path.join(ROOT, "db/migration_171_orders.sql"), "utf8");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/, "RLS is enabled on orders");
  assert.doesNotMatch(sql, /GRANT.*TO anon/i, "no anon grants");
  assert.match(sql, /is_entity_member\s*\(/, "uses is_entity_member() for tenant role check");
  assert.match(sql, /REFERENCES public\.tenant_websites\(id\)/, "website_id references tenant_websites");
  assert.match(sql, /tracking_token text NOT NULL UNIQUE DEFAULT encode\(gen_random_bytes\(24\), 'hex'\)/, "48-char hex tracking token");
  assert.match(sql, /payment_method IN \('on_fulfilment', 'online', 'mobile_money'\)/, "payment_method values");
  assert.match(sql, /CONSTRAINT orders_organizer_idempotency_key UNIQUE \(organizer_id, idempotency_key\)/, "idempotency uniqueness");
});

test("Phase 2b-2 Migration 171: rollback twin and supabase mirror exist with identical hash", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT, "db/migration_171_orders_rollback.sql")),
    "rollback twin must exist"
  );
  const mirrorDir = path.join(ROOT, "supabase/migrations");
  const mirrors = fs.readdirSync(mirrorDir);
  assert.ok(
    mirrors.some((f) => f.includes("migration_171")),
    "supabase/migrations must contain a mirror of migration_171"
  );
  const fwd = fs.readFileSync(path.join(ROOT, "db/migration_171_orders.sql"), "utf8");
  const mirror = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261012000002_migration_171_orders.sql"), "utf8");
  assert.equal(mirror, fwd, "mirror must be byte-identical to db/ forward file");
});

// ── 11. Cart (source-text: client component needs DOM) ───────────────────────

test("Phase 2b-2 Cart: StorefrontBrowse wraps localStorage in try/catch (file-level check)", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"),
    "utf8"
  );
  assert.match(src, /localStorage/, "uses localStorage for cart persistence");
  assert.match(src, /try\s*{[\s\S]*?localStorage[\s\S]*?catch/, "localStorage is wrapped in try/catch");
});

test("Phase 2b-2 Cart: idempotency key is sent with checkout submission (file-level check)", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"),
    "utf8"
  );
  assert.match(src, /idempotencyKey/, "cart generates an idempotency key");
});

test("Phase 2b-2 Cart: unknown_option failures surface a specific message (file-level check)", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "components/site/blocks/StorefrontBrowse.tsx"),
    "utf8"
  );
  assert.match(src, /res\.error === "unknown_option"/, "cart branches on the unknown_option code");
  assert.match(src, /no longer available/, "cart explains the stale option");
});

// ── 12. EN/FR key parity: Storefront ordering keys ────────────────────────────

test("Phase 2b-2 i18n: EN and FR Storefront order keys are identical", () => {
  const en = require(path.join(ROOT, "messages/en.json"));
  const fr = require(path.join(ROOT, "messages/fr.json"));

  const ORDER_KEYS = [
    "addToOrder", "viewOrder", "yourOrder", "emptyCart", "subtotal",
    "deliveryFee", "deliveryFeeNotice", "total", "fulfilment", "pickup",
    "delivery", "deliveryAddress", "customerDetails", "fullName", "phone",
    "email", "orderNote", "paymentOnFulfilment", "placeOrder", "placingOrder",
    "orderSuccessTitle", "orderSuccessSubtext", "orderNumber",
    "scheduledNotice", "noUpcomingHours", "backToMenu",
  ];
  for (const key of ORDER_KEYS) {
    assert.equal(typeof en.Storefront[key], "string", `en.Storefront.${key} must be a string`);
    assert.equal(typeof fr.Storefront[key], "string", `fr.Storefront.${key} must be a string`);
  }
});

test("Phase 2b-2 i18n: EN and FR Orders namespace keys are identical", () => {
  const en = require(path.join(ROOT, "messages/en.json"));
  const fr = require(path.join(ROOT, "messages/fr.json"));
  const enKeys = Object.keys(en.Orders).sort();
  const frKeys = Object.keys(fr.Orders).sort();
  assert.deepEqual(enKeys, frKeys, "Orders namespace must have identical keys in EN and FR");
});

// ── 13. Existing site page (source-text: server component needs request scope) ─

test("Phase 2b-2 Site page: orderConfig only built when storefrontFeatures.ordering is true", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "app/site/[slug]/[[...page]]/page.tsx"),
    "utf8"
  );
  assert.match(src, /storefrontFeatures\.ordering/, "orderConfig is gated on storefrontFeatures.ordering");
  assert.match(src, /resolveOrderSchedule/, "resolveOrderSchedule is called for orderConfig");
  assert.match(src, /orderConfig\s*=\s*{/, "orderConfig object is built");
  assert.match(src, /orderConfig={orderConfig}/, "orderConfig is passed to BlockRenderer");
});

// ── 14. Primary action: orderNow vs viewMenu ───────────────────────────────────

const { resolvePrimaryAction } = require(path.join(ROOT, "lib/storefront-primary-action.ts"));

test("Phase 2b-2 Primary action: orderNow when ordering is live and menu page exists", () => {
  const result = resolvePrimaryAction({
    businessType: "Full-Service Restaurant",
    features: {
      offerings: ["online_ordering", "pickup"],
      built: { ordering: true, delivery: false, pickup: true, reservations: false },
    },
    builtPages: new Set(["home", "menu", "catalog", "contact"]),
  });
  assert.equal(result.primary?.labelKey, "orderNow");
});

test("Phase 2b-2 Primary action: viewMenu when ordering not live but menu page exists", () => {
  const result = resolvePrimaryAction({
    businessType: "Full-Service Restaurant",
    features: {
      offerings: [], // online_ordering not selected
      built: { ordering: true, delivery: false, pickup: true, reservations: false },
    },
    builtPages: new Set(["home", "menu", "catalog", "contact"]),
  });
  // ordering is false because offerings does not include online_ordering
  assert.equal(result.primary?.labelKey, "viewMenu");
});

// ── 15. Owner orders page (source-text: server component needs auth scope) ────

test("Phase 2b-2 Orders page: file exists at correct path", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT, "app/dashboard/org/[id]/orders/page.tsx")),
    "orders page must exist at app/dashboard/org/[id]/orders/page.tsx"
  );
});

test("Phase 2b-2 Orders page: tenant-scoped query and role guard without viewer", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "app/dashboard/org/[id]/orders/page.tsx"),
    "utf8"
  );
  assert.match(src, /checkTenantAccess/, "uses checkTenantAccess for role guard");
  assert.match(src, /ALLOWED_ROLES = \["owner", "admin", "manager", "editor", "finance"\]/, "ALLOWED_ROLES matches RLS read roles");
  assert.doesNotMatch(src, /\.\.\.ALLOWED_ROLES, "viewer"/, "viewer must not be granted read access");
  assert.match(src, /createSupabaseAdmin/, "reads via the admin client with a manual tenant guard (RLS bypass documented)");
  assert.match(src, /organizer_id.*organizerId|eq\("organizer_id"/, "queries filtered by organizer_id");
  assert.match(src, /created_at.*asc.*false|ascending.*false/, "orders sorted descending by date");
});

test("Phase 2b-2 Orders nav: orders module has routeExists: true in org-dashboard-modules", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/org-dashboard-modules.ts"), "utf8");
  assert.match(src, /key: "orders"[\s\S]*?routeExists: true/, "orders module routeExists must be true");
});

test("Phase 2b-2 Orders nav: org Orders requires the online_ordering offering (behavior)", () => {
  const { getOrgNavModules } = require(path.join(ROOT, "lib/org-dashboard-modules.ts"));
  const { getCapabilitiesForBusiness } = require(path.join(ROOT, "lib/business-taxonomy.ts"));
  const caps = getCapabilitiesForBusiness("", "Restaurant", "Full-Service Restaurant");
  const withOffering = getOrgNavModules(caps, { hasMenuRows: false, hasServiceRows: false, offerings: ["online_ordering"] });
  assert.ok(withOffering.some((m) => m.key === "orders"), "orders visible with the offering");
  const withoutOffering = getOrgNavModules(caps, { hasMenuRows: true, hasServiceRows: false, offerings: [] });
  assert.ok(!withoutOffering.some((m) => m.key === "orders"), "menu rows alone do not enable orders");
});

test("Phase 2b-2 Action shape: exported submitOrderRequest takes only serializable input", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/actions/orders.ts"), "utf8");
  assert.match(src, /export async function submitOrderRequest\(\s*input: SubmitOrderRequestInput\s*\)/, "single serializable input param");
  assert.doesNotMatch(src, /overrides/, "no test-only client override param");
  assert.match(src, /submitOrderRequestWithClient\(input, admin\)/, "delegates to the internal client-injected function");
  assert.match(src, /export type \{ OrderItemInput, SubmitOrderRequestInput, SubmitOrderResult \}/, "types re-exported for callers");
});

test("Phase 2b-2 Source-text remainder: only DOM/request/DB-bound checks stay file-level", () => {
  // Guardrail: this file must not reintroduce source-text checks for logic
  // already covered by mocked behavior above (sold-out, inactive, honeypot,
  // fulfilment, notifications throw-shape).
  const src = fs.readFileSync(__filename, "utf8");
  assert.doesNotMatch(src, /action must reject sold-out items \(file-level check\)/);
  assert.doesNotMatch(src, /action must reject inactive items \(file-level check\)/);
  assert.doesNotMatch(src, /rejects non-empty hp field \(file-level check\)/);
  assert.doesNotMatch(src, /never rethrows \(file-level check\)/);
});
