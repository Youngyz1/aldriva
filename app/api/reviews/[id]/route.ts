/**
 * app/api/reviews/[id]/route.ts
 * PUT    /api/reviews/:id  — update own review (auth required)
 * DELETE /api/reviews/:id  — delete own review (auth required; admin can delete any)
 */

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .single();
  return data?.role === "admin" && data?.status === "active";
}

// ── PUT — update own review ───────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid review ID." }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { rating, title, review } = body as {
    rating?: number;
    title?: string;
    review?: string;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (rating !== undefined) {
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json(
        { error: "Rating must be an integer between 1 and 5." },
        { status: 400 }
      );
    }
    updates.rating = ratingNum;
  }

  if (title !== undefined) updates.title = (title ?? "").trim().slice(0, 200) || null;
  if (review !== undefined) updates.review = (review ?? "").trim().slice(0, 2000) || null;

  // Only update if this review belongs to the user
  const { data, error } = await supabaseAdmin
    .from("reviews")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, rating, title, review, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Review not found or you do not have permission to edit it." },
      { status: 404 }
    );
  }

  return NextResponse.json({ review: data });
}

// ── DELETE — delete own review (admin can delete any) ─────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid review ID." }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const admin = await isAdminUser(user.id);

  // Build the delete query — admins can delete any review, users only their own
  const query = supabaseAdmin.from("reviews").delete().eq("id", id);
  if (!admin) query.eq("user_id", user.id);

  const { error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json(
      { error: "Review not found or you do not have permission to delete it." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
