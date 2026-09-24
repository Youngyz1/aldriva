import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getUserEntityMemberships } from "@/lib/entity-auth";
import { getProfileMenuData, type ProfileMenuData } from "@/lib/profile-menu-data";
import ProfileClient from "./ProfileClient";

type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
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

type PublicEvent = {
  id: string;
  title: string;
  slug: string | null;
  banner: string | null;
  event_date: string | null;
  venue: string | null;
  city: string | null;
  status: string | null;
  created_at: string | null;
};

type PublicBusiness = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  banner_url: string | null;
  category: string | null;
  city: string | null;
  status: string | null;
  created_at: string | null;
};

type PublicArticle = {
  id: string;
  title: string;
  slug: string;
  cover_image: string | null;
  excerpt: string | null;
  category: string | null;
  status: string | null;
  published_at: string | null;
  created_at: string | null;
};

type PublicProduct = {
  id: string;
  name: string;
  slug: string | null;
  price: number | string | null;
  status: string | null;
  created_at: string | null;
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
    .slice(0, 12);
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
  let viewerEmail: string | null = null;

  try {
    const supabaseServer = await createSupabaseServer();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    viewerId = user?.id ?? null;
    viewerEmail = user?.email ?? null;
  } catch {
    // Public page: unauthenticated visitors can still view public profile data.
  }

  const isOwnProfile = viewerId === id;

  // Personal fundraisers only: organizer_id IS NULL
  let fundraisersQuery = supabaseAdmin
    .from("fundraisers")
    .select("id, title, slug, banner, image_url, goal, raised, raised_amount, category, created_at, status")
    .eq("user_id", id)
    .is("organizer_id", null)
    .is("deleted_at", null);

  if (!isOwnProfile) {
    fundraisersQuery = fundraisersQuery.eq("status", "published");
  }
  fundraisersQuery = fundraisersQuery.order("created_at", { ascending: false }).limit(12);

  // Personal events only: organizer_id IS NULL
  let eventsQuery = supabaseAdmin
    .from("events")
    .select("id, title, slug, banner, event_date, venue, city, status, created_at")
    .eq("user_id", id)
    .is("organizer_id", null);

  if (!isOwnProfile) {
    eventsQuery = eventsQuery.eq("status", "published");
  }
  eventsQuery = eventsQuery.order("created_at", { ascending: false }).limit(12);

  // Personal businesses only: organizer_id IS NULL
  let businessesQuery = supabaseAdmin
    .from("businesses")
    .select("id, name, slug, logo_url, banner_url, category, city, status, created_at")
    .eq("owner_id", id)
    .is("organizer_id", null);

  if (!isOwnProfile) {
    businessesQuery = businessesQuery.eq("status", "published");
  }
  businessesQuery = businessesQuery.order("created_at", { ascending: false }).limit(12);

  // Personal articles only: organizer_id IS NULL
  let articlesQuery = supabaseAdmin
    .from("articles")
    .select("id, title, slug, cover_image, excerpt, category, status, published_at, created_at")
    .eq("owner_id", id)
    .is("organizer_id", null);

  if (!isOwnProfile) {
    articlesQuery = articlesQuery.eq("status", "published").eq("visibility", "public");
  }
  articlesQuery = articlesQuery.order("created_at", { ascending: false }).limit(12);

  // Personal products only: business_id IS NULL
  let productsQuery = supabaseAdmin
    .from("products")
    .select("id, name, slug, price, status, created_at")
    .eq("owner_id", id)
    .is("business_id", null);

  if (!isOwnProfile) {
    productsQuery = productsQuery.eq("status", "published");
  }
  productsQuery = productsQuery.order("created_at", { ascending: false }).limit(12);

  // Base profile & stats query
  const [
    profileResult,
    followerResult,
    followingResult,
    fundraisersResult,
    eventsResult,
    businessesResult,
    articlesResult,
    productsResult,
    donationsResult,
  ] = await Promise.all([
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
    fundraisersQuery,
    eventsQuery,
    businessesQuery,
    articlesQuery,
    productsQuery,
    supabaseAdmin
      .from("donations")
      .select("id, amount, created_at, fundraisers(title, slug, status, deleted_at)")
      .eq("user_id", id)
      .in("status", ["completed", "succeeded"])
      .neq("donor_name", "Anonymous")
      .order("created_at", { ascending: false })
      .limit(20),
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

  // Profile Menu data: strictly for the profile owner
  let profileMenuData: ProfileMenuData | null = null;
  if (isOwnProfile && viewerId) {
    // Resolve organizer IDs for owner
    const [{ data: ownedOrgs }, entityRoles] = await Promise.all([
      supabaseAdmin.from("organizers").select("id").eq("user_id", viewerId).is("deleted_at", null),
      getUserEntityMemberships(viewerId),
    ]);
    const ownedIds = (ownedOrgs ?? []).map((o) => o.id);
    const allOrgIds = Array.from(new Set([...ownedIds, ...Object.keys(entityRoles)]));

    profileMenuData = await getProfileMenuData(id, viewerId, viewerEmail, allOrgIds);
  }

  return (
    <ProfileClient
      profile={profile}
      followerCount={followerResult.count ?? 0}
      followingCount={followingResult.count ?? 0}
      isFollowing={isFollowing}
      isOwnProfile={isOwnProfile}
      isLoggedIn={Boolean(viewerId)}
      fundraisers={(fundraisersResult.data ?? []) as PublicFundraiser[]}
      events={(eventsResult.data ?? []) as PublicEvent[]}
      businesses={(businessesResult.data ?? []) as PublicBusiness[]}
      articles={(articlesResult.data ?? []) as PublicArticle[]}
      products={(productsResult.data ?? []) as PublicProduct[]}
      donations={publicDonationActivity((donationsResult.data ?? []) as DonationRow[])}
      menuData={profileMenuData}
    />
  );
}
