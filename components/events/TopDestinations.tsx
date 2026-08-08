"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { CURATED_DESTINATIONS } from "@/lib/curated-destinations";
import { slugifyCity } from "@/lib/city-slug";

/**
 * "Explore events by city" — a horizontal sliding carousel of city tiles
 * linking to the dedicated /events/city/[citySlug] route (own server-side
 * data fetch — see app/events/EventsPageView.tsx — blended with live
 * Ticketmaster/SeatGeek results for that city). Reuses the shared embla
 * `Carousel` primitives (same ones used by Gallery4 / CampaignShowcasePager)
 * rather than a bespoke scroller. The destination list itself lives in
 * lib/curated-destinations.ts (shared with the slug resolver).
 */
export default function TopDestinations() {
  const [api, setApi] = useState<CarouselApi>();
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    if (!api) return;
    const update = () => {
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    };
    update();
    api.on("select", update);
    api.on("reInit", update);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);

  return (
    <section className="mt-20 border-t border-zinc-200 pt-16">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">
            Explore events by city
          </h2>
        </div>
        {/* Arrow controls (desktop) — mobile uses swipe/drag. */}
        <div className="hidden shrink-0 gap-2 sm:flex">
          <Button
            size="icon"
            variant="outline"
            onClick={() => api?.scrollPrev()}
            disabled={!canPrev}
            aria-label="Previous cities"
            className="h-10 w-10 rounded-full disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => api?.scrollNext()}
            disabled={!canNext}
            aria-label="Next cities"
            className="h-10 w-10 rounded-full disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Carousel
        setApi={setApi}
        opts={{
          align: "start",
          loop: false,
          breakpoints: { "(max-width: 640px)": { dragFree: true } },
        }}
      >
        <CarouselContent>
          {CURATED_DESTINATIONS.map((city) => (
            <CarouselItem
              key={city.name}
              className="basis-[82%] sm:basis-1/2 lg:basis-1/3"
            >
              <Link
                href={`/events/city/${slugifyCity(city.name)}`}
                className="group relative block overflow-hidden rounded-2xl ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative h-48 w-full bg-zinc-100 sm:h-56">
                  <Image
                    src={city.image}
                    alt={city.alt}
                    fill
                    sizes="(max-width: 640px) 82vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <h3 className="text-xl font-black text-white">{city.name}</h3>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-white/85">
                      Browse events
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}
