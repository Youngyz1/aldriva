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
    const admin = createSupabaseAdmin();

    let user: { id: string } | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      const { data: authData } = await admin.auth.getUser(token);
      if (authData?.user) user = authData.user;
    }

    if (!user) {
      const supabase = await createSupabaseServer();
      const { data: serverAuth } = await supabase.auth.getUser();
      user = serverAuth?.user ?? null;
    }

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager", "ticket_scanner"]);
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

    // 1. Calculate Headline Stats on ticket_instances
    const [{ count: totalSold }, { count: checkedIn }, { count: notArrived }] = await Promise.all([
      admin
        .from("ticket_instances")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .in("status", ["valid", "used"]),
      admin
        .from("ticket_instances")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "used"),
      admin
        .from("ticket_instances")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "valid"),
    ]);

    const soldCount = totalSold ?? 0;
    const checkedInCount = checkedIn ?? 0;
    const notArrivedCount = notArrived ?? 0;
    const attendanceRate = soldCount > 0 ? Math.round((checkedInCount / soldCount) * 100) : 0;

    // 2. Fetch Scanner Breakdown from ticket_checkins
    const { data: checkinAudits } = await admin
      .from("ticket_checkins")
      .select("scanned_by_user_id, ticket_instance_id, ticket_order_id")
      .eq("event_id", eventId);

    const auditMap: Record<string, string | null> = {};
    const scannerCounts: Record<string, number> = {};
    let attributedTotal = 0;

    for (const audit of checkinAudits ?? []) {
      if (audit.ticket_instance_id) {
        auditMap[audit.ticket_instance_id] = audit.scanned_by_user_id;
      }
      if (audit.ticket_order_id) {
        auditMap[audit.ticket_order_id] = audit.scanned_by_user_id;
      }
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

    // 3. Query Filtered & Paginated Check-In History Table on ticket_instances
    let historyQuery = admin
      .from("ticket_instances")
      .select(`
        id,
        order_id,
        ticket_id,
        seat_label,
        checked_in_at,
        qr_code,
        status,
        ticket_orders (
          buyer_name,
          buyer_email,
          total_amount
        )
      `, { count: "exact" })
      .eq("event_id", eventId)
      .eq("status", "used")
      .order("checked_in_at", { ascending: false });

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data: historyInstances, count: totalHistoryCount, error: historyErr } = await historyQuery.range(
      from,
      to
    );

    if (historyErr) {
      return NextResponse.json({ error: historyErr.message }, { status: 500 });
    }

    // Hydrate tier names for instances
    const ticketIds = Array.from(new Set((historyInstances ?? []).map((i) => i.ticket_id).filter(Boolean)));
    const { data: dbTickets } = ticketIds.length
      ? await admin.from("tickets").select("id, name").in("id", ticketIds)
      : { data: [] };

    const ticketNameMap = new Map((dbTickets || []).map((t) => [t.id, t.name]));

    // Enrich history instances with buyer information and scanner attribution
    const enrichedHistory = (historyInstances ?? []).map((inst) => {
      const orderData = inst.ticket_orders as any;
      const scannedById = auditMap[inst.id] || (inst.order_id ? auditMap[inst.order_id] : null) || null;
      const tierName = (inst.ticket_id ? ticketNameMap.get(inst.ticket_id) : null) || "Standard Entry";

      return {
        id: inst.id,
        order_id: inst.order_id,
        buyer_name: orderData?.buyer_name || "Guest",
        buyer_email: orderData?.buyer_email || "",
        tier_name: tierName,
        seat_label: inst.seat_label,
        quantity: 1,
        total_amount: orderData?.total_amount || 0,
        checked_in_at: inst.checked_in_at,
        qr_code: inst.qr_code,
        scanned_by_id: scannedById,
        scanned_by_name: scannedById ? staffMap[scannedById]?.name || "Staff Member" : "Unattributed / Bulk",
      };
    });

    // Client-side/in-memory filtering for search & scanner_id
    let filteredHistory = enrichedHistory;
    if (search) {
      filteredHistory = filteredHistory.filter(
        (h) =>
          h.buyer_name.toLowerCase().includes(search) ||
          h.buyer_email.toLowerCase().includes(search) ||
          h.tier_name.toLowerCase().includes(search) ||
          h.qr_code.toLowerCase().includes(search)
      );
    }

    const finalHistory =
      scannerId === "all"
        ? filteredHistory
        : scannerId === "unattributed"
        ? filteredHistory.filter((h) => !h.scanned_by_id)
        : filteredHistory.filter((h) => h.scanned_by_id === scannerId);

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
    console.error("[events/[id]/checkins]", err);
    return NextResponse.json({ error: "Could not load check-ins. Please try again." }, { status: 500 });
  }
}
