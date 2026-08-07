import PublicPagination from "@/components/public/PublicPagination";
import CampaignShowcase, {
  type CampaignShowcaseItem,
} from "@/components/fundraisers/CampaignShowcase";
import {
  getFundraiserList,
  type FundraiserListParams,
  type FundraiserSmartFilter,
} from "@/lib/fundraiser-data";
import { getDonationCounts } from "@/lib/donation-counts";
import { cacheLife } from "next/cache";

export type FundraisersPageFilters = {
  q?: string;
  sort?: string;
  page?: string;
  categories?: string;
  filter?: string;
};

const SMART_FILTERS = ["close-to-target", "just-launched", "needs-momentum", "trending"] as const;
const PAGE_SIZE = 12;

// Single featured campaign (highest amount raised) for the default browse
// view. Fixed args regardless of the caller's filter state — only *whether*
// this gets called varies by request, not what it's called with — so it
// caches as one call site, same as getCachedTrendingRankedEventIds in
// EventsResultsSection.
const getCachedFeaturedFundraiser = async () => {
  "use cache";
  cacheLife({ revalidate: 120 });

  return (await getFundraiserList({ featuredOnly: true, sort: "raised", pageSize: 1 }))
    .fundraisers[0] ?? null;
};

// Browse grid — keyed by the full filter set (`params` is part of the cache
// key), so each distinct search/sort/category/page/filter combination caches
// independently.
const getCachedFundraiserGrid = async (params: FundraiserListParams) => {
  "use cache";
  cacheLife({ revalidate: 60 });

  return getFundraiserList(params);
};

// Donor counts for the current featured pick + grid page, combined — one
// cached `.in(...)` lookup keyed on the full ID array, not a per-card call.
// Returns a plain object (not the Map getDonationCounts returns) so it
// serializes cleanly across the 'use cache' boundary.
const getCachedDonorCounts = async (
  fundraiserIds: string[]
): Promise<Record<string, number>> => {
  "use cache";
  cacheLife({ revalidate: 60 });

  const counts = await getDonationCounts(fundraiserIds);
  return Object.fromEntries(counts);
};

/**
 * The one genuinely per-request piece of `/fundraisers` — everything here
 * depends on `filters` (search/sort/category/page/smart-filter). No
 * headers()/cookies() reads exist on this route (unlike EventsFilterHeader
 * on /events), so there's no separate small boundary to split out; this is
 * the whole dynamic Suspense boundary.
 */
export default async function FundraisersBrowseSection({
  filters,
}: {
  filters: Promise<FundraisersPageFilters>;
}) {
  const resolved = await filters;
  const query = resolved.q?.trim();
  const sort = resolved.sort || "newest";
  const page = Math.max(1, parseInt(resolved.page || "1", 10) || 1);
  const selectedCategories = resolved.categories
    ? resolved.categories.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const smartFilter: FundraiserSmartFilter =
    (SMART_FILTERS as readonly string[]).includes(resolved.filter ?? "")
      ? (resolved.filter as FundraiserSmartFilter)
      : "all";

  // 1. Pick a single featured campaign (by highest amount raised) when
  // browsing the default view without a search query — excluded from the
  // grid below so the same campaign never renders twice. Behavioural smart
  // filters skip the featured pin so the ranked results stand on their own.
  const sortParam = sort === "raised" || sort === "goal" ? sort : "newest";

  const featuredItem =
    !query && smartFilter === "all" ? await getCachedFeaturedFundraiser() : null;

  // 2. Fetch the browse grid, excluding the featured pick so it can't appear
  // twice on the same page load.
  const { fundraisers, total: totalCount } = await getCachedFundraiserGrid({
    categories: selectedCategories,
    excludeIds: featuredItem ? [featuredItem.id] : undefined,
    searchQuery: query,
    sort: sortParam,
    smartFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  // 3. Donor counts for each fundraiser (including the featured pick) — one
  // cached `.in(...)` lookup keyed on the combined ID set, not a per-card call.
  const fundraiserIds = [
    ...(featuredItem ? [featuredItem.id] : []),
    ...fundraisers.map((f) => f.id),
  ];
  const donorCounts =
    fundraiserIds.length > 0 ? await getCachedDonorCounts(fundraiserIds) : {};

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE));

  const showcaseFeatured: CampaignShowcaseItem | null = featuredItem
    ? {
        id: featuredItem.id,
        slug: featuredItem.slug,
        title: featuredItem.title,
        raised: featuredItem.raised,
        goal: featuredItem.goal,
        image: featuredItem.image,
        category: featuredItem.category,
        organizer: featuredItem.organizer,
        donorCount: donorCounts[featuredItem.id],
      }
    : null;

  const showcaseItems: CampaignShowcaseItem[] = fundraisers.map((f) => ({
    id: f.id,
    slug: f.slug,
    title: f.title,
    raised: f.raised,
    goal: f.goal,
    image: f.image,
    category: f.category,
    organizer: f.organizer,
    donorCount: donorCounts[f.id],
  }));

  function buildHref(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sort !== "newest") params.set("sort", sort);
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (smartFilter !== "all") params.set("filter", smartFilter);
    Object.entries(updates).forEach(([k, v]) => params.set(k, v));
    return `/fundraisers?${params.toString()}`;
  }

  return (
    <>
      <CampaignShowcase
        basePath="/fundraisers"
        activeFilter={smartFilter}
        featured={showcaseFeatured}
        items={showcaseItems}
        emptyState={{
          icon: "💚",
          title: "No fundraisers found",
          description: "Try a different filter to discover more campaigns to support.",
          action: { label: "Start a fundraiser", href: "/create-fundraiser" },
        }}
      />

      {fundraisers && fundraisers.length > 0 && (
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
