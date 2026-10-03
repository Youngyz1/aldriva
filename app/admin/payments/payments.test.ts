/**
 * Pins for app/admin/payments (read-only ledger tables).
 * p2-style server/requireAdmin gate checks plus byte-identical rendering
 * pins (queries, money/date format, fallbacks) and unit tests for the
 * strings-file helpers. Run via the package.json test list (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatMoneyWithCurrency,
  paymentsFooter,
  paymentsStrings,
  statusChips,
} from "./payments-strings.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "page.tsx"), "utf8");

test("payments page stays server-rendered with requireAdmin", () => {
  assert.ok(!/^"use client"/m.test(src), "must be a server component");
  assert.ok(src.includes("await requireAdmin()"), "must call requireAdmin()");
});

test("payments queries are unchanged (latest 50, same columns)", () => {
  assert.ok(src.includes("events(title)"), "ticket_orders join kept");
  assert.ok(src.includes("fundraisers(title)"), "donations join kept");
  assert.equal(src.split(".limit(50)").length - 1, 2, "both queries limit 50");
  assert.ok(src.includes("total_amount, currency, status"), "orders select currency");
  assert.ok(src.includes("amount, currency, status"), "donations select currency");
});

test("money and date formatting stay byte-identical", () => {
  assert.ok(
    src.includes("money(o.total_amount, o.currency)"),
    "orders pass their stored currency"
  );
  assert.ok(
    src.includes("money(d.amount, d.currency)"),
    "donations pass their stored currency"
  );
  assert.ok(src.includes("month: 'short'"), "dateLabel format kept");
});

test("identity and status fallbacks stay byte-identical", () => {
  assert.ok(src.includes("|| 'Guest'"), "guest fallback kept");
  assert.ok(src.includes("|| 'Anonymous'"), "anonymous fallback kept");
  assert.ok(src.includes("?? '—'"), "missing target fallback kept");
  assert.ok(src.includes("?? 'succeeded'"), "null donation status reads succeeded");
});

test("payments tables carry no row actions", () => {
  assert.ok(!src.includes("RowMenu"), "no overflow menus on a read-only page");
  assert.ok(!src.includes("actions:"), "rows have no actions config");
});

test("paymentsFooter composes both slice counts", () => {
  assert.equal(
    paymentsFooter(50, 50),
    "1-50 of 50 ticket orders · 1-50 of 50 donations"
  );
  assert.equal(
    paymentsFooter(0, 3),
    "1-0 of 0 ticket orders · 1-3 of 3 donations"
  );
});

test("amounts format with their own currency code", () => {
  assert.equal(formatMoneyWithCurrency(1234.5, "USD"), "$1,234.50");
  assert.equal(formatMoneyWithCurrency(1234.5, "usd"), "$1,234.50");
  assert.equal(formatMoneyWithCurrency(1234.5, "EUR"), "€1,234.50");
});

test("null or unknown currency falls back to legacy $ rendering", () => {
  const legacy = "$1,234.50";
  assert.equal(formatMoneyWithCurrency(1234.5, null), legacy);
  assert.equal(formatMoneyWithCurrency(1234.5, "Q12"), legacy);
  assert.equal(formatMoneyWithCurrency(null, null), "$0.00");
});

test("statusChips counts by displayed status with null fallback", () => {
  assert.deepEqual(
    statusChips(
      [{ status: "valid" }, { status: "refunded" }, { status: "valid" }, { status: null }],
      paymentsStrings.ordersNoun,
      "pending"
    ),
    [
      { label: "valid ticket orders", value: 2 },
      { label: "refunded ticket orders", value: 1 },
      { label: "pending ticket orders", value: 1 },
    ]
  );
  assert.deepEqual(statusChips([], paymentsStrings.donationsNoun, "succeeded"), []);
});
