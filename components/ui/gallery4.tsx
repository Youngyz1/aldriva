"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

export interface Gallery4Item {
  id: string;
  title: string;
  description: string;
  href: string;
  image: string;
  cta?: string;
}

export interface Gallery4Props {
  title?: string;
  description?: string;
  eyebrow?: string;
  items: Gallery4Item[];
}

const fallbackItems: Gallery4Item[] = [
  {
    id: "community-care",
    title: "Support Community Care",
    description: "Help local organizers raise funds for neighbors and families.",
    href: "/fundraisers",
    image:
      "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1080&auto=format&fit=crop",
    cta: "Donate Now",
  },
  {
    id: "school-drive",
    title: "Build Better Community Spaces",
    description: "Back campaigns that create lasting impact for local communities.",
    href: "/fundraisers",
    image:
      "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1080&auto=format&fit=crop",
    cta: "Donate Now",
  },
  {
    id: "medical-support",
    title: "Fund Urgent Medical Needs",
    description: "Contribute to campaigns where every donation helps move a story forward.",
    href: "/fundraisers",
    image:
      "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=1080&auto=format&fit=crop",
    cta: "Donate Now",
  },
];

export function Gallery4({
  title = "Crowdfunding for causes, communities, and events.",
  description = "Campaigns can tell a story, show progress, collect donations, and keep supporters engaged.",
  eyebrow = "Fundraising",
  items = fallbackItems,
}: Gallery4Props) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = items.length > 0 ? items : fallbackItems;

  useEffect(() => {
    if (!carouselApi) {
      return;
    }

    const updateSelection = () => {
      setCanScrollPrev(carouselApi.canScrollPrev());
      setCanScrollNext(carouselApi.canScrollNext());
      setCurrentSlide(carouselApi.selectedScrollSnap());
    };

    updateSelection();
    carouselApi.on("select", updateSelection);
    carouselApi.on("reInit", updateSelection);

    return () => {
      carouselApi.off("select", updateSelection);
      carouselApi.off("reInit", updateSelection);
    };
  }, [carouselApi]);

  return (
    <section className="overflow-hidden bg-white py-24 text-zinc-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between md:mb-14 lg:mb-16">
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-sm font-black uppercase tracking-wide text-emerald-600">
              {eyebrow}
            </p>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">
              {title}
            </h2>
            <p className="text-lg leading-8 text-zinc-600">{description}</p>
            <a
              href="/fundraisers"
              className="mt-2 w-fit rounded-xl bg-zinc-950 px-5 py-3 text-sm font-black text-white transition hover:bg-black"
            >
              Browse campaigns
            </a>
          </div>
          <div className="hidden shrink-0 gap-2 md:flex">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => carouselApi?.scrollPrev()}
              disabled={!canScrollPrev}
              className="text-zinc-800 hover:bg-zinc-100 hover:text-zinc-950 disabled:pointer-events-auto disabled:text-zinc-300"
            >
              <ArrowLeft className="size-5" />
              <span className="sr-only">Previous fundraiser</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => carouselApi?.scrollNext()}
              disabled={!canScrollNext}
              className="text-zinc-800 hover:bg-zinc-100 hover:text-zinc-950 disabled:pointer-events-auto disabled:text-zinc-300"
            >
              <ArrowRight className="size-5" />
              <span className="sr-only">Next fundraiser</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full">
        <Carousel
          setApi={setCarouselApi}
          opts={{
            align: "start",
            breakpoints: {
              "(max-width: 768px)": {
                dragFree: true,
              },
            },
          }}
        >
          <CarouselContent className="ml-0 2xl:ml-[max(8rem,calc(50vw-700px))] 2xl:mr-[max(0rem,calc(50vw-700px))]">
            {slides.map((item) => (
              <CarouselItem
                key={item.id}
                className="max-w-[320px] pl-5 lg:max-w-[360px]"
              >
                <a href={item.href} className="group block rounded-xl">
                  <div className="group relative h-full min-h-[27rem] max-w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm md:aspect-[5/4] lg:aspect-[16/9]">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="absolute h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 h-full bg-gradient-to-b from-transparent via-zinc-950/35 to-zinc-950/90" />
                    <div className="absolute inset-x-0 bottom-0 flex flex-col items-start p-6 text-white md:p-8">
                      <div className="mb-2 pt-4 text-xl font-black md:mb-3 md:pt-4 lg:pt-4">
                        {item.title}
                      </div>
                      <div className="mb-8 line-clamp-2 text-sm leading-6 text-zinc-200 md:mb-12 lg:mb-9">
                        {item.description}
                      </div>
                      <div className="flex items-center text-sm font-black text-emerald-300">
                        {item.cta ?? "Read more"}{" "}
                        <ArrowRight className="ml-2 size-5 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </a>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <div className="mt-8 flex justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              className={`h-2 w-2 rounded-full transition-colors ${
                currentSlide === index ? "bg-emerald-500" : "bg-zinc-200"
              }`}
              onClick={() => carouselApi?.scrollTo(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
