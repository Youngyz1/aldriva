import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FollowTargetType = "user" | "organizer";

/**
 * Single follow/unfollow endpoint for every followable entity on the
 * platform (users today, organizers today, more types later). This is the
 * only place that's allowed to write to the follows / organizer_follows
 * tables — clients must never write those directly, so that validation,
 * permissions, dedupe, and notification creation stay in one place.
 */
export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabaseServer = await createSupabaseServer();
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", message: "You must be signed in to follow someone." },
      { status: 401 }
    );
  }

  // ── Payload validation ────────────────────────────────────────────────────
  const payload = await req.json().catch(() => null);
  const targetType: FollowTargetType | undefined = payload?.targetType;
  const targetId: string | undefined = payload?.targetId;

  if (targetType !== "user" && targetType !== "organizer") {
    return NextResponse.json(
      { ok: false, error: "invalid_target_type", message: "targetType must be 'user' or 'organizer'." },
      { status: 400 }
    );
  }

  if (!targetId || !uuidPattern.test(targetId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_target", message: "A valid target ID is required." },
      { status: 400 }
    );
  }

  const supabaseAdmin = createSupabaseAdmin();

  if (targetType === "organizer") {
    return followOrganizer({ supabaseAdmin, actorId: user.id, organizerId: targetId });
  }

  return followUser({ supabaseAdmin, actorId: user.id, targetUserId: targetId });
}

// ── User → user follow ────────────────────────────────────────────────────

async function followUser({
  supabaseAdmin,
  actorId,
  targetUserId,
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  actorId: string;
  targetUserId: string;
}) {
  if (actorId === targetUserId) {
    return NextResponse.json(
      { ok: false, error: "self_follow", message: "You cannot follow yourself." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("follows")
    .select("id")
    .eq("follower_id", actorId)
    .eq("following_id", targetUserId)
    .maybeSingle();

  let following: boolean;

  if (existing) {
    await supabaseAdmin
      .from("follows")
      .delete()
      .eq("follower_id", actorId)
      .eq("following_id", targetUserId);
    following = false;
  } else {
    await supabaseAdmin
      .from("follows")
      .insert({ follower_id: actorId, following_id: targetUserId });
    following = true;

    const { data: followerProfile } = await supabaseAdmin
      .from("public_profiles")
      .select("display_name")
      .eq("id", actorId)
      .maybeSingle();

    await createNotification({
      userId: targetUserId,
      actorId,
      type: "follow",
      title: "New follower",
      body: `${followerProfile?.display_name || "Someone"} started following you.`,
      link: `/profile/${actorId}`,
      relatedType: "profile",
      relatedId: actorId,
    });
  }

  const { count } = await supabaseAdmin
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", targetUserId);

  return NextResponse.json({ ok: true, following, followerCount: count ?? 0 });
}

// ── User → organizer follow ───────────────────────────────────────────────

async function followOrganizer({
  supabaseAdmin,
  actorId,
  organizerId,
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  actorId: string;
  organizerId: string;
}) {
  const { data: organizer } = await supabaseAdmin
    .from("organizers")
    .select("user_id, slug, name")
    .eq("id", organizerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!organizer) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "This organization could not be found." },
      { status: 404 }
    );
  }

  if (organizer.user_id === actorId) {
    return NextResponse.json(
      { ok: false, error: "self_follow", message: "You cannot follow your own organization." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("organizer_follows")
    .select("id")
    .eq("organizer_id", organizerId)
    .eq("user_id", actorId)
    .maybeSingle();

  let following: boolean;

  if (existing) {
    await supabaseAdmin
      .from("organizer_follows")
      .delete()
      .eq("organizer_id", organizerId)
      .eq("user_id", actorId);
    following = false;
  } else {
    await supabaseAdmin
      .from("organizer_follows")
      .insert({ organizer_id: organizerId, user_id: actorId });
    following = true;

    if (organizer.user_id) {
      const { data: followerProfile } = await supabaseAdmin
        .from("public_profiles")
        .select("display_name")
        .eq("id", actorId)
        .maybeSingle();

      await createNotification({
        userId: organizer.user_id,
        actorId,
        type: "follow",
        title: "New follower",
        body: `${followerProfile?.display_name || "Someone"} started following ${organizer.name}.`,
        link: `/org/${organizer.slug ?? organizerId}`,
        relatedType: "organizer",
        relatedId: organizerId,
      });
    }
  }

  const { count } = await supabaseAdmin
    .from("organizer_follows")
    .select("*", { count: "exact", head: true })
    .eq("organizer_id", organizerId);

  return NextResponse.json({ ok: true, following, followerCount: count ?? 0 });
}
