/**
 * lib/table-bill.ts
 *
 * Domain calculations, types, and transition logic for Table Sessions and Running Bills (Phase 4).
 * Single authoritative source of truth for bill itemization, totals, payment balance, and session status.
 */

export interface RunningBillItem {
  id: string; // Unique identifier: `${orderId}:${itemIndex}`
  orderId: string;
  orderNumber: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  chosenOptions?: Array<{ name: string; price_delta?: number }>;
  orderStatus: string;
  paymentStatus: string;
  waiterConfirmation: string;
}

export interface RunningBillOrderSummary {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  waiterConfirmation: string;
  totalAmount: number;
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    chosen_options?: Array<{ name: string; price_delta?: number }>;
  }>;
}

export interface TableRunningBill {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  businessId: string;
  sessionStatus: "active" | "bill_requested" | "paid" | "closed";
  openedAt: string;
  closedAt: string | null;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  orderCount: number;
  orders: RunningBillOrderSummary[];
  excludedOrders: RunningBillOrderSummary[];
  items: RunningBillItem[];
}

export interface RawBillOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  payment_method: string;
  dine_in_confirmation?: string | null;
  total_amount: number | string;
  currency?: string | null;
  items?: unknown;
}

export interface RawBillSession {
  id: string;
  table_id: string;
  business_id: string;
  status: string;
  opened_at: string;
  closed_at?: string | null;
}

export interface RawBillTable {
  id: string;
  label: string;
}

/**
 * Pure calculation function for a table session's running bill.
 * Aggregates eligible orders, excludes cancelled/declined orders,
 * calculates running totals, paid portions, and outstanding balances.
 */
export function calculateTableRunningBill(
  session: RawBillSession,
  table: RawBillTable,
  orders: RawBillOrder[]
): TableRunningBill {
  const activeOrders: RunningBillOrderSummary[] = [];
  const excludedOrders: RunningBillOrderSummary[] = [];
  const items: RunningBillItem[] = [];

  let currency = "USD";
  let totalAmount = 0;
  let paidAmount = 0;

  for (const o of orders) {
    if (o.currency && typeof o.currency === "string") {
      currency = o.currency.toUpperCase();
    }

    const waiterState = o.dine_in_confirmation || "not_applicable";
    const isExcluded = o.status === "cancelled" || waiterState === "declined";

    const rawItems = Array.isArray(o.items) ? o.items : [];
    const orderItems: RunningBillOrderSummary["items"] = rawItems.map((it: any) => ({
      name: String(it?.name || "Item"),
      quantity: Number(it?.quantity || 1),
      unit_price: Number(it?.unit_price || 0),
      line_total: Number(
        it?.line_total !== undefined
          ? it.line_total
          : Number(it?.unit_price || 0) * Number(it?.quantity || 1)
      ),
      chosen_options: Array.isArray(it?.chosen_options) ? it.chosen_options : undefined,
    }));

    const summary: RunningBillOrderSummary = {
      orderId: o.id,
      orderNumber: o.order_number,
      createdAt: o.created_at,
      status: o.status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      waiterConfirmation: waiterState,
      totalAmount: Number(Number(o.total_amount || 0).toFixed(2)),
      items: orderItems,
    };

    if (isExcluded) {
      excludedOrders.push(summary);
      continue;
    }

    activeOrders.push(summary);
    const orderTotal = summary.totalAmount;
    totalAmount += orderTotal;

    if (o.payment_status === "paid") {
      paidAmount += orderTotal;
    }

    // Itemized lines
    orderItems.forEach((it, idx) => {
      items.push({
        id: `${o.id}:${idx}`,
        orderId: o.id,
        orderNumber: o.order_number,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unit_price,
        lineTotal: it.line_total,
        chosenOptions: it.chosen_options,
        orderStatus: o.status,
        paymentStatus: o.payment_status,
        waiterConfirmation: waiterState,
      });
    });
  }

  const roundedTotal = Number(totalAmount.toFixed(2));
  const roundedPaid = Number(paidAmount.toFixed(2));
  const unpaidAmount = Math.max(0, Number((roundedTotal - roundedPaid).toFixed(2)));

  return {
    sessionId: session.id,
    tableId: table.id,
    tableLabel: table.label,
    businessId: session.business_id,
    sessionStatus: (["active", "bill_requested", "paid", "closed"].includes(session.status)
      ? session.status
      : "active") as TableRunningBill["sessionStatus"],
    openedAt: session.opened_at,
    closedAt: session.closed_at || null,
    currency,
    totalAmount: roundedTotal,
    paidAmount: roundedPaid,
    unpaidAmount,
    orderCount: activeOrders.length,
    orders: activeOrders,
    excludedOrders,
    items,
  };
}

/**
 * Validates whether a table session can accept a "Request Bill" action from a customer.
 */
export function canRequestBill(sessionStatus: string): { allowed: boolean; reason?: string } {
  if (sessionStatus === "bill_requested") {
    return { allowed: false, reason: "Bill has already been requested." };
  }
  if (sessionStatus === "closed" || sessionStatus === "paid") {
    return { allowed: false, reason: "Table session is already closed or paid." };
  }
  if (sessionStatus !== "active") {
    return { allowed: false, reason: "Session is not active." };
  }
  return { allowed: true };
}

/**
 * Validates whether a table session can be marked paid and closed by staff.
 */
export function canMarkTablePaidAndClose(sessionStatus: string): { allowed: boolean; reason?: string } {
  if (sessionStatus === "closed" || sessionStatus === "paid") {
    return { allowed: false, reason: "Table session is already closed." };
  }
  if (!["active", "bill_requested"].includes(sessionStatus)) {
    return { allowed: false, reason: `Cannot close session in "${sessionStatus}" state.` };
  }
  return { allowed: true };
}
