/**
 * app/api/reviews/route.ts
 * GET  /api/reviews?event_id=<uuid>          — list approved reviews for an event
 * GET  /api/reviews?fundraiser_id=<uuid>     — list approved reviews for a fundraiser
 * GET  /api/reviews?organizer_id=<uuid>      — list approved reviews for an organizer
 * POST /api/reviews                           — create a new review (auth required)
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

function isValidUuid(v: string | null): v is string {
  return Boolean(v && UUID_PATTERN.test(v));
}

// ── GET — list reviews ────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const eventId = sp.get("event_id");
  const fundraiserId = sp.get("fundraiser_id");
  const organizerId = sp.get("organizer_id");

  // Determine which column to filter on
  type Target = { column: string; id: string };
  let target: Target | null = null;

  if (isValidUuid(eventId)) {
    target = { column: "event_id", id: eventId };
  } else if (isValidUuid(fundraiserId)) {
    target = { column: "fundraiser_id", id: fundraiserId };
  } else if (isValidUuid(organizerId)) {
    target = { column: "organizer_id", id: organizerId };
  }

  const baseSelect = "id, rating, title, review, is_verified, created_at, updated_at, user_id";

  let query = supabaseAdmin
    .from("reviews")
    .select(baseSelect)
    .eq("is_approved", true);

  if (target) {
    query = query.eq(target.column, target.id);
  } else {
    query = query.eq("review_type", "platform");
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set((data ?? []).map((review) => review.user_id).filter(Boolean))
  );
  const { data: profiles } = userIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds)
    : { data: [] };
  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      { display_name: profile.display_name, avatar_url: profile.avatar_url },
    ])
  );
  const reviews = (data ?? []).map((review) => ({
    ...review,
    profiles: review.user_id ? profileById.get(review.user_id) ?? null : null,
  }));

  return NextResponse.json({ reviews });
}

// ── POST — create review ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Authenticate the user via session cookie
  const supabaseUser = await createSupabaseServer();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { event_id, fundraiser_id, organizer_id, review_type, rating, title, review } = body as {
    event_id?: string;
    fundraiser_id?: string;
    organizer_id?: string;
    review_type?: string;
    rating?: number;
    title?: string;
    review?: string;
  };

  // Validate rating
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json(
      { error: "Rating must be an integer between 1 and 5." },
      { status: 400 }
    );
  }

  // Determine if it is a platform review
  const isPlatform = review_type === "platform" || (!event_id && !fundraiser_id && !organizer_id);

  // At least one target required if not platform review
  const hasEvent = isValidUuid(event_id ?? null);
  const hasFundraiser = isValidUuid(fundraiser_id ?? null);
  const hasOrganizer = isValidUuid(organizer_id ?? null);

  if (!isPlatform && !hasEvent && !hasFundraiser && !hasOrganizer) {
    return NextResponse.json(
      { error: "Provide a valid event_id, fundraiser_id, or organizer_id." },
      { status: 400 }
    );
  }

  // Validate text fields
  const cleanTitle = (title ?? "").trim().slice(0, 200) || null;
  const cleanReview = (review ?? "").trim().slice(0, 2000) || null;

  const payload = {
    user_id: user.id,
    event_id: !isPlatform && hasEvent ? event_id : null,
    fundraiser_id: !isPlatform && hasFundraiser ? fundraiser_id : null,
    organizer_id: !isPlatform && hasOrganizer ? organizer_id : null,
    review_type: isPlatform ? "platform" : (hasEvent ? "event" : (hasFundraiser ? "fundraiser" : "organizer")),
    rating: ratingNum,
    title: cleanTitle,
    review: cleanReview,
    is_approved: true,
  };

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .insert(payload)
    .select("id, rating, title, review, is_verified, created_at, user_id")
    .single();

  if (error) {
    // Unique constraint violation = duplicate review
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You have already reviewed this item." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ review: data }, { status: 201 });
}
