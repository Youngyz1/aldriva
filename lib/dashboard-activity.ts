import { Heart, Calendar, Newspaper, Store, ShoppingBag, type LucideIcon } from "lucide-react";
import { supabaseAdmin } from "@/lib/dashboard-context";
import { money } from "@/lib/format";
import { getTimeAgo } from "@/lib/fund4good-data";

export type VerticalKey = "fundraisers" | "events" | "articles" | "businesses" | "products";

type VerticalConfig = {
  key: VerticalKey;
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  statsHref: string;
  createHref: string;
  /** Phrasing for a user with zero activity in this vertical (onboarding tiles, KPI-row prompts). */
  createCta: string;
  /** Phrasing for a user already active in this vertical (Quick Actions tiles). */
  createAgainCta: string;
};

/** Single source of truth for each vertical's identity — the color a vertical
 *  gets here is the same one it uses in the zero-state onboarding tiles, so
 *  a vertical's color is consistent whether it's active or not-yet-started. */
export const VERTICAL_CONFIG: Record<VerticalKey, VerticalConfig> = {
  fundraisers: {
    key: "fundraisers",
    label: "Fundraisers",
    icon: Heart,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-700",
    statsHref: "/dashboard/fundraisers",
    createHref: "/create-fundraiser",
    createCta: "Start a fundraiser",
    createAgainCta: "Start another fundraiser",
  },
  events: {
    key: "events",
    label: "Events",
    icon: Calendar,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    statsHref: "/dashboard/events",
    createHref: "/create-event",
    createCta: "Create an event",
    createAgainCta: "Create another event",
  },
  articles: {
    key: "articles",
    label: "Articles",
    icon: Newspaper,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    statsHref: "/dashboard/articles",
    createHref: "/dashboard/articles/new",
    createCta: "Write an article",
    createAgainCta: "Write another article",
  },
  businesses: {
    key: "businesses",
    label: "Businesses",
    icon: Store,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    statsHref: "/dashboard/businesses",
    createHref: "/dashboard/businesses/new",
    createCta: "List a business",
    createAgainCta: "List another business",
  },
  products: {
    key: "products",
    label: "Products",
    icon: ShoppingBag,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
    statsHref: "/dashboard/products",
    createHref: "/dashboard/products/new",
    createCta: "Add a product",
    createAgainCta: "Add another product",
  },
};

export type VerticalStat = {
  key: VerticalKey;
  label: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  href: string;
  /** Raw item count, for ranking "most active vertical" in Quick Actions — not necessarily what `value` displays (fundraisers' value is a currency total). */
  count: number;
};

export type VerticalPrompt = {
  key: VerticalKey;
  label: string;
  cta: string;
  href: string;
};

export type DashboardActivityType =
  | "donation_received"
  | "fundraiser_created"
  | "event_created"
  | "article_published"
  | "business_listed"
  | "product_added";

export type DashboardActivity = {
  id: string;
  type: DashboardActivityType;
  title: string;
  description: string;
  timestamp: string;
  href: string;
};

