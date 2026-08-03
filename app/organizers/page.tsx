import { supabase } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { HOMEPAGE_SETTING_KEYS, getHomepageSettings } from "@/lib/homepage-hero";
import Link from "next/link";
import { Suspense } from "react";
import { CallToAction } from "@/components/ui/call-to-action";
import OrganizerCard, { type OrganizerCardData } from "@/components/public/OrganizerCard";
import PublicPagination from "@/components/public/PublicPagination";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import OrganizersDirectoryControls from "./OrganizersDirectoryControls";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Organizations — Aldriva",
  description: "Discover organizations and causes on Aldriva.",
  alternates: {
    canonical: `${getSiteUrl()}/organizers`,
  },
  openGraph: {
    title: "Organizations — Aldriva",
    description: "Discover organizations and causes on Aldriva.",
    url: `${getSiteUrl()}/organizers`,
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Aldriva Organizations" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

const PAGE_SIZE = 9;

async function getOrganizerStats(ids: string[]) {
  const stats = new Map<string, { events: number; fundraisers: number; followers: number }>();
  if (ids.length === 0) return stats;

  for (const id of ids) {
    stats.set(id, { events: 0, fundraisers: 0, followers: 0 });
  }

  const [{ data: events }, { data: fundraisers }, { data: follows }] = await Promise.all([
    supabase.from("events").select("organizer_id").in("organizer_id", ids).eq("visibility", "public"),
    supabase.from("fundraisers").select("organizer_id").in("organizer_id", ids),
    supabase.from("organizer_follows").select("organizer_id").in("organizer_id", ids),
  ]);

  for (const row of events ?? []) {
    if (row.organizer_id && stats.has(row.organizer_id)) {
      stats.get(row.organizer_id)!.events += 1;
    }
  }
  for (const row of fundraisers ?? []) {
    if (row.organizer_id && stats.has(row.organizer_id)) {
      stats.get(row.organizer_id)!.fundraisers += 1;
    }
  }
  for (const row of follows ?? []) {
    if (row.organizer_id && stats.has(row.organizer_id)) {
      stats.get(row.organizer_id)!.followers += 1;
    }
  }

  return stats;
}

function enrichOrganizers(
  organizers: Array<{
    id: string;
    slug?: string | null;
    name: string;
    bio: string | null;
    photo: string | null;
    banner: string | null;
    status: string | null;
    org_type?: string | null;
    follower_offset?: number;
    events_offset?: number;
  }>,
  stats: Map<string, { events: number; fundraisers: number; followers: number }>
): OrganizerCardData[] {
  return organizers.map((org) => ({
    id: org.id,
    slug: org.slug,
    name: org.name,
    bio: org.bio,
    photo: org.photo,
    banner: org.banner,
    status: org.status,
    org_type: org.org_type,
    eventCount: (stats.get(org.id)?.events ?? 0) + (org.events_offset ?? 0),
    fundraiserCount: stats.get(org.id)?.fundraisers ?? 0,
    followerCount: (stats.get(org.id)?.followers ?? 0) + (org.follower_offset ?? 0),
  }));
}

export default async function OrganizersDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const query = filters.q?.trim();
  const statusFilter = filters.status === "verified" ? "verified" : "all";
  const sort = filters.sort === "events" ? "events" : "name";
  const page = Math.max(1, parseInt(filters.page || "1", 10) || 1);

  const adminClient = createSupabaseAdmin();

  // 1. Fetch CMS Hero Settings & dynamic statistics
  const [
    { data: cmsRows },
    { count: verifiedCount },
    { count: hostedCount },
    { data: raisedData }
  ] = await Promise.all([
    adminClient.from("platform_settings").select("key, value").in("key", HOMEPAGE_SETTING_KEYS),
    adminClient.from("organizers").select("id", { count: "exact", head: true }).eq("status", "verified").eq("visibility", "public").is("deleted_at", null),
    adminClient.from("events").select("id", { count: "exact", head: true }).eq("visibility", "public").eq("status", "approved").is("deleted_at", null),
    adminClient.from("fundraisers").select("raised").eq("status", "published").is("deleted_at", null)
  ]);

  const cms = getHomepageSettings(cmsRows);
  const totalVerifiedOrganizers = verifiedCount ?? 0;
  const totalEventsHosted = hostedCount ?? 0;
  const totalCommunityRaised = raisedData?.reduce((sum, f) => sum + Number(f.raised || 0), 0) || 0;

  // 2. Fetch main directory organizers (Step 3)
  let organizersQuery = supabase
    .from("organizers")
    .select("*", { count: "exact" })
    .eq("visibility", "public")
    .is("deleted_at", null);

  if (statusFilter === "verified") {
    organizersQuery = organizersQuery.eq("status", "verified");
  } else {
    organizersQuery = organizersQuery.in("status", ["pending", "verified"]);
  }

  if (query) organizersQuery = organizersQuery.ilike("name", `%${query}%`);

  if (sort === "name") {
    organizersQuery = organizersQuery.order("name", { ascending: true });
  } else {
    organizersQuery = organizersQuery.order("created_at", { ascending: false });
  }

  const from = (page - 1) * PAGE_SIZE;
  organizersQuery = organizersQuery.range(from, from + PAGE_SIZE - 1);

  const { data: organizers, error, count: totalCount } = await organizersQuery;

  const ids = (organizers ?? []).map((o) => o.id);
  const stats = await getOrganizerStats(ids);
  const enriched = enrichOrganizers(organizers ?? [], stats);

  // 3. Fetch Featured Verified Organizers (Step 2) when no search query
  const { data: featuredOrganizers } = !query
    ? await supabase
        .from("organizers")
        .select("*")
        .eq("visibility", "public")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: null };

  const featuredIds = (featuredOrganizers ?? []).map((o) => o.id);
  const featuredStats = await getOrganizerStats(featuredIds);
  const featuredEnriched = enrichOrganizers(featuredOrganizers ?? [], featuredStats);

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE));

  function buildHref(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (statusFilter === "verified") params.set("status", "verified");
    if (sort === "events") params.set("sort", "events");
    Object.entries(updates).forEach(([k, v]) => params.set(k, v));
    return `/organizers?${params.toString()}`;
  }

  function money(value: number) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-16">
      {/* ── CMS Hero Banner (Step 1) ── */}
      <section
        className="relative flex min-h-[360px] items-center justify-center bg-cover bg-center px-4 py-16 text-center sm:min-h-[420px] sm:px-12 sm:py-20 lg:min-h-[460px]"
        style={{
          backgroundImage: `url("${cms.organizersHeroImageUrl || cms.imageUrl}")`,
        }}
      >
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative w-full max-w-4xl text-white">
          <span className="inline-block rounded-full bg-violet-600/30 border border-violet-500/40 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-violet-300 backdrop-blur-sm">
            {cms.organizersHeroEyebrow}
          </span>
          <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {cms.organizersHeroHeadlineLine1}
            {cms.organizersHeroHeadlineLine2 && (
              <>
                <br />
                <span className="text-violet-400">{cms.organizersHeroHeadlineLine2}</span>
              </>
            )}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-300 sm:text-lg">
            {cms.organizersHeroDescription}
          </p>

          {/* Dynamic statistics */}
          <div className="mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-x-6 gap-y-2 border-t border-white/10 pt-6 text-xs font-bold text-zinc-400 sm:text-sm">
            <span>{totalVerifiedOrganizers.toLocaleString()} Organizations</span>
            <span>•</span>
            <span>{totalEventsHosted.toLocaleString()} Events Hosted</span>
            <span>•</span>
            <span>{money(totalCommunityRaised)} Community Raised</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* ── Featured Organizers Section (Step 2) ── */}
        {!query && featuredEnriched.length > 0 && (
          <div className="mb-14">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-wider text-orange-600 font-bold">Industry Leaders</p>
              <h2 className="text-2xl font-black text-zinc-950 sm:text-3xl mt-1">Featured Organizations</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredEnriched.map((org) => (
                <OrganizerCard key={org.id} organizer={org} featured />
              ))}
            </div>
          </div>
        )}

        {/* ── Browse Organizers Section (Step 3) ── */}
        <div className="mb-8 border-b border-zinc-200 pb-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">Search Directory</h2>
            <p className="text-sm font-medium text-zinc-500 mt-1 font-bold">Discover creators by name, verified status, or events hosted.</p>
          </div>

          <div className="mt-6">
            <Suspense fallback={null}>
              <OrganizersDirectoryControls
                defaultQuery={query || ""}
                activeStatus={statusFilter}
                activeSort={sort}
              />
            </Suspense>
          </div>
        </div>

        {error && (
          <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-600">
            Failed to load organizations. Please try again later.
          </div>
        )}

        {enriched.length > 0 ? (
          <>
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-bold text-zinc-500">
                {totalCount ?? enriched.length} organization{(totalCount ?? 0) === 1 ? "" : "s"} found
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {enriched.map((org) => (
                <OrganizerCard key={org.id} organizer={org} />
              ))}
            </div>
          </>
        ) : (
          <PublicEmptyState
            icon="👋"
            title="No organizations found"
            description={query ? "Try a different search term." : "Be the first to join the directory."}
            action={{ label: "Create an Organization", href: "/create-organizer" }}
          />
        )}

        {/* ── Become Organizer Section (Step 4) ── */}
        <section className="mt-20 border-t border-zinc-200 pt-16 flex justify-center">
          <CallToAction
            headline="Ready to host your next big event?"
            subtext="Create events, run fundraisers, and grow your audience — all in one platform."
            ctaLabel="Create an Organization"
            ctaHref="/create-organizer"
            memberCount="1,200+ organizations"
          />
        </section>

        {/* ── Pagination Section (Step 5) ── */}
        {enriched.length > 0 && (
          <div className="mt-12 flex justify-center border-t border-zinc-150 pt-8">
            <PublicPagination
              currentPage={page}
              totalPages={totalPages}
              buildHref={(p) => buildHref({ page: String(p) })}
            />
          </div>
        )}
      </div>
    </main>
  );
}
