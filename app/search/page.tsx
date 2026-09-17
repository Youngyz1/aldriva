import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { supabase } from "@/lib/supabase";
import { searchExternalEvents } from "@/lib/external-events";
import SearchPageClient from "./SearchPageClient";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Search — Aldriva",
  description: "Search events, fundraisers, and organizers on Aldriva.",
  openGraph: {
    title: "Search — Aldriva",
    description: "Search events, fundraisers, and organizers on Aldriva.",
    url: `${getSiteUrl()}/search`,
    siteName: "Aldriva",
    images: [{ url: "/aldriva-og-image-v2.png", width: 1200, height: 630, alt: "Search Aldriva" }],
  },
  twitter: { card: "summary_large_image", images: ["/aldriva-og-image-v2.png"] },
};

// The external grid is 4-wide; cap at 3 rows so the "Events elsewhere" section
// stays a discovery aid rather than swamping the page (each source can return a
// full page of ~20). searchExternalEvents interleaves sources, so the slice
// keeps a balanced mix of Ticketmaster and SeatGeek.
const MAX_EXTERNAL_RESULTS = 12;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (!query) {
    return (
      <SearchPageClient
        query=""
        events={[]}
        fundraisers={[]}
        organizers={[]}
        articles={[]}
        products={[]}
        externalEvents={[]}
      />
    );
  }

  const pattern = `%${query}%`;
  const nowIso = new Date().toISOString();

  // Live external event results (Ticketmaster + SeatGeek) run in parallel with
  // the DB queries — no added latency. Fetched per view and never stored; the
  // lib handles the 5-min cache, rate-limit warning, and source attribution.
  const [eventsResult, fundraisersResult, organizersResult, articlesResult, productsResult, externalEvents] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, slug, event_date, city, venue, banner, category")
        .eq("visibility", "public")
        .eq("status", "approved")
        .is("deleted_at", null)
        .ilike("title", pattern)
        .order("event_date", { ascending: true })
        .limit(8),
      supabase
        .from("fundraisers")
        .select("id, title, slug, goal, raised, banner, category")
        .is("deleted_at", null)
        .or(`title.ilike.${pattern},category.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("organizers")
        .select("id, name, bio, photo, banner, status")
        .eq("visibility", "public")
        .in("status", ["pending", "verified"])
        .is("deleted_at", null)
        .ilike("name", pattern)
        .order("name", { ascending: true })
        .limit(6),
      supabase
        .from("articles")
        .select("id, title, slug, excerpt, cover_image_url, categories, tags, reading_time, published_at, created_at")
        .eq("status", "published")
        .eq("visibility", "public")
        .lte("published_at", nowIso)
        .or(`title.ilike.${pattern},excerpt.ilike.${pattern}`)
        .order("published_at", { ascending: false })
        .limit(6),
      supabase
        .from("products")
        .select("id, name, slug, description, cover_image_url, images, product_type, category")
        .in("status", ["active", "out_of_stock"])
        .or(`name.ilike.${pattern},description.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(6),
      searchExternalEvents({ query }),
    ]);

  return (
    <SearchPageClient
      query={query}
      events={eventsResult.data ?? []}
      fundraisers={fundraisersResult.data ?? []}
      organizers={organizersResult.data ?? []}
      articles={articlesResult.data ?? []}
      products={(productsResult.data ?? []) as Array<{
        id: string;
        name: string;
        slug: string;
        description: string;
        cover_image_url: string | null;
        images: string[] | null;
        product_type: string | null;
        category: string | null;
      }>}
      externalEvents={externalEvents.slice(0, MAX_EXTERNAL_RESULTS)}
    />
  );
}
