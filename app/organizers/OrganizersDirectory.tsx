import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { CallToAction } from "@/components/ui/call-to-action";
import OrganizerCard, { type OrganizerCardData } from "@/components/public/OrganizerCard";
import PublicPagination from "@/components/public/PublicPagination";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import OrganizersDirectoryControls from "./OrganizersDirectoryControls";
import { cacheLife } from "next/cache";

export type OrganizersPageFilters = {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
};

const PAGE_SIZE = 9;

type OrganizerRow = {
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
};

type OrganizerStatsEntry = { events: number; fundraisers: number; followers: number };
type OrganizerStatsRecord = Record<string, OrganizerStatsEntry>;

// Event/fundraiser/follower counts for a set of organizer IDs — one
// `.in(...)` query per table regardless of how many IDs, not a per-organizer
// fan-out. Called twice per render (main list, featured picks) as two
// independent single-array-arg calls, not a loop — same safe shape as the
// donor-counts fetcher in FundraisersBrowseSection.tsx. Returns a plain
// object (not a Map) so it serializes cleanly across the 'use cache' boundary.
const getCachedOrganizerStats = async (ids: string[]): Promise<OrganizerStatsRecord> => {
  "use cache";
  cacheLife({ revalidate: 60 });

  const stats: OrganizerStatsRecord = {};
  if (ids.length === 0) return stats;

  for (const id of ids) {
    stats[id] = { events: 0, fundraisers: 0, followers: 0 };
  }

  const [{ data: events }, { data: fundraisers }, { data: follows }] = await Promise.all([
    supabase.from("events").select("organizer_id").in("organizer_id", ids).eq("visibility", "public"),
    supabase.from("fundraisers").select("organizer_id").in("organizer_id", ids),
    supabase.from("organizer_follows").select("organizer_id").in("organizer_id", ids),
  ]);

  for (const row of events ?? []) {
    if (row.organizer_id && stats[row.organizer_id]) stats[row.organizer_id].events += 1;
  }
  for (const row of fundraisers ?? []) {
    if (row.organizer_id && stats[row.organizer_id]) stats[row.organizer_id].fundraisers += 1;
  }
  for (const row of follows ?? []) {
    if (row.organizer_id && stats[row.organizer_id]) stats[row.organizer_id].followers += 1;
  }

  return stats;
};

function enrichOrganizers(
  organizers: OrganizerRow[],
  stats: OrganizerStatsRecord
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
    eventCount: (stats[org.id]?.events ?? 0) + (org.events_offset ?? 0),
    fundraiserCount: stats[org.id]?.fundraisers ?? 0,
    followerCount: (stats[org.id]?.followers ?? 0) + (org.follower_offset ?? 0),
  }));
}

// Featured picks for the default (no search) view — fixed args regardless of
// the caller's filter state, so it caches as one call site, same as
// getCachedFeaturedFundraiser in FundraisersBrowseSection.tsx.
const getCachedFeaturedOrganizers = async (): Promise<OrganizerRow[]> => {
  "use cache";
  cacheLife({ revalidate: 120 });

  const { data } = await supabase
    .from("organizers")
    .select("*")
    .eq("visibility", "public")
    .eq("status", "verified")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  return data ?? [];
};

type DirectoryParams = {
  query?: string;
  statusFilter: "all" | "verified";
  sort: "name" | "events";
  page: number;
};

// Main directory listing — keyed by the full filter set (`params` is part of
// the cache key), so each distinct search/status/sort/page combination
// caches independently. `hasError` collapses the Postgrest error down to a
// boolean (only ever used to show a generic message) so nothing beyond a
// plain serializable shape crosses the 'use cache' boundary.
const getCachedOrganizersDirectory = async (params: DirectoryParams) => {
  "use cache";
  cacheLife({ revalidate: 60 });

  let organizersQuery = supabase
    .from("organizers")
    .select("*", { count: "exact" })
    .eq("visibility", "public")
    .is("deleted_at", null);

  if (params.statusFilter === "verified") {
    organizersQuery = organizersQuery.eq("status", "verified");
  } else {
    organizersQuery = organizersQuery.in("status", ["pending", "verified"]);
  }

  if (params.query) {
    organizersQuery = organizersQuery.ilike("name", `%${params.query}%`);
  }

  if (params.sort === "name") {
    organizersQuery = organizersQuery.order("name", { ascending: true });
  } else {
    organizersQuery = organizersQuery.order("created_at", { ascending: false });
  }

  const from = (params.page - 1) * PAGE_SIZE;
  organizersQuery = organizersQuery.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await organizersQuery;

  return {
    organizers: (data ?? []) as OrganizerRow[],
    hasError: Boolean(error),
    totalCount: count ?? 0,
  };
};

/**
 * The one genuinely per-request piece of `/organizers` — everything here
 * depends on `filters` (search/status/sort/page). No headers()/cookies()
 * reads exist on this route, so there's no separate small boundary to split
 * out; this is the whole dynamic Suspense boundary.
 *
 * The "Search Directory" heading and the "Become an Organizer" CTA band both
 * have no filter dependency of their own, but stay here rather than in the
 * static shell: the heading shares one bordered block with the (genuinely
 * dynamic) controls row, and the CTA sits between the results grid and
 * pagination in the original layout — splitting either out cleanly would
 * mean restructuring the wrapper markup or reordering content, for very
 * little static-shell benefit from what's a small amount of marketing copy.
 */
export default async function OrganizersDirectory({
  filters,
}: {
  filters: Promise<OrganizersPageFilters>;
}) {
  const resolved = await filters;
  const query = resolved.q?.trim();
  const statusFilter: "all" | "verified" = resolved.status === "verified" ? "verified" : "all";
  const sort: "name" | "events" = resolved.sort === "events" ? "events" : "name";
  const page = Math.max(1, parseInt(resolved.page || "1", 10) || 1);

  // 1. Main directory listing.
  const { organizers, hasError, totalCount } = await getCachedOrganizersDirectory({
    query,
    statusFilter,
    sort,
    page,
  });
  const ids = organizers.map((o) => o.id);
  const stats = await getCachedOrganizerStats(ids);
  const enriched = enrichOrganizers(organizers, stats);

  // 2. Featured verified organizers, shown only on the default (no search) view.
  const featuredOrganizers = !query ? await getCachedFeaturedOrganizers() : [];
  const featuredIds = featuredOrganizers.map((o) => o.id);
  const featuredStats = await getCachedOrganizerStats(featuredIds);
  const featuredEnriched = enrichOrganizers(featuredOrganizers, featuredStats);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (statusFilter === "verified") params.set("status", "verified");
    if (sort === "events") params.set("sort", "events");
    Object.entries(updates).forEach(([k, v]) => params.set(k, v));
    return `/organizers?${params.toString()}`;
  }

  return (
    <>
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

      {hasError && (
        <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-600">
          Failed to load organizations. Please try again later.
        </div>
      )}

      {enriched.length > 0 ? (
        <>
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-500">
              {totalCount || enriched.length} organization{totalCount === 1 ? "" : "s"} found
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

      <section className="mt-20 border-t border-zinc-200 pt-16 flex justify-center">
        <CallToAction
          headline="Ready to host your next big event?"
          subtext="Create events, run fundraisers, and grow your audience — all in one platform."
          ctaLabel="Create an Organization"
          ctaHref="/create-organizer"
          memberCount="1,200+ organizations"
        />
      </section>

      {enriched.length > 0 && (
        <div className="mt-12 flex justify-center border-t border-zinc-150 pt-8">
          <PublicPagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={(p) => buildHref({ page: String(p) })}
          />
        </div>
      )}
    </>
  );
}
