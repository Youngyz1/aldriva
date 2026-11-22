/**
 * lib/__tests__/table-bill.test.cjs
 *
 * Unit tests for Phase 4 Running Table Bill calculation and session transitions.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const {
  calculateTableRunningBill,
  canRequestBill,
  canMarkTablePaidAndClose,
} = require(path.join(ROOT, "lib/table-bill.ts"));

test("table-bill: calculation with single unpaid order", () => {
  const session = {
    id: "sess-1",
    table_id: "tbl-1",
    business_id: "biz-1",
    status: "active",
    opened_at: "2026-10-28T12:00:00Z",
  };
  const table = { id: "tbl-1", label: "Table 5" };
  const orders = [
    {
      id: "ord-1",
      order_number: "ORD-101",
      created_at: "2026-10-28T12:05:00Z",
      status: "pending",
      payment_status: "unpaid",
      payment_method: "at_table",
      dine_in_confirmation: "confirmed",
      total_amount: 25.5,
      currency: "USD",
      items: [
        { name: "Burger", quantity: 2, unit_price: 10.0, line_total: 20.0 },
        { name: "Fries", quantity: 1, unit_price: 5.5, line_total: 5.5 },
      ],
    },
  ];

  const bill = calculateTableRunningBill(session, table, orders);

  assert.equal(bill.sessionId, "sess-1");
  assert.equal(bill.tableLabel, "Table 5");
  assert.equal(bill.sessionStatus, "active");
  assert.equal(bill.totalAmount, 25.5);
  assert.equal(bill.paidAmount, 0);
  assert.equal(bill.unpaidAmount, 25.5);
  assert.equal(bill.orderCount, 1);
  assert.equal(bill.items.length, 2);
  assert.equal(bill.items[0].name, "Burger");
  assert.equal(bill.items[0].quantity, 2);
  assert.equal(bill.items[1].name, "Fries");
  assert.equal(bill.items[1].lineTotal, 5.5);
});

test("table-bill: multiple orders in one session are aggregated correctly", () => {
  const session = {
    id: "sess-1",
    table_id: "tbl-1",
    business_id: "biz-1",
    status: "active",
    opened_at: "2026-10-28T12:00:00Z",
  };
  const table = { id: "tbl-1", label: "Table 2" };
  const orders = [
    {
      id: "ord-1",
      order_number: "ORD-101",
      created_at: "2026-10-28T12:05:00Z",
      status: "accepted",
      payment_status: "unpaid",
      payment_method: "at_table",
      dine_in_confirmation: "confirmed",
      total_amount: 30.0,
      currency: "EUR",
      items: [{ name: "Pizza Margherita", quantity: 2, unit_price: 15.0, line_total: 30.0 }],
    },
    {
      id: "ord-2",
      order_number: "ORD-102",
      created_at: "2026-10-28T12:35:00Z",
      status: "preparing",
      payment_status: "unpaid",
      payment_method: "at_table",
      dine_in_confirmation: "confirmed",
      total_amount: 14.5,
      currency: "EUR",
      items: [
        { name: "Tiramisu", quantity: 1, unit_price: 8.0, line_total: 8.0 },
        { name: "Espresso", quantity: 2, unit_price: 3.25, line_total: 6.5 },
      ],
    },
  ];

  const bill = calculateTableRunningBill(session, table, orders);

  assert.equal(bill.totalAmount, 44.5);
  assert.equal(bill.paidAmount, 0);
  assert.equal(bill.unpaidAmount, 44.5);
  assert.equal(bill.orderCount, 2);
  assert.equal(bill.items.length, 3);
  assert.equal(bill.currency, "EUR");
});

test("table-bill: online paid order plus at-table unpaid order", () => {
  const session = {
    id: "sess-2",
    table_id: "tbl-2",
    business_id: "biz-1",
    status: "active",
    opened_at: "2026-10-28T13:00:00Z",
  };
  const table = { id: "tbl-2", label: "Table 8" };
  const orders = [
    {
      id: "ord-p1",
      order_number: "ORD-201",
      created_at: "2026-10-28T13:05:00Z",
      status: "ready",
      payment_status: "paid",
      payment_method: "online",
      dine_in_confirmation: "confirmed",
      total_amount: 50.0,
      currency: "USD",
      items: [{ name: "Steak", quantity: 1, unit_price: 50.0, line_total: 50.0 }],
    },
    {
      id: "ord-p2",
      order_number: "ORD-202",
      created_at: "2026-10-28T13:40:00Z",
      status: "accepted",
      payment_status: "unpaid",
      payment_method: "at_table",
      dine_in_confirmation: "confirmed",
      total_amount: 18.0,
      currency: "USD",
      items: [{ name: "Wine", quantity: 2, unit_price: 9.0, line_total: 18.0 }],
    },
  ];

  const bill = calculateTableRunningBill(session, table, orders);

  assert.equal(bill.totalAmount, 68.0);
  assert.equal(bill.paidAmount, 50.0);
  assert.equal(bill.unpaidAmount, 18.0);
  assert.equal(bill.orderCount, 2);
});

test("table-bill: cancelled and declined orders are excluded from bill totals", () => {
  const session = {
    id: "sess-3",
    table_id: "tbl-3",
    business_id: "biz-1",
    status: "active",
    opened_at: "2026-10-28T14:00:00Z",
  };
  const table = { id: "tbl-3", label: "Table 1" };
  const orders = [
    {
      id: "ord-ok",
      order_number: "ORD-301",
      created_at: "2026-10-28T14:05:00Z",
      status: "completed",
      payment_status: "paid",
      payment_method: "at_table",
      dine_in_confirmation: "confirmed",
      total_amount: 20.0,
      items: [{ name: "Pasta", quantity: 1, unit_price: 20.0 }],
    },
    {
      id: "ord-cancelled",
      order_number: "ORD-302",
      created_at: "2026-10-28T14:10:00Z",
      status: "cancelled",
      payment_status: "unpaid",
      payment_method: "at_table",
      dine_in_confirmation: "confirmed",
      total_amount: 15.0,
      items: [{ name: "Salad", quantity: 1, unit_price: 15.0 }],
    },
    {
      id: "ord-declined",
      order_number: "ORD-303",
      created_at: "2026-10-28T14:15:00Z",
      status: "pending",
      payment_status: "unpaid",
      payment_method: "at_table",
      dine_in_confirmation: "declined",
      total_amount: 40.0,
      items: [{ name: "Lobster", quantity: 1, unit_price: 40.0 }],
    },
  ];

  const bill = calculateTableRunningBill(session, table, orders);

  assert.equal(bill.totalAmount, 20.0, "Only non-cancelled/non-declined orders count towards total");
  assert.equal(bill.paidAmount, 20.0);
  assert.equal(bill.unpaidAmount, 0.0);
  assert.equal(bill.orderCount, 1);
  assert.equal(bill.excludedOrders.length, 2);
  assert.equal(bill.items.length, 1);
});

test("table-bill: the running bill selects only columns present in the live orders schema", () => {
  // Read-only schema contract checked against staging on 2026-10-29.
  const liveOrdersColumns = new Set(`
    id organizer_id business_id website_id order_number tracking_token customer_name
    customer_phone customer_email fulfilment_type delivery_address customer_note currency
    subtotal delivery_fee total_amount status payment_method payment_status provider
    provider_reference scheduled_for items idempotency_key created_at updated_at
    payment_expires_at estimated_ready_at status_history cancellation_reason rider_name
    rider_phone courier_worker_id delivery_issue delivery_rating delivery_rating_comment
    table_id table_session_id table_label dine_in_confirmation dine_in_declined_reason
    guest_token_hash
  `.trim().split(/\s+/));
  const source = fs.readFileSync(path.join(ROOT, "lib/actions/table-management.ts"), "utf8");
  const start = source.indexOf("export async function getTableRunningBill(");
  const end = source.indexOf("export async function requestTableBill(", start);
  assert.ok(start >= 0 && end > start, "getTableRunningBill action exists");
  const action = source.slice(start, end);
  const orderSelects = [...action.matchAll(/\.from\("orders"\)\s*\.select\(\s*(?:"([^"]+)"|`([^`]+)`)/g)]
    .map((match) => (match[1] ?? match[2]).split(",").map((column) => column.trim()));

  assert.equal(orderSelects.length, 3, "authorization, primary bill, and compatibility fallback selects are guarded");
  for (const columns of orderSelects) {
    for (const column of columns) {
      assert.ok(liveOrdersColumns.has(column), `orders.${column} exists in the live schema`);
    }
  }
  assert.ok(action.includes("dine_in_confirmation"), "primary bill query reads the live confirmation column");
  assert.doesNotMatch(action, /waiter_confirmation_state|waiter_confirmed_at/);
});

test("table-bill: canRequestBill validation rules", () => {
  assert.equal(canRequestBill("active").allowed, true);
  assert.equal(canRequestBill("bill_requested").allowed, false);
  assert.equal(canRequestBill("closed").allowed, false);
  assert.equal(canRequestBill("paid").allowed, false);
  assert.equal(canRequestBill("unknown").allowed, false);
});

test("table-bill: canMarkTablePaidAndClose validation rules", () => {
  assert.equal(canMarkTablePaidAndClose("active").allowed, true);
  assert.equal(canMarkTablePaidAndClose("bill_requested").allowed, true);
  assert.equal(canMarkTablePaidAndClose("closed").allowed, false);
  assert.equal(canMarkTablePaidAndClose("paid").allowed, false);
});
