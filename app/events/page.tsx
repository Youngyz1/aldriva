import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import EventsPageView, { type EventsPageFilters } from "@/app/events/EventsPageView";
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

export default function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventsPageFilters>;
}) {
  // `filters` is passed down unawaited — reading searchParams is itself a
  // request-time operation under Cache Components, so it happens inside the
  // Suspense-wrapped dynamic components (EventsFilterHeader,
  // EventsResultsSection) rather than blocking this page from returning its
  // static shell.
  // Events list is a public discovery surface → full marketing footer.
  // Wrapped at the page level (NOT in an app/events/layout.tsx) so the
  // event detail, edit, my-tickets and team flows keep their own tiers.
  return (
    <MarketingSection>
      <EventsPageView
        filters={searchParams}
        showTrendingEvents
        showHero
        showCategoryIcons
      />
    </MarketingSection>
  );
}
