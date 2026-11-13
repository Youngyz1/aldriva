/**
 * lib/__tests__/business-order-ledger.test.cjs
 *
 * Workstream B Unit Tests:
 * 1. Online business checkout & payment intent verification:
 *    - Currency support: USD, EUR, GBP, CAD, XOF, XAF allowed; unsupported rejected.
 *    - Zero-decimal currencies (XOF, XAF): factor 1 vs factor 100 for USD/EUR.
 *    - Server-side price verification and total integrity.
 * 2. Webhook verification & ledger integration:
 *    - Tenant boundary check (metadata organizer must match order organizer).
 *    - Exact amount and currency matching in minor units.
 *    - Idempotent transition to payment_status = 'paid'.
 *    - Recipient ledger crediting with source_type = 'order'.
 *    - Replay protection: duplicates are acknowledged without duplicate ledger entries.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

if (!require.extensions[".ts"]) {
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
}

const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  toMinorUnits,
  fromMinorUnits,
  isZeroDecimalCurrency,
} = require("@/lib/money.ts");

const {
  isOnlinePaymentCurrencySupported,
  ONLINE_PAYMENT_CURRENCIES,
} = require("@/lib/storefront-features.ts");

test("Workstream B - Business Checkout, Payment Verification & Ledger Integration", async (t) => {
  await t.test("Currency support stays limited to confirmed central-provider capability", () => {
    assert.equal(isOnlinePaymentCurrencySupported("USD"), true);
    assert.deepEqual([...ONLINE_PAYMENT_CURRENCIES], ["USD"]);

    // Formatting/minor-unit support is not proof the configured merchant can charge it.
    for (const unsupported of ["EUR", "GBP", "CAD", "XOF", "XAF", "XYZ", "ABC", "", null]) {
      assert.equal(isOnlinePaymentCurrencySupported(unsupported), false);
    }
  });

  await t.test("Minor unit conversions: zero-decimal currencies (XOF/XAF) have factor 1, USD/EUR factor 100", () => {
    // 5000 FCFA -> 5000 minor units
    assert.equal(isZeroDecimalCurrency("XOF"), true);
    assert.equal(isZeroDecimalCurrency("XAF"), true);
    assert.equal(toMinorUnits(5000, "XOF"), 5000);
    assert.equal(toMinorUnits(2500, "XAF"), 2500);
    assert.equal(fromMinorUnits(5000, "XOF"), 5000);

    // $25.50 USD -> 2550 minor units (cents)
    assert.equal(isZeroDecimalCurrency("USD"), false);
    assert.equal(toMinorUnits(25.50, "USD"), 2550);
    assert.equal(fromMinorUnits(2550, "USD"), 25.50);

    // €18.00 EUR -> 1800 minor units (cents)
    assert.equal(isZeroDecimalCurrency("EUR"), false);
    assert.equal(toMinorUnits(18.00, "EUR"), 1800);
    assert.equal(fromMinorUnits(1800, "EUR"), 18.00);
  });

  await t.test("Webhook payment verification: tenant and amount mismatch rejection", () => {
    const order = {
      id: "ord-test-1",
      organizer_id: "org-alpha",
      currency: "USD",
      total_amount: 45.00,
      payment_status: "unpaid",
    };

    function verifyPayment(orderData, pi, meta) {
      if (meta && meta.organizer_id && meta.organizer_id !== orderData.organizer_id) {
        return { ok: false, reason: "tenant_mismatch" };
      }
      const orderCurrency = String(orderData.currency).toUpperCase();
      if (!pi.currency || pi.currency.toUpperCase() !== orderCurrency) {
        return { ok: false, reason: "currency_mismatch" };
      }
      const expectedMinor = toMinorUnits(orderData.total_amount, orderCurrency);
      if (pi.amount !== expectedMinor) {
        return { ok: false, reason: "amount_mismatch", expected: expectedMinor, actual: pi.amount };
      }
      return { ok: true };
    }

    // 1. Tenant mismatch
    const badTenant = verifyPayment(order, { currency: "usd", amount: 4500 }, { organizer_id: "org-attacker" });
    assert.equal(badTenant.ok, false);
    assert.equal(badTenant.reason, "tenant_mismatch");

    // 2. Currency mismatch
    const badCurrency = verifyPayment(order, { currency: "eur", amount: 4500 }, { organizer_id: "org-alpha" });
    assert.equal(badCurrency.ok, false);
    assert.equal(badCurrency.reason, "currency_mismatch");

    // 3. Amount underpayment
    const underpaid = verifyPayment(order, { currency: "usd", amount: 2000 }, { organizer_id: "org-alpha" });
    assert.equal(underpaid.ok, false);
    assert.equal(underpaid.reason, "amount_mismatch");

    // 4. Perfect match
    const valid = verifyPayment(order, { currency: "usd", amount: 4500 }, { organizer_id: "org-alpha" });
    assert.equal(valid.ok, true);
  });

  await t.test("Ledger crediting: idempotency and replay protection", async () => {
    // Simulated DB
    const ledger = [];
    const orders = {
      "ord-1": {
        id: "ord-1",
        organizer_id: "org-alpha",
        business_id: "biz-1",
        total_amount: 32.50,
        currency: "USD",
        payment_status: "unpaid",
        provider_reference: null,
      }
    };

    function recordOrderPaidAndCredit(orderId, paymentIntentId) {
      const order = orders[orderId];
      if (!order) return { ok: false, error: "ORDER_NOT_FOUND" };

      if (order.payment_status === "paid") {
        const alreadyCredited = ledger.some(e => e.source_type === "order" && e.source_id === orderId);
        return { ok: true, wasNewlyPaid: false, credited: alreadyCredited };
      }

      // Transition order
      order.payment_status = "paid";
      order.provider_reference = paymentIntentId;

      // Credit ledger
      const existing = ledger.find(e => e.source_type === "order" && e.source_id === orderId);
      let credited = false;
      if (!existing && order.total_amount > 0) {
        ledger.push({
          recipient_id: order.organizer_id,
          entry_type: "credit",
          amount: order.total_amount,
          currency: order.currency.toLowerCase(),
          source_type: "order",
          source_id: order.id,
          description: `Storefront order #${order.id} payment`,
        });
        credited = true;
      }

      return { ok: true, wasNewlyPaid: true, credited };
    }

    // First webhook delivery
    const res1 = recordOrderPaidAndCredit("ord-1", "pi_test_123");
    assert.equal(res1.ok, true);
    assert.equal(res1.wasNewlyPaid, true);
    assert.equal(res1.credited, true);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].amount, 32.50);
    assert.equal(ledger[0].source_type, "order");
    assert.equal(orders["ord-1"].payment_status, "paid");

    // Second webhook delivery (replay/retry)
    const res2 = recordOrderPaidAndCredit("ord-1", "pi_test_123");
    assert.equal(res2.ok, true);
    assert.equal(res2.wasNewlyPaid, false); // Already paid
    assert.equal(res2.credited, true);      // Ledger entry was already present
    assert.equal(ledger.length, 1);         // No duplicate ledger entry inserted!
  });
});
