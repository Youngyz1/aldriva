"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, Search } from "lucide-react";

import { type CampaignShowcaseItem } from "@/components/fundraisers/CampaignShowcase";
import CampaignShowcasePager from "@/components/fundraisers/CampaignShowcasePager";
import CampaignShowcaseMobileList from "@/components/fundraisers/CampaignShowcaseMobileList";

type Filter = "all" | "just-launched" | "close-to-target" | "needs-momentum" | "trending";

const FILTER_META: Record<Filter, { label: string; title: string; description: string; emptyTitle: string; emptyDesc: string }> = {
  all: {
    label: "Browse all",
    title: "Browse All",
    description: "Explore all community fundraisers and find causes to support.",
    emptyTitle: "No fundraisers found",
    emptyDesc: "Try a different filter to discover more campaigns to support.",
  },
  "just-launched": {
    label: "Just Launched",
    title: "Just Launched",
    description: "Recently launched campaigns — newest first. These fundraisers were created in the last 30 days.",
    emptyTitle: "No new campaigns right now",
    emptyDesc: "There are no campaigns launched in the last 30 days. Try another filter or check back soon.",
  },
  "close-to-target": {
    label: "Close to Target",
    title: "Close to Target",
    description: "Campaigns close to reaching their goal — your donation could put them over the top.",
    emptyTitle: "No campaigns close to target",
    emptyDesc: "No fundraisers are close to their goal right now. Check back soon or browse all campaigns.",
  },
  "needs-momentum": {
    label: "Needs Momentum",
    title: "Needs Momentum",
    description: "Campaigns that need a boost — low progress and running for a while.",
    emptyTitle: "No campaigns need momentum right now",
    emptyDesc: "All active campaigns have good momentum. Check back soon or browse all fundraisers.",
  },
  trending: {
    label: "Trending",
    title: "Trending",
    description: "Campaigns with recent momentum — most donations per day.",
    emptyTitle: "No trending campaigns right now",
    emptyDesc: "No campaigns are trending at the moment. Check back soon or browse all fundraisers.",
  },
};

const FILTER_TO_PATH: Record<Filter, string> = {
  all: "/fundraisers/browse-all",
  "just-launched": "/fundraisers/just-launched",
  "close-to-target": "/fundraisers/close-to-target",
  "needs-momentum": "/fundraisers/needs-momentum",
  trending: "/fundraisers/trending",
};

