"use server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { cookies, headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  generateQrShortCode,
  hashToken,
  GUEST_DEVICE_TOKEN_COOKIE,
  type BusinessTable,
  type QrRedirectCode,
  type TableOrderingMode,
  type TableSession,
} from "@/lib/table-qr";
import { createNotification } from "@/lib/notifications";
import {
  calculateTableRunningBill,
  canRequestBill,
  type TableRunningBill,
  type RawBillOrder,
} from "@/lib/table-bill";
import { revalidatePath } from "next/cache";

export interface TableWithQr extends BusinessTable {
  qr_code?: QrRedirectCode | null;
  active_session?: TableSession | null;
}

export interface ListBusinessTablesResult {
  success: boolean;
  tables?: TableWithQr[];
  menuQr?: QrRedirectCode | null;
  orderingMode?: TableOrderingMode;
  businessName?: string;
  businessSlug?: string;
  error?: string;
}

/**
 * Lists all tables for a business, along with their active QR redirect codes,
 * active table sessions, and the business's menu QR code.
 */
export async function listBusinessTables(businessId: string): Promise<ListBusinessTablesResult> {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createSupabaseAdmin();

  const { data: business, error: bizError } = await admin
    .from("businesses")
    .select("id, name, slug, table_ordering_mode")
    .eq("id", businessId)
    .single();

  if (bizError || !business) {
    return { success: false, error: "Business not found" };
  }

  // 1. Fetch tables
  const { data: tables, error: tablesError } = await admin
    .from("business_tables")
    .select("*")
    .eq("business_id", businessId)
    .order("position", { ascending: true })
    .order("label", { ascending: true });

  if (tablesError) {
    return { success: false, error: tablesError.message };
  }

  // 2. Fetch active QR codes for this business
  const { data: qrCodes } = await admin
    .from("qr_redirect_codes")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true);

  // 3. Fetch active or bill_requested sessions
  const { data: sessions } = await admin
    .from("table_sessions")
    .select("*")
    .eq("business_id", businessId)
    .in("status", ["active", "bill_requested"]);

  const qrByTable = new Map<string, QrRedirectCode>();
  let menuQr: QrRedirectCode | null = null;

  for (const code of (qrCodes || []) as QrRedirectCode[]) {
    if (code.target_type === "menu") {
      menuQr = code;
    } else if (code.table_id) {
      qrByTable.set(code.table_id, code);
    }
  }

  const sessionByTable = new Map<string, TableSession>();
  for (const session of (sessions || []) as TableSession[]) {
    sessionByTable.set(session.table_id, session);
  }

  const tablesWithQr: TableWithQr[] = (tables || []).map((t) => ({
    ...t,
    qr_code: qrByTable.get(t.id) || null,
    active_session: sessionByTable.get(t.id) || null,
  }));

  return {
    success: true,
    tables: tablesWithQr,
    menuQr,
    orderingMode: (business.table_ordering_mode as TableOrderingMode) || "order_pay_later",
    businessName: business.name,
    businessSlug: business.slug,
  };
}

/**
 * Creates a new business table and automatically generates its active QR redirect code.
 */
export async function createBusinessTable(input: {
  businessId: string;
  label: string;
  position?: number;
}): Promise<{ success: boolean; table?: TableWithQr; error?: string }> {
  const auth = await assertCanManageBusiness(input.businessId);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const trimmedLabel = input.label?.trim();
  if (!trimmedLabel || trimmedLabel.length < 1 || trimmedLabel.length > 50) {
    return { success: false, error: "Table label must be between 1 and 50 characters" };
  }

  const admin = createSupabaseAdmin();

  // Insert table
  const { data: table, error: tableError } = await admin
    .from("business_tables")
    .insert({
      business_id: input.businessId,
      label: trimmedLabel,
      position: typeof input.position === "number" && input.position >= 0 ? input.position : 0,
      is_active: true,
    })
    .select()
    .single();

  if (tableError || !table) {
    if (tableError?.code === "23505") {
      return { success: false, error: `A table labeled "${trimmedLabel}" already exists for this business` };
    }
    return { success: false, error: "Failed to create table" };
  }

  // Generate QR code for the table
  const shortCode = generateQrShortCode();
  const { data: qrCode, error: qrError } = await admin
    .from("qr_redirect_codes")
    .insert({
      code: shortCode,
      target_type: "table",
      business_id: input.businessId,
      table_id: table.id,
      is_active: true,
    })
    .select()
    .single();

  if (qrError) {
    console.error("[createBusinessTable] QR code generation failed:", qrError);
  }

  revalidatePath(`/dashboard/businesses/${input.businessId}`);

  return {
    success: true,
    table: {
      ...table,
      qr_code: qrCode || null,
      active_session: null,
    },
  };
}

