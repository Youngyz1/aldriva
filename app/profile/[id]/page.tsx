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

type PublicOrganizer = {
  id: string;
  name: string | null;
  slug: string | null;
  photo: string | null;
  bio: string | null;
  status: string | null;
  verified_at: string | null;
};

type PublicFundraiser = {
  id: string;
  title: string;
  slug: string;
  banner: string | null;
  image_url: string | null;
  goal: number | string | null;
  raised: number | string | null;
  raised_amount: number | string | null;
  category: string | null;
  created_at: string | null;
  status: string | null;
};

type DonationActivity = {
  id: string;
  amount: number | string | null;
  created_at: string;
  fundraiser: {
    title: string;
    slug: string;
  };
};

type FundraiserRelation = {
  title: string | null;
  slug: string | null;
  status: string | null;
  deleted_at: string | null;
};

type DonationRow = {
  id: string;
  amount: number | string | null;
  created_at: string;
  fundraisers: FundraiserRelation | FundraiserRelation[] | null;
};

function metadataDisplayName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function withAuthDisplayName(profile: PublicProfile): Promise<PublicProfile> {
  if (profile.display_name?.trim()) return profile;

  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  const fallbackName = metadataDisplayName(data.user?.user_metadata?.display_name);

  return fallbackName ? { ...profile, display_name: fallbackName } : profile;
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0];
  return value ?? null;
}

function publicDonationActivity(rows: DonationRow[]): DonationActivity[] {
  return rows
    .map((row) => {
      const fundraiser = firstRelation(row.fundraisers);
      if (!fundraiser?.slug || !fundraiser.title) return null;
      if (fundraiser.status !== "published" || fundraiser.deleted_at) return null;

      return {
        id: row.id,
        amount: row.amount,
        created_at: row.created_at,
        fundraiser: {
          title: fundraiser.title,
          slug: fundraiser.slug,
        },
      };
    })
    .filter((row): row is DonationActivity => Boolean(row))
    .slice(0, 6);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabaseAdmin = createSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("public_profiles")
    .select("id, display_name, avatar_url")
    .eq("id", id)
    .maybeSingle();

  const profile = data ? await withAuthDisplayName(data as PublicProfile) : null;
  const name = profile?.display_name || "Member";

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

  let viewerId: string | null = null;
  try {
    const supabaseServer = await createSupabaseServer();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    viewerId = user?.id ?? null;
  } catch {
    // Public page: unauthenticated visitors can still view public profile data.
  }

  const isOwnProfile = viewerId === id;

  let fundraisersQuery = supabaseAdmin
    .from("fundraisers")
    .select("id, title, slug, banner, image_url, goal, raised, raised_amount, category, created_at, status")
    .eq("user_id", id)
    .is("deleted_at", null);

  if (!isOwnProfile) {
    fundraisersQuery = fundraisersQuery.eq("status", "published");
  }

  fundraisersQuery = fundraisersQuery.order("created_at", { ascending: false }).limit(6);

  const [profileResult, followerResult, followingResult, organizersResult, fundraisersResult, donationsResult] = await Promise.all([
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
    supabaseAdmin
      .from("organizers")
      .select("id, name, slug, photo, bio, status, verified_at")
      .eq("user_id", id)
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
    fundraisersQuery,
    supabaseAdmin
      .from("donations")
      .select("id, amount, created_at, fundraisers(title, slug, status, deleted_at)")
      .eq("user_id", id)
      .in("status", ["completed", "succeeded"])
      .neq("donor_name", "Anonymous")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const rawProfile = profileResult.data as PublicProfile | null;
  if (!rawProfile) return notFound();
  const profile = await withAuthDisplayName(rawProfile);

  let isFollowing = false;
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
      followerCount={followerResult.count ?? 0}
      followingCount={followingResult.count ?? 0}
      isFollowing={isFollowing}
      isOwnProfile={isOwnProfile}
      isLoggedIn={Boolean(viewerId)}
      organizers={(organizersResult.data ?? []) as PublicOrganizer[]}
      fundraisers={(fundraisersResult.data ?? []) as PublicFundraiser[]}
      donations={publicDonationActivity((donationsResult.data ?? []) as DonationRow[])}
    />
  );
}