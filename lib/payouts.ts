/**
 * lib/payouts.ts
 * Server-only service module for payout & balance ledger operations.
 * Connects Next.js Server Components and Server Actions to Migration 73 RPCs.
 */

"use server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { hasEntityAccess } from "@/lib/entity-auth";

export type RecipientType = "user" | "organizer" | "business";

export type PayoutStatus =
  | "requested"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type DestinationType =
  | "stripe_connect"
  | "bank_transfer"
  | "crypto"
  | "manual";

export type LedgerEntryItem = {
  id: string;
  entry_type: string;
  amount: number;
  currency: string;
  source_type: string;
  description: string | null;
  created_at: string;
};

export type PayoutHistoryItem = {
  id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  destination_type: DestinationType;
  destination_reference: string | null;
  external_payout_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipientPaymentsOverview = {
  recipientId: string;
  availableBalance: number;
  pendingPayoutAmount: number;
  totalWithdrawn: number;
  currency: string;
  ledgerEntries: LedgerEntryItem[];
  payoutHistory: PayoutHistoryItem[];
};

export type RequestPayoutInput = {
  recipientType: RecipientType;
  entityId?: string;
  amount: number;
  currency?: string;
  destinationType: DestinationType;
  destinationReference?: string;
  idempotencyKey?: string;
};

export type AdminPayoutQueueItem = {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientType: RecipientType;
  amount: number;
  currency: string;
  status: PayoutStatus;
  destinationType: DestinationType;
  destinationReference: string | null;
  externalPayoutId: string | null;
  failureReason: string | null;
  requestedByEmail: string | null;
  processedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Private Recipient Ownership Resolver ─────────────────────────────────────

async function resolveAndAuthorizeRecipient(
  userId: string,
  recipientType: RecipientType,
  entityId?: string
): Promise<string> {
  const supabaseAdmin = createSupabaseAdmin();

  if (recipientType === "user") {
    const { data: recipientId, error } = await supabaseAdmin.rpc(
      "resolve_recipient",
      {
        p_recipient_type: "user",
        p_user_id: userId,
        p_organizer_id: null,
        p_business_id: null,
      }
    );

    if (error || !recipientId) {
      throw new Error(`Failed to resolve user recipient: ${error?.message || "unknown"}`);
    }
    return recipientId as string;
  }

  if (recipientType === "organizer") {
    if (!entityId) throw new Error("Organizer ID is required.");

    const { data: org } = await supabaseAdmin
      .from("organizers")
      .select("id, user_id")
      .eq("id", entityId)
      .maybeSingle();

    if (!org) throw new Error("Organizer profile not found.");

    const isDirectOwner = org.user_id === userId;
    const isDelegated = await hasEntityAccess(userId, entityId, ["owner", "admin", "manager", "finance"]);

    if (!isDirectOwner && !isDelegated) {
      throw new Error("Unauthorized to access payouts for this organizer.");
    }

    const { data: recipientId, error } = await supabaseAdmin.rpc(
      "resolve_recipient",
      {
        p_recipient_type: "organizer",
        p_user_id: null,
        p_organizer_id: entityId,
        p_business_id: null,
      }
    );

    if (error || !recipientId) {
      throw new Error(`Failed to resolve organizer recipient: ${error?.message || "unknown"}`);
    }
    return recipientId as string;
  }

  if (recipientType === "business") {
    if (!entityId) throw new Error("Business ID is required.");

    const { data: biz } = await supabaseAdmin
      .from("businesses")
      .select("id, owner_id")
      .eq("id", entityId)
      .maybeSingle();

    if (!biz) throw new Error("Business listing not found.");

    if (biz.owner_id !== userId) {
      throw new Error("Unauthorized to access payouts for this business.");
    }

    const { data: recipientId, error } = await supabaseAdmin.rpc(
      "resolve_recipient",
      {
        p_recipient_type: "business",
        p_user_id: null,
        p_organizer_id: null,
        p_business_id: entityId,
      }
    );

    if (error || !recipientId) {
      throw new Error(`Failed to resolve business recipient: ${error?.message || "unknown"}`);
    }
    return recipientId as string;
  }

  throw new Error(`Invalid recipient type: ${recipientType}`);
}

// ── Public Server Actions & Services ─────────────────────────────────────────

/**
 * Fetches real-time available balance, ledger entries, and payout history for a recipient.
 */
export async function getRecipientPaymentsOverview(
  recipientType: RecipientType,
  entityId?: string,
  currency: string = "usd"
): Promise<RecipientPaymentsOverview> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized: Please sign in.");

  const normalizedCurrency = currency.toLowerCase();
  const recipientId = await resolveAndAuthorizeRecipient(user.id, recipientType, entityId);
  const supabaseAdmin = createSupabaseAdmin();

  // 1. Available Balance via RPC
  const { data: balanceData, error: balanceError } = await supabaseAdmin.rpc(
    "get_recipient_balance",
    {
      p_recipient_id: recipientId,
      p_currency: normalizedCurrency,
    }
  );

  if (balanceError) {
    throw new Error(`Failed to fetch recipient balance: ${balanceError.message}`);
  }

  const availableBalance = Number(balanceData ?? 0);

  // 2. Payout History & Ledger Entries in parallel
  const [payoutsRes, ledgerRes] = await Promise.all([
    supabaseAdmin
      .from("payouts")
      .select("id, amount, currency, status, destination_type, destination_reference, external_payout_id, failure_reason, created_at, updated_at")
      .eq("recipient_id", recipientId)
      .eq("currency", normalizedCurrency)
      .order("created_at", { ascending: false }),

    supabaseAdmin
      .from("recipient_ledger_entries")
      .select("id, entry_type, amount, currency, source_type, description, created_at")
      .eq("recipient_id", recipientId)
      .eq("currency", normalizedCurrency)
      .order("created_at", { ascending: false }),
  ]);

  const payoutHistory: PayoutHistoryItem[] = (payoutsRes.data ?? []).map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status as PayoutStatus,
    destination_type: p.destination_type as DestinationType,
    destination_reference: p.destination_reference,
    external_payout_id: p.external_payout_id,
    failure_reason: p.failure_reason,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  const ledgerEntries: LedgerEntryItem[] = (ledgerRes.data ?? []).map((l) => ({
    id: l.id,
    entry_type: l.entry_type,
    amount: Number(l.amount),
    currency: l.currency,
    source_type: l.source_type,
    description: l.description,
    created_at: l.created_at,
  }));

  const pendingPayoutAmount = payoutHistory
    .filter((p) => p.status === "requested" || p.status === "processing")
    .reduce((acc, p) => acc + p.amount, 0);

  const totalWithdrawn = payoutHistory
    .filter((p) => p.status === "completed")
    .reduce((acc, p) => acc + p.amount, 0);

  return {
    recipientId,
    availableBalance,
    pendingPayoutAmount,
    totalWithdrawn,
    currency: normalizedCurrency,
    ledgerEntries,
    payoutHistory,
  };
}

/**
 * Validates ownership, balance sufficiency, and idempotency, then atomically
 * creates payout and debits ledger via request_payout_and_debit RPC.
 */
export async function requestRecipientPayout(
  input: RequestPayoutInput
): Promise<{ payoutId: string; newBalance: number }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized: Please sign in.");

  if (!input.amount || input.amount <= 0) {
    throw new Error("Payout amount must be greater than zero.");
  }

  const currency = (input.currency || "usd").toLowerCase();
  const recipientId = await resolveAndAuthorizeRecipient(user.id, input.recipientType, input.entityId);
  const supabaseAdmin = createSupabaseAdmin();

  const idempotencyKey = input.idempotencyKey || `req_${crypto.randomUUID()}`;

  const { data, error } = await supabaseAdmin.rpc("request_payout_and_debit", {
    p_recipient_id: recipientId,
    p_amount: input.amount,
    p_currency: currency,
    p_destination_type: input.destinationType,
    p_destination_reference: input.destinationReference || null,
    p_requested_by: user.id,
    p_client_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (error.message.includes("insufficient balance")) {
      throw new Error("Insufficient available balance for this payout request.");
    }
    throw new Error(`Failed to request payout: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Failed to create payout record.");

  return {
    payoutId: row.payout_id,
    newBalance: Number(row.new_balance),
  };
}

/**
 * Cancels a requested payout if caller owns the recipient profile.
 * Triggers compensating credit reversal inside cancel_payout RPC.
 */
export async function cancelRecipientPayout(
  payoutId: string
): Promise<{ payoutId: string; status: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized: Please sign in.");

  const supabaseAdmin = createSupabaseAdmin();

  const { data: payout } = await supabaseAdmin
    .from("payouts")
    .select("id, recipient_id, status")
    .eq("id", payoutId)
    .maybeSingle();

  if (!payout) throw new Error("Payout record not found.");

  if (payout.status !== "requested") {
    throw new Error(`Payout cannot be cancelled because it is in state '${payout.status}'.`);
  }

  const { data: recipient } = await supabaseAdmin
    .from("recipients")
    .select("recipient_type, user_id, organizer_id, business_id")
    .eq("id", payout.recipient_id)
    .single();

  if (!recipient) throw new Error("Recipient record not found.");

  if (recipient.recipient_type === "user") {
    if (recipient.user_id !== user.id) {
      throw new Error("Unauthorized to cancel this payout.");
    }
  } else if (recipient.recipient_type === "organizer") {
    const isDirectOwner = recipient.user_id === user.id;
    const isDelegated = recipient.organizer_id
      ? await hasEntityAccess(user.id, recipient.organizer_id, ["owner", "admin", "manager", "finance"])
      : false;
    if (!isDirectOwner && !isDelegated) {
      throw new Error("Unauthorized to cancel this payout.");
    }
  } else if (recipient.recipient_type === "business") {
    const { data: biz } = await supabaseAdmin
      .from("businesses")
      .select("owner_id")
      .eq("id", recipient.business_id)
      .maybeSingle();
    if (!biz || biz.owner_id !== user.id) {
      throw new Error("Unauthorized to cancel this payout.");
    }
  }

  const { data, error } = await supabaseAdmin.rpc("cancel_payout", {
    p_payout_id: payoutId,
    p_cancelled_by: user.id,
  });

  if (error) {
    throw new Error(`Failed to cancel payout: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    payoutId: row.payout_id,
    status: row.status,
  };
}

// ── Admin Payout Queue Services ──────────────────────────────────────────────

/**
 * Admin: Lists all payout requests across all recipients with status filter support.
 */
export async function getAdminPayoutQueue(
  statusFilter?: string
): Promise<AdminPayoutQueueItem[]> {
  const user = await getCurrentUser();
  const admin = await isAdmin();
  if (!user || !admin) throw new Error("Unauthorized: Admin access required.");

  const supabaseAdmin = createSupabaseAdmin();
  let query = supabaseAdmin
    .from("payouts")
    .select("id, recipient_id, amount, currency, status, destination_type, destination_reference, external_payout_id, failure_reason, requested_by, processed_by, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: payouts, error } = await query;
  if (error) throw new Error(`Failed to fetch payout queue: ${error.message}`);

  if (!payouts || payouts.length === 0) return [];

  const recipientIds = Array.from(new Set(payouts.map((p) => p.recipient_id)));
  const userIds = Array.from(
    new Set(
      payouts
        .flatMap((p) => [p.requested_by, p.processed_by])
        .filter((id): id is string => Boolean(id))
    )
  );

  const [recipientsRes, usersRes] = await Promise.all([
    supabaseAdmin.from("recipients").select("id, recipient_type, user_id, organizer_id, business_id").in("id", recipientIds),
    userIds.length > 0 ? supabaseAdmin.auth.admin.listUsers() : { data: { users: [] } },
  ]);

  const recipientMap = new Map((recipientsRes.data ?? []).map((r) => [r.id, r]));
  const userEmailMap = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email || null]));

  const orgIds = Array.from(new Set((recipientsRes.data ?? []).map((r) => r.organizer_id).filter((id): id is string => Boolean(id))));
  const bizIds = Array.from(new Set((recipientsRes.data ?? []).map((r) => r.business_id).filter((id): id is string => Boolean(id))));

  const [orgsRes, bizRes] = await Promise.all([
    orgIds.length > 0 ? supabaseAdmin.from("organizers").select("id, name").in("id", orgIds) : { data: [] },
    bizIds.length > 0 ? supabaseAdmin.from("businesses").select("id, name").in("id", bizIds) : { data: [] },
  ]);

  const orgMap = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name]));
  const bizMap = new Map((bizRes.data ?? []).map((b) => [b.id, b.name]));

  return payouts.map((p) => {
    const r = recipientMap.get(p.recipient_id);
    let recipientName = "Unknown Recipient";
    let recipientType: RecipientType = "user";

    if (r) {
      recipientType = r.recipient_type as RecipientType;
      if (r.recipient_type === "user" && r.user_id) {
        recipientName = userEmailMap.get(r.user_id) || `User (${r.user_id.slice(0, 8)})`;
      } else if (r.recipient_type === "organizer" && r.organizer_id) {
        recipientName = orgMap.get(r.organizer_id) || `Organizer (${r.organizer_id.slice(0, 8)})`;
      } else if (r.recipient_type === "business" && r.business_id) {
        recipientName = bizMap.get(r.business_id) || `Business (${r.business_id.slice(0, 8)})`;
      }
    }

    return {
      id: p.id,
      recipientId: p.recipient_id,
      recipientName,
      recipientType,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status as PayoutStatus,
      destinationType: p.destination_type as DestinationType,
      destinationReference: p.destination_reference,
      externalPayoutId: p.external_payout_id,
      failureReason: p.failure_reason,
      requestedByEmail: p.requested_by ? userEmailMap.get(p.requested_by) || null : null,
      processedByEmail: p.processed_by ? userEmailMap.get(p.processed_by) || null : null,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  });
}

