import { Suspense } from "react";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { MarketingSection } from "@/components/footers";
import EventsSearchResultsSection, {
  EventsSearchResultsSkeleton,
} from "./EventsSearchResultsSection";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Search Events — Aldriva",
  description: "Search and discover events on Aldriva.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function EventsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    location?: string;
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
              Search Events
            </h1>
            <p className="mt-2 text-sm font-medium text-zinc-500 sm:text-base">
              Find live events, concerts, workshops, and community gatherings.
            </p>
          </div>

          <Suspense fallback={<EventsSearchResultsSkeleton />}>
            <EventsSearchResultsSection searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </MarketingSection>
  );
}
