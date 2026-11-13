import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkTenantAccess } from "@/lib/entity-auth";
import type { EntityRole } from "@/lib/entity-auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import { resolveScannedCode, logRejection } from "@/lib/scan-codes/resolve";
import type { Actor, ScanDoneResult, ScanErrorCode, ScanResult } from "./types";
import { ORDER_SCAN_COLUMNS, parseOrderRow } from "./orders";
import { runOrderScanAction } from "./orders";
import { runReservationScanAction } from "./reservations";
import { checkRateLimitFailClosed } from "@/lib/rate-limit";
import type { ScannerScope } from "@/lib/offline-scanner-token";

const ADMIN_ROLES: EntityRole[] = ["owner", "admin", "manager"];

function enforceTokenScope(
  tokenScope: ScannerScope | null,
  resolved: { tenantId: string; businessId: string | null; branchId: string | null },
  requestId: string,
): { ok: true } | { ok: false; failure: "not_found" } {
  if (!tokenScope) return { ok: true };
  if (tokenScope.tenant_id !== undefined && tokenScope.tenant_id !== resolved.tenantId) {
    logRejection(requestId, "scope_mismatch", { expected: tokenScope.tenant_id, actual: resolved.tenantId });
    return { ok: false, failure: "not_found" };
  }
  if (tokenScope.business_id !== undefined && tokenScope.business_id !== resolved.businessId) {
    logRejection(requestId, "scope_mismatch", { expected: tokenScope.business_id, actual: resolved.businessId });
    return { ok: false, failure: "not_found" };
  }
  if (tokenScope.branch_id !== undefined && tokenScope.branch_id !== resolved.branchId) {
    logRejection(requestId, "scope_mismatch", { expected: tokenScope.branch_id, actual: resolved.branchId });
    return { ok: false, failure: "not_found" };
  }
  return { ok: true };
}

function enforceActorBusinessMatch(
  actor: Actor,
  resolvedBusinessId: string | null,
  requestId: string,
): { ok: true } | { ok: false; failure: "not_found" } {
  if (actor.kind !== "worker") return { ok: true };
  if (actor.businessId && resolvedBusinessId && actor.businessId !== resolvedBusinessId) {
    logRejection(requestId, "not_found", { expectedBusiness: actor.businessId, actualBusiness: resolvedBusinessId });
    return { ok: false, failure: "not_found" };
  }
  return { ok: true };
}

// Tokens (v2 scanner Bearer) are designed in Phase 4.

interface AuthContextUser {
  kind: "user";
  userId: string;
}

interface AuthContextWorker {
  kind: "worker";
  workerId: string;
  businessId: string;
  workerName: string;
  tokenScope: ScannerScope;
}

type AuthContext = AuthContextUser | AuthContextWorker;

