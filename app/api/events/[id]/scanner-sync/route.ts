import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { verifyScannerToken } from "@/lib/offline-scanner-token";
import {
  eventStaffSessionCookieName,
  hashEventStaffSessionToken,
  validateEventStaffSession,
  validateEventStaffSessionHash,
} from "@/lib/staff/guest-session";
import { recordRejectedTicketScan, type TicketScanRejectionReason } from "@/lib/staff/scan-attempts";

interface PendingScanItem {
  scan_id: string;
  ticket_instance_id: string;
  order_id?: string | null;
  qr_code: string;
  scanned_at: string;
  delegating_user_id?: string | null;
  current_user_id?: string | null;
  entrance_id?: string | null;
  device_id?: string | null;
}

function offlineScanIdForDatabase(value: string, eventId: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value.toLowerCase();
  }
  const bytes = createHash("sha256").update(`${eventId}:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = randomUUID();
  let stage = "authenticate";
  try {
    const { id: eventId } = await params;
    const admin = createSupabaseAdmin();

    const body = await req.json().catch(() => ({}));
    const rawScans: PendingScanItem[] = Array.isArray(body.scans) ? body.scans : [];
    const clientToken = body.token || null;

    let delegatingUserId: string | null = null;
    let requestUserId: string | null = null;
    let staffMemberId: string | null = null;
    let sessionHash: string | null = null;
    let entranceId: string | null = null;
    let isAuthorized = false;

    // 1. Authenticate via Bearer header or body.token (8-hour signed scanner token)
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
    const tokenToVerify = bearerToken || clientToken;

    if (tokenToVerify) {
      const verified = verifyScannerToken(tokenToVerify, eventId);
      if (verified.valid && verified.payload) {
        if (verified.payload.userId) {
          const canScan = await hasEventOrOrganizerAccess(
            verified.payload.userId,
            eventId,
            ["event_manager", "ticket_scanner"]
          );
          if (canScan) {
            delegatingUserId = verified.payload.userId;
            entranceId = verified.payload.entranceId || null;
            isAuthorized = true;
          }
        } else if (verified.payload.staffMemberId && verified.payload.sessionHash) {
          const guest = await validateEventStaffSessionHash(eventId, verified.payload.sessionHash);
          if (guest && guest.staffMemberId === verified.payload.staffMemberId) {
            staffMemberId = guest.staffMemberId;
            sessionHash = verified.payload.sessionHash;
            entranceId = guest.entranceId;
            isAuthorized = true;
          }
        }
      }
    }

    // 2. Fallback to Supabase server session auth
    if (!isAuthorized) {
      const supabase = await createSupabaseServer();
      const { data: serverAuth } = await supabase.auth.getUser();
      if (serverAuth?.user) {
        requestUserId = serverAuth.user.id;
        const canManage = await hasEventOrOrganizerAccess(
          serverAuth.user.id,
          eventId,
          ["event_manager", "ticket_scanner"]
        );
        if (canManage) {
          isAuthorized = true;
          delegatingUserId = serverAuth.user.id;
          requestUserId = serverAuth.user.id;
        }
      }
    }

    const persistRejection = async (
      scan: PendingScanItem,
      reason: TicketScanRejectionReason,
      options?: { ticketInstanceId?: string | null; offlineScanId?: string | null; attemptedAt?: string },
    ) => {
      const scanIdIsValid = typeof scan.scan_id === "string" && !!scan.scan_id.trim() && scan.scan_id.length <= 200;
      const databaseScanId = options?.offlineScanId === null
        ? null
        : options?.offlineScanId || (scanIdIsValid ? offlineScanIdForDatabase(scan.scan_id, eventId) : null);
      const result = await recordRejectedTicketScan(admin, {
        eventId,
        staffMemberId,
        scannedByUserId: staffMemberId ? null : requestUserId || delegatingUserId,
        delegatingUserId: staffMemberId ? null : delegatingUserId,
        ticketInstanceId: options?.ticketInstanceId ?? null,
        entranceId,
        deviceId: typeof scan.device_id === "string" ? scan.device_id.slice(0, 120) : null,
        scanSource: "offline_sync",
        offlineScanId: databaseScanId,
        reason,
        attemptedAt: options?.attemptedAt,
      }, requestId);
      return result;
    };

    const auditUnavailable = () => NextResponse.json(
      { error: "Offline scan activity could not be recorded. Retry synchronization.", requestId },
      { status: 503, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } },
    );

    const databaseUnavailable = (failedStage: string, errorCode?: string) => {
      console.error("[scanner-sync]", {
        requestId,
        stage: failedStage,
        errorCode: typeof errorCode === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(errorCode)
          ? errorCode
          : "UNKNOWN",
      });
      return NextResponse.json(
        { error: "Offline scans could not be synchronized safely. Retry synchronization.", requestId },
        { status: 503, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } },
      );
    };

    if (!isAuthorized) {
      const guestToken = req.cookies.get(eventStaffSessionCookieName(eventId))?.value;
      if (guestToken) {
        const guest = await validateEventStaffSession(eventId, guestToken);
        if (guest) {
          staffMemberId = guest.staffMemberId;
          sessionHash = hashEventStaffSessionToken(guestToken);
          entranceId = guest.entranceId;
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Staff session is missing, expired, or revoked.", status: "expired_session" },
        { status: 401 }
      );
    }

    if (rawScans.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        synced: 0,
        conflicts: 0,
        failed: 0,
        results: [],
      });
    }

    // Sort scans by scanned_at ascending so earliest scans are processed first (First-Timestamp-Wins)
    const sortedScans = [...rawScans].sort(
      (a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime()
    );

    const results: Array<{
      scan_id: string;
      status: "synced" | "conflict" | "failed";
      action?: string;
      reason?: string;
      error?: string;
    }> = [];

    let countSynced = 0;
    let countConflicts = 0;
    let countFailed = 0;

    stage = "process_scans";
    for (const scan of sortedScans) {
      if (typeof scan.scan_id !== "string" || !scan.scan_id.trim() || scan.scan_id.length > 200) {
        if (!(await persistRejection(scan, "invalid_scan", { offlineScanId: null }))) return auditUnavailable();
        results.push({ scan_id: "", status: "failed", error: "INVALID_SCAN_ID" });
        countFailed++;
        continue;
      }
      const databaseScanId = offlineScanIdForDatabase(scan.scan_id, eventId);
      const scannedAtMs = typeof scan.scanned_at === "string" ? Date.parse(scan.scanned_at) : NaN;
      if (!Number.isFinite(scannedAtMs) || Math.abs(Date.now() - scannedAtMs) > 48 * 60 * 60 * 1000) {
        if (!(await persistRejection(scan, "invalid_timestamp", { attemptedAt: new Date().toISOString() }))) return auditUnavailable();
        results.push({ scan_id: scan.scan_id, status: "failed", error: "INVALID_SCAN_TIMESTAMP" });
        countFailed++;
        continue;
      }
      const databaseDeviceId = typeof scan.device_id === "string" ? scan.device_id.slice(0, 120) : null;
      // 1. Idempotency Check: if this offline_scan_id already exists in ticket_checkins
      const { data: existingCheckinByScanId, error: checkinByScanIdError } = await admin
        .from("ticket_checkins")
        .select("id, event_id, ticket_instance_id")
        .eq("offline_scan_id", databaseScanId)
        .maybeSingle();
      if (checkinByScanIdError) return databaseUnavailable("idempotency_check", checkinByScanIdError.code);

      if (existingCheckinByScanId?.event_id === eventId) {
        if (!scan.ticket_instance_id || existingCheckinByScanId.ticket_instance_id !== scan.ticket_instance_id) {
          if (!(await persistRejection(scan, "scan_id_reused", { offlineScanId: null }))) return auditUnavailable();
          results.push({ scan_id: scan.scan_id, status: "failed", error: "SCAN_ID_REUSED" });
          countFailed++;
          continue;
        }
        results.push({
          scan_id: scan.scan_id,
          status: "synced",
          action: "idempotent_noop",
        });
        countSynced++;
        continue;
      }
      if (existingCheckinByScanId && existingCheckinByScanId.event_id !== eventId) {
        if (!(await persistRejection(scan, "scan_id_reused", { offlineScanId: null }))) return auditUnavailable();
        results.push({ scan_id: scan.scan_id, status: "failed", error: "SCAN_ID_REUSED" });
        countFailed++;
        continue;
      }

      // 2. Check if conflict was already recorded for this scan_id
      try {
        const { data: existingConflict, error: existingConflictError } = await admin
          .from("offline_scan_conflicts")
          .select("id, event_id, conflict_reason")
          .eq("offline_scan_id", databaseScanId)
          .maybeSingle();
        if (existingConflictError) return databaseUnavailable("conflict_lookup", existingConflictError.code);

        if (existingConflict) {
          if (existingConflict.event_id !== eventId) {
            if (!(await persistRejection(scan, "scan_id_reused", { offlineScanId: null }))) return auditUnavailable();
            results.push({ scan_id: scan.scan_id, status: "failed", error: "SCAN_ID_REUSED" });
            countFailed++;
            continue;
          }
          const reason = existingConflict.conflict_reason === "ticket_cancelled"
            ? "ticket_cancelled"
            : existingConflict.conflict_reason === "ticket_refunded"
              ? "ticket_refunded"
              : existingConflict.conflict_reason === "wrong_event"
                ? "wrong_event"
                : existingConflict.conflict_reason === "ticket_not_found"
                  ? "ticket_not_found"
                  : existingConflict.conflict_reason === "ticket_not_valid"
                    ? "ticket_not_valid"
                    : "already_checked_in";
          if (!(await persistRejection(scan, reason, {
            ticketInstanceId: scan.ticket_instance_id || null,
            attemptedAt: scan.scanned_at,
          }))) return auditUnavailable();
          results.push({
            scan_id: scan.scan_id,
            status: "conflict",
            reason: existingConflict.conflict_reason,
          });
          countConflicts++;
          continue;
        }
      } catch {
        return databaseUnavailable("conflict_lookup");
      }

      // 3. Find ticket instance
      let ticketInstance: any = null;
      if (scan.ticket_instance_id) {
        const { data: inst, error: instanceError } = await admin
          .from("ticket_instances")
          .select("id, event_id, order_id, status, checked_in_at")
          .eq("id", scan.ticket_instance_id)
          .maybeSingle();
        if (instanceError) return databaseUnavailable("ticket_instance_lookup", instanceError.code);
        ticketInstance = inst;
      }

      if (!ticketInstance && scan.qr_code) {
        const cleanCode = scan.qr_code.trim().toUpperCase();
        const { data: inst, error: codeLookupError } = await admin
          .from("ticket_instances")
          .select("id, event_id, order_id, status, checked_in_at")
          .eq("qr_code", cleanCode)
          .maybeSingle();
        if (codeLookupError) return databaseUnavailable("ticket_code_lookup", codeLookupError.code);
        ticketInstance = inst;
      }

      if (!ticketInstance) {
        if (!(await persistRejection(scan, "ticket_not_found", { attemptedAt: new Date(scannedAtMs).toISOString() }))) return auditUnavailable();
        results.push({
          scan_id: scan.scan_id,
          status: "failed",
          error: "TICKET_NOT_FOUND",
        });
        countFailed++;
        continue;
      }

      if (ticketInstance.event_id !== eventId) {
        if (!(await persistRejection(scan, "wrong_event", { attemptedAt: new Date(scannedAtMs).toISOString() }))) return auditUnavailable();
        results.push({
          scan_id: scan.scan_id,
          status: "failed",
          error: "WRONG_EVENT",
        });
        countFailed++;
        continue;
      }

      // 4. If ticket is currently 'valid' -> Attempt atomic transition to 'used'
      if (ticketInstance.status === "valid") {
        const { error: atomicError } = await admin.rpc("check_in_ticket", {
          p_ticket_instance_id: ticketInstance.id,
          p_event_id: eventId,
          p_scanned_by_user_id: staffMemberId ? null : requestUserId,
          p_delegating_user_id: staffMemberId ? null : delegatingUserId,
          p_staff_member_id: staffMemberId,
          p_session_token_hash: staffMemberId ? sessionHash : null,
          p_scan_source: "offline_sync",
          p_offline_scan_id: databaseScanId,
          p_scanned_at: new Date(scannedAtMs).toISOString(),
          p_device_id: databaseDeviceId,
          p_entrance_id: entranceId,
        });

        if (!atomicError) {
          results.push({ scan_id: scan.scan_id, status: "synced", action: "accepted" });
          countSynced++;
          continue;
        }

        const atomicMessage = atomicError.message || "CHECK_IN_FAILED";
        if (atomicMessage.includes("STAFF_SESSION_INVALID")) {
          return NextResponse.json(
            { error: "Staff access has expired or was revoked.", status: "expired_session" },
            { status: 401, headers: { "Cache-Control": "no-store, private" } }
          );
        }
        if (atomicMessage.includes("SCANNER_PERMISSION_DENIED")) {
          return NextResponse.json({ error: "Scanner permission was revoked." }, { status: 403 });
        }
        const expectedConflict = [
          "ALREADY_CHECKED_IN", "TICKET_CANCELLED", "TICKET_REFUNDED",
          "TICKET_NOT_FOUND", "TICKET_NOT_VALID", "WRONG_EVENT",
        ].find((code) => atomicMessage.includes(code));
        if (!expectedConflict) {
          console.error("[scanner-sync]", { requestId, stage, errorCode: atomicError.code || "UNKNOWN" });
          if (!(await persistRejection(scan, "verification_error", {
            ticketInstanceId: ticketInstance.id,
            attemptedAt: new Date(scannedAtMs).toISOString(),
          }))) return auditUnavailable();
          return NextResponse.json(
            { error: "Offline scans could not be synchronized safely.", requestId },
            { status: 503, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } }
          );
        }

        if (expectedConflict === "ALREADY_CHECKED_IN") {
          const { data: winningCheckin, error: winningCheckinError } = await admin
            .from("ticket_checkins")
            .select("id, checked_in_at, offline_scanned_at")
            .eq("ticket_instance_id", ticketInstance.id)
            .maybeSingle();
          if (winningCheckinError) return databaseUnavailable("winning_checkin_lookup", winningCheckinError.code);
          const winningTime = winningCheckin?.offline_scanned_at || winningCheckin?.checked_in_at;
          const isEarlier = winningTime && scannedAtMs < Date.parse(winningTime);
          const { error: conflictInsertError } = await admin.from("offline_scan_conflicts").insert({
            event_id: eventId,
            ticket_instance_id: ticketInstance.id,
            ticket_order_id: ticketInstance.order_id || null,
            offline_scan_id: databaseScanId,
            device_id: databaseDeviceId,
            entrance_id: entranceId,
            delegating_user_id: staffMemberId ? null : delegatingUserId,
            scanned_by_user_id: staffMemberId ? null : requestUserId,
            scanned_by_staff_member_id: staffMemberId,
            offline_scanned_at: new Date(scannedAtMs).toISOString(),
            conflict_reason: isEarlier ? "duplicate_offline_scan_earlier_timestamp" : "already_checked_in",
            winning_checkin_id: winningCheckin?.id || null,
            raw_payload: { scan_id: scan.scan_id, ticket_instance_id: ticketInstance.id },
          });
          if (conflictInsertError && conflictInsertError.code !== "23505") {
            return databaseUnavailable("conflict_write", conflictInsertError.code);
          }
        }
        const atomicReason: Record<string, TicketScanRejectionReason> = {
          ALREADY_CHECKED_IN: "already_checked_in",
          TICKET_CANCELLED: "ticket_cancelled",
          TICKET_REFUNDED: "ticket_refunded",
          TICKET_NOT_FOUND: "ticket_not_found",
          TICKET_NOT_VALID: "ticket_not_valid",
          WRONG_EVENT: "wrong_event",
        };
        if (!(await persistRejection(scan, atomicReason[expectedConflict] || "offline_conflict", {
          ticketInstanceId: expectedConflict === "WRONG_EVENT" ? null : ticketInstance.id,
          attemptedAt: new Date(scannedAtMs).toISOString(),
        }))) return auditUnavailable();
        results.push({ scan_id: scan.scan_id, status: "conflict", reason: expectedConflict });
        countConflicts++;
        continue;


      }

      // 5. If ticket is already 'used' -> Conflict Resolution (First-Timestamp-Wins)
      if (ticketInstance.status === "used" || ticketInstance.status === "valid") {
        const { data: existingCheckin, error: existingCheckinError } = await admin
          .from("ticket_checkins")
          .select("id, checked_in_at, offline_scanned_at, scanned_by_user_id, scanned_by_staff_member_id, device_id, entrance_id")
          .eq("ticket_instance_id", ticketInstance.id)
          .maybeSingle();
        if (existingCheckinError) return databaseUnavailable("existing_checkin_lookup", existingCheckinError.code);

        const existingTime =
          (existingCheckin as any)?.offline_scanned_at ||
          existingCheckin?.checked_in_at ||
          ticketInstance.checked_in_at ||
          new Date().toISOString();

        const scanTimeMs = scannedAtMs;
        const existingTimeMs = new Date(existingTime).getTime();

        const isEarlierScan = !isNaN(scanTimeMs) && !isNaN(existingTimeMs) && scanTimeMs < existingTimeMs;
        const conflictReason = isEarlierScan
          ? "duplicate_offline_scan_earlier_timestamp"
          : "already_checked_in";

        // Try recording conflict audit entry
        const { error: conflictInsertError } = await admin.from("offline_scan_conflicts").insert({
          event_id: eventId,
          ticket_instance_id: ticketInstance.id,
          ticket_order_id: ticketInstance.order_id || null,
          offline_scan_id: databaseScanId,
          device_id: databaseDeviceId,
          entrance_id: entranceId,
          delegating_user_id: staffMemberId ? null : delegatingUserId,
          scanned_by_user_id: staffMemberId ? null : requestUserId,
          scanned_by_staff_member_id: staffMemberId,
          offline_scanned_at: new Date(scannedAtMs).toISOString(),
          conflict_reason: conflictReason,
          winning_checkin_id: existingCheckin?.id || null,
          raw_payload: { scan_id: scan.scan_id, ticket_instance_id: ticketInstance.id },
        });
        if (conflictInsertError && conflictInsertError.code !== "23505") {
          return databaseUnavailable("conflict_write", conflictInsertError.code);
        }

        if (!(await persistRejection(scan, "already_checked_in", {
          ticketInstanceId: ticketInstance.id,
          attemptedAt: new Date(scannedAtMs).toISOString(),
        }))) return auditUnavailable();

        results.push({
          scan_id: scan.scan_id,
          status: "conflict",
          reason: "ALREADY_CHECKED_IN",
        });
        countConflicts++;
        continue;
      }

      // 6. Handle Cancelled or Refunded Tickets
      if (ticketInstance.status === "cancelled" || ticketInstance.status === "refunded") {
        const { error: conflictInsertError } = await admin.from("offline_scan_conflicts").insert({
          event_id: eventId,
          ticket_instance_id: ticketInstance.id,
          ticket_order_id: ticketInstance.order_id || null,
          offline_scan_id: databaseScanId,
          device_id: databaseDeviceId,
          entrance_id: entranceId,
          delegating_user_id: staffMemberId ? null : delegatingUserId,
          scanned_by_user_id: staffMemberId ? null : requestUserId,
          scanned_by_staff_member_id: staffMemberId,
          offline_scanned_at: new Date(scannedAtMs).toISOString(),
          conflict_reason: `ticket_${ticketInstance.status}`,
          winning_checkin_id: null,
          raw_payload: { scan_id: scan.scan_id, ticket_instance_id: ticketInstance.id },
        });
        if (conflictInsertError && conflictInsertError.code !== "23505") {
          return databaseUnavailable("conflict_write", conflictInsertError.code);
        }

        if (!(await persistRejection(scan, ticketInstance.status === "cancelled" ? "ticket_cancelled" : "ticket_refunded", {
          ticketInstanceId: ticketInstance.id,
          attemptedAt: new Date(scannedAtMs).toISOString(),
        }))) return auditUnavailable();

        results.push({
          scan_id: scan.scan_id,
          status: "conflict",
          reason: ticketInstance.status.toUpperCase(),
        });
        countConflicts++;
        continue;
      }

      // Fallback
      if (!(await persistRejection(scan, "unknown_status", {
        ticketInstanceId: ticketInstance.id,
        attemptedAt: new Date(scannedAtMs).toISOString(),
      }))) return auditUnavailable();
      results.push({
        scan_id: scan.scan_id,
        status: "failed",
        error: "UNKNOWN_STATUS",
      });
      countFailed++;
    }

    return NextResponse.json({
      success: true,
      processed: sortedScans.length,
      synced: countSynced,
      conflicts: countConflicts,
      failed: countFailed,
      results,
    });
  } catch (err: unknown) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    console.error("[events/[id]/scanner-sync]", { requestId, stage, errorName });
    return NextResponse.json(
      { error: "Internal server error syncing offline scans." },
      { status: 500 }
    );
  }
}
