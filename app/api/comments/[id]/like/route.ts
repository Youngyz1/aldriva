/**
 * app/api/comments/[id]/like/route.ts
 * POST   — like a comment (anyone, no login).
 * DELETE — unlike (removes only this visitor's own like).
 *
 * Dedup: a like is refused if EITHER the visitor's `visitor_id` cookie OR the
 * client IP already liked the comment. The displayed count = comments.likes
 * (admin/imported baseline) + count(*) of rows in comment_likes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createNotification } from "@/lib/notifications";

// Service role: bypasses RLS — comment_likes has no public policies.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COOKIE = "visitor_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Real client IP on Vercel (first x-forwarded-for entry); null in local dev. */
function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || null;
}

function readVisitorCookie(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE)?.value;
  return v && uuidPattern.test(v) ? v : null;
}

function setVisitorCookie(res: NextResponse, id: string) {
  res.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

async function totalLikes(commentId: string, baseline: number): Promise<number> {
  const { count } = await supabaseAdmin
    .from("comment_likes")
    .select("id", { count: "exact", head: true })
    .eq("comment_id", commentId);
  return baseline + (count ?? 0);
}

type ApprovedComment = {
  baseline: number;
  authorUserId: string | null;
  targetType: string;
  targetId: string;
  body: string;
};

/** Returns the comment's baseline like count if it exists and is publicly shown. */
async function getApprovedComment(id: string): Promise<ApprovedComment | null> {
  const { data } = await supabaseAdmin
    .from("comments")
    .select("id, likes, status, user_id, target_type, target_id, body")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status !== "approved") return null;
  return {
    baseline: Number(data.likes ?? 0),
    authorUserId: data.user_id,
    targetType: data.target_type,
    targetId: data.target_id,
    body: data.body,
  };
}

async function notifyCommentAuthorOfLike(id: string, comment: ApprovedComment) {
  if (!comment.authorUserId || comment.targetType !== "fundraiser") return;

  const { data: fundraiser } = await supabaseAdmin
    .from("fundraisers")
    .select("slug")
    .eq("id", comment.targetId)
    .maybeSingle();

  await createNotification({
    userId: comment.authorUserId,
    type: "like",
    title: "Someone liked your comment",
    body: `"${comment.body.slice(0, 140)}"`,
    link: fundraiser?.slug ? `/fundraisers/${fundraiser.slug}` : null,
    relatedType: "comment",
    relatedId: id,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Invalid comment." }, { status: 400 });
  }
  const comment = await getApprovedComment(id);
  if (!comment) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  const existing = readVisitorCookie(req);
  const isNewCookie = !existing;
  const cookieId = existing ?? randomUUID();
  const ip = clientIp(req);

  // Already liked by THIS visitor (cookie)?
  const { data: byCookie } = await supabaseAdmin
    .from("comment_likes")
    .select("id")
    .eq("comment_id", id)
    .eq("cookie_id", cookieId)
    .limit(1);

  if (byCookie && byCookie.length > 0) {
    const count = await totalLikes(id, comment.baseline);
    const res = NextResponse.json({ liked: true, count });
    if (isNewCookie) setVisitorCookie(res, cookieId);
    return res;
  }

  // Blocked because a DIFFERENT visitor on this IP already liked it?
  if (ip) {
    const { data: byIp } = await supabaseAdmin
      .from("comment_likes")
      .select("id")
      .eq("comment_id", id)
      .eq("ip_address", ip)
      .limit(1);
    if (byIp && byIp.length > 0) {
      const count = await totalLikes(id, comment.baseline);
      const res = NextResponse.json({ liked: false, blocked: true, count });
      if (isNewCookie) setVisitorCookie(res, cookieId);
      return res;
    }
  }

  const { error } = await supabaseAdmin
    .from("comment_likes")
    .insert({ comment_id: id, cookie_id: cookieId, ip_address: ip });

  let liked = true;
  if (error) {
    // 23505 = unique violation: a concurrent request won the race. Our visitor
    // is "liked" only if it was our cookie that got the row.
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { data: recheck } = await supabaseAdmin
      .from("comment_likes")
      .select("id")
      .eq("comment_id", id)
      .eq("cookie_id", cookieId)
      .limit(1);
    liked = Boolean(recheck && recheck.length);
  } else {
    notifyCommentAuthorOfLike(id, comment).catch((err) =>
      console.error("[comments] Failed to notify comment author of like:", err)
    );
  }

  const count = await totalLikes(id, comment.baseline);
  const res = NextResponse.json({ liked, count });
  if (isNewCookie) setVisitorCookie(res, cookieId);
  return res;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Invalid comment." }, { status: 400 });
  }
  const comment = await getApprovedComment(id);
  if (!comment) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  // Unlike only removes this visitor's own like (keyed by their cookie).
  const cookieId = readVisitorCookie(req);
  if (cookieId) {
    await supabaseAdmin
      .from("comment_likes")
      .delete()
      .eq("comment_id", id)
      .eq("cookie_id", cookieId);
  }

  const count = await totalLikes(id, comment.baseline);
  return NextResponse.json({ liked: false, count });
}
