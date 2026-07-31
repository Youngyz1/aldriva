import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const fundraiserId = searchParams.get("fundraiserId");
  const limitParam = searchParams.get("limit");

  // --- Validate fundraiserId ---
  if (!fundraiserId) {
    return NextResponse.json(
      { error: "Missing required query parameter: fundraiserId" },
      { status: 400 }
    );
  }

  if (!UUID_REGEX.test(fundraiserId)) {
    return NextResponse.json(
      { error: "Invalid fundraiserId: must be a valid UUID" },
      { status: 400 }
    );
  }

  // --- Parse & clamp limit ---
  let limit = 10;
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      return NextResponse.json(
        { error: "Invalid limit: must be a positive integer" },
        { status: 400 }
      );
    }
    limit = Math.min(parsed, 50);
  }

  // --- Query donations (paginated list) ---
  const { data: donations, error: donationsError } = await supabaseAdmin
    .from("donations")
    .select("id, donor_name, amount, created_at, user_id")
    .eq("fundraiser_id", fundraiserId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (donationsError) {
    console.error("[donations GET] donations query error:", donationsError);
    return NextResponse.json(
      { error: "Failed to fetch donations" },
      { status: 500 }
    );
  }

  const userIds = Array.from(
    new Set(
      (donations ?? [])
        .map((donation) => donation.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const profileByUserId = new Map<
    string,
    { id: string; display_name: string | null; avatar_url: string | null }
  >();

  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    for (const profile of profiles ?? []) {
      profileByUserId.set(profile.id, profile);
    }
  }

  // --- Query total count of completed donations ---
  const { count, error: countError } = await supabaseAdmin
    .from("donations")
    .select("id", { count: "exact", head: true })
    .eq("fundraiser_id", fundraiserId)
    .eq("status", "completed");

  if (countError) {
    console.error("[donations GET] count query error:", countError);
    return NextResponse.json(
      { error: "Failed to fetch donation count" },
      { status: 500 }
    );
  }

  // --- Query fundraiser raised & goal ---
  const { data: fundraiser, error: fundraiserError } = await supabaseAdmin
    .from("fundraisers")
    .select("raised, goal")
    .eq("id", fundraiserId)
    .single();

  if (fundraiserError) {
    console.error("[donations GET] fundraiser query error:", fundraiserError);
    return NextResponse.json(
      { error: "Failed to fetch fundraiser details" },
      { status: 500 }
    );
  }

  const publicDonations = (donations ?? []).map((donation) => ({
    id: donation.id,
    donor_name: donation.donor_name,
    user_id: donation.user_id,
    profile: donation.user_id ? profileByUserId.get(donation.user_id) ?? null : null,
    amount: donation.amount,
    created_at: donation.created_at,
  }));

  return NextResponse.json({
    donations: publicDonations,
    totalCount: count ?? 0,
    raised: fundraiser.raised,
    goal: fundraiser.goal,
  });
}
