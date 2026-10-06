/**
 * app/api/invitation-media/upload/route.ts
 *
 * Server-side audio upload endpoint for invitation page background music.
 * Reads the raw request body, applies server-side magic-byte verification,
 * and writes to the `invitation-media` private Supabase bucket.
 *
 * Security:
 * - Session authentication required (getCurrentUser).
 * - Event ownership/organizer access required (hasEventOrOrganizerAccess).
 * - Audio URL path must start with {eventId}/ — client cannot specify arbitrary paths.
 * - 5 MB body hard-limit enforced server-side (before magic-byte check).
 * - Only MP3 (audio/mpeg) and M4A (audio/mp4) accepted (magic-byte verified).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";
import { validateAudioBytes, uploadInvitationAudio } from "@/lib/uploadAudio";

// Allow up to 6MB body (5MB file + headers), per Next.js route handler config.
export const maxDuration = 60;

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth — require a session
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // 2. Read eventId from search params (not from the body, to avoid client-controlled paths)
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    return NextResponse.json({ error: "Missing eventId query parameter." }, { status: 400 });
  }

  // 3. Permission check — allows owner, admin, manager, event_manager, platform admin; denies editor.
  const hasAccess =
    (await isAdmin()) ||
    (await hasEventOrOrganizerAccess(user.id, eventId.trim(), ["event_manager"], ENTITY_ROLES_MANAGE));
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden. You do not have permission to manage this event." }, { status: 403 });
  }

  // 4. Read body with size guard
  let bodyBuffer: ArrayBuffer;
  try {
    bodyBuffer = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to read request body." }, { status: 400 });
  }

  if (bodyBuffer.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Audio file exceeds the 5MB size limit (received ${(bodyBuffer.byteLength / 1024 / 1024).toFixed(2)} MB).` },
      { status: 413 }
    );
  }

  // 5. Magic-byte validation
  const bytes = new Uint8Array(bodyBuffer);
  const validation = validateAudioBytes(bytes, bodyBuffer.byteLength);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  // 6. Upload to invitation-media bucket at {eventId}/{uuid}.ext
  try {
    const { url } = await uploadInvitationAudio(eventId.trim(), bytes, validation.extension!);
    return NextResponse.json({ ok: true, url });
  } catch {
    console.error("[invitation-media/upload] Upload failed");
    return NextResponse.json({ error: "Audio upload failed. Please try again." }, { status: 500 });
  }
}
