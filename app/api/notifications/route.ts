import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const offset = Math.max(Number(request.nextUrl.searchParams.get("offset") ?? 0) || 0, 0);

  const [{ data: notifications, error }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, link, related_type, related_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications: notifications ?? [],
    unreadCount: unreadCount ?? 0,
    hasMore: (notifications ?? []).length === PAGE_SIZE,
  });
}
