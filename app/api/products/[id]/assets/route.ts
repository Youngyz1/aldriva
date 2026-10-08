import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireProductOwner } from "@/lib/product-access";
import { canUsePrivateR2Media } from "@/lib/media/driver-policy";
import { deletePrivateMediaObject } from "@/lib/storage/private-media";
import {
  DIGITAL_ASSET_BUCKET,
  isUuid,
  productAssetStorageProvider,
} from "@/lib/digital-products";

export const maxDuration = 60;

/** Public metadata shape — file_path is never exposed to the browser. */
function toPublicAsset(row: {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  position: number;
  is_preview: boolean;
  version: string;
  created_at: string;
}) {
  return row;
}

/**
 * GET /api/products/[id]/assets — list asset metadata for the owner/admin.
 * file_path is stripped: it is only ever used server-side to mint signed URLs.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;

    const gate = await requireProductOwner(productId);
    if ("error" in gate) return gate.error;

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("product_assets")
      .select(
        "id, file_name, mime_type, file_size_bytes, position, is_preview, version, created_at"
      )
      .eq("product_id", productId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[products/assets] list error:", error.message);
      return NextResponse.json({ error: "Could not load assets." }, { status: 500 });
    }

    return NextResponse.json({ assets: (data ?? []).map(toPublicAsset) });
  } catch (err) {
    console.error("[products/assets] GET route error:", err);
    return NextResponse.json(
      { error: "Could not load assets. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/products/[id]/assets — bulk reorder / flag / version update.
 * Body: { assets: [{ id, position?, is_preview?, version? }] }.
 * Every row is re-scoped to the product server-side; unknown ids fail closed.
 */
export async function PATCH(
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
    const updates = (body as { assets?: unknown }).assets;
    if (!Array.isArray(updates) || updates.length === 0 || updates.length > 100) {
      return NextResponse.json({ error: "No asset updates supplied." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data: existing } = await admin
      .from("product_assets")
      .select("id")
      .eq("product_id", productId);
    const ownedIds = new Set((existing ?? []).map((r: { id: string }) => r.id));

    for (const item of updates) {
      const row = item as {
        id?: unknown;
        position?: unknown;
        is_preview?: unknown;
        version?: unknown;
      };
      if (!isUuid(row.id) || !ownedIds.has(row.id)) {
        return NextResponse.json({ error: "Invalid asset update." }, { status: 400 });
      }
      const patch: Record<string, unknown> = {};
      if (row.position !== undefined) {
        if (
          typeof row.position !== "number" ||
          !Number.isInteger(row.position) ||
          row.position < 0 ||
          row.position > 10000
        ) {
          return NextResponse.json({ error: "Invalid asset position." }, { status: 400 });
        }
        patch.position = row.position;
      }
      if (row.is_preview !== undefined) {
        if (typeof row.is_preview !== "boolean") {
          return NextResponse.json({ error: "Invalid preview flag." }, { status: 400 });
        }
        patch.is_preview = row.is_preview;
      }
      if (row.version !== undefined) {
        const version = typeof row.version === "string" ? row.version.trim() || "1.0" : "1.0";
        if (version.length > 20) {
          return NextResponse.json({ error: "Version cannot exceed 20 characters." }, { status: 400 });
        }
        patch.version = version;
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "Invalid asset update." }, { status: 400 });
      }
      const { error } = await admin
        .from("product_assets")
        .update(patch)
        .eq("id", row.id)
        .eq("product_id", productId);
      if (error) {
        console.error("[products/assets] patch error:", error.message);
        return NextResponse.json({ error: "Could not update assets." }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[products/assets] PATCH route error:", err);
    return NextResponse.json(
      { error: "Could not update assets. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/products/[id]/assets?assetId= — removes the storage object
 * (service role) and its row. Scoped to the product; unknown ids 404.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;

    const gate = await requireProductOwner(productId);
    if ("error" in gate) return gate.error;

    const limited = await enforceRateLimit("productAsset", req, gate.user.id);
    if (limited) return limited;

    const assetId = req.nextUrl.searchParams.get("assetId");
    if (!isUuid(assetId)) {
      return NextResponse.json({ error: "Invalid asset." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data: row } = await admin
      .from("product_assets")
      .select("id, file_path, storage_provider")
      .eq("id", assetId)
      .eq("product_id", productId)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }

    const provider = productAssetStorageProvider((row as { storage_provider?: string }).storage_provider);
    if (provider === "r2") {
      if (!canUsePrivateR2Media({
        driver: process.env.IMAGE_STORAGE_DRIVER,
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      })) {
        return NextResponse.json({ error: "R2 operations are unavailable for this deployment." }, { status: 409 });
      }
      try {
        await deletePrivateMediaObject((row as { file_path: string }).file_path);
      } catch (storageError) {
        console.error("[products/assets] R2 remove failed:", storageError instanceof Error ? storageError.name : "unknown");
        // Continue: deleting the database row keeps the existing removal behavior.
      }
    } else if (provider === "supabase") {
      const { error: storageError } = await admin.storage
        .from(DIGITAL_ASSET_BUCKET)
        .remove([(row as { file_path: string }).file_path]);
      if (storageError) {
        console.error("[products/assets] storage remove error:", storageError.message);
        // Continue: the row must still go so a stuck object can't block the UI.
      }
    } else {
      return NextResponse.json({ error: "Asset storage provider is invalid." }, { status: 500 });
    }

    const { error } = await admin
      .from("product_assets")
      .delete()
      .eq("id", assetId)
      .eq("product_id", productId);
    if (error) {
      console.error("[products/assets] delete error:", error.message);
      return NextResponse.json({ error: "Could not delete the asset." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[products/assets] DELETE route error:", err);
    return NextResponse.json(
      { error: "Could not delete the asset. Please try again." },
      { status: 500 }
    );
  }
}
