import { supabaseAdmin } from "@/lib/dashboard-context";
import type { DashboardContext } from "@/lib/dashboard-context";
import {
  type AccountDashboardData,
  type AttentionItem,
  type WorkspaceItem,
  type EventItem,
  type FundraiserItem,
  type ArticleItem,
  type ProductItem,
  type SupportingItem,
  computeWorkspaceStatLabel,
  isEventWithinNext7Days,
  getStartSomethingSuggestions,
  isBrandNewAccount,
} from "@/lib/dashboard/account-blocks-registry";

export type MyThingsEntity = {
  id: string;
  title: string;
  slug?: string | null;
  status?: string | null;
  subtitle?: string | null;
  created_at: string;
  href: string;
};

export type MyThingsSection = {
  key: string;
  label: string;
  items: MyThingsEntity[];
  listHref: string;
  createHref?: string;
  createLabel?: string;
};

const ORG_TYPE_LABELS: Record<string, string> = {
  nonprofit: "Nonprofit",
  business: "Business",
  church: "Church",
  school: "School",
  creator: "Creator",
  community: "Community",
  government: "Government",
  restaurant: "Restaurant",
  sports_club: "Sports Club",
  other: "Organization",
};

export async function getMyThingsData(ctx: DashboardContext): Promise<{
  sections: MyThingsSection[];
  hasAny: boolean;
  accountData: AccountDashboardData;
}> {
  const { user } = ctx;
  const orgIds = (ctx.organizers ?? []).map((o) => o.id);

  // Parallel guarded queries for account entities
  const [
    personalTicketsRes,
    personalDonationsRes,
    userEventsRes,
    orgEventsRes,
    teamMembershipsRes,
    userFundraisersRes,
    orgFundraisersRes,
    personalBusinessesRes,
    articlesRes,
    productsRes,
  ] = await Promise.all([
    // My Tickets
    user.email
      ? supabaseAdmin
          .from("ticket_orders")
          .select("id, status, created_at, quantity, total_amount, events(id, title, slug, event_date)")
          .ilike("buyer_email", user.email)
          .eq("status", "valid")
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),

    // My Donations
    supabaseAdmin
      .from("donations")
      .select("id, amount, status, created_at, fundraisers(id, title, slug)")
      .eq("user_id", user.id)
      .in("status", ["succeeded", "completed"])
      .order("created_at", { ascending: false })
      .limit(10),

    // Own Events
    supabaseAdmin
      .from("events")
      .select("id, title, slug, status, created_at, kind, event_date, organizer_id, user_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),

    // Organizer Events
    orgIds.length > 0
      ? supabaseAdmin
          .from("events")
          .select("id, title, slug, status, created_at, kind, event_date, organizer_id, user_id")
          .in("organizer_id", orgIds)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),

    // Team Memberships for events
    supabaseAdmin
      .from("event_team_members")
      .select("event_id")
      .eq("user_id", user.id)
      .eq("status", "active"),

    // Own Fundraisers
    supabaseAdmin
      .from("fundraisers")
      .select("id, title, slug, status, created_at, goal, raised, raised_amount, organizer_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),

    // Organizer Fundraisers
    orgIds.length > 0
      ? supabaseAdmin
          .from("fundraisers")
          .select("id, title, slug, status, created_at, goal, raised, raised_amount, organizer_id")
          .in("organizer_id", orgIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),

    // Personal Businesses
    supabaseAdmin
      .from("businesses")
      .select("id, name, slug, status, category, industry, created_at")
      .eq("owner_id", user.id)
      .is("organizer_id", null)
      .order("created_at", { ascending: false })
      .limit(10),

    // Personal Articles
    supabaseAdmin
      .from("articles")
      .select("id, title, slug, status, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),

    // Personal Products
    supabaseAdmin
      .from("products")
      .select("id, name, slug, status, created_at")
      .eq("owner_id", user.id)
      .is("business_id", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // If team memberships exist, fetch those events too
  let teamEventsData: Array<{
    id: string;
    title: string;
    slug: string | null;
    status: string;
    created_at: string;
    kind?: string | null;
    event_date?: string | null;
    organizer_id?: string | null;
    user_id?: string | null;
  }> = [];

  const teamEventIds = (teamMembershipsRes.data ?? [])
    .map((m: { event_id: string }) => m.event_id)
    .filter(Boolean);

  if (teamEventIds.length > 0) {
    try {
      const { data: teamEvents } = await supabaseAdmin
        .from("events")
        .select("id, title, slug, status, created_at, kind, event_date, organizer_id, user_id")
        .in("id", teamEventIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (teamEvents) {
        teamEventsData = teamEvents as typeof teamEventsData;
      }
    } catch {
      // Non-fatal if team events query fails
    }
  }

  // Pending counts per organizer
  const pendingCountByOrg: Record<string, number> = {};

  if (orgIds.length > 0) {
    try {
      const { data: pendingRows } = await supabaseAdmin
        .from("orders")
        .select("organizer_id")
        .in("organizer_id", orgIds)
        .eq("status", "pending");

      if (pendingRows) {
        for (const row of pendingRows) {
          pendingCountByOrg[row.organizer_id] = (pendingCountByOrg[row.organizer_id] || 0) + 1;
        }
      }
    } catch {
      // Non-fatal if orders query fails
    }

    // Phase 7: pending table requests share the same per-org badge through
    // one grouped query (never per-org). Missing migration 176 fails here
    // and the badge simply counts orders.
    try {
      const { data: pendingReservations } = await supabaseAdmin
        .from("reservations")
        .select("organizer_id")
        .in("organizer_id", orgIds)
        .eq("status", "pending");

      if (pendingReservations) {
        for (const row of pendingReservations) {
          pendingCountByOrg[row.organizer_id] = (pendingCountByOrg[row.organizer_id] || 0) + 1;
        }
      }
    } catch {
      // Non-fatal if reservations query fails
    }
  }

  // Combine and deduplicate events (own, organizer, team)
  type RawEvent = {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    created_at: string;
    kind?: string | null;
    event_date?: string | null;
    organizer_id?: string | null;
    user_id?: string | null;
  };

  const rawEventsMap = new Map<string, RawEvent>();
  for (const ev of ((userEventsRes.data as RawEvent[]) ?? [])) {
    rawEventsMap.set(ev.id, ev);
  }
  for (const ev of ((orgEventsRes.data as RawEvent[]) ?? [])) {
    if (!rawEventsMap.has(ev.id)) rawEventsMap.set(ev.id, ev);
  }
  for (const ev of teamEventsData) {
    if (!rawEventsMap.has(ev.id)) rawEventsMap.set(ev.id, ev);
  }

  const allRawEvents = Array.from(rawEventsMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Combine and deduplicate fundraisers (own, organizer)
  type RawFundraiser = {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    created_at: string;
    goal?: number | null;
    raised?: number | null;
    raised_amount?: number | null;
    organizer_id?: string | null;
  };

  const rawFundraisersMap = new Map<string, RawFundraiser>();
  for (const f of ((userFundraisersRes.data as RawFundraiser[]) ?? [])) {
    rawFundraisersMap.set(f.id, f);
  }
  for (const f of ((orgFundraisersRes.data as RawFundraiser[]) ?? [])) {
    if (!rawFundraisersMap.has(f.id)) rawFundraisersMap.set(f.id, f);
  }
  const allRawFundraisers = Array.from(rawFundraisersMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Group untitled invitation drafts
  const isUntitledDraft = (ev: { title?: string | null; status?: string | null }) => {
    const titleLower = (ev.title ?? "").trim().toLowerCase();
    const isDraft = ev.status === "draft" || ev.status === "pending";
    const isUntitled =
      !titleLower ||
      titleLower === "untitled invitation" ||
      titleLower.startsWith("untitled");
    return isDraft && isUntitled;
  };

  const untitledDraftEvents = allRawEvents.filter(isUntitledDraft);
  const normalEvents = allRawEvents.filter((ev) => !isUntitledDraft(ev));

  const events: EventItem[] = normalEvents.map((ev) => ({
    id: ev.id,
    title: ev.title || "Event",
    subtitle: ev.event_date ? undefined : null,
    status: ev.status,
    kind: ev.kind,
    created_at: ev.created_at,
    event_date: ev.event_date,
    href: `/dashboard/events/${ev.id}/overview`,
  }));

  if (untitledDraftEvents.length > 0) {
    events.push({
      id: "drafts-invitation-group",
      title: `Drafts (${untitledDraftEvents.length})`,
      subtitle: "Unpublished invitations",
      status: "draft",
      isDraftGroup: true,
      draftCount: untitledDraftEvents.length,
      created_at: untitledDraftEvents[0].created_at,
      href: `/dashboard/events?kind=invitation&status=draft`,
    });
  }

  // Fundraisers list
  const fundraisers: FundraiserItem[] = allRawFundraisers.map((f) => ({
    id: f.id,
    title: f.title,
    slug: f.slug,
    status: f.status,
    raisedAmount: Number(f.raised_amount ?? f.raised ?? 0),
    targetAmount: f.goal != null ? Number(f.goal) : null,
    created_at: f.created_at,
    href: `/dashboard/fundraisers/${f.id}/overview`,
  }));

  // Articles list
  type RawArticle = { id: string; title: string; slug: string | null; status: string; created_at: string };
  const articles: ArticleItem[] = ((articlesRes.data as RawArticle[]) ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    status: a.status,
    created_at: a.created_at,
    href: `/dashboard/articles/${a.id}/edit`,
  }));

  // Products list
  type RawProduct = { id: string; name: string; slug: string | null; status: string; created_at: string };
  const products: ProductItem[] = ((productsRes.data as RawProduct[]) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    created_at: p.created_at,
    href: `/dashboard/products/${p.id}/edit`,
  }));

  // Supporting items: Tickets & Donations merged chronologically
  type RawTicket = {
    id: string;
    status: string;
    created_at: string;
    quantity?: number | null;
    total_amount?: number | null;
    events?: { id: string; title: string; slug: string | null; event_date: string | null } | Array<{ id: string; title: string; slug: string | null; event_date: string | null }> | null;
  };
  type RawDonation = {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    fundraisers?: { id: string; title: string; slug: string | null } | Array<{ id: string; title: string; slug: string | null }> | null;
  };

  const rawTickets = ((personalTicketsRes.data as unknown as RawTicket[]) ?? []);
  const rawDonations = ((personalDonationsRes.data as unknown as RawDonation[]) ?? []);

  const supporting: SupportingItem[] = [];

  for (const t of rawTickets) {
    const qty = t.quantity ?? 1;
    const amountStr = t.total_amount != null ? `$${Number(t.total_amount).toFixed(2)}` : "";
    const detail = `Ticket · ${qty} ticket${qty > 1 ? "s" : ""}${amountStr ? ` (${amountStr})` : ""}`;
    const ev = Array.isArray(t.events) ? t.events[0] : t.events;
    supporting.push({
      id: t.id,
      type: "ticket",
      title: ev?.title || "Event Ticket",
      detail,
      status: t.status,
      created_at: t.created_at,
      href: "/dashboard/tickets",
    });
  }

  for (const d of rawDonations) {
    const fund = Array.isArray(d.fundraisers) ? d.fundraisers[0] : d.fundraisers;
    supporting.push({
      id: d.id,
      type: "donation",
      title: fund?.title || "Fundraiser Donation",
      detail: `Donation · $${Number(d.amount).toFixed(2)}`,
      status: d.status,
      created_at: d.created_at,
      href: "/dashboard/donations",
    });
  }

  supporting.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Personal Businesses
  type RawBusiness = {
    id: string;
    name: string;
    slug: string | null;
    status: string;
    category?: string | null;
    industry?: string | null;
    created_at: string;
  };
  const rawBusinesses = ((personalBusinessesRes.data as RawBusiness[]) ?? []);

  // Compute Workspaces (organizers + personal businesses)
  const workspaces: WorkspaceItem[] = [];

  for (const org of ctx.organizers ?? []) {
    const pendingCount = pendingCountByOrg[org.id] || 0;
    const upcomingEventsForOrg = allRawEvents.filter(
      (ev) => ev.organizer_id === org.id && ev.event_date && new Date(ev.event_date) >= new Date()
    ).length;
    const raisedForOrg = allRawFundraisers
      .filter((f) => f.organizer_id === org.id)
      .reduce((sum, f) => sum + Number(f.raised_amount ?? f.raised ?? 0), 0);

    const statLabel = computeWorkspaceStatLabel({
      pendingCount,
      upcomingCount: upcomingEventsForOrg,
      amountRaised: raisedForOrg,
      orgType: org.org_type,
    });

    workspaces.push({
      id: org.id,
      name: org.name,
      typeChip: ORG_TYPE_LABELS[org.org_type || ""] || "Organization",
      statLabel,
      href: `/dashboard/organizers/${org.id}/overview`,
      isBusiness: org.org_type === "restaurant" || org.org_type === "business",
    });
  }

  for (const bus of rawBusinesses) {
    workspaces.push({
      id: bus.id,
      name: bus.name,
      typeChip: bus.category || bus.industry || "Business",
      statLabel: "0 pending",
      href: `/dashboard/businesses/${bus.id}/overview`,
      isBusiness: true,
    });
  }

  // 1. Needs attention block items
  const attentionItems: AttentionItem[] = [];

  // A. Pending requests per organizer
  for (const org of ctx.organizers ?? []) {
    const pending = pendingCountByOrg[org.id] || 0;
    if (pending > 0) {
      attentionItems.push({
        id: `pending-org-${org.id}`,
        category: "pending_request",
        title: org.name,
        detail: `${pending} pending request${pending === 1 ? "" : "s"} to review`,
        badge: "Pending requests",
        href: `/dashboard/organizers/${org.id}/overview`,
        urgent: true,
      });
    }
  }

  // B. Events in next 7 days
  const now = new Date();
  for (const ev of normalEvents) {
    if (ev.status !== "cancelled" && ev.status !== "rejected" && isEventWithinNext7Days(ev.event_date, now)) {
      attentionItems.push({
        id: `upcoming-event-${ev.id}`,
        category: "upcoming_event",
        title: ev.title,
        detail: "Upcoming in the next 7 days",
        badge: "Upcoming event",
        href: `/dashboard/events/${ev.id}/overview`,
      });
    }
  }

  // C. Unfinished drafts
  if (untitledDraftEvents.length > 0) {
    attentionItems.push({
      id: "drafts-invitation-group-attention",
      category: "draft",
      title: `Drafts (${untitledDraftEvents.length})`,
      detail: "Unpublished invitations ready to finish or publish",
      badge: "Drafts",
      href: `/dashboard/events?kind=invitation&status=draft`,
    });
  }

  const namedDraftEvents = normalEvents.filter(
    (ev) => ev.status === "draft" || ev.status === "pending"
  );
  for (const ev of namedDraftEvents.slice(0, 3)) {
    attentionItems.push({
      id: `draft-event-${ev.id}`,
      category: "draft",
      title: ev.title,
      detail: "Unpublished event draft",
      badge: "Draft event",
      href: `/dashboard/events/${ev.id}/overview`,
    });
  }

  const draftArticles = articles.filter((a) => a.status === "draft");
  for (const a of draftArticles.slice(0, 2)) {
    attentionItems.push({
      id: `draft-article-${a.id}`,
      category: "draft",
      title: a.title,
      detail: "Unpublished article draft",
      badge: "Draft article",
      href: `/dashboard/articles/${a.id}/edit`,
    });
  }

  const draftProducts = products.filter((p) => p.status === "draft");
  for (const p of draftProducts.slice(0, 2)) {
    attentionItems.push({
      id: `draft-product-${p.id}`,
      category: "draft",
      title: p.name,
      detail: "Unpublished product draft",
      badge: "Draft product",
      href: `/dashboard/products/${p.id}/edit`,
    });
  }

  const draftFundraisers = fundraisers.filter((f) => f.status === "draft");
  for (const f of draftFundraisers.slice(0, 2)) {
    attentionItems.push({
      id: `draft-fundraiser-${f.id}`,
      category: "draft",
      title: f.title,
      detail: "Unpublished campaign draft",
      badge: "Draft campaign",
      href: `/dashboard/fundraisers/${f.id}/overview`,
    });
  }

  // 8. Start something suggestions (only for types with 0 items)
  const startSuggestions = getStartSomethingSuggestions({
    events: normalEvents.length + untitledDraftEvents.length,
    fundraisers: fundraisers.length,
    workspaces: (ctx.organizers ?? []).length,
    businesses: rawBusinesses.length,
    articles: articles.length,
    products: products.length,
  });

  const hasAnyContent = !isBrandNewAccount({
    workspaces,
    events,
    fundraisers,
    articles,
    products,
    supporting,
  });

  const accountData: AccountDashboardData = {
    user: {
      id: user.id,
      displayName: (user.user_metadata?.display_name as string | undefined)?.trim() || "User",
      email: user.email,
    },
    attentionItems,
    workspaces,
    events,
    fundraisers,
    articles,
    products,
    supporting,
    startSuggestions,
    hasAnyContent,
  };

  // Backwards compatibility sections for tests & legacy consumers
  const organizersSection: MyThingsSection = {
    key: "organizers",
    label: "My Organizers",
    listHref: "/dashboard/organizations",
    createHref: "/create-organizer",
    createLabel: "New Organizer",
    items: (ctx.organizers ?? []).map((o) => {
      const pendingCount = pendingCountByOrg[o.id] || 0;
      return {
        id: o.id,
        title: o.name,
        slug: o.slug ?? undefined,
        status: o.status ?? undefined,
        subtitle: pendingCount > 0 ? `• ${pendingCount} pending request${pendingCount > 1 ? "s" : ""}` : undefined,
        created_at: (o as { created_at?: string }).created_at ?? new Date().toISOString(),
        href: `/dashboard/org/${o.id}/overview`,
      };
    }),
  };

  const legacyEventsSection: MyThingsSection = {
    key: "events",
    label: "My Events",
    listHref: "/dashboard/events",
    createHref: "/dashboard/events/new",
    createLabel: "New Event",
    items: events.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: e.subtitle ?? undefined,
      status: e.status,
      created_at: e.created_at,
      href: e.href,
    })),
  };

  const legacyDonationsSection: MyThingsSection = {
    key: "donations",
    label: "My Donations",
    listHref: "/dashboard/donations",
    items: rawDonations.map((x) => {
      const fund = Array.isArray(x.fundraisers) ? x.fundraisers[0] : x.fundraisers;
      return {
        id: x.id,
        title: fund?.title || "Fundraiser Donation",
        subtitle: `$${Number(x.amount).toFixed(2)}`,
        status: x.status,
        created_at: x.created_at,
        href: "/dashboard/donations",
      };
    }),
  };

  const sections: MyThingsSection[] = [
    organizersSection,
    legacyEventsSection,
    legacyDonationsSection,
  ];

  return {
    sections,
    hasAny: hasAnyContent,
    accountData,
  };
}
