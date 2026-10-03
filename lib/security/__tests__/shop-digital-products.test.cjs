/**
 * Regression tests for the Shop digital-products implementation
 * (migration_116 + Phase 1/2 routes).
 *
 * Covers the pure authorization/validation core (lib/digital-products.ts)
 * plus static source assertions locking in the security properties:
 * private bucket, server-side paid-order checks, hardened order lookup,
 * single-license digital checkout, and exactly-once purchase fan-out.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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

const dp = require("@/lib/digital-products");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ── Product-type model ────────────────────────────────────────────────────

test("digital types are generic (not pdf-only); 'other' preserves physical", () => {
  for (const t of [
    "ebook", "guide", "workbook", "template", "spreadsheet",
    "presentation", "resource_pack", "course", "audio", "video", "bundle",
  ]) {
    assert.equal(dp.isDigitalProductType(t), true, `${t} must be digital`);
    assert.equal(dp.isValidProductType(t), true);
  }
  assert.equal(dp.isDigitalProductType("other"), false);
  assert.equal(dp.isDigitalProductType(null), false);
  assert.equal(dp.isDigitalProductType("pdf"), false);
  assert.equal(dp.isValidProductType("pdf"), false);
  assert.equal(dp.isValidLicense("personal"), true);
  assert.equal(dp.isValidLicense("lifetime-deal"), false);
});

// ── Upload request validation ─────────────────────────────────────────────

test("validateAssetRequest allowlists extensions and caps size", () => {
  assert.equal(dp.validateAssetRequest("guide.pdf", 1024).valid, true);
  assert.equal(dp.validateAssetRequest("kit.ZIP", 1024).valid, true);
  assert.equal(dp.validateAssetRequest("sheet.xlsx", 1024).valid, true);
  const bad = dp.validateAssetRequest("run.exe", 1024);
  assert.equal(bad.valid, false);
  const big = dp.validateAssetRequest("film.mp4", dp.DIGITAL_ASSET_MAX_BYTES + 1);
  assert.equal(big.valid, false);
  assert.equal(dp.validateAssetRequest("", 100).valid, false);
  assert.equal(dp.validateAssetRequest("a.pdf", 0).valid, false);
});

test("validateAssetRequest rejects path traversal", () => {
  assert.equal(dp.validateAssetRequest("../secret.pdf", 100).valid, false);
  assert.equal(dp.validateAssetRequest("a/b.pdf", 100).valid, false);
  assert.equal(dp.validateAssetRequest("a\\b.pdf", 100).valid, false);
  assert.equal(dp.buildAssetPath("not-a-uuid", "also-bad", "a.pdf"), null);
});

// ── Magic-byte preflight ──────────────────────────────────────────────────

test("sniffAssetBytes accepts real envelopes, rejects spoofs", () => {
  const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  assert.equal(dp.sniffAssetBytes(pdf, ".pdf").valid, true);
  const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  assert.equal(dp.sniffAssetBytes(zip, ".docx").valid, true);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(dp.sniffAssetBytes(png, ".png").valid, true);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(dp.sniffAssetBytes(jpg, ".jpg").valid, true);
  // Random bytes wearing a .pdf extension must fail.
  const junk = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x11, 0x22, 0x33, 0x44]);
  assert.equal(dp.sniffAssetBytes(junk, ".pdf").valid, false);
  assert.equal(dp.sniffAssetBytes(new Uint8Array(0), ".pdf").valid, false);
});

// ── Storage path builder ──────────────────────────────────────────────────

test("buildAssetPath scopes paths to the product directory", () => {
  const pid = "11111111-1111-4111-8111-111111111111";
  const aid = "22222222-2222-4222-8222-222222222222";
  const p = dp.buildAssetPath(pid, aid, "My Guide.PDF");
  assert.ok(p && p.startsWith(`${pid}/${aid}/`), "path must be product/asset scoped");
  assert.ok(!p.includes(" "), "path must be sanitized");
  assert.equal(dp.buildAssetPath(pid, aid, "evil.exe"), null);
});

// ── Download authorization matrix ─────────────────────────────────────────

test("decideDownloadAccess: paid account buyer is allowed", () => {
  assert.equal(
    dp.decideDownloadAccess({
      orderFound: true,
      orderStatus: "paid",
      requesterUserId: "u1",
      orderBuyerId: "u1",
      guestEmail: null,
      orderBuyerEmail: "buyer@x.com",
    }),
    "allow"
  );
});

for (const status of ["pending", "cancelled", "refunded", "expired", null]) {
  test(`decideDownloadAccess: status '${status}' is denied even for the buyer`, () => {
    assert.equal(
      dp.decideDownloadAccess({
        orderFound: true,
        orderStatus: status,
        requesterUserId: "u1",
        orderBuyerId: "u1",
        guestEmail: null,
        orderBuyerEmail: "buyer@x.com",
      }),
      "deny"
    );
  });
}

test("decideDownloadAccess: unknown order is denied", () => {
  assert.equal(
    dp.decideDownloadAccess({
      orderFound: false,
      orderStatus: null,
      requesterUserId: "u1",
      orderBuyerId: "u1",
      guestEmail: null,
      orderBuyerEmail: null,
    }),
    "deny"
  );
});

test("decideDownloadAccess: another buyer is denied", () => {
  assert.equal(
    dp.decideDownloadAccess({
      orderFound: true,
      orderStatus: "paid",
      requesterUserId: "intruder",
      orderBuyerId: "u1",
      guestEmail: null,
      orderBuyerEmail: "buyer@x.com",
    }),
    "deny"
  );
});

test("decideDownloadAccess: guest email match (case-insensitive) is allowed", () => {
  assert.equal(
    dp.decideDownloadAccess({
      orderFound: true,
      orderStatus: "paid",
      requesterUserId: null,
      orderBuyerId: null,
      guestEmail: "Buyer@X.com ",
      orderBuyerEmail: "buyer@x.com",
    }),
    "allow"
  );
});

test("decideDownloadAccess: guest email mismatch or empty fails closed", () => {
  const base = {
    orderFound: true,
    orderStatus: "paid",
    requesterUserId: null,
    orderBuyerId: null,
  };
  assert.equal(
    dp.decideDownloadAccess({ ...base, guestEmail: "other@x.com", orderBuyerEmail: "buyer@x.com" }),
    "deny"
  );
  assert.equal(
    dp.decideDownloadAccess({ ...base, guestEmail: "", orderBuyerEmail: "" }),
    "deny"
  );
  // Account order: guest email proof alone must NOT suffice.
  assert.equal(
    dp.decideDownloadAccess({
      ...base,
      orderBuyerId: "u1",
      guestEmail: "buyer@x.com",
      orderBuyerEmail: "buyer@x.com",
    }),
    "deny"
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────

test("normalizeTags lowercases, dasherizes, and caps", () => {
  assert.deepEqual(dp.normalizeTags("Restaurant, Startup Kit,  "), ["restaurant", "startup-kit"]);
  assert.deepEqual(dp.normalizeTags(null), []);
  const many = Array.from({ length: 30 }, (_, i) => `t${i}`);
  assert.equal(dp.normalizeTags(many).length, dp.MAX_TAGS);
});

test("formatFileSize renders human sizes", () => {
  assert.equal(dp.formatFileSize(500), "500 B");
  assert.equal(dp.formatFileSize(2048), "2.0 KB");
  assert.equal(dp.formatFileSize(null), "—");
});

// ── Static security properties ────────────────────────────────────────────

test("migration 116 + rollback exist; bucket is private", () => {
  const fwd = path.join(ROOT, "db", "migration_116_shop_digital_products.sql");
  const rb = path.join(ROOT, "db", "migration_116_shop_digital_products_rollback.sql");
  const mirror = path.join(
    ROOT,
    "supabase",
    "migrations",
    "20260913000000_migration_116_shop_digital_products.sql"
  );
  assert.ok(fs.existsSync(fwd), "forward migration must exist");
  assert.ok(fs.existsSync(rb), "rollback must exist");
  assert.ok(fs.existsSync(mirror), "supabase mirror must exist");
  const sql = read("db/migration_116_shop_digital_products.sql");
  assert.ok(sql.includes("'product-assets'"), "bucket declared");
  assert.ok(
    /VALUES \(\s*'product-assets',\s*'product-assets',\s*false/s.test(sql),
    "product-assets bucket must be private (public=false)"
  );
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
  assert.ok(
    sql.includes("No INSERT/UPDATE/DELETE policies"),
    "asset writes must be service-role only"
  );
  assert.ok(sql.includes("product_assets"), "assets table");
  assert.ok(sql.includes("product_downloads"), "download log");
  assert.ok(sql.includes("product_purchase"), "notification types extended");
});

test("paid assets never use public URLs", () => {
  for (const f of [
    "app/api/products/[id]/download/route.ts",
    "app/api/products/[id]/upload-url/route.ts",
    "app/api/products/[id]/assets/confirm/route.ts",
    "app/api/products/[id]/assets/route.ts",
    "lib/product-notifications.ts",
  ]) {
    const src = read(f);
    assert.ok(!src.includes("getPublicUrl"), `${f} must never mint public URLs`);
  }
  const download = read("app/api/products/[id]/download/route.ts");
  assert.ok(download.includes("createSignedUrl"), "delivery via signed URLs");
  assert.ok(download.includes('"paid"'), "paid-order gate present");
  assert.ok(download.includes("cancelled") && download.includes("refunded"), "refund/cancel deny documented");
});

test("order-lookup requires buyer proof and stays generic", () => {
  const src = read("app/api/products/order-lookup/route.ts");
  assert.ok(src.includes("session_id"), "stripe session proof supported");
  assert.ok(src.includes("isEmailEntitled"), "guest email proof supported");
  assert.ok(src.includes("guestLookup"), "rate limited");
  assert.ok(!src.includes("asset") || src.includes("assetCount"), "no asset paths leaked");
  assert.ok(!src.includes("file_path"), "storage paths never returned");
});

test("digital checkout is single-license on both rails", () => {
  for (const f of ["app/api/checkout/product/route.ts", "app/api/checkout/product-crypto/route.ts"]) {
    const src = read(f);
    assert.ok(src.includes("isDigitalProductType"), `${f} must clamp digital quantity`);
    assert.ok(
      src.includes('product.status !== "active"') && src.includes('"out_of_stock"'),
      `${f} must keep the approval allowlist`
    );
  }
});

test("purchase fan-out is exactly-once on both webhooks", () => {
  const stripe = read("app/api/webhooks/stripe/route.ts");
  assert.ok(stripe.includes("was_newly_paid"), "stripe gates fan-out on newly-paid");
  assert.ok(stripe.includes("notifyProductPurchase"), "stripe notifies product purchases");
  const crypto = read("app/api/crypto/webhook/route.ts");
  assert.ok(crypto.includes("was_newly_paid"), "crypto gates fan-out on newly-paid");
  assert.ok(crypto.includes("notifyProductPurchase"), "crypto notifies product purchases");
});

test("no new /shop route; /products stays canonical", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "app", "shop")), "must not create /shop");
  assert.ok(fs.existsSync(path.join(ROOT, "app", "products", "library", "page.tsx")), "library exists");
});