export async function runScanAction({
  admin,
  code,
  action,
  clientScanId,
  deviceId,
  cashCollected,
  clientScannedAt,
  requestId,
  authContext,
}: {
  admin: ReturnType<typeof createSupabaseAdmin>;
  code: string;
  action: "pick_up" | "deliver" | "seat" | "no_show" | "refund";
  clientScanId?: string | null;
  deviceId?: string | null;
  cashCollected?: boolean;
  clientScannedAt?: string | null;
  requestId: string;
  authContext?: AuthContext;
}): Promise<ScanResult> {
  let actor: Actor;
  let rateLimitKey: string;
  let tokenScope: ScannerScope | null;
  let actorRole: string | null;

  if (authContext) {
    // Token-based auth (worker or user token) — session auth is skipped.
    actor = authContext;
    rateLimitKey = authContext.kind === "worker" ? `worker:${authContext.workerId}` : `user:${authContext.userId}`;
    tokenScope = authContext.kind === "worker" ? authContext.tokenScope : null;
    actorRole = authContext.kind === "worker" ? "courier" : null;
  } else {
    // (a) Session auth: createSupabaseServer is async, await it.
    let supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
    try {
      supabase = await createSupabaseServer();
    } catch {
      return { kind: "failure", failure: "unavailable" };
    }
    if (!supabase || !supabase.auth) {
      return { kind: "failure", failure: "unavailable" };
    }

    // (a2) getUser wrapped in try/catch.
    let userId: string;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        logRejection(requestId, "unauthorized");
        return { kind: "failure", failure: "unauthorized" };
      }
      userId = data.user.id;
    } catch {
      return { kind: "failure", failure: "unavailable" };
    }

    actor = { kind: "user", userId };
    rateLimitKey = `user:${userId}`;
    tokenScope = null;
    actorRole = null;
  }

  // Fix 1: Worker actors may only perform pick_up and deliver.
  // Reject seat, no_show, refund, and any other action before any DB writes
  // or side effects (code resolution, begin_scan_event, order mutation).
  if (actor.kind === "worker" && action !== "pick_up" && action !== "deliver") {
    logRejection(requestId, "action_not_supported", { actorKind: actor.kind, action });
    return { kind: "failure", failure: "not_found" };
  }

  // (b) Per-user/per-worker rate limit.
  const limit = await checkRateLimitFailClosed("userScanAction", rateLimitKey);
  if (!limit.allowed) {
    logRejection(requestId, "rate_limited", { retryAfter: limit.retryAfter });
    return { kind: "failure", failure: "rate_limited", retryAfter: limit.retryAfter };
  }

  // (c) Resolve the code.
  const resolved = await resolveScannedCode(admin, code, {
    principal: undefined,
    requestId,
  });

  // (d) Non-subject kinds -> not_found (byte-identical 404 bodies, reason logged server-side only).
  if (resolved.kind !== "subject") {
    logRejection(requestId, "not_found", { kind: resolved.kind });
    return { kind: "failure", failure: "not_found" };
  }

  // (e) Scope enforcement: compare token scope against resolved subject.
  // Fail closed on missing or mismatched scoped values.
  //
  // Note on event_id: V2 tokens require scope.event_id, but LookedUpScanCode
  // (lib/scan-codes/issue.ts) does not return event_id for order/reservation
  // subjects — those entities are business-scoped, not event-scoped. There is
  // no genuine event association to compare against at the scan-code level,
  // so event_id is not enforced here. This preserves backward compatibility
  // with existing event ticket scanner tokens (which use event_id in their
  // own scope path) while allowing business-scoped worker tokens to operate
  // on orders/reservations within their tenant/business/branch.
  const scopeCheck = enforceTokenScope(tokenScope, { tenantId: resolved.tenantId, businessId: resolved.businessId, branchId: resolved.branchId }, requestId);
  if (!scopeCheck.ok) {
    return { kind: "failure", failure: scopeCheck.failure };
  }

  const tenantId = resolved.tenantId;

  // (f) Tenant access check for user actors -> not_found on denial.
  if (actor.kind === "user") {
    const access = await checkTenantAccess(actor.userId, tenantId, ADMIN_ROLES);
    if (!access.hasAccess) {
      logRejection(requestId, "not_found", { tenantId });
      return { kind: "failure", failure: "not_found" };
    }
  }

  // For worker actors, verify business association matches the scanned subject.
  const workerBusinessCheck = enforceActorBusinessMatch(actor, resolved.businessId, requestId);
  if (!workerBusinessCheck.ok) {
    return { kind: "failure", failure: workerBusinessCheck.failure };
  }

  const codeType = resolved.codeType;
  const subjectId = resolved.subjectId;
  const branchId = resolved.branchId ?? null;

  // (g) begin_scan_event. p_scan_code_id stays null — known gap, to be wired in Phase 4.
  // out_id and out_scan_event_id both equal scan_events.id per migration lines 405-445.
  // p_source is always "online" (offline_sync comes in Phase 6).
  const source = "online";

  const actorKind = actor.kind;
  const actorUserId = actor.kind === "user" ? actor.userId : null;
  const actorWorkerId = actor.kind === "worker" ? actor.workerId : null;

  let beginResult: { out_id: string; out_is_replay: boolean; out_outcome: string; out_reason: string | null; out_from_status: string | null; out_to_status: string | null; out_scan_event_id: string } | null = null;

  try {
    const { data: beginData, error: beginError } = await admin.rpc("begin_scan_event", {
      p_tenant_id: tenantId,
      p_business_id: resolved.businessId ?? null,
      p_branch_id: branchId,
      p_code_type: codeType,
      p_subject_id: subjectId,
      p_scan_code_id: null,
      p_action: action,
      p_actor_kind: actorKind,
      p_actor_user_id: actorUserId,
      p_actor_worker_id: actorWorkerId,
      p_actor_role: actorRole,
      p_client_scan_id: clientScanId ?? null,
      p_device_id: deviceId ?? null,
      p_source: source,
      p_client_scanned_at: clientScannedAt ?? null,
    });

    if (beginError) {
      const msg = beginError.message ?? "";
      if (msg.includes("CLIENT_SCAN_ID_REUSED")) {
        logRejection(requestId, "client_scan_id_reused", { codeType, action });
        return { kind: "failure", failure: "conflict" };
      }
      logRejection(requestId, "begin_scan_event_error", { error: "db_error" });
      return { kind: "failure", failure: "unavailable" };
    }

    beginResult = beginData?.[0] ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("CLIENT_SCAN_ID_REUSED")) {
      logRejection(requestId, "client_scan_id_reused", { codeType, action });
      return { kind: "failure", failure: "conflict" };
    }
    logRejection(requestId, "begin_scan_event_exception", { error: "db_error" });
    return { kind: "failure", failure: "unavailable" };
  }

  if (!beginResult) {
    logRejection(requestId, "begin_scan_event_no_result");
    return { kind: "failure", failure: "unavailable" };
  }

  const scanEventId = beginResult.out_scan_event_id;

  // Replay of a finalized event: return stored outcome/reason/from/to with real event id.
  if (beginResult.out_is_replay && beginResult.out_outcome !== "pending") {
    return {
      kind: "done",
      outcome: beginResult.out_outcome as ScanDoneResult["outcome"],
      codeType,
      action,
      fromStatus: beginResult.out_from_status ?? null,
      toStatus: beginResult.out_to_status ?? null,
      eventId: scanEventId,
      reason: beginResult.out_reason ?? null,
      paymentStatus: null,
    };
  }

  // Replay of a still-pending event re-runs the action below.

  // Execute the action.
  let outcome: string;
  let fromStatus: string | null;
  let toStatus: string | null;
  let reason: ScanErrorCode | null;
  let paymentStatus: string | null;

  if (codeType === "reservation") {
    const res = await runReservationScanAction({
      admin,
      actor,
      reservationId: subjectId,
      tenantId,
      action: action as "seat" | "no_show",
      scanEventId,
    });

    // Unavailable from RPC: do not finalize, return failure.
    if (res.outcome === "error" || !res.shouldFinalize) {
      return { kind: "failure", failure: "unavailable" };
    }

    outcome = res.outcome;
    fromStatus = res.fromStatus ?? null;
    toStatus = res.toStatus ?? null;
    reason = res.reason;
    paymentStatus = res.paymentStatus ?? null;

    // Finalize whenever event_finalized !== true (includes not_found and already_done).
    if (res.eventFinalized !== true) {
      await finalizeEvent(admin, scanEventId, {
        outcome: res.outcome,
        reason: res.reason ?? null,
        from: res.fromStatus ?? null,
        to: res.toStatus ?? null,
        meta: { codeType, action },
        requestId,
        scanEventId,
      });
    }
  } else {
    // codeType === "order"
    const { data: orderData, error: orderError } = await admin
      .from("orders")
      .select(ORDER_SCAN_COLUMNS.join(","))
      .eq("id", subjectId)
      .eq("organizer_id", tenantId)
      .maybeSingle();

    // A1: orderError -> return unavailable WITHOUT finalizing.
    if (orderError) {
      logRejection(requestId, "order_read_error", { error: "db_error" });
      return { kind: "failure", failure: "unavailable" };
    }

    // A1: Only !orderError && !orderData -> finalize rejected/not_found.
    if (!orderData) {
      await finalizeEvent(admin, scanEventId, {
        outcome: "rejected",
        reason: "not_found",
        from: null,
        to: null,
        meta: { codeType, action },
        requestId,
        scanEventId,
      });
      return {
        kind: "done",
        outcome: "rejected",
        codeType,
        action,
        fromStatus: null,
        toStatus: null,
        eventId: scanEventId,
        reason: "not_found",
        paymentStatus: null,
      };
    }

    const order = parseOrderRow(orderData);
    if (!order) {
      logRejection(requestId, "order_row_malformed");
      return { kind: "failure", failure: "unavailable" };
    }

    // Business mismatch guard.
    const resolvedBusinessId = resolved.businessId ?? null;
    if (resolvedBusinessId && order.business_id && resolvedBusinessId !== order.business_id) {
      await finalizeEvent(admin, scanEventId, {
        outcome: "rejected",
        reason: "not_found",
        from: null,
        to: null,
        meta: { codeType, action },
        requestId,
        scanEventId,
      });
      return {
        kind: "done",
        outcome: "rejected",
        codeType,
        action,
        fromStatus: null,
        toStatus: null,
        eventId: scanEventId,
        reason: "not_found",
        paymentStatus: null,
      };
    }

    const ordResult = await runOrderScanAction({
      admin,
      actor,
      order,
      organizerId: tenantId,
      expectedBusinessId: resolvedBusinessId,
      action,
      cashCollected: cashCollected ?? false,
      scanEventId,
    });

    // Core errors that map to "error" must not finalize — leave event pending for retry.
    if (ordResult.outcome === "error") {
      return { kind: "failure", failure: "unavailable" };
    }

    outcome = ordResult.outcome;
    fromStatus = ordResult.fromStatus ?? null;
    toStatus = ordResult.toStatus ?? null;
    reason = ordResult.reason;
    paymentStatus = ordResult.paymentStatus ?? null;
  }

  // Finalize for orders (reservations already finalized above).
  if (codeType !== "reservation") {
    await finalizeEvent(admin, scanEventId, {
      outcome,
      reason: reason ?? null,
      from: fromStatus ?? null,
      to: toStatus ?? null,
      meta: { codeType, action },
      requestId,
      scanEventId,
    });
  }

  return {
    kind: "done",
    outcome: outcome as ScanDoneResult["outcome"],
    codeType,
    action,
    fromStatus,
    toStatus: toStatus === null ? null : toStatus,
    eventId: scanEventId,
    reason: reason ?? null,
    paymentStatus,
  };
}

async function finalizeEvent(
  admin: ReturnType<typeof createSupabaseAdmin>,
  id: string,
  params: {
    outcome: string;
    reason: string | null;
    from: string | null;
    to: string | null;
    meta: { codeType: string; action: string };
    requestId: string;
    scanEventId: string;
  },
): Promise<void> {
  const { error: finError } = await admin.rpc("finalize_scan_event", {
    p_id: id,
    p_outcome: params.outcome,
    p_reason: params.reason,
    p_from_status: params.from,
    p_to_status: params.to,
    p_meta: params.meta,
  });
  if (finError) {
    console.error(JSON.stringify({
      event: "scan_action_finalize_error",
      requestId: params.requestId,
      scanEventId: params.scanEventId,
      error: "db_error",
    }));
  }
}
