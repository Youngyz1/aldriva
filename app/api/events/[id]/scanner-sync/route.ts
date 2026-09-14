import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { verifyScannerToken } from "@/lib/offline-scanner-token";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const admin = createSupabaseAdmin();

    const body = await req.json().catch(() => ({}));
    const rawScans: PendingScanItem[] = Array.isArray(body.scans) ? body.scans : [];
    const clientToken = body.token || null;

    let delegatingUserId: string | null = null;
    let requestUserId: string | null = null;
    let isAuthorized = false;

    // 1. Authenticate via Bearer header or body.token (8-hour signed scanner token)
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
    const tokenToVerify = bearerToken || clientToken;

    if (tokenToVerify) {
      const verified = verifyScannerToken(tokenToVerify, eventId);
      if (verified.valid && verified.payload) {
        delegatingUserId = verified.payload.userId;
        isAuthorized = true;
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
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized. Valid scanner token or active session required." },
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

    for (const scan of sortedScans) {
      // 1. Idempotency Check: if this offline_scan_id already exists in ticket_checkins
      const { data: existingCheckinByScanId } = await admin
        .from("ticket_checkins")
        .select("id")
        .eq("offline_scan_id", scan.scan_id)
        .maybeSingle();

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
      try {
        const { data: existingConflict } = await admin
          .from("offline_scan_conflicts")
          .select("id, conflict_reason")
          .eq("offline_scan_id", scan.scan_id)
          .maybeSingle();

        if (existingConflict) {
          results.push({
            scan_id: scan.scan_id,
            status: "conflict",
            reason: existingConflict.conflict_reason,
          });
          countConflicts++;
          continue;
        }
      } catch {
        // Table may not yet exist in unmigrated environment
      }

      // 3. Find ticket instance
      let ticketInstance: any = null;
      if (scan.ticket_instance_id) {
        const { data: inst } = await admin
          .from("ticket_instances")
          .select("id, event_id, order_id, status, checked_in_at")
          .eq("id", scan.ticket_instance_id)
          .maybeSingle();
        ticketInstance = inst;
      }

      if (!ticketInstance && scan.qr_code) {
        const cleanCode = scan.qr_code.trim().toUpperCase();
        const { data: inst } = await admin
          .from("ticket_instances")
          .select("id, event_id, order_id, status, checked_in_at")
          .eq("qr_code", cleanCode)
          .maybeSingle();
        ticketInstance = inst;
      }

      if (!ticketInstance) {
        results.push({
          scan_id: scan.scan_id,
          status: "failed",
          error: "TICKET_NOT_FOUND",
        });
        countFailed++;
        continue;
      }

      if (ticketInstance.event_id !== eventId) {
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

        if (!updateErr && updated) {
          // Successfully claimed check-in
          const checkinPayload: any = {
            ticket_instance_id: updated.id,
            ticket_order_id: updated.order_id,
            event_id: updated.event_id,
            scanned_by_user_id: scan.current_user_id || requestUserId || null,
            delegating_user_id: scan.delegating_user_id || delegatingUserId || null,
            device_id: scan.device_id || null,
            entrance_id: scan.entrance_id || null,
            scan_source: "offline",
            offline_scan_id: scan.scan_id,
            offline_scanned_at: scan.scanned_at,
            checked_in_at: scan.scanned_at || new Date().toISOString(),
          };

          let { error: insertErr } = await admin.from("ticket_checkins").insert(checkinPayload);

          // Graceful fallback if delegating_user_id / offline_scanned_at are not yet in the DB schema
          if (insertErr && (insertErr.message?.includes("delegating_user_id") || insertErr.message?.includes("offline_scanned_at"))) {
            delete checkinPayload.delegating_user_id;
            delete checkinPayload.offline_scanned_at;
            const retry = await admin.from("ticket_checkins").insert(checkinPayload);
            insertErr = retry.error;
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
        }
      }

      // 5. If ticket is already 'used' -> Conflict Resolution (First-Timestamp-Wins)
      if (ticketInstance.status === "used" || ticketInstance.status === "valid") {
        const { data: existingCheckin } = await admin
          .from("ticket_checkins")
          .select("id, checked_in_at, scanned_by_user_id, device_id, entrance_id")
          .eq("ticket_instance_id", ticketInstance.id)
          .maybeSingle();

        const existingTime =
          (existingCheckin as any)?.offline_scanned_at ||
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
        try {
          await admin.from("offline_scan_conflicts").insert({
            event_id: eventId,
            ticket_instance_id: ticketInstance.id,
            ticket_order_id: ticketInstance.order_id || null,
            offline_scan_id: scan.scan_id,
            device_id: scan.device_id || null,
            entrance_id: scan.entrance_id || null,
            delegating_user_id: scan.delegating_user_id || delegatingUserId || null,
            scanned_by_user_id: scan.current_user_id || requestUserId || null,
            offline_scanned_at: scan.scanned_at,
            conflict_reason: conflictReason,
            winning_checkin_id: existingCheckin?.id || null,
            raw_payload: scan,
          });
        } catch {
          // If table not yet present, conflict is still logged in memory & response
        }

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
        try {
          await admin.from("offline_scan_conflicts").insert({
            event_id: eventId,
            ticket_instance_id: ticketInstance.id,
            ticket_order_id: ticketInstance.order_id || null,
            offline_scan_id: scan.scan_id,
            device_id: scan.device_id || null,
            entrance_id: scan.entrance_id || null,
            delegating_user_id: scan.delegating_user_id || delegatingUserId || null,
            scanned_by_user_id: scan.current_user_id || requestUserId || null,
            offline_scanned_at: scan.scanned_at,
            conflict_reason: `ticket_${ticketInstance.status}`,
            winning_checkin_id: null,
            raw_payload: scan,
          });
        } catch {
          // Ignore if table not present
        }

        results.push({
          scan_id: scan.scan_id,
          status: "conflict",
          reason: ticketInstance.status.toUpperCase(),
        });
        countConflicts++;
        continue;
      }

      // Fallback
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
