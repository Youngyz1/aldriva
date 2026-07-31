/**
 * app/api/admin/reviews/route.ts
 * GET /api/admin/reviews  — paginated list of all reviews for admin moderation
 * Admin only. Uses service-role client.
 */

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function requireAdminUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" || profile.status !== "active") return null;
  return user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const perPage = Math.min(50, Math.max(1, Number(sp.get("per_page") ?? 20)));
  const status = sp.get("status"); // "approved" | "hidden" | null (all)
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabaseAdmin
    .from("reviews")
    .select(
      "id, rating, title, review, is_approved, is_verified, created_at, user_id, event_id, fundraiser_id, organizer_id, review_type, events(title), fundraisers(title), organizers(name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status === "approved") query = query.eq("is_approved", true);
  if (status === "hidden") query = query.eq("is_approved", false);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set((data ?? []).map((review) => review.user_id).filter(Boolean))
  );
  const { data: profiles } = userIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds)
    : { data: [] };
  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, { display_name: profile.display_name }])
  );
  const reviews = (data ?? []).map((review) => ({
    ...review,
    profiles: review.user_id ? profileById.get(review.user_id) ?? null : null,
  }));

  return NextResponse.json({
    reviews,
    total: count ?? 0,
    page,
    per_page: perPage,
    total_pages: Math.ceil((count ?? 0) / perPage),
  });
}
