/**
 * lib/actions/event-memories.ts
 *
 * Organizer-side Memories management — Round 4.
 *
 * - Upload-credential lifecycle (mint on first open, regenerate, revoke,
 *   approval toggle). Memories serve every event kind: unlike invitation
 *   tooling, there is no kind gate here (photos are not invitations).
 * - Moderation (approve / reject / delete, single + bulk). Deletes remove
 *   the private object through the row's own storage provider first; the
 *   row is kept when the object cannot be removed (retry next run).
 */

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { generateMemoryToken, isMemoryTokenFormat } from "@/lib/memories/tokens";
import {
  getMemoryStorageDriverFor,
  type MemoryStorageProvider,
} from "@/lib/memories/storage";
import { buildMemoryUploadUrl } from "@/lib/invitation-url";

export interface MemorySettingsState {
  ok: boolean;
  error?: string;
  active?: boolean;
  requireApproval?: boolean;
  uploadUrl?: string | null;
  tokenPreview?: string | null;
}

async function canModerate(userId: string, eventId: string): Promise<boolean> {
  return hasEventOrOrganizerAccess(userId, eventId, ["event_manager"]);
}

/** Organizer view of the upload credential (never exposes the full token except on mint/regenerate). */
export async function getMemorySettingsState(eventId: string): Promise<MemorySettingsState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("event_memory_settings")
    .select("upload_token, is_active, require_approval")
    .eq("event_id", eventId)
    .maybeSingle();
  const row = data as { upload_token?: string; is_active?: boolean; require_approval?: boolean } | null;
  if (!row) return { ok: true, active: false };
  const token = row.upload_token ?? "";
  return {
    ok: true,
    active: row.is_active === true,
    requireApproval: row.require_approval !== false,
    uploadUrl: row.is_active === true && isMemoryTokenFormat(token) ? buildMemoryUploadUrl(token) : null,
    tokenPreview:
      row.is_active === true && token.length > 12 ? `${token.slice(0, 8)}…${token.slice(-4)}` : null,
  };
}

/** Mints the upload credential on first open (idempotent: returns existing). */
export async function getOrCreateMemorySettings(eventId: string): Promise<MemorySettingsState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }

  const admin = createSupabaseAdmin();
  const { data: existing } = await admin
    .from("event_memory_settings")
    .select("upload_token, is_active, require_approval")
    .eq("event_id", eventId)
    .maybeSingle();
  const row = existing as { upload_token?: string; is_active?: boolean; require_approval?: boolean } | null;
  if (row?.upload_token) {
    const state = await getMemorySettingsState(eventId);
    return state;
  }

  const token = generateMemoryToken();
  const { error } = await admin.from("event_memory_settings").insert({
    event_id: eventId,
    upload_token: token,
    is_active: true,
    require_approval: true,
    created_by: user.id,
  });
  if (error) return { ok: false, error: "Could not enable photo uploads." };
  revalidatePath(`/dashboard/events/${eventId}/memories`);
  return {
    ok: true,
    active: true,
    requireApproval: true,
    uploadUrl: buildMemoryUploadUrl(token),
    tokenPreview: `${token.slice(0, 8)}…${token.slice(-4)}`,
  };
}

/** Rotates the upload credential (old QR dies immediately). */
export async function regenerateMemoryToken(eventId: string): Promise<MemorySettingsState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }

  const token = generateMemoryToken();
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("event_memory_settings")
    .update({ upload_token: token, is_active: true, revoked_at: null })
    .eq("event_id", eventId);
  if (error) return { ok: false, error: "Could not regenerate the upload link." };
  revalidatePath(`/dashboard/events/${eventId}/memories`);
  return {
    ok: true,
    active: true,
    uploadUrl: buildMemoryUploadUrl(token),
    tokenPreview: `${token.slice(0, 8)}…${token.slice(-4)}`,
  };
}

/** Revokes uploads (existing photos are untouched). */
export async function setMemoryUploadsActive(
  eventId: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("event_memory_settings")
    .update({ is_active: active, revoked_at: active ? null : new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) return { ok: false, error: "Could not update photo uploads." };
  revalidatePath(`/dashboard/events/${eventId}/memories`);
  return { ok: true };
}

/** Approval toggle. Default true (approval required). */
export async function setMemoryRequireApproval(
  eventId: string,
  requireApproval: boolean
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("event_memory_settings")
    .update({ require_approval: requireApproval })
    .eq("event_id", eventId);
  if (error) return { ok: false, error: "Could not update approval." };
  revalidatePath(`/dashboard/events/${eventId}/memories`);
  return { ok: true };
}

export type MemoryModerationStatus = "approved" | "rejected";

async function removeMemoryObject(
  provider: MemoryStorageProvider,
  objectKey: string
): Promise<boolean> {
  try {
    await getMemoryStorageDriverFor(provider).delete(objectKey);
    return true;
  } catch (err) {
    console.error("[event-memories] unlink failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Approve or reject a single photo. */
export async function moderateMemory(
  eventId: string,
  memoryId: string,
  status: MemoryModerationStatus
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId || !memoryId) return { ok: false, error: "Missing event or photo." };
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("event_memories")
    .update({
      status,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    })
    .eq("id", memoryId)
    .eq("event_id", eventId);
  if (error) return { ok: false, error: "Could not moderate this photo." };
  revalidatePath(`/dashboard/events/${eventId}/memories`);
  return { ok: true };
}

/** Approve/reject in bulk. Returns per-photo failures (partial success). */
export async function bulkModerateMemories(
  eventId: string,
  memoryIds: string[],
  status: MemoryModerationStatus
): Promise<{ ok: boolean; error?: string; failed?: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!Array.isArray(memoryIds) || memoryIds.length === 0 || memoryIds.length > 200) {
    return { ok: false, error: "Select between 1 and 200 photos." };
  }
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("event_memories")
    .update({
      status,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    })
    .eq("event_id", eventId)
    .in("id", memoryIds);
  if (error) return { ok: false, error: "Bulk moderation failed." };
  revalidatePath(`/dashboard/events/${eventId}/memories`);
  return { ok: true };
}

/** Deletes photos (object first, then row). Rows survive object failures for retry. */
export async function deleteMemories(
  eventId: string,
  memoryIds: string[]
): Promise<{ ok: boolean; error?: string; deleted?: string[]; failed?: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage memories." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!Array.isArray(memoryIds) || memoryIds.length === 0 || memoryIds.length > 200) {
    return { ok: false, error: "Select between 1 and 200 photos." };
  }
  if (!(await canModerate(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("event_memories")
    .select("id, storage_provider, object_key")
    .eq("event_id", eventId)
    .in("id", memoryIds);
  const rows = ((data ?? []) as { id: string; storage_provider: MemoryStorageProvider; object_key: string }[]);
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    const removed = await removeMemoryObject(row.storage_provider, row.object_key);
    if (!removed) {
      failed.push(row.id);
      continue;
    }
    const { error } = await admin.from("event_memories").delete().eq("id", row.id).eq("event_id", eventId);
    if (error) failed.push(row.id);
    else deleted.push(row.id);
  }
  // Anything requested but not found counts as failed (no silent drops).
  for (const id of memoryIds) {
    if (!rows.some((r) => r.id === id)) failed.push(id);
  }
  // Reports cascade with their photo rows (ON DELETE CASCADE) — no cleanup needed.
  revalidatePath(`/dashboard/events/${eventId}/memories`);
  return { ok: failed.length === 0, deleted, failed };
}
