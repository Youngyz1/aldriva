import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/auth";
import { getUploadUrl } from "@/lib/storage/r2";
import { canUseR2Uploads } from "@/lib/media/driver-policy";
import {
  enforcePublicMediaRateLimits,
  PublicMediaQuotaMigrationMissingError,
  reservePublicMediaQuota,
} from "@/lib/media/upload-limits";
import {
  authorizeMediaTarget,
  getMediaTargetKey,
  isUploadMediaPurpose,
  isUuid,
  MEDIA_PURPOSE_POLICIES,
} from "@/lib/media/public-media";

export const maxDuration = 60;

export async function POST(request: Request) {
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
    const purpose = body?.purpose;
    const contentType = body?.contentType;
    const contentLength = body?.size;
    const tenantId = body?.tenantId;
    const targetId = body?.targetId;

    if (!isUploadMediaPurpose(purpose)) {
      return NextResponse.json({ error: "Unsupported media purpose." }, { status: 400 });
    }
    const policy = MEDIA_PURPOSE_POLICIES[purpose];
    if (typeof contentType !== "string" || !(policy.allowedTypes as readonly string[]).includes(contentType)) {
      return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
    }
    if (typeof contentLength !== "number" || !Number.isInteger(contentLength) || contentLength < 1 || contentLength > policy.maxBytes) {
      return NextResponse.json({ error: `Images must be ${Math.floor(policy.maxBytes / 1024 / 1024)} MB or smaller.` }, { status: 400 });
    }

    let normalizedTenantId: string | null = null;
    if (tenantId !== undefined && tenantId !== null) {
      if (!isUuid(tenantId)) return NextResponse.json({ error: "Invalid tenant." }, { status: 400 });
      normalizedTenantId = tenantId;
    }
    let normalizedTargetId: string | null = null;
    if (targetId !== undefined && targetId !== null) {
      if (!isUuid(targetId)) return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
      normalizedTargetId = targetId;
    }

    if (policy.targetKind === "tenant" && (!normalizedTenantId || normalizedTargetId)) {
      return NextResponse.json({ error: "A tenant is required for this image purpose." }, { status: 400 });
    }
    if (policy.targetKind === "event" && (!normalizedTargetId || normalizedTenantId)) {
      return NextResponse.json({ error: "An event is required for this image purpose." }, { status: 400 });
    }
    if (policy.targetKind === "personal" && (normalizedTenantId || normalizedTargetId)) {
      return NextResponse.json({ error: "This image purpose does not accept a target." }, { status: 400 });
    }

    if (!(await authorizeMediaTarget(user.id, purpose, normalizedTenantId, "upload", normalizedTargetId))) {
      return NextResponse.json({ error: "You do not have permission to upload this image." }, { status: 403 });
    }

    const tempBucket = process.env.R2_TMP_BUCKET;
    if (!tempBucket || tempBucket === process.env.R2_BUCKET) {
      throw new Error("R2 temporary storage is not configured separately from public media.");
    }

    const scopeId = policy.targetKind === "event" ? normalizedTargetId : normalizedTenantId;
    const key = getMediaTargetKey(user.id, purpose, scopeId) + "/" + randomUUID();
    const uploadUrl = await getUploadUrl(tempBucket, key, contentType, contentLength);
    if (!(await reservePublicMediaQuota(user.id, contentLength))) {
      return NextResponse.json({ error: "Your daily image upload quota has been reached." }, { status: 429 });
    }

    return NextResponse.json({ uploadUrl, tempKey: key, expiresIn: 300 }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[media/upload-url] failed:", error instanceof Error ? error.name : "unknown");
    if (error instanceof PublicMediaQuotaMigrationMissingError) {
      return NextResponse.json({
        error: "Public media quota is unavailable. Verify that migrations 160 and 161 are applied; R2 uploads are temporarily unavailable.",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Could not prepare the image upload." }, { status: 500 });
  }
}
