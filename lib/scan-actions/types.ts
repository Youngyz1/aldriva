import type { OrderRowRecord, OrderStatus } from "@/lib/orders/transition-core";

export type ScanAction = "pick_up" | "deliver" | "seat" | "no_show" | "refund";

export type ScanOutcome = "success" | "already_done" | "rejected" | "conflict" | "error";

export type ScanErrorCode =
  | "payment_required"
  | "cash_confirmation_required"
  | "courier_required"
  | "status_changed"
  | "invalid_transition"
  | "fulfilment_not_supported"
  | "action_not_supported"
  | "too_early"
  | "reason_required"
  | "not_found"
  | "client_scan_id_reused";

export interface ActorUser {
  kind: "user";
  userId: string;
}

export interface ActorWorker {
  kind: "worker";
  workerId: string;
  businessId: string;
  workerName: string;
}

export type Actor = ActorUser | ActorWorker;

export interface ScanOrderInput {
  admin: ReturnType<typeof import("@/lib/supabase-admin").createSupabaseAdmin>;
  actor: Actor;
  order: OrderRowRecord;
  organizerId: string;
  expectedBusinessId: string | null;
  action: ScanAction;
  cashCollected: boolean;
  scanEventId: string;
}

export interface ScanOrderResult {
  ok: boolean;
  outcome: ScanOutcome;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  reason: ScanErrorCode | null;
  paymentStatus: string | null;
  shouldFinalize: boolean;
}

export interface ScanReservationResult {
  ok: boolean;
  outcome: ScanOutcome;
  fromStatus: string | null;
  toStatus: string | null;
  reason: ScanErrorCode | null;
  paymentStatus: string | null;
  branchId: string | null;
  eventFinalized: boolean | null;
  shouldFinalize: boolean;
}

export interface ScanDoneResult {
  kind: "done";
  outcome: Extract<ScanOutcome, "success" | "already_done" | "rejected">;
  codeType: "order" | "reservation";
  action: ScanAction;
  fromStatus: string | null;
  toStatus: string | null;
  eventId: string;
  reason: string | null;
  paymentStatus: string | null;
}

export interface ScanFailureResult {
  kind: "failure";
  failure: "unauthorized" | "not_found" | "conflict" | "rate_limited" | "unavailable";
  retryAfter?: number;
}

export type ScanResult = ScanDoneResult | ScanFailureResult;

export interface ScanRouteInput {
  code: string;
  action: ScanAction;
  clientScanId?: string | null;
  clientScannedAt?: string | null;
  deviceId?: string | null;
  cashCollected?: boolean;
}
