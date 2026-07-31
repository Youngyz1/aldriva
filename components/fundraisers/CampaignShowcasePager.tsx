"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import CampaignShowcaseCard from "@/components/fundraisers/CampaignShowcaseCard";
import type { CampaignShowcaseItem } from "@/components/fundraisers/CampaignShowcase";

export interface CampaignShowcasePage {
  key: string;
  /** Large slot on the left (desktop) / top (tablet). */
  big: CampaignShowcaseItem;
  /** Up to four cards filling the 2×2 grid. */
  small: CampaignShowcaseItem[];
  /** True only for the genuine featured pick (page one) — adds the ring/badge. */
  bigFeatured: boolean;
}

interface CampaignShowcasePagerProps {
  pages: CampaignShowcasePage[];
  /** Filter cluster rendered on the left of the header row (category + sort). */
  controls: React.ReactNode;
}

const ARROW_CLASS =
  "static h-9 w-9 translate-y-0 rounded-full border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40";

function ShowcaseCard({
  item,
  big = false,
  featured = false,
}: {
  item: CampaignShowcaseItem;
  big?: boolean;
  featured?: boolean;
}) {
  return (
    <CampaignShowcaseCard
      slug={item.slug}
      title={item.title}
      raised={item.raised}
      goal={item.goal}
      image={item.image}
      donorCount={item.donorCount}
      featured={featured}
      tall={big && !featured}
    />
  );
}

/**
 * Desktop/tablet pager: caps the showcase at a single page (one big card + a
 * 2×2 grid) and browses additional pages with header arrows, reusing the shared
 * embla carousel. Each slide is one page; the internal layout is asymmetric on
 * desktop and stacked (big on top) on tablet. Mobile uses a separate per-card
 * carousel and never renders this component.
 */
export default function CampaignShowcasePager({ pages, controls }: CampaignShowcasePagerProps) {
  const hasMultiplePages = pages.length > 1;

  return (
    <Carousel opts={{ align: "start", watchDrag: false }}>
      <div className="mb-6 flex items-center justify-between gap-3">
        {controls}
        {hasMultiplePages && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <CarouselPrevious className={ARROW_CLASS} aria-label="Previous campaigns" />
            <CarouselNext className={ARROW_CLASS} aria-label="Next campaigns" />
          </div>
        )}
      </div>

      <CarouselContent className="-ml-6">
        {pages.map((page) => (
          <CarouselItem key={page.key} className="basis-full pl-6">
            {/* Desktop: asymmetric featured + 2×2 */}
            <div className="hidden grid-cols-5 gap-6 lg:grid">
              <div className="col-span-2">
                <ShowcaseCard item={page.big} big featured={page.bigFeatured} />
              </div>
              <div className="col-span-3 grid grid-cols-2 gap-6">
                {page.small.map((item) => (
                  <ShowcaseCard key={item.id} item={item} />
                ))}
              </div>
            </div>

            {/* Tablet: big card full-width on top, uniform 2-col grid below */}
            <div className="grid gap-6 lg:hidden">
              <ShowcaseCard item={page.big} big featured={page.bigFeatured} />
              {page.small.length > 0 && (
                <div className="grid grid-cols-2 gap-6">
                  {page.small.map((item) => (
                    <ShowcaseCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
