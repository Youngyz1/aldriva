import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServer } from "@/lib/supabase-server";
import { checkTenantAccess } from "@/lib/entity-auth";
import { canUsePrivateR2Media } from "@/lib/media/driver-policy";
import { getPrivateMediaPutUrl } from "@/lib/storage/private-media";

export const maxDuration = 60;

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

function extFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { bookingId, organizerId, kind, contentType, fileSizeBytes, fileName } = body as {
      bookingId?: string; organizerId?: string; kind?: string; contentType?: string; fileSizeBytes?: number; fileName?: string;
    };
    if (!bookingId || !organizerId || (kind !== "pickup" && kind !== "return")) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const access = await checkTenantAccess(user.id, organizerId, ["owner", "admin", "manager", "editor"]);
    if (!access.hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!contentType || !ALLOWED_IMAGE.has(contentType)) {
      return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
    }
    const size = Number(fileSizeBytes);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (max 10 MB)." }, { status: 400 });
    }

    const id = randomUUID();
    const ext = extFor(contentType);
    const key = `rentals/inspections/${organizerId}/${bookingId}/${kind}/${id}.${ext}`;

    const useR2 = canUsePrivateR2Media({
      driver: process.env.IMAGE_STORAGE_DRIVER,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    if (useR2) {
      const privateBucket = process.env.R2_PRIVATE_BUCKET;
      if (!privateBucket || privateBucket === process.env.R2_BUCKET || privateBucket === process.env.R2_TMP_BUCKET) {
        throw new Error("Private R2 storage must use a separate bucket.");
      }
      const signedUrl = await getPrivateMediaPutUrl(key, contentType, size);
      return NextResponse.json({ key, signedUrl, contentType, provider: "r2", fileName: fileName ?? `${id}.${ext}` });
    }

    // Fallback: Supabase private-like path not configured for rental inspections in this flow.
    return NextResponse.json({ error: "Inspection photo storage is not configured." }, { status: 503 });
  } catch (err) {
    console.error("[rentals/inspections/upload-url]", err);
    return NextResponse.json({ error: "Could not prepare upload." }, { status: 500 });
  }
}