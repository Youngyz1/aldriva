"use server";

import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";

export interface HostGuestbookWish {
  id: string;
  eventId: string;
  invitationId: string | null;
  guestName: string;
  message: string;
  isVisible: boolean;
  createdAt: string;
}

export async function getHostGuestbookWishes(
  eventId: string
): Promise<{ ok: boolean; wishes?: HostGuestbookWish[]; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) return { ok: false, error: "Forbidden" };

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await (admin as any)
      .from("event_guestbook_entries")
      .select("id, event_id, invitation_id, guest_name, message, is_visible, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("event_guestbook_entries")) {
        return { ok: true, wishes: [] };
      }
      return { ok: false, error: error.message };
    }

    return {
      ok: true,
      wishes: (data || []).map((row: any) => ({
        id: row.id,
        eventId: row.event_id,
        invitationId: row.invitation_id,
        guestName: row.guest_name,
        message: row.message,
        isVisible: row.is_visible,
        createdAt: row.created_at,
      })),
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to load guestbook wishes." };
  }
}

export async function toggleGuestbookWishVisibility(
  eventId: string,
  wishId: string,
  isVisible: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) return { ok: false, error: "Forbidden" };

  try {
    const admin = createSupabaseAdmin();
    const { error } = await (admin as any)
      .from("event_guestbook_entries")
      .update({ is_visible: isVisible })
      .eq("id", wishId)
      .eq("event_id", eventId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to update wish visibility." };
  }
}

export async function deleteGuestbookWish(
  eventId: string,
  wishId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!canManage) return { ok: false, error: "Forbidden" };

  try {
    const admin = createSupabaseAdmin();
    const { error } = await (admin as any)
      .from("event_guestbook_entries")
      .delete()
      .eq("id", wishId)
      .eq("event_id", eventId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to delete wish." };
  }
}
