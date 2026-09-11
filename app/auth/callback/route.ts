import { createSupabaseServer } from "@/lib/supabase-server";
import { resolveSafeNextPath } from "@/lib/safe-redirect";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] Session exchange error:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
  }

  // Redirect to `next` only when it resolves to a same-origin path.
  return NextResponse.redirect(`${origin}${resolveSafeNextPath(next, origin)}`);
}
