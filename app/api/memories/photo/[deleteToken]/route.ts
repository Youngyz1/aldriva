import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getMemoryStorageDriverFor, type MemoryStorageProvider } from "@/lib/memories/storage";
import { hashPhotoDeleteToken } from "@/lib/memories/photos";

/**
 * DELETE /api/memories/photo/[deleteToken]
 * Lets the anonymous uploader delete their own photo with the one-time
 * credential returned at upload. No login, no event context needed —
 * possession of the 64-hex secret IS the authorization.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ deleteToken: string }> }
) {
  const { deleteToken } = await params;
  if (typeof deleteToken !== "string" || !/^[0-9a-f]{64}$/.test(deleteToken)) {
    return NextResponse.json({ error: "Invalid delete credential." }, { status: 404 });
  }

  const admin = createSupabaseAdmin();
  const { data: photo } = await admin
    .from("event_memories")
    .select("id, storage_provider, object_key")
    .eq("delete_token_hash", hashPhotoDeleteToken(deleteToken))
    .maybeSingle();
  const row = photo as {
    id?: string;
    storage_provider?: MemoryStorageProvider;
    object_key?: string;
  } | null;
  if (!row?.id || !row.object_key) {
    return NextResponse.json({ error: "Photo not found or already deleted." }, { status: 404 });
  }

  try {
    await getMemoryStorageDriverFor(row.storage_provider === "r2" ? "r2" : "supabase").delete(
      row.object_key
    );
  } catch (err) {
    console.error("[memories/photo/delete] unlink failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not delete this photo right now. Please try again." },
      { status: 500 }
    );
  }

  await admin.from("event_memories").delete().eq("id", row.id);
  return NextResponse.json({ ok: true, message: "Your photo was deleted." });
}
