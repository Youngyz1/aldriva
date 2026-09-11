import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden in production" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "uche2net@gmail.com",
  });
  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  const supabase = await createSupabaseServer();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr) {
    return NextResponse.json({ error: verifyErr.message }, { status: 500 });
  }

  const nextPath =
    req.nextUrl.searchParams.get("next") ||
    "/dashboard/events/b43e4ceb-118b-4106-9754-b604060e9d6a/seating";

  return NextResponse.redirect(new URL(nextPath, "http://localhost:3002"));
}
