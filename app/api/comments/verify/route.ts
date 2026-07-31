import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/comments/verify?targetType=event&targetId=<uuid>&email=<email>
 * Returns { eligible: true } if the email has a valid ticket order (event)
 * or a successful donation (fundraiser), otherwise { eligible: false }.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId") || "";
  const email = (searchParams.get("email") || "").toLowerCase().trim();

  if (
    (targetType !== "event" && targetType !== "fundraiser") ||
    !uuidPattern.test(targetId) ||
    !email
  ) {
    return NextResponse.json({ eligible: false, reason: "invalid_params" });
  }

  if (targetType === "event") {
    const { data } = await supabaseAdmin
      .from("ticket_orders")
      .select("id")
      .eq("event_id", targetId)
      .ilike("buyer_email", email)
      .in("status", ["valid", "used", "checked_in"])
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ eligible: Boolean(data) });
  }

  // fundraiser
  const { data } = await supabaseAdmin
    .from("donations")
    .select("id")
    .eq("fundraiser_id", targetId)
    .ilike("donor_email", email)
    .in("status", ["completed", "succeeded"])
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ eligible: Boolean(data) });
}
