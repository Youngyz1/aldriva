import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMemoryTokenFormat } from "@/lib/memories/tokens";
import { isRateLimited, rateLimitedResponse } from "@/lib/memories/guest-limits";
import { getMemoryStorageDriver } from "@/lib/memories/storage";
import {
  finalizeMemoryPhoto,
  generatePhotoDeleteToken,
  hashPhotoDeleteToken,
} from "@/lib/memories/photos";

/**
 * POST /api/memories/[token]/complete
 * Validates a direct-to-storage upload (magic bytes, size, conversion,
 * metadata strip), stores the finalized photo row, and returns a
 * short-lived view URL plus a one-time uploader delete credential.
 */
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!isMemoryTokenFormat(token)) {
    return NextResponse.json({ error: "This upload link is invalid or expired." }, { status: 404 });
  }

  if (await isRateLimited(req, "memoryUploadComplete", `token:${token}`)) {
    return rateLimitedResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 422 });
  }

  const key = typeof body.key === "string" ? body.key : "";
  const rawLabel = typeof body.guestLabel === "string" ? body.guestLabel.trim() : "";
  const guestLabel = rawLabel ? rawLabel.slice(0, 80) : null;
  if (!key) {
    return NextResponse.json({ error: "Missing upload reference." }, { status: 422 });
  }

  const admin = createSupabaseAdmin();
  const { data: settings } = await admin
    .from("event_memory_settings")
    .select("id, event_id, is_active, require_approval")
    .eq("upload_token", token)
    .maybeSingle();
  const row = settings as {
    id?: string;
    event_id?: string;
    is_active?: boolean;
    require_approval?: boolean;
  } | null;
  if (!row?.event_id || row.is_active !== true) {
    return NextResponse.json({ error: "This upload link is invalid or expired." }, { status: 404 });
  }

  const driver = getMemoryStorageDriver();
  let finalized;
  try {
    // The photo kind is sniffed from magic bytes inside finalize — the
    // client-declared type is never accepted or trusted here.
    finalized = await finalizeMemoryPhoto({ driver, eventId: row.event_id, pendingKey: key });
  } catch (err) {
    console.error("[memories/complete] rejected upload:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "This file is not a supported photo. Use JPEG, PNG, WebP, or HEIC under 15 MB." },
      { status: 422 }
    );
  }

  const deleteToken = generatePhotoDeleteToken();
  const { data: inserted, error: insertError } = await admin
    .from("event_memories")
    .insert({
      event_id: row.event_id,
      settings_id: row.id ?? null,
      storage_provider: driver.provider,
      object_key: finalized.objectKey,
      content_type: finalized.contentType,
      size_bytes: finalized.sizeBytes,
      width: finalized.width,
      height: finalized.height,
      status: row.require_approval === false ? "approved" : "pending",
      guest_label: guestLabel,
      delete_token_hash: hashPhotoDeleteToken(deleteToken),
    })
    .select("id, status")
    .single();

  if (insertError || !inserted) {
    // The finalized object is orphaned — remove it so storage cannot fill
    // with unreachable files (best effort; retention sweeps leftovers).
    await driver.delete(finalized.objectKey).catch(() => {});
    console.error("[memories/complete] row insert failed:", insertError?.message);
    return NextResponse.json({ error: "Could not save your photo. Please try again." }, { status: 500 });
  }

  let viewUrl: string | null = null;
  try {
    viewUrl = await driver.signGet(finalized.objectKey, 300);
  } catch {
    viewUrl = null;
  }

  const photo = inserted as { id: string; status: string };
  return NextResponse.json({
    id: photo.id,
    status: photo.status,
    viewUrl,
    deleteToken,
    message:
      photo.status === "approved"
        ? "Photo added to the event memories."
        : "Photo uploaded. The organizer will review it before it appears.",
  });
}
