import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { resolveCitySlugName } from "@/lib/resolve-city-slug";
import { CURATED_DESTINATIONS } from "@/lib/curated-destinations";
import { slugifyCity } from "@/lib/city-slug";
import EventsPageView, { type EventsPageFilters } from "@/app/events/EventsPageView";

// Pre-render the curated destination set (also used by TopDestinations); any
// other city slug still resolves correctly via resolveCitySlugName's fallback
// (see generateMetadata/page body below) — this is a build-time performance
// warm-up, not an allowlist. dynamicParams stays at its default (true).
export async function generateStaticParams() {
  return CURATED_DESTINATIONS.map((destination) => ({
    citySlug: slugifyCity(destination.name),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}): Promise<Metadata> {
  const { citySlug } = await params;
  const cityName = await resolveCitySlugName(citySlug);
  const title = `Events in ${cityName} — Aldriva`;
  const description = `Browse and buy tickets for events in ${cityName}.`;
  const url = `${getSiteUrl()}/events/city/${citySlug}`;

  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Aldriva",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", images: ["/og-image.png"] },
  };
}

export default async function EventsCityPage({
  params,
  searchParams,
}: {
  params: Promise<{ citySlug: string }>;
  searchParams: Promise<Omit<EventsPageFilters, "location">>;
}) {
  const { citySlug } = await params;
  const cityName = await resolveCitySlugName(citySlug);

  // `filters` is passed down unawaited — see app/events/page.tsx for why.
  return (
    <EventsPageView
      filters={searchParams}
      forcedLocation={cityName}
    />
  );
}