export default function FilterableCampaignShowcase({
  initialFilter,
  initialItems,
  initialTotal,
  initialPage,
  initialSearch = "",
}: {
  initialFilter: Filter;
  initialItems: CampaignShowcaseItem[];
  initialTotal: number;
  initialPage: number;
  initialSearch?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [items, setItems] = useState<CampaignShowcaseItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [isPending, startTransition] = useTransition();

  const meta = FILTER_META[filter] ?? FILTER_META.all;
  const totalPages = Math.max(1, Math.ceil(total / 12));

  const emptyTitle = meta.emptyTitle;
  const emptyDesc = meta.emptyDesc;

  // Sync URL when filter changes
  useEffect(() => {
    const expectedPath = FILTER_TO_PATH[filter];
    if (pathname !== expectedPath) {
      window.history.replaceState(null, "", expectedPath);
    }
  }, [filter, pathname]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      if (filter !== "all") {
        params.set("filter", filter);
      }
      router.push(`/fundraisers/search?${params.toString()}`);
    } else {
      router.push(FILTER_TO_PATH[filter]);
    }
  }

  async function handleFilterChange(newFilter: string) {
    const nextFilter = (["all", "just-launched", "close-to-target", "needs-momentum", "trending"].includes(newFilter)
      ? newFilter
      : "all") as Filter;

    if (nextFilter === filter) return;

    setFilter(nextFilter);
    setPage(1);

    const nextPath = FILTER_TO_PATH[nextFilter];
    window.history.replaceState(null, "", nextPath);

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/fundraisers/list?filter=${nextFilter}&page=1&pageSize=12`
        );
        const data = await res.json();
        setItems(
          (data.fundraisers || []).map((f: any) => ({
            id: f.id,
            slug: f.slug,
            title: f.title,
            raised: f.raised,
            goal: f.goal,
            image: f.image,
            category: f.category,
            organizer: f.organizer,
            donorCount: f.donorCount,
          }))
        );
        setTotal(data.total ?? 0);
      } catch (e) {
        console.error("Failed to fetch filter", e);
      }
    });
  }

  async function handlePageChange(newPage: number) {
    setPage(newPage);
    const path = FILTER_TO_PATH[filter] ?? "/fundraisers/browse-all";
    const pagePart = newPage === 1 ? "" : `?page=${newPage}`;
    window.history.replaceState(null, "", `${path}${pagePart}`);

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/fundraisers/list?filter=${filter}&page=${newPage}&pageSize=12`
        );
        const data = await res.json();
        setItems(
          (data.fundraisers || []).map((f: any) => ({
            id: f.id,
            slug: f.slug,
            title: f.title,
            raised: f.raised,
            goal: f.goal,
            image: f.image,
            category: f.category,
            organizer: f.organizer,
            donorCount: f.donorCount,
          }))
        );
        setTotal(data.total ?? 0);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        console.error("Failed to fetch page", e);
      }
    });
  }

  return (
    <div>
      {/* Breadcrumb + heading — updates in place when filter changes */}
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/fundraisers" className="hover:text-zinc-800 hover:underline">
          Fundraisers
        </Link>
        <span aria-hidden className="text-zinc-300">
          /
        </span>
        <span className="font-bold text-zinc-900">{meta.label}</span>
      </nav>
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">{meta.title}</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-zinc-500 sm:text-base">{meta.description}</p>
      </div>

      {/* Search + filter — same row, not navbar, matching Events page pattern */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search fundraisers..."
            aria-label="Search fundraisers"
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </form>
        <label className="relative block sm:w-56 shrink-0">
          <span className="sr-only">Filter campaigns</span>
          <select
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-4 pr-9 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">Browse all</option>
            <option value="close-to-target">Close to target</option>
            <option value="just-launched">Just launched</option>
            <option value="needs-momentum">Needs momentum</option>
            <option value="trending">Trending</option>
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">▼</span>
        </label>
      </div>

      <div className={isPending ? "opacity-60 transition-opacity" : ""}>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:px-10 sm:py-16">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
              <Heart className="h-8 w-8" />
            </div>
            <h2 className="mt-2 text-xl font-black text-zinc-950 sm:text-2xl">{emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 sm:text-base">{emptyDesc}</p>
            <Link
              href="/fundraisers/browse-all"
              className="mt-6 inline-flex rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white transition hover:bg-orange-700"
            >
              Browse all fundraisers
            </Link>
          </div>
        ) : (
          <>
            {/* Direct grid without duplicate ShowcaseControls — we already have our in-place filter above */}
            <div className="hidden sm:block">
              <CampaignShowcasePager
                pages={(() => {
                  const PAGE_SIZE = 5;
                  const ordered = items;
                  const pages: any[] = [];
                  for (let i = 0; i < ordered.length; i += PAGE_SIZE) {
                    const group = ordered.slice(i, i + PAGE_SIZE);
                    pages.push({ key: group[0].id, big: group[0], small: group.slice(1), bigFeatured: false });
                  }
                  return pages;
                })()}
                controls={null as any}
              />
            </div>
            <div className="sm:hidden">
              <CampaignShowcaseMobileList featured={null} items={items} />
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {totalPages > 1 &&
                Array.from({ length: totalPages }).map((_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      className={`min-w-[2.25rem] rounded-lg px-3 py-2 text-center text-sm font-black transition ${
                        p === page ? "bg-orange-600 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-orange-600"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
