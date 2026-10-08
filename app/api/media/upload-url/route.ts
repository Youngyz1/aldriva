import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUploadUrl } from "@/lib/storage/r2";
import {
  authorizeMediaTarget,
  getMediaTargetKey,
  isMediaPurpose,
  isUuid,
  MAX_PUBLIC_MEDIA_BYTES,
  PUBLIC_MEDIA_TYPES,
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

    const limited = await enforceRateLimit("mediaUpload", request, user.id);
    if (limited) return limited;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const purpose = body?.purpose;
    const contentType = body?.contentType;
    const contentLength = body?.size;
    const tenantId = body?.tenantId;

    if (!isMediaPurpose(purpose)) {
      return NextResponse.json({ error: "Unsupported media purpose." }, { status: 400 });
    }
    if (typeof contentType !== "string" || !PUBLIC_MEDIA_TYPES.includes(contentType as (typeof PUBLIC_MEDIA_TYPES)[number])) {
      return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
    }
    if (typeof contentLength !== "number" || !Number.isInteger(contentLength) || contentLength < 1 || contentLength > MAX_PUBLIC_MEDIA_BYTES) {
      return NextResponse.json({ error: "Images must be 10 MB or smaller." }, { status: 400 });
    }

    let normalizedTenantId: string | null = null;
    if (tenantId !== undefined && tenantId !== null) {
      if (!isUuid(tenantId)) return NextResponse.json({ error: "Invalid tenant." }, { status: 400 });
      normalizedTenantId = tenantId;
    }

    if (!(await authorizeMediaTarget(user.id, purpose, normalizedTenantId, "upload"))) {
      return NextResponse.json({ error: "You do not have permission to upload this image." }, { status: 403 });
    }

    const tempBucket = process.env.R2_TMP_BUCKET;
    if (!tempBucket || tempBucket === process.env.R2_BUCKET) {
      throw new Error("R2 temporary storage is not configured separately from public media.");
    }

    const key = getMediaTargetKey(user.id, purpose, normalizedTenantId) + "/" + randomUUID();
    const uploadUrl = await getUploadUrl(tempBucket, key, contentType, contentLength);

    return NextResponse.json({ uploadUrl, tempKey: key, expiresIn: 300 }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[media/upload-url] failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not prepare the image upload." }, { status: 500 });
  }
}
