import Link from "next/link";
import { Heart, Search } from "lucide-react";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import PublicPagination from "@/components/public/PublicPagination";
import CampaignShowcase, {
  type CampaignShowcaseItem,
} from "@/components/fundraisers/CampaignShowcase";
import {
  getFundraiserList,
  type FundraiserSmartFilter,
} from "@/lib/fundraiser-data";
import { getDonationCounts } from "@/lib/donation-counts";
import { cacheLife } from "next/cache";

const SMART_FILTERS = [
  "close-to-target",
  "just-launched",
  "needs-momentum",
  "trending",
] as const;
const PAGE_SIZE = 12;

export function FundraisersSearchResultsSkeleton() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="h-10 w-64 animate-pulse rounded-full bg-zinc-100" />
        <div className="h-10 w-40 animate-pulse rounded-full bg-zinc-100" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
          >
            <div className="aspect-[4/3] w-full animate-pulse bg-zinc-100" />
            <div className="space-y-2.5 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const getCachedDonorCounts = async (
  fundraiserIds: string[]
): Promise<Record<string, number>> => {
  "use cache";
  cacheLife({ revalidate: 60 });

  const counts = await getDonationCounts(fundraiserIds);
  return Object.fromEntries(counts);
};

export default async function FundraisersSearchResultsSection({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    category?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const { q, filter, category, sort, page: pageParam } = await searchParams;
  const query = q?.trim() || "";
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const smartFilter: FundraiserSmartFilter = (
    SMART_FILTERS as readonly string[]
  ).includes(filter ?? "")
    ? (filter as FundraiserSmartFilter)
    : "all";

  const selectedCategories = category
    ? category.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  // 1. Domain-isolated query: touches only fundraisers table
  const { fundraisers, total: totalCount } = query
    ? await getFundraiserList({
        searchQuery: query,
        smartFilter,
        categories: selectedCategories,
        sort: sort === "raised" || sort === "goal" ? sort : "newest",
        page,
        pageSize: PAGE_SIZE,
      })
    : { fundraisers: [], total: 0 };

  const fundraiserIds = fundraisers.map((f) => f.id);
  const donorCounts =
    fundraiserIds.length > 0 ? await getCachedDonorCounts(fundraiserIds) : {};

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

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / PAGE_SIZE));

  function buildHref(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (smartFilter !== "all") params.set("filter", smartFilter);
    if (selectedCategories.length > 0)
      params.set("category", selectedCategories.join(","));
    if (sort && sort !== "newest") params.set("sort", sort);
    Object.entries(updates).forEach(([k, v]) => params.set(k, v));
    return `/fundraisers/search?${params.toString()}`;
  }

  // Fallback discovery items when query returns 0 results
  let fallbackShowcaseItems: CampaignShowcaseItem[] = [];
  if (fundraisers.length === 0) {
    const { fundraisers: fallbackList } = await getFundraiserList({
      smartFilter: "trending",
      pageSize: 6,
    });
    const fallbackIds = fallbackList.map((f) => f.id);
    const fallbackDonorCounts =
      fallbackIds.length > 0 ? await getCachedDonorCounts(fallbackIds) : {};

    fallbackShowcaseItems = fallbackList.map((f) => ({
      id: f.id,
      slug: f.slug,
      title: f.title,
      raised: f.raised,
      goal: f.goal,
      image: f.image,
      category: f.category,
      organizer: f.organizer,
      donorCount: fallbackDonorCounts[f.id],
    }));
  }

  if (!query) {
    return (
      <div className="py-6">
        <PublicEmptyState
          icon={<Search className="h-8 w-8 text-zinc-400" />}
          title="Search all fundraisers"
          description="Enter a cause, campaign title, or organizer name in the search box."
          action={{ label: "Browse all fundraisers", href: "/fundraisers" }}
        />
      </div>
    );
  }

  const emptyState = {
    icon: <Heart className="h-8 w-8 text-zinc-400" />,
    title: `No fundraisers found for "${query}"`,
    description:
      "Try checking your spelling, using broader search terms, or explore active campaigns below.",
    action: { label: "Browse all fundraisers", href: "/fundraisers" },
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-sm font-semibold text-zinc-500">
            Showing <span className="font-bold text-zinc-900">{totalCount}</span>{" "}
            {totalCount === 1 ? "campaign" : "campaigns"} for{" "}
            <span className="font-bold text-zinc-900">&ldquo;{query}&rdquo;</span>
          </p>
        </div>
        <Link
          href="/fundraisers"
          className="text-xs font-bold text-orange-600 transition hover:text-orange-700 sm:text-sm"
        >
          ← Back to all fundraisers
        </Link>
      </div>

      <CampaignShowcase
        basePath="/fundraisers/search"
        activeFilter={smartFilter}
        featured={null}
        items={showcaseItems}
        emptyState={emptyState}
      />

      {fundraisers.length === 0 && fallbackShowcaseItems.length > 0 && (
        <div className="border-t border-zinc-200 pt-10">
          <h2 className="mb-6 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
            Popular Campaigns to Support
          </h2>
          <CampaignShowcase
            basePath="/fundraisers"
            activeFilter="trending"
            featured={null}
            items={fallbackShowcaseItems}
            emptyState={emptyState}
          />
        </div>
      )}

      {fundraisers.length > 0 && totalPages > 1 && (
        <div className="mt-12 flex justify-center border-t border-zinc-150 pt-8">
          <PublicPagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={(p) => buildHref({ page: String(p) })}
          />
        </div>
      )}
    </div>
  );
}
