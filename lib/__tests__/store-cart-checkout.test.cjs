/**
 * lib/__tests__/store-cart-checkout.test.cjs
 *
 * Milestone 3 (multi-item cart + unified checkout) and Milestone 4 (template
 * editing completion) for the Store template.
 *
 * Hermetic: pure cart/promo math, validateCartCheckout with injected fake
 * Supabase + Stripe clients, resolver/editor-schema behavior on real code,
 * EN/FR parity, migration file contracts, and source-level integration
 * assertions. No DB, no network, no Stripe calls.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
require.extensions[".tsx"] = require.extensions[".ts"];

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
  if (request === "react") {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, "node_modules/react"),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const { normalizeCartItems, STORE_CART_MAX_ITEMS } = require("../store-cart.ts");
const {
  normalizePromoCode,
  validatePromoRow,
  applyPromoToSubtotal,
} = require("../promo-codes.ts");
const {
  distributeDiscount,
  validateCartCheckout,
} = require("../store-cart-checkout.ts");
const { normalizeContent } = require("../website-content.ts");
const { resolveTemplateContent } = require("../website-template-resolver.ts");
const {
  buildWebsiteEditorSections,
  getWebsiteEditorControlForSlot,
} = require("../website-v2-editor-schema.ts");
const { getFlagshipTemplate } = require("../website-template-v2.ts");

const enStorefront = JSON.parse(read("messages/en.json")).Storefront;
const frStorefront = JSON.parse(read("messages/fr.json")).Storefront;
const enPublicSite = JSON.parse(read("messages/en.json")).PublicSite;
const frPublicSite = JSON.parse(read("messages/fr.json")).PublicSite;

// ── Fake injected clients ────────────────────────────────────────────────────

function fakeClient(fixtures) {
  return {
    from(table) {
      const filters = [];
      const rows = fixtures[table] ?? [];
      const apply = () =>
        rows.filter((row) =>
          filters.every((f) =>
            f.op === "eq" ? row[f.col] === f.val : (f.vals ?? []).includes(row[f.col])
          )
        );
      const chain = {
        select() { return chain; },
        eq(col, val) { filters.push({ op: "eq", col, val }); return chain; },
        in(col, vals) { filters.push({ op: "in", col, vals }); return chain; },
        order() { return chain; },
        limit() { return chain; },
        not() { return chain; },
        maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
        single: async () => ({ data: apply()[0] ?? null, error: null }),
        then(resolve) { resolve({ data: apply(), error: null }); },
      };
      return chain;
    },
  };
}

function baseFixtures(overrides = {}) {
  return {
    tenant_websites: [
      {
        id: "w1",
        tenant_id: "t1",
        slug: "shop",
        site_title: "Shop",
        metadata: { templateId: "store", templateVersion: "1.0.0" },
        status: "published",
      },
    ],
    businesses: [
      {
        id: "b1",
        organizer_id: "t1",
        country: null,
        industry: "",
        category: "",
        business_type: "Bakery Café",
        offerings: ["online_payment"],
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    website_content: [{ website_id: "w1", content: {} }],
    website_pages: [{ slug: "home" }, { slug: "shop" }, { slug: "contact" }],
    products: [
      {
        id: "p1",
        business_id: "b1",
        name: "Mug",
        slug: "mug",
        status: "active",
        price_type: "one_time",
        product_type: "other",
        stripe_price_id: "price_1",
        stock_quantity: 10,
      },
      {
        id: "p2",
        business_id: "b1",
        name: "Beans",
        slug: "beans",
        status: "active",
        price_type: "one_time",
        product_type: "other",
        stripe_price_id: "price_2",
        stock_quantity: 3,
      },
    ],
    promo_codes: [],
    ...overrides,
  };
}

const fakeStripe = {
  prices: {
    retrieve: async (id) => {
      const map = {
        price_1: { unit_amount: 2500, currency: "usd" },
        price_2: { unit_amount: 1000, currency: "usd" },
        price_eur: { unit_amount: 2000, currency: "eur" },
      };
      if (!map[id]) throw new Error("No such price");
      return map[id];
    },
  },
};

function check(input, fixtures = baseFixtures()) {
  return validateCartCheckout({
    supabaseAdmin: fakeClient(fixtures),
    stripeSecretKey: "sk_test_fake",
    stripeClient: fakeStripe,
    siteSlug: "shop",
    items: [
      { productId: "p1", quantity: 2 },
      { productId: "p2", quantity: 1 },
    ],
    buyerEmail: "buyer@example.com",
    buyerName: "Buyer",
    promoCode: undefined,
    viewerId: null,
    ...input,
  });
}

// ── Cart normalization ───────────────────────────────────────────────────────

test("normalizeCartItems merges, clamps, caps, and drops garbage", () => {
  assert.deepStrictEqual(normalizeCartItems("nope"), []);
  assert.deepStrictEqual(
    normalizeCartItems([
      { productId: "a", quantity: 2 },
      { productId: "a", quantity: 3 },
      { productId: "b", quantity: 0 },
      { productId: "", quantity: 1 },
      { productId: "c", quantity: 500 },
      null,
    ]),
    [
      { productId: "a", quantity: 5 },
      { productId: "c", quantity: 100 },
    ]
  );
  const many = Array.from({ length: 20 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
  assert.equal(normalizeCartItems(many).length, STORE_CART_MAX_ITEMS);
});

// ── Discount distribution ────────────────────────────────────────────────────

test("distributeDiscount sums exactly and never drives units negative", () => {
  const units = [2500, 2500, 1000];
  const out = distributeDiscount(units, 600);
  assert.equal(
    units.reduce((s, v) => s + v, 0) - out.reduce((s, v) => s + v, 0),
    600
  );
  assert.ok(out.every((v, i) => v >= 0 && v <= units[i]));
  assert.deepStrictEqual(distributeDiscount(units, 0), units);
  assert.deepStrictEqual(distributeDiscount(units, 999999), [0, 0, 0]);
  assert.deepStrictEqual(distributeDiscount([], 50), []);
});

// ── Promo validation ─────────────────────────────────────────────────────────

function promoRow(overrides = {}) {
  return {
    id: "promo1",
    tenant_id: "t1",
    code: "SAVE10",
    percent_off: 10,
    fixed_off_minor: null,
    fixed_currency: null,
    min_subtotal_minor: 0,
    max_uses: null,
    used_count: 0,
    starts_at: null,
    expires_at: null,
    is_active: true,
    ...overrides,
  };
}

test("promo codes normalize and validate tenant, window, and caps", () => {
  assert.equal(normalizePromoCode("  save10 "), "SAVE10");
  assert.equal(normalizePromoCode(null), "");
  assert.ok(validatePromoRow(promoRow(), "t1").ok);
  assert.equal(validatePromoRow(promoRow(), "other").ok, false);
  assert.equal(validatePromoRow(promoRow({ is_active: false }), "t1").ok, false);
  assert.equal(
    validatePromoRow(promoRow({ expires_at: "2020-01-01T00:00:00Z" }), "t1").ok,
    false
  );
  assert.equal(
    validatePromoRow(promoRow({ starts_at: "2999-01-01T00:00:00Z" }), "t1").ok,
    false
  );
  assert.equal(
    validatePromoRow(promoRow({ max_uses: 2, used_count: 2 }), "t1").ok,
    false
  );
  assert.equal(validatePromoRow(promoRow({ percent_off: 0 }), "t1").ok, false);
  assert.equal(validatePromoRow(promoRow({ percent_off: 95 }), "t1").ok, false);
  assert.equal(
    validatePromoRow(
      promoRow({ percent_off: null, fixed_off_minor: 500, fixed_currency: "USD" }),
      "t1"
    ).ok,
    true
  );
  assert.equal(
    validatePromoRow(
      promoRow({ percent_off: 10, fixed_off_minor: 500, fixed_currency: "USD" }),
      "t1"
    ).ok,
    false,
    "percent XOR fixed enforced"
  );
});

test("promo math honors minimums, currency gates, and caps", () => {
  const percent = validatePromoRow(promoRow(), "t1").promo;
  assert.deepStrictEqual(applyPromoToSubtotal(6000, percent, "USD"), {
    discountMinor: 600,
    totalMinor: 5400,
    belowMinimum: false,
  });
  const min = validatePromoRow(promoRow({ min_subtotal_minor: 999999 }), "t1").promo;
  assert.equal(applyPromoToSubtotal(6000, min, "USD").belowMinimum, true);
  const fixed = validatePromoRow(
    promoRow({ percent_off: null, fixed_off_minor: 500, fixed_currency: "USD" }),
    "t1"
  ).promo;
  assert.equal(applyPromoToSubtotal(6000, fixed, "EUR").discountMinor, 0);
  assert.equal(applyPromoToSubtotal(300, fixed, "USD").totalMinor, 0, "capped at subtotal");
});

// ── Checkout validation path ───────────────────────────────────────────────

test("happy path prices two items and applies a promo server-side", async () => {
  const fixtures = baseFixtures({ promo_codes: [promoRow()] });
  const res = await check({ promoCode: "save10" }, fixtures);
  assert.equal(res.ok, true);
  assert.equal(res.cart.currency, "USD");
  assert.equal(res.cart.lines.length, 2);
  assert.equal(res.cart.subtotalMinor, 6000);
  assert.equal(res.cart.discountMinor, 600);
  assert.equal(res.cart.totalMinor, 5400);
  assert.equal(res.cart.promo.code, "SAVE10");
});

test("client totals cannot override server pricing", async () => {
  const res = await check({ items: [{ productId: "p1", quantity: 1 }] });
  assert.equal(res.ok, true);
  // Forged extra fields ride along on items but change nothing.
  const forged = await check({
    items: [{ productId: "p1", quantity: 1, unitMajor: 0.01, totalMinor: 1 }],
  });
  assert.equal(forged.ok, true);
  assert.equal(forged.cart.subtotalMinor, 2500);
});

test("empty cart, bad slug, and unknown/non-store sites fail closed", async () => {
  assert.equal((await check({ items: [] })).ok, false);
  assert.equal((await check({ siteSlug: "not a slug!" })).status, 400);
  assert.equal(
    (await check({}, baseFixtures({ tenant_websites: [] }))).status,
    404
  );
  const nonStore = baseFixtures();
  nonStore.tenant_websites[0].metadata = { templateId: "food-order" };
  assert.equal((await check({}, nonStore)).status, 404);
});

test("unavailable products surface per-item 409 issues", async () => {
  const foreign = baseFixtures();
  foreign.products[0].business_id = "b-other";
  let res = await check({ items: [{ productId: "p1", quantity: 1 }] }, foreign);
  assert.equal(res.status, 409);

  const archived = baseFixtures();
  archived.products[1].status = "archived";
  res = await check({}, archived);
  assert.equal(res.status, 409);
  assert.ok(res.issues.some((i) => i.productId === "p2"));

  const soldOut = baseFixtures();
  soldOut.products[0].stock_quantity = 0;
  res = await check({ items: [{ productId: "p1", quantity: 1 }] }, soldOut);
  assert.equal(res.status, 409);

  const short = baseFixtures();
  short.products[1].stock_quantity = 1;
  res = await check({ items: [{ productId: "p2", quantity: 2 }] }, short);
  assert.equal(res.status, 409);

  const noPrice = baseFixtures();
  noPrice.products[0].stripe_price_id = null;
  res = await check({ items: [{ productId: "p1", quantity: 1 }] }, noPrice);
  assert.equal(res.status, 409);

  const sub = baseFixtures();
  sub.products[0].price_type = "subscription";
  res = await check({ items: [{ productId: "p1", quantity: 1 }] }, sub);
  assert.equal(res.status, 409);
  assert.ok(res.issues.some((i) => /separately/.test(i.error)));
});

test("currency mismatch and disabled online payment fail closed", async () => {
  const eur = baseFixtures();
  eur.products[0].stripe_price_id = "price_eur";
  const res = await check({ items: [{ productId: "p1", quantity: 1 }] }, eur);
  assert.equal(res.status, 409);
  assert.match(res.error, /EUR/);

  const off = baseFixtures();
  off.businesses[0].offerings = [];
  const res2 = await check({}, off);
  assert.equal(res2.ok, false);
});

test("digital quantities force to one; invalid promo is a 409", async () => {
  const digital = baseFixtures();
  digital.products[0].product_type = "ebook";
  const res = await check({ items: [{ productId: "p1", quantity: 5 }] }, digital);
  assert.equal(res.ok, true);
  assert.equal(res.cart.lines.find((l) => l.productId === "p1").quantity, 1);

  const badPromo = await check({ promoCode: "NOPE" });
  assert.equal(badPromo.status, 409);
});

// ── Milestone 4: density control ─────────────────────────────────────────────

test("resolver honors the owner density override and clamps it", () => {
  const doc = (extras) => normalizeContent({ template_extras: extras });
  const blocks = (content) =>
    resolveTemplateContent("store", "1.0.0", content, { includeSamples: false })
      .pages.flatMap((page) => page.blocks)
      .filter((block) => block.type === "products_embed");

  const def = blocks(doc({}));
  assert.ok(def.length > 0);
  assert.deepStrictEqual(
    def.map((b) => b.browsePageSize).sort((a, b) => a - b),
    [6, 12]
  );

  const custom = blocks(doc({ storeBrowsePageSize: 4 }));
  assert.ok(custom.length > 0);
  assert.ok(custom.every((b) => b.browsePageSize === 4));

  const clamped = blocks(doc({ storeBrowsePageSize: 999 }));
  assert.ok(clamped.every((b) => b.browsePageSize === 24));

  const invalid = blocks(doc({ storeBrowsePageSize: "many" }));
  assert.deepStrictEqual(
    invalid.map((b) => b.browsePageSize).sort((a, b) => a - b),
    [6, 12]
  );
});

test("density survives normalization and appears in preview and publish alike", () => {
  const normalized = normalizeContent({ template_extras: { storeBrowsePageSize: 8 } });
  assert.equal(normalized.template_extras.storeBrowsePageSize, 8);
  const preview = resolveTemplateContent("store", "1.0.0", normalized, {
    includeSamples: true,
  });
  const live = resolveTemplateContent("store", "1.0.0", normalized, {
    includeSamples: false,
  });
  const sizes = (resolved) =>
    resolved.pages
      .flatMap((page) => page.blocks)
      .filter((block) => block.type === "products_embed")
      .map((block) => block.browsePageSize);
  assert.ok(sizes(preview).every((size) => size === 8));
  assert.deepStrictEqual(sizes(preview), sizes(live));
});

test("V2 editor exposes the density control with a number kind", () => {
  const template = getFlagshipTemplate("store");
  const normalized = normalizeContent({});
  const resolved = resolveTemplateContent(template.id, template.version, normalized, {
    includeSamples: true,
  });
  const sections = buildWebsiteEditorSections(template, normalized, resolved, []);
  const found = getWebsiteEditorControlForSlot(sections, "shop.density");
  assert.ok(found, "shop.density control exists");
  assert.equal(found.control.kind, "number");
  assert.equal(found.control.extraKey, "storeBrowsePageSize");
  assert.equal(found.control.labelKey, "storeSlotDensity");
  const templates = ["restaurant-table-flame", "rental-driveline", "food-order"].map((id) => {
    const t = getFlagshipTemplate(id);
    const n = normalizeContent({});
    const r = resolveTemplateContent(t.id, t.version, n, { includeSamples: true });
    return getWebsiteEditorControlForSlot(
      buildWebsiteEditorSections(t, n, r, []),
      "shop.density"
    );
  });
  assert.ok(templates.every((entry) => entry === undefined), "density stays Store-only");
});

// ── i18n parity ──────────────────────────────────────────────────────────────

test("cart and density labels exist in EN and FR", () => {
  // storeCartTotal is "Total" in both languages — identical is correct.
  const identicalOk = new Set(["storeCartTotal"]);
  for (const key of [
    "storeAddToCart",
    "storeViewCart",
    "storeCartAdded",
    "storeCartTitle",
    "storeCartEmpty",
    "storeCartEmptyBody",
    "storeCartCheckout",
    "storeCartPay",
    "storeCartContinue",
    "storeCartSubtotal",
    "storeCartDiscount",
    "storeCartTotal",
    "storeCartRemove",
    "storeCartPromo",
    "storeCartPromoPlaceholder",
    "storeCartChanged",
    "storeCartUnavailable",
    "sortLabel",
    "sortFeatured",
    "sortNewest",
    "sortPriceAsc",
    "sortPriceDesc",
  ]) {
    assert.equal(typeof enStorefront[key], "string", `en Storefront.${key}`);
    assert.equal(typeof frStorefront[key], "string", `fr Storefront.${key}`);
    if (!identicalOk.has(key)) {
      assert.notEqual(frStorefront[key], enStorefront[key], `fr ${key} translated`);
    }
  }
  for (const key of ["storeEditorShop", "storeSlotDensity", "storeSlotDensityHint"]) {
    assert.equal(typeof enPublicSite[key], "string", `en PublicSite.${key}`);
    assert.equal(typeof frPublicSite[key], "string", `fr PublicSite.${key}`);
    assert.notEqual(frPublicSite[key], enPublicSite[key], `fr ${key} translated`);
  }
});

// ── Source contracts ─────────────────────────────────────────────────────────

test("cart route reuses shared validation and stamps the session", () => {
  const src = read("app/api/checkout/cart/route.ts");
  assert.ok(src.includes("validateCartCheckout"), "no forked validation");
  assert.ok(src.includes("distributeDiscount"), "snapshots sum to the charge");
  assert.ok(src.includes("price_data"), "server-computed line amounts");
  assert.ok(src.includes('kind: "product_cart"'), "cart session kind");
  assert.ok(src.includes("stripe_session_id: session.id"), "group linkage stamped");
  assert.ok(!src.includes("unit_price: rowUnitMinor /"), "no ad-hoc currency math");
  const validate = read("app/api/checkout/cart/validate/route.ts");
  assert.ok(validate.includes("validateCartCheckout"), "review shares validation");
  assert.doesNotMatch(validate, /\.insert\(/, "review writes nothing");
  assert.doesNotMatch(validate, /checkout\.sessions\.create/, "review creates no session");
});

test("webhook fulfills carts with total guard and promo burn", () => {
  const src = read("app/api/webhooks/stripe/route.ts");
  assert.ok(src.includes("fulfillProductCart"), "cart branch exists");
  assert.ok(src.includes("product_order_ids"), "metadata id array read");
  assert.ok(src.includes("toMinorUnits(Number(row.total_amount)"), "snapshot sum guard");
  assert.ok(src.includes("markProductOrderPaid(row.id"), "per-row idempotent flip");
  assert.ok(src.includes("apply_promo_use"), "promo burn on paid carts");
  assert.ok(src.includes("alertReconciliationFailure"), "row failures alert loudly");
});

test("lookup and confirmation stay tenant-bound for carts", () => {
  const lookup = read("app/api/products/order-lookup/route.ts");
  assert.ok(lookup.includes("cartSession"), "cart session mode exists");
  assert.ok(lookup.includes('payment_status !== "paid"'), "unpaid sessions stay hidden");
  assert.ok(lookup.includes('kind !== "product_cart"'), "single-order sessions cannot pivot");
  const page = read("app/site/[slug]/order-confirmation/page.tsx");
  assert.ok(page.includes("cartSession"), "page accepts cart sessions");
  assert.ok(page.includes("stripe_session_id"), "cart rows bound to the site");
  const view = read("components/site/v2/StoreOrderConfirmationView.tsx");
  assert.ok(view.includes("cartSessionId"), "view polls cart sessions");
  assert.ok(view.includes("formatMoney"), "shared formatter for totals");
});

test("cart UI mounts Store-only with a11y and empty states", () => {
  const browse = read("components/site/blocks/StorefrontBrowse.tsx");
  assert.ok(browse.includes("storeCart"), "opt-in prop, no menu-cart collision");
  assert.ok(browse.includes("StoreCartWidget"), "widget mounted");
  assert.ok(browse.includes("onAdd: handleQuickAdd"), "carousel quick-add wired");
  const carousel = read("components/site/blocks/ProductCarousel.tsx");
  assert.ok(carousel.includes("onAdd"), "opt-in quick-add prop");
  assert.doesNotMatch(carousel, /heart|rating|review/i, "no banned card chrome");
  const drawer = read("components/site/v2/StoreCartDrawer.tsx");
  assert.ok(drawer.includes('role="dialog"'), "drawer dialog semantics");
  assert.ok(drawer.includes("aria-pressed") || drawer.includes("aria-label"), "controls labelled");
  assert.ok(drawer.includes("formatMoney"), "shared formatter for money");
  assert.ok(drawer.includes("/api/checkout/cart/validate"), "review before pay");
  assert.ok(drawer.includes("promoCode"), "working promo field, not a dead input");
});

test("migration 177 ships promo codes with rollback and mirror twins", () => {
  const fwd = read("db/migration_177_store_promo_codes.sql");
  assert.ok(fwd.includes("CREATE TABLE IF NOT EXISTS public.promo_codes"));
  assert.ok(fwd.includes("promo_codes_exactly_one_discount"), "percent XOR fixed");
  assert.ok(fwd.includes("promo_codes_tenant_code_unique"), "per-tenant code uniqueness");
  assert.ok(fwd.includes("apply_promo_use"), "capped atomic burn RPC");
  assert.ok(fwd.includes("is_entity_member"), "tenant RLS pattern");
  const back = read("db/migration_177_store_promo_codes_rollback.sql");
  assert.ok(back.includes("DROP TABLE IF EXISTS public.promo_codes"));
  const mirror = read("supabase/migrations/20261016000000_migration_177_store_promo_codes.sql");
  assert.equal(mirror, fwd, "mirror byte-identical");
});

// ── Verification gap closure: hero CTA + featured picker ─────────────────────

function storeBlocks(content, options = {}) {
  const normalized = normalizeContent(content);
  return resolveTemplateContent("store", "1.0.0", normalized, {
    includeSamples: false,
    ...options,
  })
    .pages.flatMap((page) => page.blocks)
    .filter((block) => block.type === "products_embed" || block.type === "hero");
}

test("Store hero CTA honors an owner label via template_extras and stays site-local", () => {
  const owner = "Shop the collection";
  const withCta = storeBlocks({ template_extras: { storeHeroCta: owner } }).find(
    (block) => block.type === "hero"
  );
  assert.ok(withCta, "hero block emitted");
  assert.equal(withCta.ctaLabel, owner, "owner extras label wins over the platform action label");
  assert.match(withCta.ctaHref, /^\/site\/store\//, "hero targets a site-local page");

  const withoutCta = storeBlocks({}).find((block) => block.type === "hero");
  assert.ok(withoutCta);
  assert.ok(withoutCta.ctaLabel, "platform action label applies when the owner has not set one");
  assert.notEqual(withoutCta.ctaLabel, owner);
  assert.match(withoutCta.ctaHref, /^\/site\/store\//);

  // The shared primary_cta_label stays platform-owned for fixed actions
  // (pre-existing resolver precedence); the extras key is the Store path.
  const legacy = storeBlocks({ primary_cta_label: owner }).find((block) => block.type === "hero");
  assert.notEqual(legacy.ctaLabel, owner, "fixed-fallback label precedence unchanged");

  // The extras value survives normalization (trimmed, kept).
  const normalized = normalizeContent({ template_extras: { storeHeroCta: `  ${owner} ` } });
  assert.equal(normalized.template_extras.storeHeroCta, owner);
});

test("home featured picks bind UUID product ids; shop stays full-catalog", () => {
  const pickA = "11111111-1111-4111-8111-111111111111";
  const pickB = "22222222-2222-4222-8222-222222222222";
  const home = storeBlocks({ featured: { product_ids: [pickA, pickB, "not-a-uuid"] } }).filter(
    (block) => block.heading === "Featured products"
  );
  assert.ok(home.length > 0);
  assert.deepStrictEqual(home[0].selectedProductIds, [pickA, pickB]);
  const shop = storeBlocks({ featured: { product_ids: [pickA] } }).filter(
    (block) => block.heading === "Shop all products"
  );
  assert.ok(shop.length > 0);
  assert.ok(!("selectedProductIds" in shop[0]), "shop ignores featured picks");
});

test("featured product ids survive normalization; junk is dropped", () => {
  const normalized = normalizeContent({
    featured: { product_ids: ["p1", 42, "  ", "33333333-3333-4333-8333-333333333333"] },
  });
  assert.deepStrictEqual(normalized.featured.product_ids, [
    "p1",
    "33333333-3333-4333-8333-333333333333",
  ]);
});

test("V2 editor exposes hero CTA, density, and featured controls Store-only", () => {
  const template = getFlagshipTemplate("store");
  const normalized = normalizeContent({});
  const resolved = resolveTemplateContent(template.id, template.version, normalized, {
    includeSamples: true,
  });
  const sections = buildWebsiteEditorSections(template, normalized, resolved, []);
  const cta = getWebsiteEditorControlForSlot(sections, "hero.cta_primary");
  assert.ok(cta, "hero CTA control exists");
  assert.equal(cta.control.kind, "text");
  assert.equal(cta.control.field, "template_extras");
  assert.equal(cta.control.extraKey, "storeHeroCta");
  assert.equal(cta.control.labelKey, "storeSlotHeroCta");
  const featured = getWebsiteEditorControlForSlot(sections, "home.featured");
  assert.ok(featured, "featured control exists");
  assert.equal(featured.control.kind, "pick");
  assert.equal(featured.control.labelKey, "storeSlotFeaturedProducts");
  const density = getWebsiteEditorControlForSlot(sections, "shop.density");
  assert.ok(density && density.control.kind === "number");
  for (const id of ["restaurant-table-flame", "food-order"]) {
    const t = getFlagshipTemplate(id);
    const n = normalizeContent({});
    const r = resolveTemplateContent(t.id, t.version, n, { includeSamples: true });
    const s = buildWebsiteEditorSections(t, n, r, []);
    assert.equal(getWebsiteEditorControlForSlot(s, "home.featured"), undefined);
    assert.equal(getWebsiteEditorControlForSlot(s, "shop.density"), undefined);
  }
});

test("product choices action is tenant-scoped and hides unsellable rows", () => {
  const src = read("lib/actions/website-v2.ts");
  assert.ok(src.includes("getV2ProductChoices"), "action exists");
  assert.ok(src.includes(".eq(\"organizer_id\", tenantId)"), "businesses tenant-scoped");
  assert.ok(src.includes(".eq(\"status\", \"active\")"), "active products only");
  assert.ok(src.includes("getStoreProductStockState"), "sold-out filtered with shared logic");
  assert.ok(src.includes("checkTenantAccess"), "role-gated like menu choices");
  const page = read("app/dashboard/org/[id]/website/builder/page.tsx");
  assert.ok(page.includes("getV2ProductChoices(website.id)"), "builder page fetches for stores");
  assert.ok(page.includes("productChoices"), "choices reach the editor");
});

test("new hero, featured, and quantity labels exist in EN and FR", () => {
  for (const key of ["storeSlotHeroCta", "storeEditorFeatured", "storeSlotFeaturedProducts", "storePickEmpty"]) {
    assert.equal(typeof enPublicSite[key], "string", `en PublicSite.${key}`);
    assert.equal(typeof frPublicSite[key], "string", `fr PublicSite.${key}`);
    assert.notEqual(frPublicSite[key], enPublicSite[key], `fr ${key} translated`);
  }
  for (const key of ["storeCartDecrease", "storeCartIncrease"]) {
    assert.equal(typeof enStorefront[key], "string", `en Storefront.${key}`);
    assert.equal(typeof frStorefront[key], "string", `fr Storefront.${key}`);
    assert.notEqual(frStorefront[key], enStorefront[key], `fr ${key} translated`);
  }
});

test("cart mounts only on real tenant renders with one button", () => {
  const renderer = read("components/site/blocks/BlockRenderer.tsx");
  assert.ok(renderer.includes("siteSlug && tenantId"), "previews stay non-transactional");
  const drawer = read("components/site/v2/StoreCartDrawer.tsx");
  assert.ok(drawer.includes("claimButton"), "first widget owns the floating button");
  assert.ok(drawer.includes("labels.decrease"), "quantity buttons labelled");
  assert.ok(drawer.includes("labels.increase"), "quantity buttons labelled");
  const detail = read("app/site/[slug]/products/[productSlug]/page.tsx");
  assert.ok(detail.includes("cartCatalog"), "detail widget resolves the full catalog");
  assert.ok(detail.includes('.eq("status", "active")'), "widget catalog is purchasable-only");
});
