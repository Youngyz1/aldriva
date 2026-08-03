import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import EventsPageView, { type EventsPageFilters } from "@/app/events/EventsPageView";

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
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Aldriva Events" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventsPageFilters>;
}) {
  const filters = await searchParams;
  return (
    <EventsPageView
      filters={filters}
      showTrendingEvents
      showHero
      showCategoryIcons
    />
  );
}
