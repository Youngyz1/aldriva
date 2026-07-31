"use client";

import CampaignShowcaseCard from "@/components/fundraisers/CampaignShowcaseCard";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { CampaignShowcaseItem } from "@/components/fundraisers/CampaignShowcase";

interface CampaignShowcaseCarouselProps {
  featured: CampaignShowcaseItem | null;
  items: CampaignShowcaseItem[];
}

export default function CampaignShowcaseCarousel({
  featured,
  items,
}: CampaignShowcaseCarouselProps) {
  const cards = featured ? [featured, ...items] : items;

  return (
    <Carousel opts={{ align: "start", dragFree: true }}>
      <CarouselContent className="-ml-4">
        {cards.map((item) => (
          <CarouselItem key={item.id} className="basis-[85%] pl-4">
            <CampaignShowcaseCard
              slug={item.slug}
              title={item.title}
              raised={item.raised}
              goal={item.goal}
              image={item.image}
              donorCount={item.donorCount}
              featured={item.id === featured?.id}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
