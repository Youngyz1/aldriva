import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import EventsPageView, { type EventsPageFilters } from "@/app/[locale]/events/EventsPageView";
import { MarketingSection } from "@/components/footers";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Events — Aldriva",
  description: "Browse and buy tickets for events near you.",
  alternates: {
    canonical: `${getSiteUrl()}/events`,
  },
  openGraph: {
    title: "Events — Aldriva",
    description: "Browse and buy tickets for events near you.",
    url: `${getSiteUrl()}/events`,
    siteName: "Aldriva",
    images: [{ url: "/aldriva-og-image-v2.png", width: 1200, height: 630, alt: "Aldriva Events" }],
  },
  twitter: { card: "summary_large_image", images: ["/aldriva-og-image-v2.png"] },
};

import { Suspense } from "react";

async function EventsRedirectCheck({ searchParams }: { searchParams: Promise<EventsPageFilters> }) {
  const resolved = await searchParams;
  if (resolved?.q?.trim()) {
    const params = new URLSearchParams();
    Object.entries(resolved).forEach(([k, v]) => {
      if (v) params.set(k, String(v));
    });
    redirect(`/events/search?${params.toString()}`);
  }
  return null;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventsPageFilters>;
}) {
  return (
    <MarketingSection>
      <Suspense fallback={null}>
        <EventsRedirectCheck searchParams={searchParams} />
      </Suspense>
      <EventsPageView
        filters={searchParams}
        showTrendingEvents
        showHero
        showCategoryIcons
      />
    </MarketingSection>
  );
}
