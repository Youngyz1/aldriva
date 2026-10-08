import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireProductOwner } from "@/lib/product-access";
import { canUsePrivateR2Media } from "@/lib/media/driver-policy";
import { getPrivateMediaPutUrl } from "@/lib/storage/private-media";
import {
  ASSET_EXTENSION_MIMES,
  DIGITAL_ASSET_BUCKET,
  buildAssetPath,
  validateAssetRequest,
} from "@/lib/digital-products";

export const maxDuration = 60;

/**
 * POST /api/products/[id]/upload-url
 *
 * Mints a service-role signed upload URL for one digital asset. The storage
 * path is built server-side as product-assets/{productId}/{assetId}/{file}
 * so a caller can never escape the product directory (fail closed on any
 * traversal attempt — see validateAssetRequest).
 *
 * The row in product_assets is NOT created here; the client PUTs the bytes
 * to `signedUrl` and then calls /assets/confirm, which verifies the stored
 * object (extension + size from storage metadata, not client claims) before
 * inserting the row via the service role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;

    const gate = await requireProductOwner(productId);
    if ("error" in gate) return gate.error;

    const limited = await enforceRateLimit("productAsset", req, gate.user.id);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const { fileName, fileSizeBytes, mimeType } = body as {
      fileName?: unknown;
      fileSizeBytes?: unknown;
      mimeType?: unknown;
    };

    const check = validateAssetRequest(fileName, fileSizeBytes);
    if (!check.valid) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const assetId = randomUUID();
    const path = buildAssetPath(productId, assetId, fileName as string);
    if (!path) {
      return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
    }

    const extension = check.ext ?? "";
    const allowedMimes = ASSET_EXTENSION_MIMES[extension] ?? [];
    if (typeof mimeType === "string" && mimeType.length > 0 && !allowedMimes.includes(mimeType)) {
      return NextResponse.json({ error: "File content type does not match its extension." }, { status: 400 });
    }
    const contentType = typeof mimeType === "string" && allowedMimes.includes(mimeType)
      ? mimeType
      : allowedMimes[0];
    if (!contentType) return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });

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
      const r2Path = `products/${path}`;
      const signedUrl = await getPrivateMediaPutUrl(r2Path, contentType, fileSizeBytes as number);
      return NextResponse.json({ assetId, path: r2Path, signedUrl, contentType, provider: "r2" });
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(DIGITAL_ASSET_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[products/upload-url]", error?.message);
      return NextResponse.json(
        { error: "Failed to create signed upload URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      assetId,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      contentType,
      provider: "supabase",
    });
  } catch (err) {
    console.error("[products/upload-url] route error:", err);
    return NextResponse.json(
      { error: "Could not prepare the upload. Please try again." },
      { status: 500 }
    );
  }
}
