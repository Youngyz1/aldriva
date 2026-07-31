import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/dashboard-context";

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const { email } = body;
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  // Query check_email_pending_deletion RPC function
  const { data, error } = await supabaseAdmin.rpc("check_email_pending_deletion", {
    p_email: email.trim().toLowerCase(),
  });

  if (error) {
    console.error("[signup-guard error]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const matches = data as Array<{ pending_id: string; purge_date: string }> | null;

  if (matches && matches.length > 0) {
    return NextResponse.json({
      isPendingDeletion: true,
      purgeAt: matches[0].purge_date,
    });
  }

  return NextResponse.json({ isPendingDeletion: false });
}
