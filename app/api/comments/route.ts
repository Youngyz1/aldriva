import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notifications";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TargetType = "event" | "fundraiser";

function isTargetType(value: string | null): value is TargetType {
  return value === "event" || value === "fundraiser";
}

function targetTable(targetType: TargetType) {
  return targetType === "event" ? "events" : "fundraisers";
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

async function getCurrentUserId() {
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function targetExists(targetType: TargetType, targetId: string) {
  const { data, error } = await supabaseAdmin
    .from(targetTable(targetType))
    .select("id")
    .eq("id", targetId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId") || "";
  const includeDonorAmounts = searchParams.get("includeDonorAmounts") === "true";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 50);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

  if (!isTargetType(targetType) || !uuidPattern.test(targetId)) {
    return NextResponse.json({ error: "Invalid comment target." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("comments")
    .select("id, author_name, author_email, body, created_at, user_id, likes")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const comments = data || [];
  const emails = comments
    .map((c) => c.author_email)
    .filter((e): e is string => Boolean(e));

  const amountByEmail = new Map<string, number>();
  const userIds = Array.from(
    new Set(
      comments
        .map((comment) => comment.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const profileByUserId = new Map<
    string,
    { id: string; display_name: string | null; avatar_url: string | null }
  >();

  if (emails.length > 0) {
    const promises = [];

    if (includeDonorAmounts && targetType === "fundraiser") {
      promises.push(
        supabaseAdmin
          .from("donations")
          .select("donor_email, amount")
          .eq("fundraiser_id", targetId)
          .in("status", ["completed", "succeeded"])
          .in("donor_email", emails)
          .then(({ data: donations }) => {
            for (const d of donations || []) {
              const key = (d.donor_email || "").toLowerCase();
              if (!amountByEmail.has(key) || Number(d.amount ?? 0) > (amountByEmail.get(key) ?? 0)) {
                amountByEmail.set(key, Number(d.amount ?? 0));
              }
            }
          })
      );
    }

    await Promise.all(promises);
  }

  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    for (const profile of profiles ?? []) {
      profileByUserId.set(profile.id, profile);
    }
  }

  // Real like counts (added on top of the imported baseline) + whether THIS
  // visitor (by their visitor_id cookie) has already liked each comment, so the
  // UI can pre-fill hearts on load.
  const commentIds = comments.map((c) => c.id);
  const realLikeCount = new Map<string, number>();
  const likedByVisitor = new Set<string>();
  if (commentIds.length > 0) {
    const { data: counts } = await supabaseAdmin.rpc("get_comment_like_counts", {
      ids: commentIds,
    });
    for (const row of (counts ?? []) as { comment_id: string; cnt: number }[]) {
      realLikeCount.set(row.comment_id, Number(row.cnt));
    }
    const visitorCookie = request.cookies.get("visitor_id")?.value;
    if (visitorCookie && uuidPattern.test(visitorCookie)) {
      const { data: mine } = await supabaseAdmin
        .from("comment_likes")
        .select("comment_id")
        .eq("cookie_id", visitorCookie)
        .in("comment_id", commentIds);
      for (const row of (mine ?? []) as { comment_id: string }[]) {
        likedByVisitor.add(row.comment_id);
      }
    }
  }

  const safeComments = comments.map((comment) => {
    const emailKey = comment.author_email?.toLowerCase();
    const profile = comment.user_id ? profileByUserId.get(comment.user_id) ?? null : null;
    return {
      id: comment.id,
      author_name: comment.author_name,
      body: comment.body,
      created_at: comment.created_at,
      user_id: comment.user_id,
      likes: Number(comment.likes ?? 0) + (realLikeCount.get(comment.id) ?? 0),
      liked: likedByVisitor.has(comment.id),
      donor_amount: emailKey ? (amountByEmail.get(emailKey) ?? null) : null,
      author_profile: profile,
    };
  });

  return NextResponse.json({ comments: safeComments, hasMore: safeComments.length === limit });
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);

  if (!payload) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const targetType = cleanText(payload.targetType || payload.type);
  const targetId = cleanText(payload.targetId || payload.fundraiser_id);
  const authorName = cleanText(payload.authorName || payload.author_name, "Anonymous").slice(0, 120) || "Anonymous";
  const authorEmail = cleanText(payload.authorEmail).slice(0, 255) || null;
  const body = cleanText(payload.body);
  const stripeSessionId = cleanText(payload.stripeSessionId);
  const postDonationFlow = payload.type === "fundraiser" && Boolean(payload.fundraiser_id);
  const currentUserId = await getCurrentUserId();

  if (!isTargetType(targetType) || !uuidPattern.test(targetId)) {
    return NextResponse.json({ error: "Invalid comment target." }, { status: 400 });
  }

  // Comments are only allowed on fundraisers now
  if (targetType !== "fundraiser") {
    return NextResponse.json({ error: "Comments are not enabled for this type." }, { status: 403 });
  }

  if (body.length < 2 || body.length > 1000) {
    return NextResponse.json(
      { error: "Message must be between 2 and 1000 characters." },
      { status: 400 }
    );
  }

  let verifiedDonation: { id?: string; amount?: number | null; donor_email?: string | null } | null = null;

  if (!postDonationFlow) {
    // ── Donation verification ────────────────────────────────────────────────
    // Must supply a valid Stripe session ID that corresponds to a donation for this fundraiser.
    if (!stripeSessionId) {
      return NextResponse.json(
        { error: "A valid donation session is required to leave a message." },
        { status: 403 }
      );
    }

    const { data: donation } = await supabaseAdmin
      .from("donations")
      .select("id, amount, donor_email")
      .eq("fundraiser_id", targetId)
      .eq("payment_intent_id", stripeSessionId)
      .in("status", ["completed", "succeeded"])
      .limit(1)
      .maybeSingle();

    // payment_intent_id may store either the session ID or the payment intent ID.
    // Fall back to checking if any completed donation exists for this email + fundraiser.
    verifiedDonation = donation;
    if (!verifiedDonation && authorEmail) {
      const { data: fallback } = await supabaseAdmin
        .from("donations")
        .select("id, amount, donor_email")
        .eq("fundraiser_id", targetId)
        .ilike("donor_email", authorEmail)
        .in("status", ["completed", "succeeded"])
        .limit(1)
        .maybeSingle();
      verifiedDonation = fallback;
    }

    if (!verifiedDonation) {
      return NextResponse.json(
        { error: "We could not verify your donation for this fundraiser." },
        { status: 403 }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────
  } else if (authorEmail) {
    const { data: fallback } = await supabaseAdmin
      .from("donations")
      .select("id, amount, donor_email")
      .eq("fundraiser_id", targetId)
      .ilike("donor_email", authorEmail)
      .in("status", ["completed", "succeeded"])
      .limit(1)
      .maybeSingle();
    verifiedDonation = fallback;
  }

  try {
    const exists = await targetExists(targetType, targetId);
    if (!exists) {
      return NextResponse.json({ error: "This fundraiser no longer exists." }, { status: 404 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify fundraiser.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("comments")
    .insert({
      target_type: targetType,
      target_id: targetId,
      author_name: authorName,
      author_email: authorEmail || verifiedDonation?.donor_email || null,
      user_id: currentUserId,
      body,
      status: "approved",
    })
    .select("id, author_name, body, created_at, user_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: profile } = data.user_id
    ? await supabaseAdmin
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .eq("id", data.user_id)
        .maybeSingle()
    : { data: null };

  notifyFundraiserOwnerOfComment({
    fundraiserId: targetId,
    commentId: data.id,
    commenterUserId: currentUserId,
    commenterName: authorName,
    body,
  }).catch((err) => console.error("[comments] Failed to notify fundraiser owner:", err));

  return NextResponse.json({
    comment: {
      ...data,
      likes: 0,
      liked: false,
      donor_amount: Number(verifiedDonation?.amount ?? 0),
      author_profile: profile,
    }
  }, { status: 201 });
}

async function notifyFundraiserOwnerOfComment(params: {
  fundraiserId: string;
  commentId: string;
  commenterUserId: string | null;
  commenterName: string;
  body: string;
}) {
  const { data: fundraiser } = await supabaseAdmin
    .from("fundraisers")
    .select("title, slug, organizer_id, user_id")
    .eq("id", params.fundraiserId)
    .maybeSingle();

  if (!fundraiser) return;

  let ownerUserId = fundraiser.user_id;
  if (fundraiser.organizer_id) {
    const { data: organizer } = await supabaseAdmin
      .from("organizers")
      .select("user_id")
      .eq("id", fundraiser.organizer_id)
      .maybeSingle();
    if (organizer?.user_id) ownerUserId = organizer.user_id;
  }

  if (!ownerUserId || ownerUserId === params.commenterUserId) return;

  await createNotification({
    userId: ownerUserId,
    actorId: params.commenterUserId,
    type: "comment",
    title: "New comment on your fundraiser",
    body: `${params.commenterName}: "${params.body.slice(0, 140)}"`,
    link: fundraiser.slug ? `/fundraisers/${fundraiser.slug}` : null,
    relatedType: "comment",
    relatedId: params.commentId,
  });
}
