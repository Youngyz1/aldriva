/**
 * Pure handover guard logic (mirrors migration 233 rules) for testable real behavior.
 */

export type DepositStatus =
  | "none"
  | "pending_collection"
  | "collected_offline"
  | "returned_full"
  | "partially_retained"
  | "retained_full";

export type DepositAction = "none" | "return_full" | "retain_partial" | "retain_full";

export function canSettleDeposit(current: DepositStatus): boolean {
  return !(current === "returned_full" || current === "partially_retained" || current === "retained_full");
}

export function applyDepositSettlement(input: {
  currentStatus: DepositStatus;
  collectedAmount: number;
  action: DepositAction;
  retainedAmount?: number;
  reason?: string | null;
}): { ok: true; status: DepositStatus; retainedAmount: number } | { ok: false; code: "DEPOSIT_ALREADY_SETTLED" | "DEPOSIT_REASON_REQUIRED" } {
  if (input.action === "none") {
    return { ok: true, status: input.currentStatus, retainedAmount: input.currentStatus === "partially_retained" || input.currentStatus === "retained_full" ? Math.max(0, input.collectedAmount) : 0 };
  }
  if (!canSettleDeposit(input.currentStatus)) {
    return { ok: false, code: "DEPOSIT_ALREADY_SETTLED" };
  }
  const collected = Math.max(0, Number(input.collectedAmount) || 0);
  if (input.action === "return_full") return { ok: true, status: "returned_full", retainedAmount: 0 };
  if (input.action === "retain_full") {
    if (!input.reason || !String(input.reason).trim()) return { ok: false, code: "DEPOSIT_REASON_REQUIRED" };
    return { ok: true, status: "retained_full", retainedAmount: collected };
  }
  if (input.action === "retain_partial") {
    if (!input.reason || !String(input.reason).trim()) return { ok: false, code: "DEPOSIT_REASON_REQUIRED" };
    const retained = Math.min(collected, Math.max(0, Number(input.retainedAmount) || 0));
    return { ok: true, status: "partially_retained", retainedAmount: retained };
  }
  return { ok: true, status: input.currentStatus, retainedAmount: 0 };
}

/** Double-submit guard model: only one inspection per (booking, kind). */
export class InspectionSubmissionGuard {
  private seen = new Set<string>();
  submit(bookingId: string, kind: "pickup" | "return"): { ok: true } | { ok: false; code: "ALREADY_SUBMITTED" } {
    const key = `${bookingId}:${kind}`;
    if (this.seen.has(key)) return { ok: false, code: "ALREADY_SUBMITTED" };
    this.seen.add(key);
    return { ok: true };
  }
}
