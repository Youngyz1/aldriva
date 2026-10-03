/**
 * Pins for app/admin/finance/payouts (money-moving queue).
 * p2-style server/requireAdmin gate checks plus byte-identical modal-flow
 * pins (required fields, tr_ prefill, call shapes, refresh-after-mutation)
 * and preservation pins for tabs, search, and the Terminal marker.
 * Run via the package.json test list (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatCurrencyTotal,
  groupVolumeByCurrency,
  payoutsStrings,
} from "./payouts-strings.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = fs.readFileSync(path.join(here, "page.tsx"), "utf8");
const src = fs.readFileSync(path.join(here, "PayoutsAdminClient.tsx"), "utf8");

test("payouts wrapper stays server-rendered with requireAdmin", () => {
  assert.ok(!/^"use client"/m.test(wrapper), "must be a server component");
  assert.ok(wrapper.includes("await requireAdmin()"), "must call requireAdmin()");
  assert.ok(
    wrapper.includes('getAdminPayoutQueue("all")'),
    "initial queue load unchanged"
  );
});

test("Complete modal keeps required external ID and tr_ prefill", () => {
  assert.ok(src.includes("External Payout / Transfer ID *"), "ID field kept");
  assert.ok(
    src.includes("tr_${crypto.randomUUID().slice(0, 8)}"),
    "tr_ prefill kept"
  );
  assert.ok(
    src.includes("if (!externalPayoutIdInput.trim())"),
    "empty ID rejected"
  );
  assert.ok(
    src.includes("completePayout(completingItem.id, externalPayoutIdInput.trim())"),
    "completePayout call shape kept"
  );
  assert.ok(src.includes("Confirm Completion"), "confirm copy kept");
});

test("Fail modal keeps required reason and reverse-credit warning", () => {
  assert.ok(src.includes("Failure Reason *"), "reason field kept");
  assert.ok(
    src.includes("if (!failureReasonInput.trim())"),
    "empty reason rejected"
  );
  assert.ok(
    src.includes("failPayout(failingItem.id, failureReasonInput.trim())"),
    "failPayout call shape kept"
  );
  assert.ok(
    src.includes("will automatically execute a single database credit adjustment"),
    "reverse-credit warning kept"
  );
  assert.ok(src.includes("Confirm Failure & Reverse"), "confirm copy kept");
});

test("every mutation refetches and refreshes", () => {
  assert.equal(
    src.split("router.refresh()").length - 1,
    3,
    "process + complete + fail all refresh"
  );
  assert.ok(
    src.includes("transitionPayoutProcessing(payoutId)"),
    "processing transition call kept"
  );
});

test("status tabs and 4-field search are preserved", () => {
  assert.deepEqual(
    payoutsStrings.tabs.map((t) => t.value),
    ["all", "requested", "processing", "completed", "failed", "cancelled"]
  );
  for (const field of [
    "item.id.toLowerCase().includes(q)",
    "item.recipientName.toLowerCase().includes(q)",
    "item.destinationReference && item.destinationReference.toLowerCase().includes(q)",
    "item.externalPayoutId && item.externalPayoutId.toLowerCase().includes(q)",
  ]) {
    assert.ok(src.includes(field), `search still covers ${field.split(".")[1]}`);
  }
});

test("Terminal marker moved into status cell and expansion", () => {
  assert.ok(src.includes("s.terminal"), "terminal copy referenced");
  assert.ok(
    src.includes("{ label: s.stateLabel, value: s.terminal }"),
    "terminal state in expansion"
  );
});

test("working label keeps three ASCII dots", () => {
  assert.equal(payoutsStrings.updating, "Updating...");
});

test("volume groups per currency, never summed together", () => {
  assert.deepEqual(
    groupVolumeByCurrency([
      { amount: 100, currency: "usd" },
      { amount: 50, currency: "USD" },
      { amount: 20, currency: "eur" },
    ]),
    [
      { currency: "USD", total: 150 },
      { currency: "EUR", total: 20 },
    ]
  );
  assert.deepEqual(groupVolumeByCurrency([]), []);
});

test("currency totals format with their own code", () => {
  assert.equal(formatCurrencyTotal(1234.5, "USD"), "$1,234.50");
  assert.equal(formatCurrencyTotal(1234.5, "EUR"), "€1,234.50");
  assert.equal(formatCurrencyTotal(10, ""), "$10.00");
  assert.equal(formatCurrencyTotal(10, "Q12"), "Q12 10.00");
});
