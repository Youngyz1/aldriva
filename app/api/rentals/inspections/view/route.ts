import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { checkTenantAccess } from "@/lib/entity-auth";
import { canUsePrivateR2Media } from "@/lib/media/driver-policy";
import { getPrivateMediaSignedGetUrl } from "@/lib/storage/private-media";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key") || "";
    const organizerId = searchParams.get("organizerId") || "";
    const bookingId = searchParams.get("bookingId") || "";
    if (!key || !organizerId || !bookingId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const expectedPrefix = `rentals/inspections/${organizerId}/${bookingId}/`;
    if (!key.startsWith(expectedPrefix)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const access = await checkTenantAccess(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
    if (!access.hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const useR2 = canUsePrivateR2Media({
      driver: process.env.IMAGE_STORAGE_DRIVER,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    if (!useR2) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
    const url = await getPrivateMediaSignedGetUrl(key, 120);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[rentals/inspections/view]", err);
    return NextResponse.json({ error: "Could not load image." }, { status: 500 });
  }
}
