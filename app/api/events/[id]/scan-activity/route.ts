import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import {
  eventStaffSessionCookieName,
  EVENT_STAFF_SESSION_COOKIE_PREFIX,
  validateEventStaffSession,
} from "@/lib/staff/guest-session";

type SummaryRow = {
  staff_member_id: string | null;
  scanned_by_user_id: string | null;
  successful_count: number;
  rejected_count: number;
  last_activity_at: string | null;
};

function jsonError(requestId: string, error: string, status: number) {
  return NextResponse.json(
    { error, requestId },
    { status, headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  let stage = "authenticate";
  try {
    const { id: eventId } = await params;
    const admin = createSupabaseAdmin();
    const requestedStaffId = req.nextUrl.searchParams.get("staff_id");
    const mineOnly = req.nextUrl.searchParams.get("scope") === "mine";
    const pageValue = Number.parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const page = Number.isFinite(pageValue) ? Math.max(1, Math.min(pageValue, 1000)) : 1;
    const perPage = 25;

    const hasGuestCookie = req.cookies.getAll().some((cookie) => cookie.name.startsWith(EVENT_STAFF_SESSION_COOKIE_PREFIX));
    const guestToken = req.cookies.get(eventStaffSessionCookieName(eventId))?.value || null;
    const guest = guestToken ? await validateEventStaffSession(eventId, guestToken) : null;
    if ((guestToken && !guest) || (hasGuestCookie && !guestToken)) {
      return jsonError(requestId, "Staff access has expired or was revoked.", 401);
    }

    let userId: string | null = null;
    if (!guest) {
      const supabase = await createSupabaseServer();
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!userId) return jsonError(requestId, "Not signed in.", 401);
    }

    stage = "authorize_event";
    const canManage = userId
      ? await hasEventOrOrganizerAccess(userId, eventId, ["event_manager"])
      : false;
    const canScan = guest
      ? guest.role === "event_manager" || guest.role === "ticket_scanner"
      : !!userId && await hasEventOrOrganizerAccess(userId, eventId, ["event_manager", "ticket_scanner"]);
    if (!canScan) return jsonError(requestId, "You do not have permission to view scan activity for this event.", 403);

    let targetMember: Record<string, any> | null = null;
    let targetUserId: string | null = null;
    let staffMemberId: string | null = null;
    if (guest) {
      staffMemberId = guest.staffMemberId;
      if (requestedStaffId && requestedStaffId !== staffMemberId) {
        return jsonError(requestId, "You do not have permission to view another staff member's activity.", 403);
      }
      const { data } = await admin
        .from("event_team_members")
        .select("id, event_id, user_id, role, role_label, position_label, staff_name, status, entrance_id, invitation_id")
        .eq("event_id", eventId)
        .eq("id", staffMemberId)
        .maybeSingle();
      targetMember = data;
    } else if (requestedStaffId) {
      const { data: ownMembership } = await admin
        .from("event_team_members")
        .select("id, event_id, user_id, role, role_label, position_label, staff_name, status, entrance_id, invitation_id")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (!canManage && ownMembership?.id !== requestedStaffId) {
        return jsonError(requestId, "You do not have permission to view another staff member's activity.", 403);
      }
      const { data, error } = await admin
        .from("event_team_members")
        .select("id, event_id, user_id, role, role_label, position_label, staff_name, status, entrance_id, invitation_id")
        .eq("event_id", eventId)
        .eq("id", requestedStaffId)
        .maybeSingle();
      if (error) throw Object.assign(new Error("member query failed"), { code: error.code });
      if (!data) return jsonError(requestId, "Staff member not found.", 404);
      targetMember = data;
      staffMemberId = data.id;
      targetUserId = data.user_id;
    } else {
      const { data } = await admin
        .from("event_team_members")
        .select("id, event_id, user_id, role, role_label, position_label, staff_name, status, entrance_id, invitation_id")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      targetMember = data;
      staffMemberId = data?.id ?? null;
      targetUserId = userId;
    }
    if (guest) targetUserId = null;
    if (!requestedStaffId && !guest) targetUserId = userId;

    stage = "load_activity";
    const { data: summaryRows, error: summaryError } = await admin.rpc("get_event_staff_scan_summary", {
      p_event_id: eventId,
    });
    if (summaryError) throw Object.assign(new Error("summary RPC failed"), { code: summaryError.code });
    const summaries = (summaryRows || []) as SummaryRow[];

    if (canManage && !requestedStaffId && !guest && !mineOnly) {
      const [membersResult, invitationsResult, sessionsResult, admissionsResult, rejectedResult, conflictsResult] = await Promise.all([
        admin.from("event_team_members")
          .select("id, event_id, user_id, invitation_id, role, role_label, position_label, staff_name, status, entrance_id, created_at, accepted_at, removed_at")
          .eq("event_id", eventId)
          .order("created_at", { ascending: false }),
        admin.from("event_team_invitations")
          .select("id, status, expires_at, is_accountless")
          .eq("event_id", eventId),
        admin.from("event_staff_sessions")
          .select("staff_member_id, expires_at, revoked_at")
          .eq("event_id", eventId),
        // ticket_checkins is the authoritative admission ledger. A used ticket
        // row can predate this audit path or be changed independently, so it
        // must not inflate the activity dashboard's successful count.
        admin.from("ticket_checkins")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId),
        admin.from("event_ticket_scan_attempts")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId),
        admin.from("offline_scan_conflicts")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId),
      ]);
      const failedResult = [membersResult, invitationsResult, sessionsResult, admissionsResult, rejectedResult, conflictsResult]
        .find((result) => result.error);
      if (failedResult?.error) throw Object.assign(new Error("event summary query failed"), { code: failedResult.error.code });

      const members = membersResult.data || [];
      const invitations = new Map((invitationsResult.data || []).map((item) => [item.id, item]));
      const sessions = new Map((sessionsResult.data || []).map((item) => [item.staff_member_id, item]));
      const now = Date.now();
      const staff = members.map((member) => {
        const rows = summaries.filter((item) =>
          item.staff_member_id === member.id ||
          (!!member.user_id && item.scanned_by_user_id === member.user_id),
        );
        const successful = rows.reduce((sum, item) => sum + Number(item.successful_count || 0), 0);
        const rejected = rows.reduce((sum, item) => sum + Number(item.rejected_count || 0), 0);
        const times = rows.map((item) => item.last_activity_at).filter(Boolean) as string[];
        const invitation = member.invitation_id ? invitations.get(member.invitation_id) : null;
        const session = sessions.get(member.id);
        const isAccountless = invitation?.is_accountless ?? !member.user_id;
        return {
          id: member.id,
          name: member.staff_name || null,
          role: member.role,
          roleLabel: member.role_label,
          positionLabel: member.position_label,
          entranceId: member.entrance_id,
          status: member.status,
          invitationStatus: invitation?.status ?? null,
          accessStatus: member.status !== "active"
            ? "revoked"
            : session
              ? session.revoked_at
                ? "revoked"
                : new Date(session.expires_at).getTime() <= now
                  ? "expired"
                  : "active"
              : isAccountless ? "expired" : "active",
          successful,
          rejected,
          total: successful + rejected,
          lastActivityAt: times.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null,
        };
      });

      return NextResponse.json({
        requestId,
        event: {
          successful: admissionsResult.count || 0,
          rejected: rejectedResult.count || 0,
          total: (admissionsResult.count || 0) + (rejectedResult.count || 0),
          syncIssues: conflictsResult.count || 0,
          activeMembers: members.filter((member) => member.status === "active").length,
          invitations: (invitationsResult.data || []).reduce<Record<string, number>>((result, invite) => {
            result[invite.status] = (result[invite.status] || 0) + 1;
            return result;
          }, {}),
        },
        staff,
      }, { headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } });
    }

    const matchingRows = summaries.filter((item) =>
      (staffMemberId && item.staff_member_id === staffMemberId) ||
      (targetUserId && item.scanned_by_user_id === targetUserId),
    );
    const summary = matchingRows.reduce((result, item) => ({
      successful: result.successful + Number(item.successful_count || 0),
      rejected: result.rejected + Number(item.rejected_count || 0),
      lastActivityAt: !result.lastActivityAt || (item.last_activity_at && Date.parse(item.last_activity_at) > Date.parse(result.lastActivityAt))
        ? item.last_activity_at
        : result.lastActivityAt,
    }), { successful: 0, rejected: 0, lastActivityAt: null as string | null });

    stage = "load_history";
    const { data: history, error: historyError } = await admin.rpc("get_event_staff_scan_history", {
      p_event_id: eventId,
      p_staff_member_id: staffMemberId,
      p_user_id: targetUserId,
      p_limit: perPage + 1,
      p_offset: (page - 1) * perPage,
    });
    if (historyError) throw Object.assign(new Error("history RPC failed"), { code: historyError.code });

    const historyItems = (history || []).slice(0, perPage).map((entry: Record<string, any>) => ({
      entry_id: entry.entry_id,
      result: entry.result,
      reason_code: entry.reason_code,
      scan_source: entry.scan_source,
      entrance_id: entry.entrance_id,
      occurred_at: entry.occurred_at,
    }));

    return NextResponse.json({
      requestId,
      summary: {
        successful: summary.successful,
        rejected: summary.rejected,
        total: summary.successful + summary.rejected,
        lastActivityAt: summary.lastActivityAt,
      },
      staff: targetMember ? {
        id: targetMember.id,
        name: targetMember.staff_name || null,
        role: targetMember.role,
        roleLabel: targetMember.role_label,
        positionLabel: targetMember.position_label,
        entranceId: targetMember.entrance_id,
        status: targetMember.status,
      } : null,
      history: historyItems,
      page,
      perPage,
      hasMore: (history || []).length > perPage,
    }, { headers: { "Cache-Control": "no-store, private", "x-request-id": requestId } });
  } catch (err) {
    const errorCode = err && typeof err === "object" && "code" in err ? String(err.code) : "UNKNOWN";
    console.error("[event-scan-activity]", { requestId, stage, errorCode });
    return jsonError(requestId, "Scan activity is temporarily unavailable. Please try again.", 503);
  }
}
