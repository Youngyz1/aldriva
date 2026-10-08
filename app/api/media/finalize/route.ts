import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { canUseR2Uploads } from "@/lib/media/driver-policy";
import { enforcePublicMediaRateLimits } from "@/lib/media/upload-limits";
import { deleteObject, getObject, getPublicUrl, putObject, R2ObjectTooLargeError } from "@/lib/storage/r2";
import { processPublicImage } from "@/lib/media/process-public-image";
import {
  authorizeMediaTarget,
  getFinalMediaKey,
  isUploadMediaPurpose,
  MEDIA_PURPOSE_POLICIES,
  parseTemporaryMediaKey,
} from "@/lib/media/public-media";

export const maxDuration = 60;

export async function POST(request: Request) {
  let tempBucket: string | null = null;
  let tempKey: string | null = null;
  let finalKey: string | null = null;
  let finalObjectCreated = false;

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const profile = await getCurrentUserProfile();
    if (!profile || profile.status !== "active" || profile.deleted_at) {
      return NextResponse.json({ error: "An active account is required." }, { status: 403 });
    }

    if (!canUseR2Uploads({
      driver: process.env.IMAGE_STORAGE_DRIVER,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    })) {
      return NextResponse.json({ error: "R2 uploads are unavailable for this deployment." }, { status: 409 });
    }

    const limited = await enforcePublicMediaRateLimits(request, user.id);
    if (limited) return limited;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const parsedKey = parseTemporaryMediaKey(body?.tempKey, user.id);
    if (!parsedKey) return NextResponse.json({ error: "Invalid temporary upload." }, { status: 400 });
    tempKey = parsedKey.key;
    tempBucket = process.env.R2_TMP_BUCKET ?? null;

    if (!isUploadMediaPurpose(body?.purpose)) {
      return NextResponse.json({ error: "Unsupported media purpose." }, { status: 400 });
    }
    if (body.purpose !== parsedKey.purpose) {
      return NextResponse.json({ error: "The temporary upload does not match this purpose." }, { status: 400 });
    }
    const purpose = parsedKey.purpose;
    const policy = MEDIA_PURPOSE_POLICIES[purpose];

    if (!(await authorizeMediaTarget(user.id, purpose, parsedKey.tenantId, "upload", parsedKey.targetId))) {
      return NextResponse.json({ error: "You do not have permission to upload this image." }, { status: 403 });
    }

    const finalBucket = process.env.R2_BUCKET;
    if (!tempBucket || !finalBucket || tempBucket === finalBucket) throw new Error("R2 storage is not configured.");

    const uploaded = await getObject(tempBucket, tempKey, policy.maxBytes);
    if (uploaded.contentLength < 1 || uploaded.contentLength > policy.maxBytes) {
      return NextResponse.json({ error: `Images must be ${Math.floor(policy.maxBytes / 1024 / 1024)} MB or smaller.` }, { status: 400 });
    }

    let processed: Awaited<ReturnType<typeof processPublicImage>>;
    try {
      processed = await processPublicImage(uploaded.body);
    } catch {
      return NextResponse.json({ error: "The uploaded file is not a valid image." }, { status: 400 });
    }
    if (!(policy.allowedTypes as readonly string[]).includes(processed.inputType)) {
      return NextResponse.json({ error: "This image format is not allowed for this purpose." }, { status: 400 });
    }

    let recordTenantId = parsedKey.tenantId;
    let ownerUserId = parsedKey.tenantId ? null : user.id;
    if (parsedKey.targetId) {
      const admin = createSupabaseAdmin();
      const { data: event } = await admin
        .from("events")
        .select("id, organizer_id, user_id")
        .eq("id", parsedKey.targetId)
        .maybeSingle();
      if (!event) return NextResponse.json({ error: "The upload target no longer exists." }, { status: 404 });
      recordTenantId = event.organizer_id ?? null;
      ownerUserId = recordTenantId ? null : user.id;
    }

    finalKey = getFinalMediaKey(user.id, purpose, recordTenantId, parsedKey.targetId, randomUUID());

    await putObject(
      finalBucket,
      finalKey,
      processed.body,
      "image/webp",
      "public, max-age=31536000, immutable"
    );
    finalObjectCreated = true;

    const publicUrl = getPublicUrl(finalBucket, finalKey);
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("media")
      .insert({
        tenant_id: recordTenantId,
        owner_user_id: ownerUserId,
        uploader_user_id: user.id,
        target_id: parsedKey.targetId,
        object_key: finalKey,
        public_url: publicUrl,
        content_type: "image/webp",
        size_bytes: processed.body.byteLength,
        width: processed.width,
        height: processed.height,
        purpose: policy.recordPurpose,
      })
      .select("id")
      .single();

    if (error || !data) {
      await deleteObject(finalBucket, finalKey);
      finalObjectCreated = false;
      return NextResponse.json({ error: "Could not save the processed image." }, { status: 500 });
    }

    finalObjectCreated = false;
    return NextResponse.json({ id: data.id, publicUrl, width: processed.width, height: processed.height }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (finalObjectCreated && finalKey && process.env.R2_BUCKET) {
      try { await deleteObject(process.env.R2_BUCKET, finalKey); } catch { /* best-effort rollback */ }
    }
    console.error("[media/finalize] failed:", error instanceof Error ? error.name : "unknown");
    if (error instanceof R2ObjectTooLargeError) {
      return NextResponse.json({ error: "Images must be 10 MB or smaller." }, { status: 400 });
    }
    return NextResponse.json({ error: "The image upload could not be completed." }, { status: 500 });
  } finally {
    if (tempBucket && tempKey) {
      try { await deleteObject(tempBucket, tempKey); } catch (error) {
        console.error("[media/finalize] temporary cleanup failed:", error instanceof Error ? error.name : "unknown");
      }
    }
  }
}
