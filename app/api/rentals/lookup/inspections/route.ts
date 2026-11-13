import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { canUsePrivateR2Media } from "@/lib/media/driver-policy";
import { getPrivateMediaReadUrl } from "@/lib/storage/private-media";
import { enforceRateLimit } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const limited = await enforceRateLimit("guestLookup", req);
    if (limited) return limited;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || "";
    const key = searchParams.get("key") || "";
    if (!UUID.test(token) || !key) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const admin = createSupabaseAdmin();
    const { data: booking } = await admin
      .from("rental_bookings")
      .select("id, organizer_id")
      .eq("lookup_token", token)
      .maybeSingle();
    if (!booking) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const organizerId = (booking as { organizer_id: string }).organizer_id;
    const bookingId = (booking as { id: string }).id;
    const expectedPrefix = `rentals/inspections/${organizerId}/${bookingId}/`;
    if (!key.startsWith(expectedPrefix)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const useR2 = canUsePrivateR2Media({
      driver: process.env.IMAGE_STORAGE_DRIVER,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    if (!useR2) return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
    const url = await getPrivateMediaReadUrl(key, 120);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[rentals/lookup/inspections]", err);
    return NextResponse.json({ error: "Could not load image." }, { status: 500 });
  }
}