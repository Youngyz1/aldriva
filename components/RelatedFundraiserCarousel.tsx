"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import FundraiserCard from "@/components/FundraiserCard";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  type RelatedFundraiser,
  type RelatedFundraiserCategory,
} from "@/lib/fundraiser-data";

const ARROW_BUTTON_CLASS =
  "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center " +
  "rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-zinc-50 " +
  "disabled:pointer-events-none disabled:opacity-0 sm:flex";

const CATEGORY_OPTIONS: { value: RelatedFundraiserCategory; label: string }[] = [
  { value: "worldwide", label: "Happening worldwide" },
  { value: "close-to-target", label: "Close to target" },
  { value: "just-launched", label: "Just launched" },
  { value: "needs-momentum", label: "Needs momentum" },
  { value: "charities", label: "Charities" },
];

export default function RelatedFundraiserCarousel({
  fundraisers: initialFundraisers,
  excludeId,
}: {
  fundraisers: RelatedFundraiser[];
  excludeId: string;
}) {
  const [category, setCategory] = useState<RelatedFundraiserCategory>("worldwide");
  const [fundraisers, setFundraisers] = useState(initialFundraisers);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (category === "worldwide") {
      setFundraisers(initialFundraisers);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetch(
      `/api/fundraisers/related?excludeId=${encodeURIComponent(excludeId)}&category=${category}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setFundraisers(json.fundraisers ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, excludeId, initialFundraisers]);

  const [api, setApi] = useState<CarouselApi>();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    if (!api) return;

    const updateScrollState = () => {
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };

    updateScrollState();
    api.on("select", updateScrollState);
    api.on("reInit", updateScrollState);

    return () => {
      api.off("select", updateScrollState);
      api.off("reInit", updateScrollState);
    };
  }, [api]);

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-100">
          Show
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as RelatedFundraiserCategory)
            }
            className="rounded-lg border border-brand-800 bg-brand-950 px-3 py-2 text-sm font-bold text-white transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {fundraisers.length === 0 ? (
        <p className="rounded-lg border border-brand-900 bg-brand-950/50 px-5 py-10 text-center text-sm font-medium text-brand-100">
          {isLoading
            ? "Loading fundraisers…"
            : "No fundraisers match this filter right now."}
        </p>
      ) : (
        <div className="relative w-full overflow-hidden">
          <Carousel setApi={setApi} opts={{ align: "start", dragFree: true }}>
            <CarouselContent className="-ml-4 sm:-ml-6">
              {fundraisers.map((related) => (
                <CarouselItem
                  key={related.id}
                  className="basis-[85%] pl-4 sm:basis-1/2 sm:pl-6 md:basis-1/3 lg:basis-1/4"
                >
                  <FundraiserCard
                    slug={related.slug}
                    title={related.title}
                    organizer={related.organizer}
                    raised={Number(related.raised ?? 0)}
                    goal={Number(related.goal ?? 0)}
                    image={related.image_url || related.banner || null}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <button
            type="button"
            onClick={() => api?.scrollPrev()}
            disabled={!canScrollPrev}
            aria-label="Previous fundraisers"
            className={`${ARROW_BUTTON_CLASS} -left-4`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => api?.scrollNext()}
            disabled={!canScrollNext}
            aria-label="Next fundraisers"
            className={`${ARROW_BUTTON_CLASS} -right-4`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
