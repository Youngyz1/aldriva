import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Binds a beneficiary profile to the signed-in account.
 *
 * The token proves the person received the invite; the session proves who
 * they are. Both are required — a token alone can't bind a profile to an
 * arbitrary account, and a session alone can't claim a profile you weren't
 * invited to.
 *
 * The token is consumed on success so the link is single-use, and the update
 * is conditional on the row still being unclaimed so two concurrent requests
 * can't both succeed.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to claim this profile." }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing claim token." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const now = new Date().toISOString();
  // Conditional update rather than read-then-write: `.is("user_id", null)`
  // makes the database the arbiter, so a race between two claims can only
  // ever update one row.
  const { data: claimed, error } = await admin
    .from("beneficiaries")
    .update({
      user_id: user.id,
      claimed_at: now,
      updated_at: now,
      // Consume the token so the emailed link cannot be reused.
      claim_token: null,
    })
    .eq("claim_token", token)
    .is("user_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This link is no longer valid — it may have been used already." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, beneficiaryId: claimed.id });
}
