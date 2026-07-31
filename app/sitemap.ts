import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/site-url";

const BASE_URL = getSiteUrl();

/** Build a supabase admin client that works in a server context (no browser cookies). */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = getSupabase();
  const now = new Date();

  // ── Static pages ────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/events`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/fundraisers`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/organizers`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/create-event`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/create-fundraiser`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/create-organizer`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/find-tickets`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/platform`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/sponsors`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/reviews`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/businesses`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/products`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];

  // ── Dynamic: public events ───────────────────────────────────────
  const { data: events } = await supabase
    .from("events")
    .select("slug, created_at")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(5000);

  const eventUrls: MetadataRoute.Sitemap = (events ?? []).map((e) => ({
    url: `${BASE_URL}/events/${e.slug}`,
    lastModified: e.created_at ? new Date(e.created_at) : now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // ── Dynamic: public fundraisers ──────────────────────────────────
  const { data: fundraisers } = await supabase
    .from("fundraisers")
    .select("slug, created_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5000);

  const fundraiserUrls: MetadataRoute.Sitemap = (fundraisers ?? []).map((f) => ({
    url: `${BASE_URL}/fundraisers/${f.slug}`,
    lastModified: f.created_at ? new Date(f.created_at) : now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // ── Dynamic: public organizations (slug-based) ──────────────────
  const { data: organizers } = await supabase
    .from("organizers")
    .select("slug, updated_at, created_at")
    .eq("visibility", "public")
    .not("status", "in", "(rejected,suspended)")
    .not("slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);

  const organizerUrls: MetadataRoute.Sitemap = (organizers ?? [])
    .filter((o) => o.slug)
    .map((o) => ({
      url: `${BASE_URL}/org/${o.slug}`,
      lastModified: o.updated_at ? new Date(o.updated_at) : o.created_at ? new Date(o.created_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  // ── Dynamic: things-to-do cities ─────────────────────────────────
  const knownCities = [
    "Newark", "Jersey City", "Montclair", "Hoboken", "Atlantic City",
    "Princeton", "Trenton", "Asbury Park", "Morristown", "New Brunswick",
    "Philadelphia", "Wilmington", "New York", "Los Angeles", "Chicago",
    "Miami", "Boston", "Atlanta", "San Francisco",
  ];

  const cityUrls: MetadataRoute.Sitemap = knownCities.map((city) => ({
    url: `${BASE_URL}/things-to-do/${encodeURIComponent(city)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // ── Dynamic: public active articles ──────────────────────────────
  const { data: articles } = await supabase
    .from("articles")
    .select("slug, updated_at")
    .eq("status", "published")
    .eq("visibility", "public")
    .lte("published_at", now.toISOString())
    .order("published_at", { ascending: false })
    .limit(5000);

  const articleUrls: MetadataRoute.Sitemap = (articles ?? []).map((a) => ({
    url: `${BASE_URL}/articles/${a.slug}`,
    lastModified: a.updated_at ? new Date(a.updated_at) : now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // ── Dynamic: public active businesses ───────────────────────────────────
  const { data: businesses } = await supabase
    .from("businesses")
    .select("slug, updated_at")
    .eq("status", "active")
    .eq("is_flagged", false)
    .order("created_at", { ascending: false })
    .limit(5000);

  const businessUrls: MetadataRoute.Sitemap = (businesses ?? []).map((b) => ({
    url: `${BASE_URL}/businesses/${b.slug}`,
    lastModified: b.updated_at ? new Date(b.updated_at) : now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // ── Dynamic: public active/out-of-stock products ─────────────────────────
  const { data: products } = await supabase
    .from("products")
    .select("slug, updated_at")
    .in("status", ["active", "out_of_stock"])
    .order("created_at", { ascending: false })
    .limit(5000);

  const productUrls: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
    url: `${BASE_URL}/products/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...eventUrls, ...fundraiserUrls, ...organizerUrls, ...cityUrls, ...articleUrls, ...businessUrls, ...productUrls];
}
