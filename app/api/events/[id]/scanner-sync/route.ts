import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { resolveScannerPrincipal, type ScannerRequestLike } from "@/lib/scanner/resolve-principal";
import { isMissingEntranceLabelError, isUuid, normalizeEntrance } from "@/lib/staff/entrance";
import {
  recordRejectedTicketScan,
  type TicketScanRejectionReason,
} from "@/lib/staff/scan-attempts";

// A scan outside this window is always rejected: offline queues can lag, but
// a timestamp this far off is a clock problem or a malformed payload, not a
// legitimate late sync.
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_SCAN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

function databaseUnavailable(stage: string, requestId: string): NextResponse {
  console.error("[scanner-sync:database-unavailable]", { requestId, stage });
  return NextResponse.json(
    { error: "Database temporarily unavailable. Please retry the sync." },
    { status: 503, headers: { "x-request-id": requestId, "Cache-Control": "no-store" } }
  );
}

async function recordRejection(
  admin: ReturnType<typeof createSupabaseAdmin>,
  requestId: string,
  params: {
    eventId: string;
    staffMemberId: string | null;
    scannedByUserId: string | null;
    delegatingUserId: string | null;
    ticketInstanceId: string | null;
    entranceId: string | null;
    deviceId: string | null;
    offlineScanId: string | null;
    reason: TicketScanRejectionReason;
    attemptedAt: string | undefined;
    scanSource: "offline_sync";
  },
): Promise<void> {
  void recordRejectedTicketScan(admin, params, requestId).catch(() => {
    // Audit failures must never change the response seen by scanner clients.
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = randomUUID();
  try {
    const { id: eventId } = await params;
    const admin = createSupabaseAdmin();

    const body = await req.json().catch(() => ({}));
    const rawScans: PendingScanItem[] = Array.isArray(body.scans) ? body.scans : [];
    const clientToken = typeof body.token === "string" ? body.token : null;

    // The scanner token may arrive as a Bearer header or as body.token; the
    // resolver only reads headers, so a body-only token is layered onto a
    // synthetic Authorization header without touching the real request.
    const authHeader = req.headers.get("authorization");
    const effectiveReq: ScannerRequestLike =
      authHeader || !clientToken
        ? req
        : {
            headers: {
              get(name: string) {
                return name.toLowerCase() === "authorization" ? `Bearer ${clientToken}` : req.headers.get(name);
              },
            },
          };

    const resolved = await resolveScannerPrincipal(effectiveReq, {
      eventId,
      requires: { codeType: "ticket", action: "check_in" },
      requestId,
      recheckMembership: false,
    });

    if (!resolved.ok) {
      if (resolved.code === "scanner_token_revoked") {
        return NextResponse.json(
          {
            error: "Scanner access was revoked. Ask the organizer for a new invitation.",
            code: "scanner_token_revoked",
          },
          { status: 401, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      if (resolved.code === "scanner_capability_denied") {
        return NextResponse.json(
          { error: "Scanner capability denied.", code: "scanner_capability_denied" },
          { status: 403, headers: { "Cache-Control": "no-store, private" } }
        );
      }
      // not_signed_in and no_permission both fold into sync's original
      // generic 401, exactly as at 496e1ccf8.
      return NextResponse.json(
        { error: "Unauthorized. Valid scanner token or active session required." },
        { status: 401 }
      );
    }

    // A cookie-session principal carries the synthetic role "signed_in" and
    // sets both ids, matching 496e1ccf8's cookie fallback; a token-derived
    // principal only sets delegatingUserId, matching its token path.
    const requestUserId: string | null =
      resolved.principal.role === "signed_in" ? resolved.principal.userId : null;
    const delegatingUserId: string | null = resolved.principal.userId ?? null;
    // Only the guest (account-less) cookie session ever has userId null with
    // a staffMemberId set. For that principal, identity comes solely from
    // this server-resolved value - the client-supplied current_user_id /
    // delegating_user_id on each queued scan are never trusted for a guest,
    // and a guest row never writes to a column that references auth.users.
    const guestStaffMemberId: string | null = resolved.principal.userId
      ? null
      : resolved.principal.staffMemberId ?? null;

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
      // "invalid" is a terminal rejection (malformed payload: no amount of
      // retrying will ever make it succeed) distinct from "failed" (a
      // transient write failure the device should keep retrying). An older
      // client that has never seen "invalid" falls into its generic
      // else-branch and treats it as "failed" (still retryable, same as
      // today) - see lib/offline-scanner-db.ts's syncOfflineScans.
      status: "synced" | "conflict" | "failed" | "invalid";
      action?: string;
      reason?: string;
      error?: string;
    }> = [];

    let countSynced = 0;
    let countConflicts = 0;
    let countFailed = 0;

    for (const scan of sortedScans) {
      // Build the audit identity for this scan once. For guest scans, never
      // populate auth-user identity fields - identity comes solely from the
      // server-resolved guestStaffMemberId.
      const isGuest = guestStaffMemberId !== null;
      const auditIdentity = {
        staffMemberId: isGuest ? guestStaffMemberId : null,
        scannedByUserId: isGuest ? null : (scan.current_user_id || requestUserId || null),
        delegatingUserId: isGuest ? null : (scan.delegating_user_id || delegatingUserId || null),
      };

      const entrance = normalizeEntrance(scan.entrance_id);

      // 0. Validate before any write. A malformed scan can never succeed on
      // retry, so it is rejected as "invalid" (terminal), not "failed"
      // (retryable) - and rejected before the idempotency lookup below,
      // which itself depends on offline_scan_id being a well-formed uuid.
      if (!isUuid(scan.scan_id)) {
        results.push({ scan_id: scan.scan_id, status: "invalid", error: "INVALID_SCAN" });
        countFailed++;
        continue;
      }
      if (scan.ticket_instance_id && !isUuid(scan.ticket_instance_id)) {
        results.push({ scan_id: scan.scan_id, status: "invalid", error: "INVALID_SCAN" });
        countFailed++;
        continue;
      }
      const scannedAtMs = new Date(scan.scanned_at).getTime();
      const now = Date.now();
      if (
        !Number.isFinite(scannedAtMs) ||
        scannedAtMs > now + MAX_FUTURE_SKEW_MS ||
        scannedAtMs < now - MAX_SCAN_AGE_MS
      ) {
        results.push({ scan_id: scan.scan_id, status: "invalid", error: "INVALID_SCAN" });
        countFailed++;
        continue;
      }

      // 1. Idempotency Check: if this offline_scan_id already exists in ticket_checkins
      let existingCheckinByScanId: { id: string } | null = null;
      {
        const { data, error } = await admin
          .from("ticket_checkins")
          .select("id")
          .eq("offline_scan_id", scan.scan_id)
          .maybeSingle();
        if (error) {
          return databaseUnavailable("idempotency_check", requestId);
        }
        existingCheckinByScanId = data ?? null;
      }

      if (existingCheckinByScanId) {
        results.push({
          scan_id: scan.scan_id,
          status: "synced",
          action: "idempotent_noop",
        });
        countSynced++;
        continue;
      }

      // 2. Check if conflict was already recorded for this scan_id
      let existingConflict: { id: string; conflict_reason: string } | null = null;
      {
        const { data, error } = await admin
          .from("offline_scan_conflicts")
          .select("id, conflict_reason")
          .eq("offline_scan_id", scan.scan_id)
          .maybeSingle();
        if (error) {
          return databaseUnavailable("conflict_lookup", requestId);
        }
        existingConflict = data ?? null;
      }

      if (existingConflict) {
        results.push({
          scan_id: scan.scan_id,
          status: "conflict",
          reason: existingConflict.conflict_reason,
        });
        countConflicts++;
        continue;
      }

      // 3. Find ticket instance
      let ticketInstance: { id: string; event_id: string; order_id: string | null; status: string; checked_in_at: string | null } | null = null;
      if (scan.ticket_instance_id) {
        const { data: inst, error } = await admin
          .from("ticket_instances")
          .select("id, event_id, order_id, status, checked_in_at")
          .eq("id", scan.ticket_instance_id)
          .maybeSingle();
        if (error) {
          return databaseUnavailable("ticket_instance_lookup", requestId);
        }
        ticketInstance = inst ?? null;
      }

      if (!ticketInstance && scan.qr_code) {
        const cleanCode = scan.qr_code.trim().toUpperCase();
        const { data: inst, error } = await admin
          .from("ticket_instances")
          .select("id, event_id, order_id, status, checked_in_at")
          .eq("qr_code", cleanCode)
          .maybeSingle();
        if (error) {
          return databaseUnavailable("ticket_code_lookup", requestId);
        }
        ticketInstance = inst ?? null;
      }

      if (!ticketInstance) {
        await recordRejection(admin, requestId, {
          eventId,
          ...auditIdentity,
          ticketInstanceId: null,
          entranceId: entrance.id,
          deviceId: scan.device_id ?? null,
          offlineScanId: scan.scan_id,
          reason: "ticket_not_found",
          attemptedAt: scan.scanned_at ?? null,
          scanSource: "offline_sync",
        });
        results.push({
          scan_id: scan.scan_id,
          status: "failed",
          error: "TICKET_NOT_FOUND",
        });
        countFailed++;
        continue;
      }

      if (ticketInstance.event_id !== eventId) {
        const expectedConflict = "WRONG_EVENT";
        await recordRejection(admin, requestId, {
          eventId,
          ...auditIdentity,
          ticketInstanceId: expectedConflict === "WRONG_EVENT" ? null : ticketInstance.id,
          entranceId: entrance.id,
          deviceId: scan.device_id ?? null,
          offlineScanId: scan.scan_id,
          reason: "wrong_event",
          attemptedAt: scan.scanned_at ?? null,
          scanSource: "offline_sync",
        });
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
        const { data: updated, error: updateErr } = await admin
          .from("ticket_instances")
          .update({
            status: "used",
            checked_in_at: scan.scanned_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", ticketInstance.id)
          .eq("status", "valid")
          .select("id, event_id, order_id")
          .maybeSingle();

        if (updateErr) {
          // Do not silently ignore a database error on the ticket status
          // update path. Fail closed.
          return databaseUnavailable("winning_checkin_lookup", requestId);
        }

        if (!updateErr && updated) {
          // Successfully claimed check-in
          const checkinPayload: any = {
            ticket_instance_id: updated.id,
            ticket_order_id: updated.order_id,
            event_id: updated.event_id,
            scanned_by_user_id: auditIdentity.scannedByUserId,
            delegating_user_id: auditIdentity.delegatingUserId,
            scanned_by_staff_member_id: auditIdentity.staffMemberId,
            device_id: scan.device_id || null,
            entrance_id: entrance.id,
            entrance_label: entrance.label,
            scan_source: "offline",
            offline_scan_id: scan.scan_id,
            offline_scanned_at: scan.scanned_at,
            checked_in_at: scan.scanned_at || new Date().toISOString(),
          };

          let { error: insertErr } = await admin.from("ticket_checkins").insert(checkinPayload);

          // Column-fallback retries are account-path only: a guest write must
          // never have scanned_by_staff_member_id stripped to paper over a
          // schema mismatch. A guest insert error instead falls straight
          // through to the half-applied-write handling below, which reports
          // the scan as "failed" (retryable) and logs it with the request id.
          if (!isGuest) {
            // Graceful fallback if delegating_user_id / offline_scanned_at are not yet in the DB schema
            if (insertErr && (insertErr.message?.includes("delegating_user_id") || insertErr.message?.includes("offline_scanned_at"))) {
              delete checkinPayload.delegating_user_id;
              delete checkinPayload.offline_scanned_at;
              const retry = await admin.from("ticket_checkins").insert(checkinPayload);
              insertErr = retry.error;
            }

            // Entrance label column arrives with migration 208; the check-in itself
            // must still land before that migration is applied.
            if (insertErr && isMissingEntranceLabelError(insertErr)) {
              delete checkinPayload.entrance_label;
              const retry = await admin.from("ticket_checkins").insert(checkinPayload);
              insertErr = retry.error;
            }
          }

          if (!insertErr) {
            results.push({
              scan_id: scan.scan_id,
              status: "synced",
              action: "accepted",
            });
            countSynced++;
            continue;
          }

          // Half-applied write: the status flip to 'used' committed but the
          // checkins insert did not, even after both column-fallback
          // retries above. Never fall through to the conflict path below -
          // that would misreport this as ALREADY_CHECKED_IN and the device
          // would stop retrying a scan that was never actually recorded.
          console.error("[scanner-sync:half-applied]", {
            requestId,
            stage: "checkin_insert_failed",
            ticketInstanceId: updated.id,
            errorCode: insertErr.code || "UNKNOWN",
          });

          // Look up whether any checkin actually landed (revert decision needs
          // DB reads; treat read errors as database-unavailable).
          let checkinByInstance: { id: string } | null = null;
          let checkinByScanId: { id: string } | null = null;
          {
            const { data: c1, error: e1 } = await admin
              .from("ticket_checkins")
              .select("id")
              .eq("ticket_instance_id", updated.id)
              .maybeSingle();
            if (e1) {
              return databaseUnavailable("existing_checkin_lookup", requestId);
            }
            checkinByInstance = c1 ?? null;
          }
          {
            const { data: c2, error: e2 } = await admin
              .from("ticket_checkins")
              .select("id")
              .eq("offline_scan_id", scan.scan_id)
              .maybeSingle();
            if (e2) {
              return databaseUnavailable("existing_checkin_lookup", requestId);
            }
            checkinByScanId = c2 ?? null;
          }

          // Only revert if nothing actually landed for this ticket or this
          // scan - a concurrent scanner may have legitimately won in the
          // meantime (e.g. our own insert succeeded on a retry the client
          // never saw the response for), and that check-in must never be
          // undone.
          if (!checkinByInstance && !checkinByScanId) {
            const { error: revertErr } = await admin
              .from("ticket_instances")
              .update({ status: "valid", checked_in_at: null, updated_at: new Date().toISOString() })
              .eq("id", updated.id)
              .eq("status", "used");

            if (revertErr) {
              console.error("[scanner-sync:revert-failed]", {
                requestId,
                ticketInstanceId: updated.id,
                errorCode: revertErr.code || "UNKNOWN",
              });
            }
          }

          // Always "failed" (retryable), never "synced", never "conflict" -
          // regardless of whether the revert above succeeded.
          results.push({
            scan_id: scan.scan_id,
            status: "failed",
            error: "CHECKIN_WRITE_FAILED",
          });
          countFailed++;
          continue;
        }
      }

      // 5. If ticket is already 'used' -> Conflict Resolution (First-Timestamp-Wins)
      if (ticketInstance.status === "used" || ticketInstance.status === "valid") {
        let existingCheckin: { id: string; checked_in_at: string | null; scanned_by_user_id: string | null; device_id: string | null; entrance_id: string | null } | null = null;
        {
          const { data, error } = await admin
            .from("ticket_checkins")
            .select("id, checked_in_at, scanned_by_user_id, device_id, entrance_id")
            .eq("ticket_instance_id", ticketInstance.id)
            .maybeSingle();
          if (error) {
            return databaseUnavailable("existing_checkin_lookup", requestId);
          }
          existingCheckin = data ?? null;
        }

        const existingTime =
          existingCheckin?.checked_in_at ||
          ticketInstance.checked_in_at ||
          new Date().toISOString();

        const scanTimeMs = new Date(scan.scanned_at).getTime();
        const existingTimeMs = new Date(existingTime).getTime();

        const isEarlierScan = !isNaN(scanTimeMs) && !isNaN(existingTimeMs) && scanTimeMs < existingTimeMs;
        const conflictReason = isEarlierScan
          ? "duplicate_offline_scan_earlier_timestamp"
          : "already_checked_in";

        // Try recording conflict audit entry
        const conflictInsertError = await (async () => {
          const { error } = await admin.from("offline_scan_conflicts").insert({
            event_id: eventId,
            ticket_instance_id: ticketInstance.id,
            ticket_order_id: ticketInstance.order_id || null,
            offline_scan_id: scan.scan_id,
            device_id: scan.device_id || null,
            entrance_id: entrance.id,
            delegating_user_id: auditIdentity.delegatingUserId,
            scanned_by_user_id: auditIdentity.scannedByUserId,
            scanned_by_staff_member_id: auditIdentity.staffMemberId,
            offline_scanned_at: scan.scanned_at,
            conflict_reason: conflictReason,
            winning_checkin_id: existingCheckin?.id || null,
            raw_payload: scan,
          });
          return error;
        })();

        // Duplicate-key (23505) means another scanner already recorded this
        // conflict idempotently - that's fine. Any other insert error is logged
        // but must not change the response - the conflict is still reported.
        if (conflictInsertError && conflictInsertError.code !== "23505") {
          console.error("[scanner-sync:conflict-insert-failed]", {
            requestId,
            scanId: scan.scan_id,
            errorCode: conflictInsertError.code || "UNKNOWN",
          });
        }

        await recordRejection(admin, requestId, {
          eventId,
          ...auditIdentity,
          ticketInstanceId: ticketInstance.id,
          entranceId: entrance.id,
          deviceId: scan.device_id ?? null,
          offlineScanId: scan.scan_id,
          reason: "already_checked_in",
          attemptedAt: scan.scanned_at ?? null,
          scanSource: "offline_sync",
        });

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
        const conflictReason = `ticket_${ticketInstance.status}`;

        const conflictInsertError = await (async () => {
          const { error } = await admin.from("offline_scan_conflicts").insert({
            event_id: eventId,
            ticket_instance_id: ticketInstance.id,
            ticket_order_id: ticketInstance.order_id || null,
            offline_scan_id: scan.scan_id,
            device_id: scan.device_id || null,
            entrance_id: entrance.id,
            delegating_user_id: auditIdentity.delegatingUserId,
            scanned_by_user_id: auditIdentity.scannedByUserId,
            scanned_by_staff_member_id: auditIdentity.staffMemberId,
            offline_scanned_at: scan.scanned_at,
            conflict_reason: conflictReason,
            winning_checkin_id: null,
            raw_payload: scan,
          });
          return error;
        })();

        if (conflictInsertError && conflictInsertError.code !== "23505") {
          console.error("[scanner-sync:conflict-insert-failed]", {
            requestId,
            scanId: scan.scan_id,
            errorCode: conflictInsertError.code || "UNKNOWN",
          });
        }

        await recordRejection(admin, requestId, {
          eventId,
          ...auditIdentity,
          ticketInstanceId: ticketInstance.id,
          entranceId: entrance.id,
          deviceId: scan.device_id ?? null,
          offlineScanId: scan.scan_id,
          reason: ticketInstance.status === "cancelled" ? "ticket_cancelled" : "ticket_refunded",
          attemptedAt: scan.scanned_at ?? null,
          scanSource: "offline_sync",
        });

        results.push({
          scan_id: scan.scan_id,
          status: "conflict",
          reason: ticketInstance.status.toUpperCase(),
        });
        countConflicts++;
        continue;
      }

      // Fallback - unknown status
      await recordRejection(admin, requestId, {
        eventId,
        ...auditIdentity,
        ticketInstanceId: ticketInstance.id,
        entranceId: entrance.id,
        deviceId: scan.device_id ?? null,
        offlineScanId: scan.scan_id,
        reason: "unknown_status",
        attemptedAt: scan.scanned_at ?? null,
        scanSource: "offline_sync",
      });
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
    console.error("[events/[id]/scanner-sync]", err);
    return NextResponse.json(
      { error: "Internal server error syncing offline scans." },
      { status: 500 }
    );
  }
}
