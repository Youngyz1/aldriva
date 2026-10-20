import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  KITCHEN_DISPLAY_COOKIE,
  KITCHEN_SESSION_COOKIE,
  readRequestCookie,
  validateAndRenewWorkerSession,
  validateKitchenDisplayToken,
} from "@/lib/kitchen/worker-session";
import { kitchenJson, setSessionCookie } from "@/lib/kitchen/http";

const ORDER_QUERY_LIMIT = 50;
const READY_WINDOW_MS = 6 * 60 * 60 * 1000;

type StatusHistoryEntry = { status?: unknown; at?: unknown };
type KitchenOrderRow = {
  id: string;
  business_id: string | null;
  order_number: string;
  status: string;
  fulfilment_type: string;
  customer_name: string;
  items: unknown;
  customer_note: string | null;
  created_at: string;
  updated_at: string;
  status_history: unknown;
  estimated_ready_at: string | null;
};

function latestStatusAt(history: unknown, status: string): string | null {
  if (!Array.isArray(history)) return null;
  const entries = history as StatusHistoryEntry[];
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.status !== status || typeof entry.at !== "string" || !Number.isFinite(Date.parse(entry.at))) continue;
    return entry.at;
  }
  return null;
}

function toKitchenItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.name !== "string") return [];
    const quantity = Number(row.quantity);
    const options = Array.isArray(row.chosen_options)
      ? row.chosen_options.flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const item = option as Record<string, unknown>;
          return typeof item.name === "string"
            ? [{ name: item.name, quantity: Number.isFinite(Number(item.qty)) ? Number(item.qty) : 1 }]
            : [];
        })
      : [];
    return [{ name: row.name, quantity: Number.isFinite(quantity) ? quantity : 1, options }];
  });
}

function toKitchenOrder(row: KitchenOrderRow, readyAt: string | null) {
  const acceptedAt = latestStatusAt(row.status_history, "accepted");
  // Accepted is the kitchen's first visible state, so keep NEW on it until
  // a cook starts preparation rather than letting an unattended order age out.
  const isNew = row.status === "accepted";
  const isPickup = row.fulfilment_type === "pickup";
  const firstName = isPickup ? row.customer_name.trim().split(/\s+/)[0] || null : null;
  const numericCode = row.order_number.match(/\d/g)?.join("") ?? "";

  return {
    id: row.id,
    status: row.status,
    shortCode: numericCode.slice(-4),
    orderNumber: row.order_number,
    fulfilmentType: isPickup ? "PICKUP" : "DELIVERY",
    customerFirstName: firstName,
    items: toKitchenItems(row.items),
    customerNote: row.customer_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt,
    estimatedReadyAt: row.estimated_ready_at,
    readyAt,
    isNew,
  };
}

export async function GET(request: Request) {
  const sessionToken = readRequestCookie(request, KITCHEN_SESSION_COOKIE);
  const workerSession = sessionToken ? await validateAndRenewWorkerSession(sessionToken) : null;
  if (workerSession && workerSession.role !== "cook") {
    return kitchenJson({ error: "This kitchen session cannot view cook orders." }, 403);
  }

  let viewer: "cook" | "display";
  let businessId: string;
  let sessionExpiresAt: string | null = null;
  if (workerSession) {
    viewer = "cook";
    businessId = workerSession.businessId;
    sessionExpiresAt = workerSession.expiresAt;
  } else {
    const displayToken = readRequestCookie(request, KITCHEN_DISPLAY_COOKIE);
    const displayScope = displayToken ? await validateKitchenDisplayToken(displayToken) : null;
    if (!displayScope) return kitchenJson({ error: "Kitchen access is no longer valid." }, 401);
    viewer = "display";
    businessId = displayScope.businessId;
  }

  const admin = createSupabaseAdmin();
  const columns = "id, business_id, order_number, status, fulfilment_type, customer_name, items, customer_note, created_at, updated_at, status_history, estimated_ready_at";
  const base = () => admin
    .from("orders")
    .select(columns)
    .eq("business_id", businessId)
    .not("business_id", "is", null);

  const [activeResult, readyResult] = await Promise.all([
    base()
      .in("status", ["accepted", "preparing"])
      .order("updated_at", { ascending: false })
      .limit(ORDER_QUERY_LIMIT),
    base()
      .eq("status", "ready")
      .order("updated_at", { ascending: false })
      .limit(ORDER_QUERY_LIMIT),
  ]);
  if (activeResult.error || readyResult.error) {
    return kitchenJson({ error: "Kitchen orders are temporarily unavailable." }, 503);
  }

  const now = Date.now();
  const readyCutoff = now - READY_WINDOW_MS;
  const recentReady = ((readyResult.data ?? []) as KitchenOrderRow[]).flatMap((row) => {
    const readyAt = latestStatusAt(row.status_history, "ready");
    const readyAtMs = readyAt ? Date.parse(readyAt) : Number.NaN;
    return Number.isFinite(readyAtMs) && readyAtMs >= readyCutoff
      ? [{ row, readyAt }]
      : [];
  });
  const orders = [
    ...((activeResult.data ?? []) as KitchenOrderRow[]).map((row) => toKitchenOrder(row, null)),
    ...recentReady.map(({ row, readyAt }) => toKitchenOrder(row, readyAt)),
  ].slice(0, ORDER_QUERY_LIMIT * 2);

  const response = kitchenJson({ ok: true, viewer, orders, rowLimit: ORDER_QUERY_LIMIT * 2 });
  if (viewer === "cook" && sessionToken && sessionExpiresAt) {
    setSessionCookie(response, sessionToken, sessionExpiresAt);
  }
  return response;
}