/**
 * Updates an existing business table's label, position, or active state.
 */
export async function updateBusinessTable(input: {
  tableId: string;
  label?: string;
  position?: number;
  is_active?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdmin();

  const { data: existing, error: fetchErr } = await admin
    .from("business_tables")
    .select("id, business_id")
    .eq("id", input.tableId)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: "Table not found" };
  }

  const auth = await assertCanManageBusiness(existing.business_id);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const updates: Record<string, unknown> = {};
  if (typeof input.label === "string") {
    const trimmed = input.label.trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      return { success: false, error: "Table label must be between 1 and 50 characters" };
    }
    updates.label = trimmed;
  }
  if (typeof input.position === "number" && input.position >= 0) {
    updates.position = input.position;
  }
  if (typeof input.is_active === "boolean") {
    updates.is_active = input.is_active;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true };
  }

  const { error: updateErr } = await admin
    .from("business_tables")
    .update(updates)
    .eq("id", input.tableId);

  if (updateErr) {
    if (updateErr.code === "23505") {
      return { success: false, error: "Another table already has this label" };
    }
    return { success: false, error: updateErr.message };
  }

  revalidatePath(`/dashboard/businesses/${existing.business_id}`);
  return { success: true };
}

/**
 * Deletes a business table. Cascade removes associated QR codes and table sessions.
 */
export async function deleteBusinessTable(tableId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdmin();

  const { data: existing, error: fetchErr } = await admin
    .from("business_tables")
    .select("id, business_id, label")
    .eq("id", tableId)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: "Table not found" };
  }

  const auth = await assertCanManageBusiness(existing.business_id);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const { error: delErr } = await admin
    .from("business_tables")
    .delete()
    .eq("id", tableId);

  if (delErr) {
    return { success: false, error: delErr.message };
  }

  revalidatePath(`/dashboard/businesses/${existing.business_id}`);
  return { success: true };
}

/**
 * Regenerates a table's QR redirect code.
 * Atomically deactivates any existing QR code for this table and issues a fresh code.
 * Old printed codes will immediately return inactive/expired.
 */
export async function regenerateTableQrCode(tableId: string): Promise<{
  success: boolean;
  qrCode?: QrRedirectCode;
  error?: string;
}> {
  const admin = createSupabaseAdmin();

  const { data: table, error: fetchErr } = await admin
    .from("business_tables")
    .select("id, business_id")
    .eq("id", tableId)
    .single();

  if (fetchErr || !table) {
    return { success: false, error: "Table not found" };
  }

  const auth = await assertCanManageBusiness(table.business_id);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  // Deactivate prior active codes for this table
  await admin
    .from("qr_redirect_codes")
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq("table_id", tableId)
    .eq("is_active", true);

  // Mint fresh code
  const newCode = generateQrShortCode();
  const { data: newQr, error: insertErr } = await admin
    .from("qr_redirect_codes")
    .insert({
      code: newCode,
      target_type: "table",
      business_id: table.business_id,
      table_id: table.id,
      is_active: true,
    })
    .select()
    .single();

  if (insertErr || !newQr) {
    return { success: false, error: "Failed to generate new QR code" };
  }

  revalidatePath(`/dashboard/businesses/${table.business_id}`);
  return { success: true, qrCode: newQr };
}

/**
 * Gets or creates the stable menu QR code for the business (point-of-entry QR).
 */
export async function getOrCreateBusinessMenuQrCode(businessId: string): Promise<{
  success: boolean;
  menuQr?: QrRedirectCode;
  error?: string;
}> {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createSupabaseAdmin();

  const { data: existing } = await admin
    .from("qr_redirect_codes")
    .select("*")
    .eq("business_id", businessId)
    .eq("target_type", "menu")
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    return { success: true, menuQr: existing };
  }

  const newCode = generateQrShortCode();
  const { data: created, error: insertErr } = await admin
    .from("qr_redirect_codes")
    .insert({
      code: newCode,
      target_type: "menu",
      business_id: businessId,
      table_id: null,
      is_active: true,
    })
    .select()
    .single();

  if (insertErr || !created) {
    return { success: false, error: "Failed to create menu QR code" };
  }

  return { success: true, menuQr: created };
}

