import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMemoryTokenFormat } from "@/lib/memories/tokens";
import { isRateLimited, rateLimitedResponse } from "@/lib/memories/guest-limits";
import {
  getMemoryStorageDriver,
  memoryPendingKey,
} from "@/lib/memories/storage";
import { MEMORY_MAX_BYTES, MEMORY_UPLOAD_MIME_ALLOWLIST } from "@/lib/memories/photo-format";

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * POST /api/memories/[token]/upload-url
 * Mints a scoped direct-to-storage PUT URL for one guest photo.
 * The declared type/size are re-validated server-side at completion
 * (magic bytes + stat) — never trusted here beyond basic shape.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!isMemoryTokenFormat(token)) {
    return NextResponse.json({ error: "This upload link is invalid or expired." }, { status: 404 });
  }

  if (await isRateLimited(req, "memoryUploadUrl", `token:${token}`)) {
    return rateLimitedResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 422 });
  }

  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const contentLength = typeof body.contentLength === "number" ? Math.floor(body.contentLength) : 0;

  if (!MEMORY_UPLOAD_MIME_ALLOWLIST[contentType]) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPEG, PNG, WebP, or HEIC." },
      { status: 422 }
    );
  }
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > MEMORY_MAX_BYTES) {
    return NextResponse.json({ error: "File size exceeds the 15 MB limit." }, { status: 422 });
  }

  const admin = createSupabaseAdmin();
  const { data: settings } = await admin
    .from("event_memory_settings")
    .select("event_id, is_active")
    .eq("upload_token", token)
    .maybeSingle();
  const row = settings as { event_id?: string; is_active?: boolean } | null;
  if (!row?.event_id || row.is_active !== true) {
    return NextResponse.json({ error: "This upload link is invalid or expired." }, { status: 404 });
  }

  const extension = MIME_TO_EXTENSION[contentType] ?? "jpg";
  const key = memoryPendingKey(row.event_id, `${randomUUID()}.${extension}`);

  try {
    const url = await getMemoryStorageDriver().signPut(key, contentType, contentLength);
    return NextResponse.json({ url, key, expiresIn: 300 });
  } catch (err) {
    console.error("[memories/upload-url]", err);
    return NextResponse.json({ error: "Could not prepare the upload. Please try again." }, { status: 500 });
  }
}
