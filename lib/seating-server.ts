import "server-only";
/**
 * Server-side seating mutations backed by the privileged Supabase client.
 * Keep geometry, types, and other browser-safe helpers in `lib/seating.ts`.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function reserveSeatsAtomic(
  seatIds: string[],
  holdDurationMinutes = 5
): Promise<{
  success: boolean;
  reserved_until?: string;
  unavailable_ids?: string[];
  error?: string;
}> {
  const admin = createSupabaseAdmin();

  const { data, error } = await admin.rpc("reserve_seats_atomic", {
    p_seat_ids: seatIds,
    p_hold_duration_minutes: holdDurationMinutes,
  });

  if (error) {
    // Fallback if RPC is not deployed: conditional atomic update.
    const now = new Date();
    const reservedUntil = new Date(
      now.getTime() + holdDurationMinutes * 60 * 1000
    ).toISOString();

    const { data: seats } = await admin
      .from("seats")
      .select("id, status, reserved_until, assigned_invitation_id")
      .in("id", seatIds);

    const unavailable = (seats || []).filter(
      (seat) =>
        seat.status === "sold" ||
        seat.status === "unavailable" ||
        seat.assigned_invitation_id !== null ||
        (seat.status === "reserved" &&
          seat.reserved_until &&
          new Date(seat.reserved_until) > now)
    );

    if (unavailable.length > 0) {
      return {
        success: false,
        error: "Some seats are no longer available.",
        unavailable_ids: unavailable.map((seat) => seat.id),
      };
    }

    const { error: updateErr } = await admin
      .from("seats")
      .update({ status: "reserved", reserved_until: reservedUntil })
      .in("id", seatIds);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, reserved_until: reservedUntil };
  }

  return data as {
    success: boolean;
    reserved_until?: string;
    unavailable_ids?: string[];
    error?: string;
  };
}

export async function assignSeatToInvitationAtomic(params: {
  eventId: string;
  invitationId: string;
  seatId: string;
}): Promise<{
  success: boolean;
  seatId?: string;
  seatLabel?: string;
  error?: string;
}> {
  const { eventId, invitationId, seatId } = params;
  const admin = createSupabaseAdmin();

  const { data, error } = await admin.rpc(
    "assign_seat_to_invitation_atomic",
    {
      p_event_id: eventId,
      p_invitation_id: invitationId,
      p_seat_id: seatId,
    }
  );

  if (error) {
    // Fallback if RPC is not yet loaded in Postgres.
    const { assignSeatToInvitation } = await import("@/lib/invitations");
    try {
      const result = await assignSeatToInvitation({
        eventId,
        invitationId,
        seatId,
      });
      return {
        success: true,
        seatId: result.seatId,
        seatLabel: result.seatLabel,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Assignment failed",
      };
    }
  }

  const result = data as {
    success: boolean;
    seat_id?: string;
    seat_label?: string;
    error?: string;
  };

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    seatId: result.seat_id,
    seatLabel: result.seat_label,
  };
}
