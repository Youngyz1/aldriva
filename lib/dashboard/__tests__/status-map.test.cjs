/**
 * lib/dashboard/__tests__/status-map.test.cjs
 *
 * Tests for status mappings across all platform domains.
 * Verifies:
 * - Every verified status value has a label key.
 * - Every label key exists in both English and French translation dictionaries.
 * - Unknown values fall back to humanised labels and neutral tone without throwing.
 * - All required domains are properly separated (order, order_payment, reservation,
 *   reservation_payment, booking, event, fundraiser, donation, payout).
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../..");

// TS bridge setup
const Module = require("node:module");
const ts = require("typescript");
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
  STATUS_MAP,
  resolveStatus,
  humanizeStatus,
  VERIFIED_ORDER_STATUSES,
  VERIFIED_ORDER_PAYMENT_STATUSES,
  VERIFIED_RESERVATION_STATUSES,
  VERIFIED_RESERVATION_PAYMENT_STATUSES,
  VERIFIED_ORDER_FULFILMENT_TYPES,
  VERIFIED_DINE_IN_CONFIRMATIONS,
  VERIFIED_BOOKING_TYPES,
  UNVERIFIED_EVENT_STATUSES,
  UNVERIFIED_FUNDRAISER_STATUSES,
  UNVERIFIED_DONATION_STATUSES,
  UNVERIFIED_PAYOUT_STATUSES,
  UNVERIFIED_TICKET_ORDER_STATUSES,
} = require("../status-map.ts");

const enMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
const frMessages = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/fr.json"), "utf8"));

function getTranslation(messages, key) {
  const parts = key.split(".");
  let cur = messages;
  for (const part of parts) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[part];
  }
  return cur;
}

test("status-map: required domains are separated and defined", () => {
  const requiredDomains = [
    "order",
    "order_payment",
    "reservation",
    "reservation_payment",
    "booking",
    "event",
    "fundraiser",
    "donation",
    "payout",
  ];

  for (const domain of requiredDomains) {
    assert.ok(STATUS_MAP[domain], `Domain ${domain} must exist in STATUS_MAP`);
    assert.ok(Object.keys(STATUS_MAP[domain]).length > 0, `Domain ${domain} must have status entries`);
  }

  // Booking is an alias of reservation
  assert.equal(STATUS_MAP.booking, STATUS_MAP.reservation);
});

test("status-map: every verified order status matches live constraints", () => {
  const expectedOrderStatuses = [
    "pending",
    "accepted",
    "preparing",
    "ready",
    "picked_up",
    "out_for_delivery",
    "delivered",
    "completed",
    "cancelled",
  ];
  assert.deepEqual(Object.keys(VERIFIED_ORDER_STATUSES).sort(), expectedOrderStatuses.sort());
});

test("status-map: every verified order payment status matches live constraints", () => {
  const expectedPaymentStatuses = ["unpaid", "paid", "refunded"];
  assert.deepEqual(Object.keys(VERIFIED_ORDER_PAYMENT_STATUSES).sort(), expectedPaymentStatuses.sort());
});

test("status-map: every verified reservation status matches live constraints", () => {
  const expectedReservationStatuses = [
    "pending",
    "confirmed",
    "declined",
    "seated",
    "completed",
    "no_show",
    "cancelled",
  ];
  assert.deepEqual(Object.keys(VERIFIED_RESERVATION_STATUSES).sort(), expectedReservationStatuses.sort());
});

test("status-map: every verified reservation payment status matches live constraints", () => {
  const expectedReservationPaymentStatuses = [
    "unpaid",
    "deposit_pending",
    "deposit_paid",
    "paid",
    "refunded",
    "waived",
  ];
  assert.deepEqual(Object.keys(VERIFIED_RESERVATION_PAYMENT_STATUSES).sort(), expectedReservationPaymentStatuses.sort());
});

test("status-map: every verified status value has a corresponding EN and FR label key", () => {
  for (const [domain, entries] of Object.entries(STATUS_MAP)) {
    for (const [statusValue, entry] of Object.entries(entries)) {
      assert.ok(entry.labelKey, `Domain ${domain} value ${statusValue} must have labelKey`);
      assert.ok(entry.tone, `Domain ${domain} value ${statusValue} must have tone`);

      const enVal = getTranslation(enMessages, entry.labelKey);
      assert.ok(enVal, `Missing English translation for ${entry.labelKey}`);

      const frVal = getTranslation(frMessages, entry.labelKey);
      assert.ok(frVal, `Missing French translation for ${entry.labelKey}`);
    }
  }
});

test("status-map: unknown values never throw and return humanised fallback + neutral tone", () => {
  assert.doesNotThrow(() => {
    const meta = resolveStatus("order", "unknown_special_status");
    assert.equal(meta.tone, "neutral");
    assert.equal(meta.label, "Unknown Special Status");
    assert.equal(meta.labelKey, "Status.order.unknown_special_status");
  });

  assert.doesNotThrow(() => {
    const meta = resolveStatus("reservation", "random_alien_state");
    assert.equal(meta.tone, "neutral");
    assert.equal(meta.label, "Random Alien State");
  });
});

test("status-map: humanizeStatus correctly formats strings", () => {
  assert.equal(humanizeStatus("out_for_delivery"), "Out For Delivery");
  assert.equal(humanizeStatus("deposit_pending"), "Deposit Pending");
  assert.equal(humanizeStatus("no_show"), "No Show");
  assert.equal(humanizeStatus("pending"), "Pending");
  assert.equal(humanizeStatus(""), "");
});
