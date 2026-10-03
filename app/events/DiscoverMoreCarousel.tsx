"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import EventCard from "@/components/EventCard";

export type DiscoverMoreItem = {
  id: string;
  slug: string | null;
  title: string;
  eventDate: string | null;
  city: string | null;
  banner: string | null;
  category: string | null;
};

const FALLBACK_DATE = "Date TBA";

function formatEventDate(eventDate: string | null): string {
  if (!eventDate) return FALLBACK_DATE;
  const value = new Date(eventDate);
  if (Number.isNaN(value.getTime())) return FALLBACK_DATE;
  return value.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const ARROW_CLASS =
  "static h-9 w-9 translate-y-0 rounded-full border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40";

/**
 * "Discover More" rail — the same shared Embla carousel as TrendingCarousel /
 * ExternalEventsCarousel / CampaignShowcasePager, replacing the old
 * paginated grid. `items` is the full over-fetched batch (see
 * DISCOVER_MORE_PAGE_SIZE in EventsPageView) rendered as one continuous
 * track; Prev/Next drive Embla's scrollPrev/scrollNext directly, not
 * page-index state.
 */
export default function DiscoverMoreCarousel({ items }: { items: DiscoverMoreItem[] }) {
  // Cap rendered cards at 30 — server may over-fetch up to 60 for pagination
  // headroom, but mounting all 60 in the DOM bloats Embla's layout pass.
  // Arrows only matter once there's more than a desktop view's worth (4 per view).
  const visibleItems = items.slice(0, 30);
  const showArrows = visibleItems.length > 4;

  return (
    <Carousel opts={{ align: "start", duration: 15 }}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h3 className="text-2xl font-black text-zinc-950 sm:text-3xl">Discover More</h3>

        {showArrows && (
          <div className="flex shrink-0 items-center gap-2">
            <CarouselPrevious className={ARROW_CLASS} aria-label="Previous events" />
            <CarouselNext className={ARROW_CLASS} aria-label="Next events" />
          </div>
        )}
      </div>

      <CarouselContent className="-ml-5">
        {visibleItems.map((event) => (
          <CarouselItem
            key={event.id}
            className="basis-[82%] pl-5 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
          >
            <EventCard
              slug={event.slug}
              title={event.title}
              date={formatEventDate(event.eventDate)}
              eventDate={event.eventDate}
              location={event.city || "Location TBA"}
              image={event.banner || ""}
              category={event.category}
              sizes="(max-width: 640px) 82vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
