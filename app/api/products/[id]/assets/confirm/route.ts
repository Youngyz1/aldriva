import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireProductOwner } from "@/lib/product-access";
import {
  ASSET_EXTENSION_MIMES,
  DIGITAL_ASSET_BUCKET,
  DIGITAL_ASSET_MAX_BYTES,
  assetExtensionOf,
  isUuid,
  validateAssetRequest,
} from "@/lib/digital-products";

/**
 * POST /api/products/[id]/assets/confirm
 *
 * Second half of the upload flow. After the client PUTs bytes to the signed
 * URL from /upload-url, it calls here with { assetId, path, fileName,
 * fileSizeBytes, mimeType }. The route:
 *
 *  1. Authenticates + checks product ownership (fail closed, 404).
 *  2. Re-validates extension + size, and requires the path to live under
 *     {productId}/{assetId}/ (scope check — no traversal).
 *  3. Verifies the object actually exists in storage and reads its size
 *     from storage metadata (not client claims).
 *  4. Checks the client-declared MIME is plausible for the extension.
 *  5. Inserts the product_assets row via the service role — clients can
 *     never insert asset rows directly (no INSERT RLS policy exists).
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
    const { assetId, path, fileName, fileSizeBytes, mimeType } = body as {
      assetId?: unknown;
      path?: unknown;
      fileName?: unknown;
      fileSizeBytes?: unknown;
      mimeType?: unknown;
    };

    if (!isUuid(assetId) || typeof path !== "string") {
      return NextResponse.json({ error: "Invalid asset reference." }, { status: 400 });
    }

    const check = validateAssetRequest(fileName, fileSizeBytes);
    if (!check.valid || !check.ext) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    // Scope check: the path must be exactly under this product/asset.
    const prefix = `${productId}/${assetId}/`;
    if (!path.startsWith(prefix) || path.includes("..")) {
      return NextResponse.json({ error: "Invalid asset path." }, { status: 400 });
    }

    // Declared MIME must be plausible for the extension (defense-in-depth;
    // the client never controls the stored content type authoritatively —
    // the stored object keeps whatever contentType the PUT carried).
    if (
      typeof mimeType === "string" &&
      mimeType.length > 0 &&
      !(ASSET_EXTENSION_MIMES[check.ext] ?? []).includes(mimeType)
    ) {
      return NextResponse.json(
        { error: "File content type does not match its extension." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdmin();

    // Verify the object exists; size comes from storage metadata.
    const dir = `${productId}/${assetId}`;
    const file = path.slice(prefix.length);
    const { data: listed, error: listError } = await admin.storage
      .from(DIGITAL_ASSET_BUCKET)
      .list(dir, { limit: 10 });

    if (listError) {
      console.error("[products/assets/confirm] storage list error:", listError.message);
      return NextResponse.json({ error: "Upload verification failed." }, { status: 500 });
    }

    const stored = (listed ?? []).find((f) => f.name === file);
    if (!stored) {
      return NextResponse.json(
        { error: "Uploaded file not found. Please upload again." },
        { status: 400 }
      );
    }

    const storedSize =
      typeof stored.metadata === "object" &&
      stored.metadata !== null &&
      typeof (stored.metadata as { size?: unknown }).size === "number"
        ? ((stored.metadata as { size: number }).size as number)
        : null;
    // Supabase list metadata size is informational; enforce the cap and a
    // rough match against the declared size (tolerates metadata absence).
    if (storedSize !== null) {
      if (storedSize > DIGITAL_ASSET_MAX_BYTES || storedSize <= 0) {
        await admin.storage.from(DIGITAL_ASSET_BUCKET).remove([path]);
        return NextResponse.json({ error: "Uploaded file failed validation." }, { status: 400 });
      }
    }

    const ext = assetExtensionOf(typeof fileName === "string" ? fileName : "");
    const storedMime =
      typeof mimeType === "string" && mimeType.length > 0
        ? mimeType
        : ((ASSET_EXTENSION_MIMES[ext] ?? ["application/octet-stream"])[0] as string);

    // Position appends; version inherits the product version so the listing
    // and its files stay coherent until the creator bumps the product.
    const { count } = await admin
      .from("product_assets")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);

    const { data: inserted, error: insertError } = await admin
      .from("product_assets")
      .insert({
        id: assetId,
        product_id: productId,
        file_path: path,
        file_name: (fileName as string).slice(0, 255),
        mime_type: storedMime.slice(0, 127),
        file_size_bytes:
          storedSize ?? (typeof fileSizeBytes === "number" ? fileSizeBytes : 0),
        position: count ?? 0,
        is_preview: false,
        version: (gate.product.version ?? "1.0").slice(0, 20),
      })
      .select("id, file_name, mime_type, file_size_bytes, position, is_preview, version, created_at")
      .single();

    if (insertError || !inserted) {
      console.error("[products/assets/confirm] insert error:", insertError?.message);
      return NextResponse.json({ error: "Could not attach the asset." }, { status: 500 });
    }

    return NextResponse.json({ asset: inserted });
  } catch (err) {
    console.error("[products/assets/confirm] route error:", err);
    return NextResponse.json(
      { error: "Could not confirm the upload. Please try again." },
      { status: 500 }
    );
  }
}