const ACTIVITY_ICON_CONFIG: Record<DashboardActivityType, { icon: LucideIcon; iconBg: string; iconColor: string }> = {
  donation_received: { icon: Heart, iconBg: "bg-rose-50", iconColor: "text-rose-500" },
  fundraiser_created: { icon: Heart, iconBg: "bg-brand-50", iconColor: "text-brand-700" },
  event_created: { icon: Calendar, iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
  article_published: { icon: Newspaper, iconBg: "bg-violet-50", iconColor: "text-violet-600" },
  business_listed: { icon: Store, iconBg: "bg-amber-50", iconColor: "text-amber-600" },
  product_added: { icon: ShoppingBag, iconBg: "bg-sky-50", iconColor: "text-sky-600" },
};

export function getActivityIconConfig(type: DashboardActivityType) {
  return ACTIVITY_ICON_CONFIG[type];
}

export type AdaptiveDashboardData = {
  activeVerticals: VerticalStat[];
  untouchedVerticals: VerticalPrompt[];
  activities: DashboardActivity[];
  hasAnyActivity: boolean;
};

type Row = { id: string; created_at: string; status?: string | null };
type FundraiserRow = Row & { title: string; slug: string; raised: number | string | null };
type EventRow = Row & { title: string; slug: string };
type ArticleRow = Row & { title: string; slug: string };
type BusinessRow = Row & { name: string; slug: string };
type ProductRow = Row & { name: string; slug: string };

/**
 * Determines which verticals a user has activity in and builds the merged,
 * time-sorted activity feed — all in two query "waves", not five-plus
 * sequential round trips:
 *
 *   Wave 1 (Promise.all, fully parallel): one query per vertical, each
 *   already selecting every column both the stat card AND the activity
 *   feed need, so there's no separate "recent items" query per vertical.
 *
 *   Wave 2 (only runs if the user has any fundraisers): donations for
 *   those fundraiser ids, since donations aren't a table the user owns
 *   directly — this is the one point of sequential dependency, and it's
 *   skipped entirely for a user with no fundraisers.
 */
export async function getAdaptiveDashboardData(params: {
  userId: string;
  organizerIds: string[];
}): Promise<AdaptiveDashboardData> {
  const { userId, organizerIds } = params;

  const [fundraisersRes, eventsRes, articlesRes, businessesRes, productsRes] = await Promise.all([
    organizerIds.length > 0
      ? supabaseAdmin
          .from("fundraisers")
          .select("id, title, slug, raised, status, created_at")
          .in("organizer_id", organizerIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as FundraiserRow[] }),
    organizerIds.length > 0
      ? supabaseAdmin
          .from("events")
          .select("id, title, slug, created_at")
          .in("organizer_id", organizerIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as EventRow[] }),
    supabaseAdmin
      .from("articles")
      .select("id, title, slug, status, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("businesses")
      .select("id, name, slug, status, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("products")
      .select("id, name, slug, status, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const fundraisers = (fundraisersRes.data ?? []) as FundraiserRow[];
  const events = (eventsRes.data ?? []) as EventRow[];
  const articles = (articlesRes.data ?? []) as ArticleRow[];
  const businesses = (businessesRes.data ?? []) as BusinessRow[];
  const products = (productsRes.data ?? []) as ProductRow[];

  // Wave 2 — only fires when there's something to look up.
  const fundraiserIds = fundraisers.map((f) => f.id);
  const donationsRes =
    fundraiserIds.length > 0
      ? await supabaseAdmin
          .from("donations")
          .select("id, amount, donor_name, created_at, fundraiser_id")
          .in("fundraiser_id", fundraiserIds)
          .eq("status", "succeeded")
          .order("created_at", { ascending: false })
          .limit(5)
      : { data: [] };
  const donations = (donationsRes.data ?? []) as {
    id: string;
    amount: number;
    donor_name: string | null;
    created_at: string;
    fundraiser_id: string;
  }[];

  // ---- Stats ----
  const activeVerticals: VerticalStat[] = [];
  const untouchedVerticals: VerticalPrompt[] = [];

  if (fundraisers.length > 0) {
    const totalRaised = fundraisers.reduce((sum, f) => sum + Number(f.raised || 0), 0);
    activeVerticals.push({
      key: "fundraisers",
      label: "Total Raised",
      value: money(totalRaised),
      subValue: `${fundraisers.length} fundraiser${fundraisers.length === 1 ? "" : "s"}`,
      icon: VERTICAL_CONFIG.fundraisers.icon,
      iconBg: VERTICAL_CONFIG.fundraisers.iconBg,
      iconColor: VERTICAL_CONFIG.fundraisers.iconColor,
      href: VERTICAL_CONFIG.fundraisers.statsHref,
      count: fundraisers.length,
    });
  } else {
    untouchedVerticals.push(promptFor("fundraisers"));
  }

  if (events.length > 0) {
    activeVerticals.push({
      key: "events",
      label: "Events Hosted",
      value: String(events.length),
      icon: VERTICAL_CONFIG.events.icon,
      iconBg: VERTICAL_CONFIG.events.iconBg,
      iconColor: VERTICAL_CONFIG.events.iconColor,
      href: VERTICAL_CONFIG.events.statsHref,
      count: events.length,
    });
  } else {
    untouchedVerticals.push(promptFor("events"));
  }

  if (articles.length > 0) {
    const publishedCount = articles.filter((a) => a.status === "published").length;
    activeVerticals.push({
      key: "articles",
      label: "Articles",
      value: String(articles.length),
      subValue: publishedCount > 0 ? `${publishedCount} published` : "0 published",
      icon: VERTICAL_CONFIG.articles.icon,
      iconBg: VERTICAL_CONFIG.articles.iconBg,
      iconColor: VERTICAL_CONFIG.articles.iconColor,
      href: VERTICAL_CONFIG.articles.statsHref,
      count: articles.length,
    });
  } else {
    untouchedVerticals.push(promptFor("articles"));
  }

  if (businesses.length > 0) {
    const activeCount = businesses.filter((b) => b.status === "active").length;
    activeVerticals.push({
      key: "businesses",
      label: "Business Listings",
      value: String(businesses.length),
      subValue: activeCount > 0 ? `${activeCount} active` : undefined,
      icon: VERTICAL_CONFIG.businesses.icon,
      iconBg: VERTICAL_CONFIG.businesses.iconBg,
      iconColor: VERTICAL_CONFIG.businesses.iconColor,
      href: VERTICAL_CONFIG.businesses.statsHref,
      count: businesses.length,
    });
  } else {
    untouchedVerticals.push(promptFor("businesses"));
  }

  if (products.length > 0) {
    const activeCount = products.filter((p) => p.status === "active").length;
    activeVerticals.push({
      key: "products",
      label: "Products",
      value: String(products.length),
      subValue: activeCount > 0 ? `${activeCount} active` : undefined,
      icon: VERTICAL_CONFIG.products.icon,
      iconBg: VERTICAL_CONFIG.products.iconBg,
      iconColor: VERTICAL_CONFIG.products.iconColor,
      href: VERTICAL_CONFIG.products.statsHref,
      count: products.length,
    });
  } else {
    untouchedVerticals.push(promptFor("products"));
  }

  // ---- Activity feed: merge, sort, cap ----
  const fundraiserTitleById = new Map(fundraisers.map((f) => [f.id, f.title]));

  const activities: DashboardActivity[] = [
    ...donations.map((d) => ({
      id: `donation-${d.id}`,
      type: "donation_received" as const,
      title: `New donation on "${fundraiserTitleById.get(d.fundraiser_id) ?? "your fundraiser"}"`,
      description: `${money(d.amount)} from ${d.donor_name?.trim() || "Anonymous"}`,
      timestamp: d.created_at,
      href: "/dashboard/donations",
    })),
    ...fundraisers.slice(0, 3).map((f) => ({
      id: `fundraiser-${f.id}`,
      type: "fundraiser_created" as const,
      title: "Fundraiser created",
      description: `"${f.title}" is live`,
      timestamp: f.created_at,
      href: `/fundraisers/${f.slug}`,
    })),
    ...events.slice(0, 3).map((e) => ({
      id: `event-${e.id}`,
      type: "event_created" as const,
      title: "Event created",
      description: `"${e.title}"`,
      timestamp: e.created_at,
      href: `/events/${e.slug}`,
    })),
    ...articles
      .filter((a) => a.status === "published")
      .slice(0, 3)
      .map((a) => ({
        id: `article-${a.id}`,
        type: "article_published" as const,
        title: "Article published",
        description: `"${a.title}"`,
        timestamp: a.created_at,
        href: `/articles/${a.slug}`,
      })),
    ...businesses.slice(0, 3).map((b) => ({
      id: `business-${b.id}`,
      type: "business_listed" as const,
      title: "Business listed",
      description: `"${b.name}" is now live`,
      timestamp: b.created_at,
      href: `/businesses/${b.slug}`,
    })),
    ...products.slice(0, 3).map((p) => ({
      id: `product-${p.id}`,
      type: "product_added" as const,
      title: "New product listed",
      description: `"${p.name}" added to your shop`,
      timestamp: p.created_at,
      href: `/products/${p.slug}`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return {
    activeVerticals,
    untouchedVerticals,
    activities,
    hasAnyActivity: activeVerticals.length > 0,
  };
}

function promptFor(key: VerticalKey): VerticalPrompt {
  const config = VERTICAL_CONFIG[key];
  return { key, label: config.label, cta: config.createCta, href: config.createHref };
}

export { getTimeAgo };
