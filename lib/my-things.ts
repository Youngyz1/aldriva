import { supabaseAdmin } from "@/lib/dashboard-context";
import type { DashboardContext } from "@/lib/dashboard-context";

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

export async function getMyThingsData(
  ctx: DashboardContext
): Promise<{ sections: MyThingsSection[]; hasAny: boolean }> {
  const { user } = ctx;

  // Personal-only: entities where organizer_id / business_id IS NULL and owner/user_id = current user.
  // Organizer-owned entities are NOT shown as personal; they are reached via My Organizers → Organizer workspace.
  const [
    personalTicketsRes,
    personalDonationsRes,
    personalEventsRes,
    personalFundraisersRes,
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

    // My Events (Personal only)
    supabaseAdmin
      .from("events")
      .select("id, title, slug, status, created_at")
      .eq("user_id", user.id)
      .is("organizer_id", null)
      .order("created_at", { ascending: false })
      .limit(10),

    // My Campaigns (Personal only)
    supabaseAdmin
      .from("fundraisers")
      .select("id, title, slug, status, created_at")
      .eq("user_id", user.id)
      .is("organizer_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),

    // My Businesses (Personal only)
    supabaseAdmin
      .from("businesses")
      .select("id, name, slug, status, created_at")
      .eq("owner_id", user.id)
      .is("organizer_id", null)
      .order("created_at", { ascending: false })
      .limit(10),

    // My Articles (Personal only)
    supabaseAdmin
      .from("articles")
      .select("id, title, slug, status, created_at")
      .eq("owner_id", user.id)
      .is("organizer_id", null)
      .order("created_at", { ascending: false })
      .limit(10),

    // My Products (Personal only)
    supabaseAdmin
      .from("products")
      .select("id, name, slug, status, created_at")
      .eq("owner_id", user.id)
      .is("business_id", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const orgIds = (ctx.organizers ?? []).map((o) => o.id);
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

  // Customer orders placed by this user (email match on guest orders)
  let customerOrdersRes: { data: unknown[] | null } = { data: [] };
  if (user.email) {
    try {
      const res = await supabaseAdmin
        .from("orders")
        .select("id, order_number, total_amount, currency, status, created_at, tracking_token, website_id, tenant_websites(slug)")
        .ilike("customer_email", user.email)
        .order("created_at", { ascending: false })
        .limit(10);
      customerOrdersRes = { data: res.data ?? [] };
    } catch {
      customerOrdersRes = { data: [] };
    }
  }

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
        subtitle: pendingCount > 0 ? `⚡ ${pendingCount} pending request${pendingCount > 1 ? "s" : ""}` : undefined,
        created_at: (o as { created_at?: string }).created_at ?? new Date().toISOString(),
        href: `/dashboard/org/${o.id}/overview`,
      };
    }),
  };

  const personalSections: MyThingsSection[] = [
    {
      key: "orders",
      label: "My Orders",
      listHref: "#",
      items: ((customerOrdersRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {
          id: string;
          order_number: string;
          total_amount: number;
          currency: string;
          status: string;
          created_at: string;
          tracking_token: string;
          tenant_websites?: { slug?: string } | null;
        };
        const siteSlug = x.tenant_websites?.slug || "";
        const href = siteSlug && x.tracking_token ? `/site/${siteSlug}/orders/${x.tracking_token}` : "#";
        return {
          id: x.id,
          title: `Order #${x.order_number}`,
          subtitle: `${x.total_amount} ${x.currency}`,
          status: x.status,
          created_at: x.created_at,
          href,
        };
      }),
    },
    {
      key: "tickets",
      label: "My Tickets",
      listHref: "/events/my-tickets",
      items: ((personalTicketsRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {
          id: string;
          status: string;
          created_at: string;
          quantity: number;
          total_amount: number;
          events?: { id: string; title: string; slug?: string; event_date?: string } | null;
        };
        const eventTitle = x.events?.title || "Ticket Order";
        return {
          id: x.id,
          title: eventTitle,
          subtitle: `${x.quantity} ticket${x.quantity > 1 ? "s" : ""} · $${Number(x.total_amount).toFixed(2)}`,
          status: x.status,
          created_at: x.created_at,
          href: `/events/my-tickets`,
        };
      }),
    },
    {
      key: "donations",
      label: "My Donations",
      listHref: "/dashboard/donations",
      items: ((personalDonationsRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {
          id: string;
          amount: number;
          status: string;
          created_at: string;
          fundraisers?: { id: string; title: string; slug?: string } | null;
        };
        const title = x.fundraisers?.title || "Donation";
        return {
          id: x.id,
          title,
          subtitle: `$${Number(x.amount).toFixed(2)}`,
          status: x.status,
          created_at: x.created_at,
          href: `/dashboard/donations`,
        };
      }),
    },
    {
      key: "fundraisers",
      label: "My Campaigns",
      listHref: "/dashboard/fundraisers",
      createHref: "/create-fundraiser",
      createLabel: "New Campaign",
      items: ((personalFundraisersRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as { id: string; title: string; slug: string; status: string; created_at: string };
        return {
          id: x.id,
          title: x.title,
          slug: x.slug,
          status: x.status,
          created_at: x.created_at,
          href: `/dashboard/fundraisers/${x.id}/overview`,
        };
      }),
    },
    {
      key: "events",
      label: "My Events",
      listHref: "/dashboard/events",
      createHref: "/dashboard/events/new",
      createLabel: "New Event",
      items: ((personalEventsRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as { id: string; title: string; slug: string; status: string; created_at: string };
        return {
          id: x.id,
          title: x.title,
          slug: x.slug,
          status: x.status,
          created_at: x.created_at,
          href: `/dashboard/events/${x.id}/overview`,
        };
      }),
    },
    {
      key: "businesses",
      label: "My Businesses",
      listHref: "/dashboard/businesses",
      createHref: "/dashboard/businesses/new",
      createLabel: "New Business",
      items: ((personalBusinessesRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as { id: string; name: string; slug: string; status: string; created_at: string };
        return {
          id: x.id,
          title: x.name,
          slug: x.slug,
          status: x.status,
          created_at: x.created_at,
          href: `/dashboard/businesses/${x.id}/overview`,
        };
      }),
    },
    {
      key: "articles",
      label: "My Articles",
      listHref: "/dashboard/articles",
      createHref: "/dashboard/articles/new",
      createLabel: "New Article",
      items: ((articlesRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as { id: string; title: string; slug: string; status: string; created_at: string };
        return {
          id: x.id,
          title: x.title,
          slug: x.slug,
          status: x.status,
          created_at: x.created_at,
          href: `/dashboard/articles/${x.id}/edit`,
        };
      }),
    },
    {
      key: "products",
      label: "My Products",
      listHref: "/dashboard/products",
      createHref: "/dashboard/products/new",
      createLabel: "New Product",
      items: ((productsRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as { id: string; name: string; slug: string; status: string; created_at: string };
        return {
          id: x.id,
          title: x.name,
          slug: x.slug,
          status: x.status,
          created_at: x.created_at,
          href: `/dashboard/products/${x.id}/edit`,
        };
      }),
    },
  ];

  // Only show personal sections that actually have items
  const visiblePersonalSections = personalSections.filter((s) => s.items.length > 0);

  // If user has organizers, include My Organizers section
  const sections: MyThingsSection[] = [];
  if (organizersSection.items.length > 0) {
    sections.push(organizersSection);
  }
  sections.push(...visiblePersonalSections);

  const hasAny = sections.length > 0;
  return { sections, hasAny };
}
