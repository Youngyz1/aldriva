import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { Actor, ScanErrorCode, ScanReservationResult } from "./types";

const ALLOWED_REASONS: ReadonlySet<ScanErrorCode> = new Set([
  "not_found",
  "invalid_transition",
  "too_early",
  "reason_required",
  "action_not_supported",
]);

export async function runReservationScanAction({
  admin,
  actor,
  reservationId,
  tenantId,
  action,
  scanEventId,
}: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  actor: Actor;
  reservationId: string;
  tenantId: string;
  action: "seat" | "no_show";
  scanEventId: string;
}): Promise<ScanReservationResult> {
  const p_actor = {
    userId: actor.kind === "user" ? actor.userId : null,
    workerId: null,
    staffMemberId: null,
  };

  const { data, error } = await admin.rpc("scan_reservation_action", {
    p_tenant_id: tenantId,
    p_reservation_id: reservationId,
    p_action: action,
    p_scan_event_id: scanEventId,
    p_actor,
  });

  if (error) {
    return {
      ok: false,
      outcome: "error",
      fromStatus: null,
      toStatus: null,
      reason: null,
      paymentStatus: null,
      branchId: null,
      eventFinalized: null,
      shouldFinalize: false,
    };
  }

  // scan_reservation_action returns json (a single object). Tolerate an array too.
  const r = Array.isArray(data) ? data[0] : data;
  if (!r || typeof r !== "object") {
    return {
      ok: false,
      outcome: "error",
      fromStatus: null,
      toStatus: null,
      reason: null,
      paymentStatus: null,
      branchId: null,
      eventFinalized: null,
      shouldFinalize: false,
    };
  }

  const result = r as {
    outcome: string;
    from_status: string | null;
    to_status: string | null;
    reason: string | null;
    payment_status: string | null;
    branch_id: string | null;
    event_finalized: boolean | null;
  };

  // C2: Check for unknown outcome FIRST, before computing outcome/ok.
  if (!["success", "already_done", "rejected"].includes(result.outcome)) {
    return {
      ok: false,
      outcome: "error",
      fromStatus: null,
      toStatus: null,
      reason: null,
      paymentStatus: null,
      branchId: null,
      eventFinalized: null,
      shouldFinalize: false,
    };
  }

  const outcome = result.outcome === "success" ? "success" : result.outcome === "already_done" ? "already_done" : "rejected";
  const ok = result.outcome === "success" || result.outcome === "already_done";

  // C1: Validate reason against allowed set. Unknown reason string -> error result.
  const rawReason = result.reason ?? null;
  if (rawReason !== null && !ALLOWED_REASONS.has(rawReason as ScanErrorCode)) {
    return {
      ok: false,
      outcome: "error",
      fromStatus: null,
      toStatus: null,
      reason: null,
      paymentStatus: null,
      branchId: null,
      eventFinalized: null,
      shouldFinalize: false,
    };
  }

  const reason: ScanErrorCode | null = rawReason as ScanErrorCode | null;

  return {
    ok,
    outcome,
    fromStatus: result.from_status ?? null,
    toStatus: result.to_status ?? null,
    reason,
    paymentStatus: result.payment_status ?? null,
    branchId: result.branch_id ?? null,
    eventFinalized: result.event_finalized ?? null,
    shouldFinalize: true,
  };
}
