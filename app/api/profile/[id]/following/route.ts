import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: profileUserId } = await params;

  const supabaseServer = await createSupabaseServer();
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  // Strict server-side privacy: only the profile owner may retrieve their individual following identities
  if (!user || user.id !== profileUserId) {
    return NextResponse.json(
      { error: "Forbidden: Following lists are private to the profile owner." },
      { status: 403 }
    );
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: followRows, error } = await supabaseAdmin
    .from("follows")
    .select("following_id, created_at")
    .eq("follower_id", profileUserId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[profile/following]", error);
    return NextResponse.json({ error: "Failed to load following list." }, { status: 500 });
  }

  const followingIds = (followRows ?? []).map((f) => f.following_id);
  if (followingIds.length === 0) {
    return NextResponse.json({ following: [] });
  }

  const { data: profiles } = await supabaseAdmin
    .from("public_profiles")
    .select("id, display_name, avatar_url")
    .in("id", followingIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const following = followingIds.map((id) => profileMap.get(id) || { id, display_name: "Aldriva Member", avatar_url: null });

  return NextResponse.json({ following });
}
