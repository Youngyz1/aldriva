import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import ProfileClient from "./ProfileClient";

type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("public_profiles")
    .select("id, display_name")
    .eq("id", id)
    .maybeSingle();

  const name = (data as { display_name: string | null } | null)?.display_name || "Member";
  return {
    title: `${name} - Aldriva`,
    description: `View ${name}'s public Aldriva profile.`,
    alternates: {
      canonical: `${getSiteUrl()}/profile/${id}`,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabaseAdmin = createSupabaseAdmin();

  // Fetch profile + follower/following counts in parallel
  const [profileResult, followerResult, followingResult] = await Promise.all([
    supabaseAdmin
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", id),
    supabaseAdmin
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", id),
  ]);

  const profile = profileResult.data as PublicProfile | null;
  if (!profile) return notFound();

  const followerCount = followerResult.count ?? 0;
  const followingCount = followingResult.count ?? 0;

  // Determine the current viewer — no redirect on failure, page is public
  let viewerId: string | null = null;
  try {
    const supabaseServer = await createSupabaseServer();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    viewerId = user?.id ?? null;
  } catch {
    // Unauthenticated or cookie error — leave viewerId null
  }

  // Check if the viewer is already following this profile
  let isFollowing = false;
  const isOwnProfile = viewerId === id;
  if (viewerId && !isOwnProfile) {
    const { data: followRow } = await supabaseAdmin
      .from("follows")
      .select("id")
      .eq("follower_id", viewerId)
      .eq("following_id", id)
      .maybeSingle();
    isFollowing = Boolean(followRow);
  }

  return (
    <ProfileClient
      profile={profile}
      followerCount={followerCount}
      followingCount={followingCount}
      isFollowing={isFollowing}
      isOwnProfile={isOwnProfile}
      isLoggedIn={Boolean(viewerId)}
    />
  );
}
