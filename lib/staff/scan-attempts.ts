import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const TICKET_SCAN_REJECTION_REASONS = [
  "already_checked_in",
  "ticket_not_found",
  "wrong_event",
  "ticket_cancelled",
  "ticket_refunded",
  "ticket_not_valid",
  "ticket_ineligible",
  "unauthorized_entrance",
  "verification_error",
  "unsupported_code",
  "offline_conflict",
  "invalid_scan",
  "invalid_timestamp",
  "scan_id_reused",
  "unknown_status",
] as const;

export type TicketScanRejectionReason = (typeof TICKET_SCAN_REJECTION_REASONS)[number];

export type RejectedTicketScan = {
  eventId: string;
  staffMemberId: string | null;
  scannedByUserId: string | null;
  delegatingUserId?: string | null;
  ticketInstanceId?: string | null;
  entranceId?: string | null;
  deviceId?: string | null;
  scanSource: "online" | "offline_sync";
  offlineScanId?: string | null;
  reason: TicketScanRejectionReason;
  attemptedAt?: string;
};

/**
 * Store only rejected attempts. A successful admission is already represented
 * by its authoritative ticket_checkins row, so this never duplicates it.
 */
export async function recordRejectedTicketScan(
  admin: SupabaseClient,
  attempt: RejectedTicketScan,
  requestId: string,
): Promise<boolean> {
  const { error } = await admin.from("event_ticket_scan_attempts").insert({
    event_id: attempt.eventId,
    staff_member_id: attempt.staffMemberId,
    scanned_by_user_id: attempt.scannedByUserId,
    delegating_user_id: attempt.delegatingUserId ?? null,
    ticket_instance_id: attempt.ticketInstanceId ?? null,
    entrance_id: attempt.entranceId ?? null,
    device_id: attempt.deviceId?.slice(0, 120) ?? null,
    scan_source: attempt.scanSource,
    offline_scan_id: attempt.offlineScanId ?? null,
    reason_code: attempt.reason,
    attempted_at: attempt.attemptedAt ?? new Date().toISOString(),
  });

  if (!error) return true;

  if (error.code === "23505" && attempt.offlineScanId) {
    const { data: existing } = await admin
      .from("event_ticket_scan_attempts")
      .select("event_id, staff_member_id, scanned_by_user_id, delegating_user_id")
      .eq("offline_scan_id", attempt.offlineScanId)
      .maybeSingle();
    if (
      existing?.event_id === attempt.eventId &&
      existing?.staff_member_id === attempt.staffMemberId &&
      existing?.scanned_by_user_id === attempt.scannedByUserId &&
      existing?.delegating_user_id === (attempt.delegatingUserId ?? null)
    ) return true;
  }

  // Error codes are useful operationally; database messages can contain row data.
  console.error("[ticket-scan-audit]", {
    requestId,
    stage: "persist_rejected_attempt",
    errorCode: error.code || "UNKNOWN",
  });
  return false;
}
