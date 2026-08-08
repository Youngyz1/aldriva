"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import EventCard from "@/components/EventCard";
import { cn } from "@/lib/utils";

export type TrendingItem = {
  id: string;
  slug: string;
  title: string;
  eventDate: string | null;
  city: string | null;
  venue: string | null;
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
const ARROW_CLASS_DARK =
  "border-white/20 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-orange-400";

/**
 * "Trending Events" rail — a single continuous Embla track (the same shared
 * carousel as ExternalEventsCarousel/CampaignShowcasePager), not a paginated
 * grid. Every item in `items` is one slide in one track; Prev/Next drive
 * Embla's scrollPrev/scrollNext directly instead of local page state.
 */
export default function TrendingCarousel({
  items,
  onDark = false,
}: {
  items: TrendingItem[];
  onDark?: boolean;
}) {
  // Arrows only matter once there's more than a desktop view's worth (4 per view).
  const showArrows = items.length > 4;

  return (
    <section>
      <Carousel opts={{ align: "start" }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3
            className={cn(
              "text-2xl font-black sm:text-3xl",
              onDark ? "text-white" : "text-zinc-950"
            )}
          >
            Trending Events
          </h3>

          {showArrows && (
            <div className="flex shrink-0 items-center gap-2">
              <CarouselPrevious
                className={cn(ARROW_CLASS, onDark && ARROW_CLASS_DARK)}
                aria-label="Previous trending events"
              />
              <CarouselNext
                className={cn(ARROW_CLASS, onDark && ARROW_CLASS_DARK)}
                aria-label="Next trending events"
              />
            </div>
          )}
        </div>

        <CarouselContent className="-ml-5">
          {items.map((event) => (
            <CarouselItem
              key={event.id}
              className="basis-[82%] pl-5 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
            >
              <EventCard
                slug={event.slug}
                title={event.title}
                date={formatEventDate(event.eventDate)}
                eventDate={event.eventDate}
                location={event.city || event.venue || "Location TBA"}
                image={event.banner || ""}
                category={event.category}
                onDark={onDark}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}
