import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { authorizeMediaTarget, isMediaPurpose, isUuid } from "@/lib/media/public-media";
import { deleteObject } from "@/lib/storage/r2";

export const maxDuration = 60;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const profile = await getCurrentUserProfile();
    if (!profile || profile.status !== "active" || profile.deleted_at) {
      return NextResponse.json({ error: "An active account is required." }, { status: 403 });
    }

    const limited = await enforceRateLimit("mediaUpload", request, user.id);
    if (limited) return limited;

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Media not found." }, { status: 404 });

    const admin = createSupabaseAdmin();
    const { data: media, error: queryError } = await admin
      .from("media")
      .select("id, tenant_id, owner_user_id, object_key, purpose")
      .eq("id", id)
      .maybeSingle();
    if (queryError) throw queryError;
    if (!media || !isMediaPurpose(media.purpose)) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    if (
      (media.purpose === "avatar" && media.owner_user_id !== user.id) ||
      !(await authorizeMediaTarget(user.id, media.purpose, media.tenant_id, "delete"))
    ) {
      return NextResponse.json({ error: "You do not have permission to delete this image." }, { status: 403 });
    }

    const finalBucket = process.env.R2_BUCKET;
    if (!finalBucket) throw new Error("R2 storage is not configured.");
    await deleteObject(finalBucket, media.object_key);

    const { error: deleteError } = await admin.from("media").delete().eq("id", id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[media/delete] failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not delete the image." }, { status: 500 });
  }
}
