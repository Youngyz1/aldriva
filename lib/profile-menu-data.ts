import { supabaseAdmin } from "@/lib/dashboard-context";

export type ProfileMenuOrganizer = {
  id: string;
  name: string;
  slug: string | null;
  photo: string | null;
};

export type ProfileMenuData = {
  isOwner: boolean;
  personal: {
    hasTickets: boolean;
    hasDonations: boolean;
    hasCampaigns: boolean;
    hasEvents: boolean;
    hasBusinesses: boolean;
    hasArticles: boolean;
    hasProducts: boolean;
    ticketCount: number;
    donationCount: number;
    campaignCount: number;
    eventCount: number;
    businessCount: number;
    articleCount: number;
    productCount: number;
  };
  organizerResources: {
    hasEvents: boolean;
    hasFundraisers: boolean;
    hasBusinesses: boolean;
    hasArticles: boolean;
    hasProducts: boolean;
  };
  organizers: ProfileMenuOrganizer[];
};

/**
 * Derives the dynamic profile menu data strictly server-side.
 * Uses batched queries to prevent N+1 queries.
 * Returns null if viewer is not the profile owner.
 */
export async function getProfileMenuData(
  profileUserId: string,
  viewerUserId: string | null,
  viewerEmail: string | null,
  organizerIds: string[] = []
): Promise<ProfileMenuData | null> {
  // Only the authenticated profile owner receives the management-oriented profile menu data
  if (!viewerUserId || viewerUserId !== profileUserId) {
    return null;
  }

  // Batch query all personal & organizer resource existence in parallel
  const [
    personalTicketsRes,
    personalDonationsRes,
    personalCampaignsRes,
    personalEventsRes,
    personalBusinessesRes,
    personalArticlesRes,
    personalProductsRes,
    orgEventsRes,
    orgFundraisersRes,
    orgBusinessesRes,
    orgArticlesRes,
    organizersListRes,
  ] = await Promise.all([
    // Personal Tickets (buyer_email or buyer_id)
    viewerEmail
      ? supabaseAdmin
          .from("ticket_orders")
          .select("id", { count: "exact", head: true })
          .ilike("buyer_email", viewerEmail)
      : Promise.resolve({ count: 0 }),

    // Personal Donations (user_id)
    supabaseAdmin
      .from("donations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewerUserId)
      .in("status", ["succeeded", "completed"]),

    // Personal Campaigns (user_id = viewer AND organizer_id IS NULL)
    supabaseAdmin
      .from("fundraisers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewerUserId)
      .is("organizer_id", null)
      .is("deleted_at", null),

    // Personal Events (user_id = viewer AND organizer_id IS NULL)
    supabaseAdmin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewerUserId)
      .is("organizer_id", null),

    // Personal Businesses (owner_id = viewer AND organizer_id IS NULL)
    supabaseAdmin
      .from("businesses")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", viewerUserId)
      .is("organizer_id", null),

    // Personal Articles (owner_id = viewer AND organizer_id IS NULL)
    supabaseAdmin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", viewerUserId)
      .is("organizer_id", null),

    // Personal Products (owner_id = viewer AND business_id IS NULL)
    supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", viewerUserId)
      .is("business_id", null),

    // Organizer Events (events belonging to user's authorized organizers)
    organizerIds.length > 0
      ? supabaseAdmin
          .from("events")
          .select("id", { count: "exact", head: true })
          .in("organizer_id", organizerIds)
      : Promise.resolve({ count: 0 }),

    // Organizer Fundraisers
    organizerIds.length > 0
      ? supabaseAdmin
          .from("fundraisers")
          .select("id", { count: "exact", head: true })
          .in("organizer_id", organizerIds)
          .is("deleted_at", null)
      : Promise.resolve({ count: 0 }),

    // Organizer Businesses
    organizerIds.length > 0
      ? supabaseAdmin
          .from("businesses")
          .select("id", { count: "exact", head: true })
          .in("organizer_id", organizerIds)
      : Promise.resolve({ count: 0 }),

    // Organizer Articles
    organizerIds.length > 0
      ? supabaseAdmin
          .from("articles")
          .select("id", { count: "exact", head: true })
          .in("organizer_id", organizerIds)
      : Promise.resolve({ count: 0 }),

    // Organizers user owns / belongs to
    organizerIds.length > 0
      ? supabaseAdmin
          .from("organizers")
          .select("id, name, slug, photo")
          .in("id", organizerIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  // Check if any business belonging to organizers has products
  let hasOrgProducts = false;
  if (organizerIds.length > 0) {
    const { data: businesses } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .in("organizer_id", organizerIds);

    const businessIds = (businesses ?? []).map((b) => b.id);
    if (businessIds.length > 0) {
      const { count: productCount } = await supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .in("business_id", businessIds);
      hasOrgProducts = (productCount ?? 0) > 0;
    }
  }

  const ticketCount = personalTicketsRes.count ?? 0;
  const donationCount = personalDonationsRes.count ?? 0;
  const campaignCount = personalCampaignsRes.count ?? 0;
  const eventCount = personalEventsRes.count ?? 0;
  const businessCount = personalBusinessesRes.count ?? 0;
  const articleCount = personalArticlesRes.count ?? 0;
  const productCount = personalProductsRes.count ?? 0;

  const organizers: ProfileMenuOrganizer[] = (
    (organizersListRes.data as unknown[]) ?? []
  ).map((r) => {
    const o = r as { id: string; name: string; slug: string | null; photo: string | null };
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      photo: o.photo,
    };
  });

  return {
    isOwner: true,
    personal: {
      hasTickets: ticketCount > 0,
      hasDonations: donationCount > 0,
      hasCampaigns: campaignCount > 0,
      hasEvents: eventCount > 0,
      hasBusinesses: businessCount > 0,
      hasArticles: articleCount > 0,
      hasProducts: productCount > 0,
      ticketCount,
      donationCount,
      campaignCount,
      eventCount,
      businessCount,
      articleCount,
      productCount,
    },
    organizerResources: {
      hasEvents: (orgEventsRes.count ?? 0) > 0,
      hasFundraisers: (orgFundraisersRes.count ?? 0) > 0,
      hasBusinesses: (orgBusinessesRes.count ?? 0) > 0,
      hasArticles: (orgArticlesRes.count ?? 0) > 0,
      hasProducts: hasOrgProducts,
    },
    organizers,
  };
}