/** Admin: Transitions payout status requested → processing. */
export async function transitionPayoutProcessing(
  payoutId: string
): Promise<{ payoutId: string; status: string }> {
  const user = await getCurrentUser();
  const admin = await isAdmin();
  if (!user || !admin) throw new Error("Unauthorized: Admin access required.");

  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("transition_payout_processing", {
    p_payout_id: payoutId,
    p_processed_by: user.id,
  });

  if (error) throw new Error(`Failed to transition payout to processing: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { payoutId: row.payout_id, status: row.status };
}

/** Admin: Completes payout with external rail reference ID. */
export async function completePayout(
  payoutId: string,
  externalPayoutId: string
): Promise<{ payoutId: string; status: string }> {
  const user = await getCurrentUser();
  const admin = await isAdmin();
  if (!user || !admin) throw new Error("Unauthorized: Admin access required.");

  if (!externalPayoutId || !externalPayoutId.trim()) {
    throw new Error("External payout reference ID is required to complete payout.");
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("complete_payout", {
    p_payout_id: payoutId,
    p_external_payout_id: externalPayoutId.trim(),
    p_processed_by: user.id,
  });

  if (error) throw new Error(`Failed to complete payout: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { payoutId: row.payout_id, status: row.status };
}

/** Admin: Fails payout and triggers database compensating credit adjustment. */
export async function failPayout(
  payoutId: string,
  failureReason: string
): Promise<{ payoutId: string; status: string }> {
  const user = await getCurrentUser();
  const admin = await isAdmin();
  if (!user || !admin) throw new Error("Unauthorized: Admin access required.");

  if (!failureReason || !failureReason.trim()) {
    throw new Error("Failure reason is required when marking payout failed.");
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("fail_payout", {
    p_payout_id: payoutId,
    p_failure_reason: failureReason.trim(),
    p_processed_by: user.id,
  });

  if (error) throw new Error(`Failed to mark payout failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { payoutId: row.payout_id, status: row.status };
}
