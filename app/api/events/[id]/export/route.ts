import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { logEventAction } from "@/lib/event-audit";

// RFC 4180 CSV escaping helper
function toCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((field) => {
      if (field === null || field === undefined) return '""';
      const str = String(field);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    })
    .join(",");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to export data for this event." },
        { status: 403 }
      );
    }

    const type = req.nextUrl.searchParams.get("type") || "guests";
    const admin = createSupabaseAdmin();

    let csvContent = "";
    let filename = `event-${eventId}-${type}.csv`;

    // ── GUESTS EXPORT ──────────────────────────────────────────────────────────
    if (type === "guests") {
      const { data: invitations } = await admin
        .from("event_invitations")
        .select("id, guest_name, guest_title, organization, email, phone, invitation_status, rsvp_status, rsvp_at, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      // Fetch seats for invitations
      const { data: seats } = await admin
        .from("seats")
        .select("assigned_invitation_id, section, row_label, seat_number, table_number, table_name")
        .eq("event_id", eventId)
        .not("assigned_invitation_id", "is", null);

      const seatMap = new Map<string, string>();
      (seats || []).forEach((s) => {
        if (s.assigned_invitation_id) {
          const label = s.table_number
            ? `Table ${s.table_number}${s.table_name ? ` (${s.table_name})` : ""}, Seat ${s.seat_number}`
            : `${s.section}, Row ${s.row_label}, Seat ${s.seat_number}`;
          seatMap.set(s.assigned_invitation_id, label);
        }
      });

      const rows: string[] = [
        toCsvRow(["Guest Name", "Title", "Organization", "Email", "Phone", "Invitation Status", "RSVP Status", "RSVP Date", "Assigned Seat", "Created At"]),
      ];

      (invitations || []).forEach((inv) => {
        rows.push(
          toCsvRow([
            inv.guest_name,
            inv.guest_title || "",
            inv.organization || "",
            inv.email || "",
            inv.phone || "",
            inv.invitation_status,
            inv.rsvp_status,
            inv.rsvp_at || "",
            seatMap.get(inv.id) || "Unassigned",
            inv.created_at,
          ])
        );
      });

      csvContent = rows.join("\r\n");
    }

    // ── CHECKINS EXPORT ────────────────────────────────────────────────────────
    else if (type === "checkins") {
      const { data: checkins } = await admin
        .from("ticket_checkins")
        .select("id, ticket_instance_id, ticket_order_id, scanned_by_user_id, checked_in_at")
        .eq("event_id", eventId)
        .order("checked_in_at", { ascending: false });

      const { data: instances } = await admin
        .from("ticket_instances")
        .select("id, source, seat_label, invitation_id, order_id")
        .eq("event_id", eventId);

      const instMap = new Map<string, any>();
      (instances || []).forEach((i) => instMap.set(i.id, i));

      const rows: string[] = [
        toCsvRow(["Checkin ID", "Instance ID", "Seat Label", "Source", "Checked In At", "Scanned By User ID"]),
      ];

      (checkins || []).forEach((c) => {
        const inst = instMap.get(c.ticket_instance_id);
        rows.push(
          toCsvRow([
            c.id,
            c.ticket_instance_id || "",
            inst?.seat_label || "General",
            inst?.source || "purchase",
            c.checked_in_at,
            c.scanned_by_user_id || "Direct Staff",
          ])
        );
      });

      csvContent = rows.join("\r\n");
    }

    // ── SEATING EXPORT ─────────────────────────────────────────────────────────
    else if (type === "seating") {
      const { data: seats } = await admin
        .from("seats")
        .select("id, section, row_label, seat_number, table_number, table_name, is_vip, status, price_override, assigned_invitation_id")
        .eq("event_id", eventId)
        .order("section")
        .order("row_label")
        .order("seat_number");

      const rows: string[] = [
        toCsvRow(["Seat ID", "Section", "Row", "Seat Number", "Table Number", "Table Name", "Is VIP", "Status", "Price Override", "Assigned Invitation ID"]),
      ];

      (seats || []).forEach((s) => {
        rows.push(
          toCsvRow([
            s.id,
            s.section,
            s.row_label,
            s.seat_number,
            s.table_number || "",
            s.table_name || "",
            s.is_vip ? "Yes" : "No",
            s.status,
            s.price_override ?? "",
            s.assigned_invitation_id || "",
          ])
        );
      });

      csvContent = rows.join("\r\n");
    }

    // ── TICKETS / RECONCILIATION EXPORT ───────────────────────────────────────
    else if (type === "tickets") {
      const { data: orders } = await admin
        .from("ticket_orders")
        .select("id, buyer_name, buyer_email, quantity, total_amount, status, created_at, checked_in_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      const rows: string[] = [
        toCsvRow(["Order ID", "Buyer Name", "Buyer Email", "Quantity", "Total Amount ($)", "Status", "Purchased At", "Checked In At"]),
      ];

      (orders || []).forEach((o) => {
        rows.push(
          toCsvRow([
            o.id,
            o.buyer_name || "",
            o.buyer_email || "",
            o.quantity,
            o.total_amount,
            o.status,
            o.created_at,
            o.checked_in_at || "",
          ])
        );
      });

      csvContent = rows.join("\r\n");
    } else {
      return NextResponse.json({ error: "Invalid export type. Supported: guests, checkins, seating, tickets." }, { status: 400 });
    }

    // Audit log the export
    await logEventAction({
      eventId,
      actorUserId: user.id,
      actorRole: "event_manager",
      action: "export_generated",
      targetType: "export",
      metadata: { type, filename },
    });

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate export.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
