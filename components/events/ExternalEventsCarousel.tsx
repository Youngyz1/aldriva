"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import ExternalEventCard, { ExternalSourceCredit } from "@/components/events/ExternalEventCard";
import type { ExternalEvent } from "@/lib/external-events";

const ARROW_CLASS =
  "static h-9 w-9 translate-y-0 rounded-full border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40";

/**
 * Horizontal carousel for the live external results ("More events elsewhere").
 * Shows 3 cards at a time on desktop (2 on tablet, 1 on mobile) and slides
 * through the rest with header arrows — reuses the shared embla carousel, the
 * same mechanism as {@link CampaignShowcasePager}. Per-card attribution and the
 * upstream cap/interleave are unchanged; this is display only.
 */
export default function ExternalEventsCarousel({ events }: { events: ExternalEvent[] }) {
  // Arrows only matter once there's more than one desktop page (3 per view).
  const showArrows = events.length > 3;

  return (
    <Carousel opts={{ align: "start" }}>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-zinc-950 sm:text-3xl">More Events</h2>
          <p className="mt-1 text-sm font-medium text-zinc-500">
            Tickets are sold on the source platform.
          </p>
        </div>
        {showArrows && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <CarouselPrevious className={ARROW_CLASS} aria-label="Previous events" />
            <CarouselNext className={ARROW_CLASS} aria-label="Next events" />
          </div>
        )}
      </div>

      <CarouselContent className="-ml-5">
        {events.map((event) => (
          <CarouselItem key={event.id} className="basis-full pl-5 sm:basis-1/2 xl:basis-1/3">
            <ExternalEventCard event={event} />
          </CarouselItem>
        ))}
      </CarouselContent>

      <ExternalSourceCredit sources={events.map((e) => e.source)} />
    </Carousel>
  );
}
