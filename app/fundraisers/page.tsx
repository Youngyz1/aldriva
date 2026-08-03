import { Suspense } from "react";
import FundraisersHero from "@/app/fundraisers/FundraisersHero";
import FundraisersBrowseSection, {
  type FundraisersPageFilters,
} from "@/app/fundraisers/FundraisersBrowseSection";
import HowFundraisingWorks from "@/components/fundraisers/HowFundraisingWorks";
import WhyAldriva from "@/components/fundraisers/WhyAldriva";
import FundraiserFeaturedTopics from "@/components/fundraisers/FundraiserFeaturedTopics";
import TrustSection from "@/components/fundraisers/TrustSection";
import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Fundraisers — Aldriva",
  description: "Support causes and fundraising campaigns near you.",
  alternates: {
    canonical: `${getSiteUrl()}/fundraisers`,
  },
  openGraph: {
    title: "Fundraisers — Aldriva",
    description: "Support causes and fundraising campaigns near you.",
    url: `${getSiteUrl()}/fundraisers`,
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Aldriva Fundraisers" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

// Fallback for FundraisersBrowseSection — a big-card + 4-card grid, matching
// CampaignShowcase's own desktop pager shape (one big + 2x2 small), so
// resolving the filter-dependent grid doesn't shift layout.
function FundraisersBrowseSkeleton() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="h-10 w-64 animate-pulse rounded-full bg-zinc-100" />
        <div className="h-10 w-40 animate-pulse rounded-full bg-zinc-100" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-zinc-100">
          <div className="aspect-[4/3] w-full animate-pulse bg-zinc-100" />
          <div className="space-y-2 p-5">
            <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-zinc-100">
              <div className="aspect-video w-full animate-pulse bg-zinc-100" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FundraisersPage({
  searchParams,
}: {
  searchParams: Promise<FundraisersPageFilters>;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-16">
      {/* ── Hero: CMS-managed, same for every visitor regardless of filters —
          cached, part of the instant static shell. ── */}
      <FundraisersHero />

      {/* ── How fundraising works (organizer-focused, between Hero and Browse) ── */}
      <HowFundraisingWorks />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* ── Browse Campaigns Section — heading has no filter dependency, so
            it stays outside the Suspense boundary below. ── */}
        <div id="browse-campaigns" className="mb-8 scroll-mt-24">
          <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">Browse Campaigns</h2>
          <p className="text-sm font-medium text-zinc-500 mt-1">Explore all community fundraisers and find causes to support.</p>
        </div>

        {/* ── The one genuinely per-request piece of this page: featured pick,
            browse grid, donor counts, and pagination all depend on
            searchParams (search/sort/category/page/smart-filter). ── */}
        <Suspense fallback={<FundraisersBrowseSkeleton />}>
          <FundraisersBrowseSection filters={searchParams} />
        </Suspense>
      </div>

      {/* ── Why Aldriva (coral reassurance band; TrustSection follows later) ── */}
      <WhyAldriva />

      {/* ── Featured topics (on page background, below the coral band) ── */}
      <FundraiserFeaturedTopics />

      {/* ── Trust band (teal; FAQ + final CTA follow later, before the footer) ── */}
      <TrustSection />
    </main>
  );
}
