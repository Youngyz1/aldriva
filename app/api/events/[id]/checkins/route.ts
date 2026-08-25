import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "You do not have permission to view check-in analytics for this event." },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = parseInt(searchParams.get("per_page") || "25", 10);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const scannerId = searchParams.get("scanner_id") || "all";

    const admin = createSupabaseAdmin();

    // 1. Calculate Headline Stats
    const [{ count: totalSold }, { count: checkedIn }, { count: notArrived }] = await Promise.all([
      admin
        .from("ticket_orders")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .in("status", ["valid", "used"]),
      admin
        .from("ticket_orders")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "used"),
      admin
        .from("ticket_orders")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "valid"),
    ]);

    const soldCount = totalSold ?? 0;
    const checkedInCount = checkedIn ?? 0;
    const notArrivedCount = notArrived ?? 0;
    const attendanceRate = soldCount > 0 ? Math.round((checkedInCount / soldCount) * 100) : 0;

    // 2. Fetch Scanner Breakdown
    const { data: checkinAudits } = await admin
      .from("ticket_checkins")
      .select("scanned_by_user_id, ticket_order_id")
      .eq("event_id", eventId);

    const auditMap: Record<string, string | null> = {};
    const scannerCounts: Record<string, number> = {};
    let attributedTotal = 0;

    for (const audit of checkinAudits ?? []) {
      auditMap[audit.ticket_order_id] = audit.scanned_by_user_id;
      if (audit.scanned_by_user_id) {
        scannerCounts[audit.scanned_by_user_id] = (scannerCounts[audit.scanned_by_user_id] || 0) + 1;
        attributedTotal++;
      }
    }

    const unattributedCount = Math.max(0, checkedInCount - attributedTotal);

    // Fetch staff profiles for scanner breakdown
    const scannerUserIds = Object.keys(scannerCounts);
    let staffMap: Record<string, { name: string; email: string }> = {};

    if (scannerUserIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", scannerUserIds);

      for (const p of profiles ?? []) {
        staffMap[p.id] = {
          name: p.full_name || "Staff Member",
          email: p.email || "",
        };
      }
    }

    const scannerBreakdown = scannerUserIds.map((userId) => ({
      scanner_id: userId,
      name: staffMap[userId]?.name || "Staff Member",
      email: staffMap[userId]?.email || "",
      count: scannerCounts[userId],
    }));

    if (unattributedCount > 0 || scannerBreakdown.length === 0) {
      scannerBreakdown.push({
        scanner_id: "unattributed",
        name: "Unattributed / System Bulk",
        email: "bulk or legacy check-ins",
        count: unattributedCount,
      });
    }

    scannerBreakdown.sort((a, b) => b.count - a.count);

    // 3. Query Filtered & Paginated Check-In History Table
    let historyQuery = admin
      .from("ticket_orders")
      .select("id, buyer_name, buyer_email, seat_label, quantity, total_amount, checked_in_at, qr_code", {
        count: "exact",
      })
      .eq("event_id", eventId)
      .eq("status", "used")
      .order("checked_in_at", { ascending: false });

    if (search) {
      historyQuery = historyQuery.or(
        `buyer_name.ilike.%${search}%,buyer_email.ilike.%${search}%,qr_code.ilike.%${search}%`
      );
    }

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data: historyOrders, count: totalHistoryCount, error: historyErr } = await historyQuery.range(
      from,
      to
    );

    if (historyErr) {
      return NextResponse.json({ error: historyErr.message }, { status: 500 });
    }

    // Filter by scanner_id client-side/in-memory if scanner_id != 'all'
    const enrichedHistory = (historyOrders ?? []).map((order) => {
      const scannedById = auditMap[order.id] || null;
      return {
        ...order,
        scanned_by_id: scannedById,
        scanned_by_name: scannedById ? staffMap[scannedById]?.name || "Staff Member" : "Unattributed / Bulk",
      };
    });

    const finalHistory =
      scannerId === "all"
        ? enrichedHistory
        : scannerId === "unattributed"
        ? enrichedHistory.filter((h) => !h.scanned_by_id)
        : enrichedHistory.filter((h) => h.scanned_by_id === scannerId);

    const totalPages = Math.ceil((totalHistoryCount ?? 0) / perPage) || 1;

    return NextResponse.json({
      stats: {
        total_sold: soldCount,
        checked_in: checkedInCount,
        not_arrived: notArrivedCount,
        attendance_rate: attendanceRate,
      },
      scanner_breakdown: scannerBreakdown,
      history: {
        items: finalHistory,
        total: totalHistoryCount ?? 0,
        page,
        per_page: perPage,
        total_pages: totalPages,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
