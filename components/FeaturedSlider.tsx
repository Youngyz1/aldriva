"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Ticket } from "lucide-react";
import ProgressBar from "@/components/ui/ProgressBar";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import { safeImageSrc } from "@/lib/image-url";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type EventItem = {
  type: "event";
  id: string;
  title: string;
  slug: string;
  date?: string | null;
  location?: string | null;
  image_url?: string | null;
  category?: string | null;
};

type FundraiserItem = {
  type: "fundraiser";
  id: string;
  title: string;
  slug: string;
  goal_amount?: number | null;
  raised_amount?: number | null;
  image_url?: string | null;
};

export type FeaturedSliderItem = EventItem | FundraiserItem;

function formatDate(date: string | null | undefined) {
  if (!date) return "Date TBA";

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "Date TBA";

  return value.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function SliderImage({
  src,
  alt,
  priority,
}: {
  src: string | null | undefined;
  alt: string;
  priority?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const validSrc = !imgError ? safeImageSrc(src) : null;

  if (!validSrc) {
    return <LocalBrandedPlaceholder variant="banner" title={alt} />;
  }

  return (
    <Image
      src={validSrc}
      alt={alt}
      fill
      sizes="(max-width: 640px) 256px, 288px"
      priority={priority}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-105"
      onError={() => setImgError(true)}
    />
  );
}

export default function FeaturedSlider({ items }: { items: FeaturedSliderItem[] }) {
  if (!items || items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No featured items to display
      </p>
    );
  }

  const looped = [...items, ...items];

  return (
    <div className="relative w-full overflow-hidden group/featured-slider">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent sm:w-20" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent sm:w-20" />

      <div
        className="flex w-max gap-3 px-3 py-1 md:group-hover/featured-slider:[animation-play-state:paused] sm:gap-5 sm:px-0"
        style={{ animation: "featured-slider-scroll 38s linear infinite" }}
      >
        {looped.map((item, index) => {
          const isPriority = index < 2; // Priority load first two images to optimize LCP

          if (item.type === "event") {
            return (
              <Link
                key={`${item.type}-${item.id}-${index}`}
                href={`/events/${item.slug}`}
                className="relative h-44 w-64 flex-shrink-0 overflow-hidden rounded-xl shadow-md transition-shadow hover:shadow-xl sm:h-52 sm:w-72 sm:rounded-2xl"
              >
                <SliderImage
                  src={item.image_url}
                  alt={item.title}
                  priority={isPriority}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/45 to-zinc-950/10" />
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white sm:right-3 sm:top-3 sm:gap-1.5 sm:px-3 sm:py-1 sm:text-[10px]">
                  <Ticket className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  Event
                </span>
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-wide text-brand-400 sm:mb-1 sm:text-xs">
                    {formatDate(item.date)}
                  </p>
                  <h3 className="line-clamp-2 text-xs font-black leading-tight text-white sm:text-sm">
                    {item.title}
                  </h3>
                  {item.location && (
                    <p className="mt-0.5 truncate text-[10px] text-zinc-300 sm:mt-1 sm:text-xs">{item.location}</p>
                  )}
                </div>
              </Link>
            );
          }

          const pct = calculateFundraisingPercentage(item.raised_amount, item.goal_amount);

          return (
            <Link
              key={`${item.type}-${item.id}-${index}`}
              href={`/fundraisers/${item.slug}`}
              className="relative h-44 w-64 flex-shrink-0 overflow-hidden rounded-xl shadow-md transition-shadow hover:shadow-xl sm:h-52 sm:w-72 sm:rounded-2xl"
            >
              <SliderImage
                src={item.image_url}
                alt={item.title}
                priority={isPriority}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/50 to-zinc-950/10" />
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white sm:right-3 sm:top-3 sm:gap-1.5 sm:px-3 sm:py-1 sm:text-[10px]">
                <Heart className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                Fundraise
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                <h3 className="mb-1 line-clamp-2 text-xs font-black leading-tight text-white sm:mb-3 sm:text-sm">
                  {item.title}
                </h3>
                <div className="mb-1 sm:mb-2">
                  <ProgressBar percentage={pct} height={6} />
                </div>
                <p className="text-[10px] font-bold text-white/85 sm:text-xs">
                  {money(item.raised_amount)} raised of {money(item.goal_amount)} goal
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <style>{`
        @keyframes featured-slider-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
