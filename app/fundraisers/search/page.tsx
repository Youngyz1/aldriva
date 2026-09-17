import { Suspense } from "react";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { MarketingSection } from "@/components/footers";
import FundraisersSearchResultsSection, {
  FundraisersSearchResultsSkeleton,
} from "./FundraisersSearchResultsSection";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Search Fundraisers — Aldriva",
  description: "Search community fundraisers and causes on Aldriva.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function FundraisersSearchPage({
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
  return (
    <MarketingSection>
      <main className="min-h-screen bg-zinc-50 pb-16 text-zinc-950">
        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">
              Search Fundraisers
            </h1>
            <p className="mt-2 text-sm font-medium text-zinc-500 sm:text-base">
              Discover campaigns, community drives, and causes to support.
            </p>
          </div>

          <Suspense fallback={<FundraisersSearchResultsSkeleton />}>
            <FundraisersSearchResultsSection searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </MarketingSection>
  );
}
