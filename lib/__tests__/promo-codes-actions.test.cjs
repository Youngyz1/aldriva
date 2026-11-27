"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  if (request === "server-only") {
    return path.join(ROOT, "scripts/server-only.stub.cjs");
  }
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

const promoActions = require("../actions/promo-codes.ts");
const promoLib = require("../promo-codes.ts");
const promoRoles = require("../promo-codes-roles.ts");

test("lib/actions/promo-codes module structure and constants", () => {
  assert.ok(promoActions, "Module must load");

  assert.strictEqual(typeof promoActions.listStorePromoCodes, "function");
  assert.strictEqual(typeof promoActions.createStorePromoCode, "function");
  assert.strictEqual(typeof promoActions.updateStorePromoCode, "function");
  assert.strictEqual(typeof promoActions.toggleStorePromoCodeActive, "function");
  assert.strictEqual(typeof promoActions.deleteStorePromoCode, "function");

  assert.ok(Array.isArray(promoRoles.PROMO_READ_ROLES), "PROMO_READ_ROLES must be an array");
  assert.ok(Array.isArray(promoRoles.PROMO_MANAGE_ROLES), "PROMO_MANAGE_ROLES must be an array");

  // Read roles: owner, admin, manager, editor, finance
  assert.ok(promoRoles.PROMO_READ_ROLES.includes("owner"));
  assert.ok(promoRoles.PROMO_READ_ROLES.includes("admin"));
  assert.ok(promoRoles.PROMO_READ_ROLES.includes("manager"));
  assert.ok(promoRoles.PROMO_READ_ROLES.includes("editor"));
  assert.ok(promoRoles.PROMO_READ_ROLES.includes("finance"));
  assert.ok(!promoRoles.PROMO_READ_ROLES.includes("viewer"));

  // Manage roles: owner, admin, manager only (editors and finance cannot create/delete)
  assert.ok(promoRoles.PROMO_MANAGE_ROLES.includes("owner"));
  assert.ok(promoRoles.PROMO_MANAGE_ROLES.includes("admin"));
  assert.ok(promoRoles.PROMO_MANAGE_ROLES.includes("manager"));
  assert.ok(!promoRoles.PROMO_MANAGE_ROLES.includes("editor"));
  assert.ok(!promoRoles.PROMO_MANAGE_ROLES.includes("finance"));
  assert.ok(!promoRoles.PROMO_MANAGE_ROLES.includes("viewer"));
});

test("promo code validation rules match schema constraints", () => {
  const {
    normalizePromoCode,
    PROMO_CODE_MIN_LENGTH,
    PROMO_CODE_MAX_LENGTH,
    PROMO_PERCENT_MIN,
    PROMO_PERCENT_MAX,
    validatePromoRow,
  } = promoLib;

  assert.strictEqual(PROMO_CODE_MIN_LENGTH, 3);
  assert.strictEqual(PROMO_CODE_MAX_LENGTH, 40);
  assert.strictEqual(PROMO_PERCENT_MIN, 1);
  assert.strictEqual(PROMO_PERCENT_MAX, 90);

  // Normalization
  assert.strictEqual(normalizePromoCode("  save10  "), "SAVE10");
  assert.strictEqual(normalizePromoCode("vip-2026"), "VIP-2026");
  assert.strictEqual(normalizePromoCode(null), "");

  // Row validation: active percent code
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const validRow = {
    id: "22222222-2222-2222-2222-222222222222",
    tenant_id: tenantId,
    code: "SAVE20",
    percent_off: 20,
    fixed_off_minor: null,
    fixed_currency: null,
    min_subtotal_minor: 0,
    max_uses: 100,
    used_count: 5,
    starts_at: null,
    expires_at: null,
    is_active: true,
  };

  const res1 = validatePromoRow(validRow, tenantId);
  assert.strictEqual(res1.ok, true);
  if (res1.ok) {
    assert.strictEqual(res1.promo.code, "SAVE20");
    assert.strictEqual(res1.promo.percentOff, 20);
  }

  // Cross-tenant protection
  const resCross = validatePromoRow(validRow, "33333333-3333-3333-3333-333333333333");
  assert.strictEqual(resCross.ok, false);
  assert.match(resCross.error, /not valid for this store/i);

  // Inactive code
  const inactiveRow = { ...validRow, is_active: false };
  const resInactive = validatePromoRow(inactiveRow, tenantId);
  assert.strictEqual(resInactive.ok, false);
  assert.match(resInactive.error, /no longer active/i);

  // Exhausted usage cap
  const maxedRow = { ...validRow, max_uses: 10, used_count: 10 };
  const resMaxed = validatePromoRow(maxedRow, tenantId);
  assert.strictEqual(resMaxed.ok, false);
  assert.match(resMaxed.error, /usage limit/i);

  // Expired code
  const expiredRow = { ...validRow, expires_at: new Date(Date.now() - 60000).toISOString() };
  const resExpired = validatePromoRow(expiredRow, tenantId);
  assert.strictEqual(resExpired.ok, false);
  assert.match(resExpired.error, /expired/i);
});

test("promo code component file exists and exports PromoCodesManager", () => {
  const componentPath = path.resolve(ROOT, "components/dashboard/store/PromoCodesManager.tsx");
  assert.ok(fs.existsSync(componentPath), "PromoCodesManager.tsx component file must exist");

  const content = fs.readFileSync(componentPath, "utf8");
  assert.ok(content.includes("export function PromoCodesManager"), "Must export PromoCodesManager");
  assert.ok(content.includes("createStorePromoCode"), "Must import createStorePromoCode");
  assert.ok(content.includes("toggleStorePromoCodeActive"), "Must import toggleStorePromoCodeActive");
  assert.ok(content.includes("deleteStorePromoCode"), "Must import deleteStorePromoCode");
});
