import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

/**
 * Scheduled cron job to reconcile rental statuses:
 * 1. reconcile_rental_overdue(): flags active bookings past ends_at + 60m as overdue.
 * 2. expire_rental_bookings(NULL): expires pending / awaiting_payment holds whose window
 *    has elapsed (migration 229 rules).
 */
async function handleReconcile(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  try {
    const { data: overdueCount, error: rpcErr } = await admin.rpc("reconcile_rental_overdue");
    if (rpcErr) {
      console.error("[cron/rentals/reconcile] RPC reconcile_rental_overdue failed:", rpcErr);
    }

    const { data: expired, error: expireErr } = await admin.rpc("expire_rental_bookings", {
      p_category_id: null,
    });
    if (expireErr) {
      console.error("[cron/rentals/reconcile] expire_rental_bookings failed:", expireErr);
      return NextResponse.json(
        { error: expireErr.message, overdueReconciled: overdueCount ?? 0 },
        { status: 500 }
      );
    }

    const expiredRows = Array.isArray(expired) ? expired : [];
    const expiredCount = typeof expired === "number" ? expired : expiredRows.length;

    if (expiredRows.length > 0) {
      const { sendRentalEmail } = await import("@/lib/rental/emails");
      for (const row of expiredRows as Array<{ out_booking_id?: string; out_reason?: string }>) {
        if (row.out_booking_id) await sendRentalEmail("expired", row.out_booking_id, { reason: row.out_reason });
      }
    }

    return NextResponse.json({
      success: true,
      overdueReconciled: overdueCount ?? 0,
      expiredCount,
      expired: expiredRows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleReconcile(req);
}

export async function POST(req: NextRequest) {
  return handleReconcile(req);
}
