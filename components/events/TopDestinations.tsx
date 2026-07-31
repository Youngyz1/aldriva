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

/**
 * "Explore events by city" — a horizontal sliding carousel of city tiles
 * linking to /events?location={city} (local DB events blended with live
 * Ticketmaster/SeatGeek results for that city — see app/events/page.tsx).
 * Reuses the shared embla `Carousel` primitives (same ones used by Gallery4 /
 * CampaignShowcasePager) rather than a bespoke scroller.
 *
 * Cities need a real, recognizable landmark image. The original 3 are
 * re-hosted on Supabase (event-banners/destinations); the rest link directly
 * to verified Wikimedia Commons originals (upload.wikimedia.org, allowlisted
 * in next.config.ts) since re-hosting requires a manual Supabase Storage
 * upload this tooling can't perform. Several of these cities (LA, Chicago,
 * Miami, Atlanta, Houston, Boston, Las Vegas, Nashville, Denver, Seattle)
 * have no local Aldriva events yet — they rely entirely on the live
 * external blend to show anything real.
 *
 * To add a city: append here with a real, recognizable photo. Do not add
 * cities without a recognizable photo — small towns without one fail the bar.
 */
const DESTINATIONS: { name: string; image: string; alt: string }[] = [
  {
    name: "New York",
    image:
      "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/event-banners/destinations/new-york.jpg",
    alt: "Lower Manhattan skyline",
  },
  {
    name: "Montclair",
    image:
      "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/event-banners/destinations/montclair.jpg",
    alt: "Montclair Art Museum",
  },
  {
    name: "Pittsburgh",
    image:
      "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/event-banners/destinations/pittsburgh.jpg",
    alt: "Pittsburgh skyline from the Duquesne Incline",
  },
  {
    name: "Los Angeles",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Hollywood_sign_%288485145044%29.jpg/1280px-Hollywood_sign_%288485145044%29.jpg",
    alt: "The Hollywood Sign",
  },
  {
    name: "Chicago",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/e/eb/Chicago_from_under_the_Cloud_Gate_%289694666470%29.jpg",
    alt: "Chicago skyline reflected in Cloud Gate, Millennium Park",
  },
  {
    name: "Miami",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Ocean_drive_day_2009j.JPG/1280px-Ocean_drive_day_2009j.JPG",
    alt: "Ocean Drive, South Beach",
  },
  {
    name: "Atlanta",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/e/ed/AtL_Midtown_Downtown_2026.jpg",
    alt: "Atlanta Midtown and Downtown skyline",
  },
  {
    name: "Houston",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Downtown_Houston%2C_TX_Skyline_-_2018.jpg/1280px-Downtown_Houston%2C_TX_Skyline_-_2018.jpg",
    alt: "Downtown Houston skyline",
  },
  {
    name: "Boston",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Boston_Back_Bay_skyline_by_Chris_Rycroft.jpg/1280px-Boston_Back_Bay_skyline_by_Chris_Rycroft.jpg",
    alt: "Boston's Back Bay skyline",
  },
  {
    name: "Las Vegas",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/e/ee/Las_Vegas_Strip_09_2017_4897.jpg",
    alt: "The Las Vegas Strip",
  },
  {
    name: "Nashville",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Nashville%2C_TN_skyline.jpg/1280px-Nashville%2C_TN_skyline.jpg",
    alt: "Nashville skyline",
  },
  {
    name: "Denver",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Denver%2C_Colorado_skyline_%28cropped%29.jpg/1280px-Denver%2C_Colorado_skyline_%28cropped%29.jpg",
    alt: "Denver skyline with the Rocky Mountains",
  },
  {
    name: "Seattle",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/2/23/Space_Needle_2011-07-04.jpg",
    alt: "The Space Needle",
  },
];

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
          {DESTINATIONS.map((city) => (
            <CarouselItem
              key={city.name}
              className="basis-[82%] sm:basis-1/2 lg:basis-1/3"
            >
              <Link
                href={`/events?location=${encodeURIComponent(city.name)}`}
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
