import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
  const limit = 5;

  const supabaseAdmin = createSupabaseAdmin();

  const { data: donations, error } = await supabaseAdmin
    .from("donations")
    .select("id, donor_name, amount, created_at, user_id")
    .eq("fundraiser_id", id)
    .in("status", ["succeeded", "completed"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set((donations ?? []).map((d) => d.user_id).filter((id): id is string => Boolean(id)))
  );

  let profileMap: Record<string, { id: string; display_name: string | null; avatar_url: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);
    profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  }

  const rows = (donations ?? []).map((d) => ({
    ...d,
    profile: d.user_id ? profileMap[d.user_id] ?? null : null,
  }));

  return NextResponse.json({ ok: true, donations: rows, hasMore: rows.length === limit });
}