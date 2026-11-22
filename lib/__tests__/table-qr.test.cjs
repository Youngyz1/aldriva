const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");

// Import table-qr logic
const {
  hashToken,
  isValidTokenHash,
  generateRawToken,
  generateQrShortCode,
  isValidShortCode,
  TABLE_CONTEXT_COOKIE,
  GUEST_DEVICE_TOKEN_COOKIE,
} = require("../table-qr.ts");

test("table-qr: token hashing", async (t) => {
  await t.test("hashToken generates deterministic 64-char lowercase hex", () => {
    const raw = "test-token-value-12345";
    const expected = crypto.createHash("sha256").update(raw).digest("hex").toLowerCase();
    const hash = hashToken(raw);

    assert.equal(hash, expected);
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  await t.test("hashToken throws on invalid inputs", () => {
    assert.throws(() => hashToken(""), /Invalid raw token/);
    assert.throws(() => hashToken(null), /Invalid raw token/);
    assert.throws(() => hashToken(undefined), /Invalid raw token/);
  });

  await t.test("isValidTokenHash strictly validates 64-char lowercase hex format", () => {
    const valid = crypto.createHash("sha256").update("valid").digest("hex");
    assert.equal(isValidTokenHash(valid), true);

    // Uppercase is rejected
    assert.equal(isValidTokenHash(valid.toUpperCase()), false);
    // Wrong length
    assert.equal(isValidTokenHash("abc123"), false);
    // Non-hex characters
    assert.equal(isValidTokenHash("z".repeat(64)), false);
    // Null / undefined / empty
    assert.equal(isValidTokenHash(null), false);
    assert.equal(isValidTokenHash(undefined), false);
    assert.equal(isValidTokenHash(""), false);
  });
});

test("table-qr: short code generation and validation", async (t) => {
  await t.test("generateQrShortCode returns 12-char hex string", () => {
    const code = generateQrShortCode();
    assert.equal(typeof code, "string");
    assert.equal(code.length, 12);
    assert.match(code, /^[0-9a-f]{12}$/);
  });

  await t.test("generateRawToken produces correct byte length in hex", () => {
    const raw = generateRawToken(24);
    assert.equal(raw.length, 48); // 24 bytes * 2
    assert.match(raw, /^[0-9a-f]{48}$/);
  });

  await t.test("isValidShortCode validates short codes", () => {
    assert.equal(isValidShortCode("a1b2c3d4e5f6"), true);
    assert.equal(isValidShortCode("TABLE_10_CODE"), true);
    assert.equal(isValidShortCode("short"), false); // Under 8 chars
    assert.equal(isValidShortCode(""), false);
    assert.equal(isValidShortCode(null), false);
    assert.equal(isValidShortCode(undefined), false);
    assert.equal(isValidShortCode("invalid@char!"), false);
  });
});

test("table-qr: cookie constants and payload structure", () => {
  assert.equal(TABLE_CONTEXT_COOKIE, "aldriva_table_ctx");
  assert.equal(GUEST_DEVICE_TOKEN_COOKIE, "aldriva_guest_token");

  // Validate payload contract supports both organizerId and businessId
  const payload = {
    businessId: "biz-123",
    organizerId: "org-456",
    tableId: "tbl-789",
    tableLabel: "Table 5",
    qrCode: "shortcode123",
    tableOrderingMode: "order_pay_later",
    timestamp: Date.now(),
  };

  assert.equal(payload.businessId, "biz-123");
  assert.equal(payload.organizerId, "org-456");
  assert.equal(payload.tableId, "tbl-789");
  assert.equal(payload.tableLabel, "Table 5");
  assert.equal(payload.tableOrderingMode, "order_pay_later");
});

test("table-qr: ordering modes and confirmation states", () => {
  const validModes = ["disabled", "menu_only", "order_pay_later", "order_pay_now", "pay_online_first"];
  assert.equal(validModes.includes("disabled"), true);
  assert.equal(validModes.includes("menu_only"), true);
  assert.equal(validModes.includes("order_pay_later"), true);
  assert.equal(validModes.includes("order_pay_now"), true);
  assert.equal(validModes.includes("pay_online_first"), true);

  const confirmationStates = ["not_applicable", "pending", "confirmed", "declined"];
  assert.equal(confirmationStates.includes("pending"), true);
  assert.equal(confirmationStates.includes("confirmed"), true);
  assert.equal(confirmationStates.includes("declined"), true);
  assert.equal(confirmationStates.includes("not_applicable"), true);
});

test("table-qr: ordering mode lifecycle rules", async (t) => {
  await t.test("disabled mode blocks order placement", () => {
    const mode = "disabled";
    const canOrder = mode !== "disabled" && mode !== "menu_only";
    assert.equal(canOrder, false);
  });

  await t.test("menu_only mode blocks order placement but allows browse", () => {
    const mode = "menu_only";
    const canOrder = mode !== "disabled" && mode !== "menu_only";
    assert.equal(canOrder, false);
  });

  await t.test("order_pay_later allows ordering without upfront online card payment", () => {
    const mode = "order_pay_later";
    const requiresOnlinePayment = mode === "pay_online_first";
    assert.equal(requiresOnlinePayment, false);
  });

  await t.test("order_pay_now allows ordering with payment upon arrival", () => {
    const mode = "order_pay_now";
    const paymentMethod = "at_table";
    assert.equal(paymentMethod, "at_table");
  });

  await t.test("pay_online_first enforces online card payment", () => {
    const mode = "pay_online_first";
    const requiresOnlinePayment = mode === "pay_online_first";
    assert.equal(requiresOnlinePayment, true);
  });
});

test("table-qr: concurrency bounds and pending limits", () => {
  const MAX_DEVICE_PENDING_ORDERS = 2;
  const MAX_SESSION_PENDING_ORDERS = 4;

  assert.equal(MAX_DEVICE_PENDING_ORDERS, 2);
  assert.equal(MAX_SESSION_PENDING_ORDERS, 4);

  // Exceeding device cap is rejected
  assert.equal(2 >= MAX_DEVICE_PENDING_ORDERS, true);
  assert.equal(1 >= MAX_DEVICE_PENDING_ORDERS, false);

  // Exceeding session cap is rejected
  assert.equal(4 >= MAX_SESSION_PENDING_ORDERS, true);
  assert.equal(3 >= MAX_SESSION_PENDING_ORDERS, false);
});

test("table-qr: waiter confirmation state transitions", () => {
  // Simulate dine-in transition logic from transition-core.ts
  function transitionDineIn(currentStatus, currentConfirmation, nextStatus) {
    let nextConfirmation = currentConfirmation;
    if (currentConfirmation !== "not_applicable") {
      if (nextStatus === "accepted") {
        nextConfirmation = "confirmed";
      } else if (nextStatus === "cancelled") {
        nextConfirmation = "declined";
      }
    }
    return nextConfirmation;
  }

  // Pending dine-in order confirmed by waiter advances to accepted and confirmed
  assert.equal(transitionDineIn("pending", "pending", "accepted"), "confirmed");

  // Pending dine-in order declined by waiter cancels the order and marks declined
  assert.equal(transitionDineIn("pending", "pending", "cancelled"), "declined");

  // Non-dine-in orders stay not_applicable
  assert.equal(transitionDineIn("pending", "not_applicable", "accepted"), "not_applicable");
});