/**
 * Updates the business's table ordering mode.
 */
export async function updateBusinessTableOrderingMode(
  businessId: string,
  mode: TableOrderingMode
): Promise<{ success: boolean; error?: string }> {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const allowedModes: TableOrderingMode[] = [
    "disabled",
    "menu_only",
    "order_pay_later",
    "order_pay_now",
    "pay_online_first",
  ];
  if (!allowedModes.includes(mode)) {
    return { success: false, error: "Invalid ordering mode" };
  }

  const admin = createSupabaseAdmin();

  const { error } = await admin
    .from("businesses")
    .update({ table_ordering_mode: mode })
    .eq("id", businessId);

  if (error) {
    return { success: false, error: "Failed to update ordering mode" };
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  return { success: true };
}

/**
 * Closes an active or bill_requested table session.
 */
export async function closeTableSession(
  tableSessionId: string
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdmin();

  const { data: session, error: fetchErr } = await admin
    .from("table_sessions")
    .select("id, business_id, status")
    .eq("id", tableSessionId)
    .single();

  if (fetchErr || !session) {
    return { success: false, error: "Session not found" };
  }

  const auth = await assertCanManageBusiness(session.business_id);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const { error: updateErr } = await admin
    .from("table_sessions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
    })
    .eq("id", tableSessionId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  revalidatePath(`/dashboard/businesses/${session.business_id}`);
  return { success: true };
}

/**
 * Retrieves the itemized running bill and financial totals for an active or closed table session.
 */
export async function getTableRunningBill(
  businessId: string,
  tableId: string,
  sessionId?: string
): Promise<{ success: boolean; bill?: TableRunningBill | null; error?: string }> {
  const admin = createSupabaseAdmin();

  // 1. Verify table exists and belongs to business. Public callers need the
  // QR-issued guest token; a table UUID/context cookie alone is not proof.
  let guestTokenHash: string | null = null;
  const staffAuth = await assertCanManageBusiness(businessId);
  if (!staffAuth.ok) {
    let guestToken: string | null = null;
    try {
      guestToken = (await cookies()).get(GUEST_DEVICE_TOKEN_COOKIE)?.value ?? null;
    } catch {
      return { success: false, error: "Unauthorized: scan this table's QR code again." };
    }
    if (!guestToken?.trim()) {
      return { success: false, error: "Unauthorized: scan this table's QR code again." };
    }
    guestToken = guestToken.trim();
    guestTokenHash = hashToken(guestToken);
  }

  const { data: table, error: tableErr } = await admin
    .from("business_tables")
    .select("id, label, business_id")
    .eq("id", tableId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (tableErr || !table) {
    return { success: false, error: "Table not found." };
  }

  // 2. Fetch session (explicit ID or current active/bill_requested session)
  let sessionQuery = admin
    .from("table_sessions")
    .select("id, table_id, business_id, status, opened_at, closed_at")
    .eq("table_id", tableId)
    .eq("business_id", businessId);

  if (sessionId) {
    sessionQuery = sessionQuery.eq("id", sessionId);
  } else {
    sessionQuery = sessionQuery
      .in("status", ["active", "bill_requested"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: session, error: sessErr } = await sessionQuery.maybeSingle();

  if (sessErr) {
    return { success: false, error: "Failed to load table session." };
  }

  if (!session) {
    return { success: true, bill: null };
  }

  if (!staffAuth.ok) {
    const { data: matchedOrder, error: orderAuthError } = await admin
      .from("orders")
      .select("id")
      .eq("business_id", businessId)
      .eq("table_id", tableId)
      .eq("table_session_id", session.id)
      .eq("guest_token_hash", guestTokenHash)
      .limit(1)
      .maybeSingle();
    if (orderAuthError || !matchedOrder) {
      return { success: false, error: "Unauthorized: this device is not associated with the active table session." };
    }
  }

  // 3. Fetch all orders for this session. Guests only receive their own
  // matching order lines; staff retain the full session view.
  let ordersQuery = admin
    .from("orders")
    .select(
      "id, order_number, created_at, status, payment_status, payment_method, dine_in_confirmation, total_amount, currency, items"
    )
    .eq("table_session_id", session.id);
  if (!staffAuth.ok) ordersQuery = ordersQuery.eq("guest_token_hash", guestTokenHash);
  let orders: RawBillOrder[] | null = null;
  let ordersErr: unknown = null;
  const primaryOrders = await ordersQuery.order("created_at", { ascending: true });
  orders = primaryOrders.data as RawBillOrder[] | null;
  ordersErr = primaryOrders.error;

  if (ordersErr) {
    // Older installations may not have the table-order confirmation column.
    // Retry the base bill query so running totals remain available there too.
    let fallbackQuery = admin
      .from("orders")
      .select("id, order_number, created_at, status, payment_status, payment_method, total_amount, currency, items")
      .eq("table_session_id", session.id);
    if (!staffAuth.ok) fallbackQuery = fallbackQuery.eq("guest_token_hash", guestTokenHash);
    const fallback = await fallbackQuery.order("created_at", { ascending: true });
    orders = fallback.data as RawBillOrder[] | null;
    ordersErr = fallback.error;
  }

  if (ordersErr) {
    return { success: false, error: "Failed to load session orders." };
  }

  const bill = calculateTableRunningBill(session, table, (orders || []) as RawBillOrder[]);
  return { success: true, bill };
}

/**
 * Customer-facing action to request the bill for an active table session.
 * Updates session status to 'bill_requested' and dispatches an in-app notification to staff.
 * Authorized for guests seated at this table (via table context cookie or guest device token)
 * or restaurant staff.
 */
export async function requestTableBill({
  businessId,
  tableId,
  sessionId,
  guestToken,
}: {
  businessId: string;
  tableId: string;
  sessionId?: string;
  guestToken?: string;
}): Promise<{ success: boolean; alreadyRequested?: boolean; message?: string; error?: string }> {
  const admin = createSupabaseAdmin();

  // 1. Authorize staff now; guest authorization is checked against an order
  // in the exact active session after that session has been resolved.
  let isAuthorized = false;
  let guestTokenHash: string | null = null;
  const staffAuth = await assertCanManageBusiness(businessId);
  if (staffAuth.ok) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    try {
      const cookieStore = await cookies();
      const rawGuestToken = guestToken || cookieStore.get(GUEST_DEVICE_TOKEN_COOKIE)?.value;
      if (rawGuestToken?.trim()) {
        guestTokenHash = hashToken(rawGuestToken.trim());
      }
    } catch {
      // cookies() may throw in isolated test environments
      if (guestToken?.trim()) {
        guestTokenHash = hashToken(guestToken.trim());
      }
    }
  }

  // 2. Fetch table and business details
  const { data: table, error: tableErr } = await admin
    .from("business_tables")
    .select("id, label, business_id, businesses(id, name, organizer_id)")
    .eq("id", tableId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (tableErr || !table) {
    return { success: false, error: "Table not found." };
  }

  // 3. Fetch session
  let sessionQuery = admin
    .from("table_sessions")
    .select("id, table_id, business_id, status")
    .eq("table_id", tableId)
    .eq("business_id", businessId);

  if (sessionId) {
    sessionQuery = sessionQuery.eq("id", sessionId);
  } else {
    sessionQuery = sessionQuery
      .in("status", ["active", "bill_requested"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: session, error: sessErr } = await sessionQuery.maybeSingle();

  if (sessErr || !session) {
    return { success: false, error: "No active session found for this table." };
  }

  // Guests must prove possession of the QR-issued device credential already
  // persisted on an order belonging to this exact table session. The table
  // context cookie is intentionally not treated as an authorization token.
  if (!isAuthorized) {
    if (!guestTokenHash) {
      return { success: false, error: "Unauthorized: scan this table's QR code again to request the bill." };
    }
    const { data: matchedOrder, error: orderAuthError } = await admin
      .from("orders")
      .select("id")
      .eq("business_id", businessId)
      .eq("table_id", tableId)
      .eq("table_session_id", session.id)
      .eq("guest_token_hash", guestTokenHash)
      .limit(1)
      .maybeSingle();
    if (orderAuthError || !matchedOrder) {
      return { success: false, error: "Unauthorized: this device is not associated with the active table session." };
    }
  }

  // Per-IP limiter also bounds repeated probes and nuisance calls. The
  // session transition below remains an atomic compare-and-set for retries.
  if (!isAuthorized) {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const ip = headerList.get("x-real-ip") || forwarded?.split(",")[0]?.trim() || "unknown";
    const ipLimit = await checkRateLimit("orderRequestIp", `table-bill:${ip}`);
    if (!ipLimit.allowed) {
      return { success: false, error: "Too many bill requests. Please wait before trying again." };
    }
  }

  // 4. Validate request
  const check = canRequestBill(session.status);
  if (!check.allowed) {
    if (session.status === "bill_requested") {
      return {
        success: true,
        alreadyRequested: true,
        message: "Bill has already been requested. A waiter has been notified.",
      };
    }
    return { success: false, error: check.reason || "Cannot request bill for this session." };
  }

  // 5. Update session status atomically
  const { data: requestedSession, error: updateErr } = await admin
    .from("table_sessions")
    .update({
      status: "bill_requested",
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (updateErr) {
    return { success: false, error: "Failed to update session status." };
  }
  if (!requestedSession) {
    const { data: currentSession } = await admin
      .from("table_sessions")
      .select("status")
      .eq("id", session.id)
      .maybeSingle();
    if (currentSession?.status === "bill_requested") {
      return { success: true, alreadyRequested: true, message: "Bill has already been requested. A waiter has been notified." };
    }
    return { success: false, error: "The table session changed before the request could be recorded. Please refresh and try again." };
  }

  // 6. Notify staff via in-app notification
  const organizerId = (table.businesses as any)?.organizer_id;
  if (organizerId) {
    const { data: org } = await admin
      .from("organizers")
      .select("user_id")
      .eq("id", organizerId)
      .maybeSingle();

    if (org?.user_id) {
      await createNotification({
        userId: org.user_id,
        type: "order_placed",
        title: `Bill Requested — Table ${table.label}`,
        body: `Guests at Table ${table.label} have requested the bill.`,
        link: `/dashboard/org/${organizerId}/tables`,
      });
    }
  }

  revalidatePath(`/dashboard/businesses/${businessId}`);
  if (organizerId) {
    revalidatePath(`/dashboard/org/${organizerId}/tables`);
    revalidatePath(`/dashboard/org/${organizerId}/orders`);
  }

  return { success: true, message: "Bill requested. A server is on their way." };
}

/**
 * Staff-facing action to mark a table session paid and close it.
 * Settles unpaid cash/at-table orders, sets session to 'closed',
 * and releases the table for the next party.
 * Requires the atomic PostgreSQL RPC; failures never fall back to partial REST writes.
 */
export async function markTablePaidAndCloseSession({
  tableSessionId,
  businessId,
  paymentMethod = "at_table",
}: {
  tableSessionId: string;
  businessId: string;
  paymentMethod?: "at_table" | "cash" | "card_terminal";
}): Promise<{
  success: boolean;
  ordersSettled?: number;
  waiterConfirmed?: number;
  closedAt?: string;
  message?: string;
  error?: string;
}> {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const admin = createSupabaseAdmin();
  let ordersSettled = 0;
  let waiterConfirmed = 0;
  let closedAt: string | null = null;

  // 1. Attempt atomic PostgreSQL RPC (Migration 199)
  const { data: rpcRows, error: rpcError } = await admin.rpc(
    "mark_table_paid_and_close_session",
    {
      p_table_session_id: tableSessionId,
      p_business_id: businessId,
      p_payment_method: paymentMethod || "at_table",
      p_actor_user_id: auth.userId,
    }
  );

  if (!rpcError && rpcRows) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : (rpcRows as any);
    if (row) {
      if (row.out_success === false || row.out_error) {
        return { success: false, error: row.out_error || "Failed to settle table." };
      }
      ordersSettled = Number(row.out_orders_settled ?? 0);
      waiterConfirmed = Number(row.out_waiter_confirmed ?? 0);
      closedAt = row.out_closed_at
        ? new Date(row.out_closed_at).toISOString()
        : new Date().toISOString();
    }
  } else {
    // Never fall back to sequential REST updates: without the RPC's transaction,
    // paid orders could be left behind in an open session.
    return {
      success: false,
      error: "Atomic settlement is unavailable. No orders were changed; please retry or contact support.",
    };
  }

  // Revalidate cache paths
  const { data: biz } = await admin
    .from("businesses")
    .select("organizer_id")
    .eq("id", businessId)
    .maybeSingle();

  revalidatePath(`/dashboard/businesses/${businessId}`);
  if (biz?.organizer_id) {
    revalidatePath(`/dashboard/org/${biz.organizer_id}/tables`);
    revalidatePath(`/dashboard/org/${biz.organizer_id}/orders`);
  }

  return {
    success: true,
    ordersSettled,
    waiterConfirmed,
    closedAt: closedAt || new Date().toISOString(),
    message: "Table session marked paid and closed.",
  };
}
