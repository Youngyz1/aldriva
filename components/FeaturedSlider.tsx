"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Ticket } from "lucide-react";
import { normalizeImageUrl } from "@/lib/image-url";
import ProgressBar from "@/components/ui/ProgressBar";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=800";

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

// Guard against non-image srcs reaching next/image. `startsWith("http")` was
// too weak — a banner set to a YouTube/other-host URL passed through and threw
// an "unconfigured host" error that onError can't catch. normalizeImageUrl
// rejects any disallowed host / non-image extension, falling back to a safe URL.
function validImageUrl(src: string | null | undefined) {
  return normalizeImageUrl(src, FALLBACK_IMAGE);
}

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

function progress(raised: number | null | undefined, goal: number | null | undefined) {
  const raisedAmount = Number(raised ?? 0);
  const goalAmount = Number(goal ?? 0);

  if (goalAmount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((raisedAmount / goalAmount) * 100)));
}

// The marquee loops by rendering one "set" of cards twice and animating
// translateX(-50%) — seamless regardless of set width. But a fixed-duration
// animation only looks right for the item count it was tuned for: too few
// items and the set is narrower than the viewport, leaving a visible gap
// and (since the same duration now covers a shorter distance) a much slower
// crawl. To stay correct for any item count (4 featured events vs. 12
// homepage picks), we pad the set up to a minimum card count and derive the
// animation duration from the set's *measured* pixel width so px/s stays
// constant no matter how many items or which breakpoint is active.
const TARGET_SPEED_PX_PER_SEC = 97; // matches the homepage's original 38s / ~3696px feel
const MIN_SET_ITEMS = 20; // wide enough that one set outruns even ultra-wide viewports
const APPROX_CARD_WIDTH_PX = 308; // sm+ card (288px) + gap (20px), used only for the pre-measurement estimate

function SliderImage({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  const [imgSrc, setImgSrc] = useState(src);
  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      sizes="300px"
      priority={priority}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-105"
      onError={() => {
        setImgSrc(FALLBACK_IMAGE);
      }}
    />
  );
}

export default function FeaturedSlider({ items }: { items: FeaturedSliderItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Repeat the source items until the set is at least MIN_SET_ITEMS long, so
  // a sparse events-only list (e.g. 4 items) fills as much space as the
  // homepage's mixed events+fundraisers list (e.g. 12 items).
  const repeatCount = items.length > 0 ? Math.max(1, Math.ceil(MIN_SET_ITEMS / items.length)) : 0;
  const setItems = repeatCount > 0 ? Array.from({ length: repeatCount }, () => items).flat() : [];
  const looped = [...setItems, ...setItems];

  const [durationSec, setDurationSec] = useState(
    () => (setItems.length * APPROX_CARD_WIDTH_PX) / TARGET_SPEED_PX_PER_SEC
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const setWidth = track.scrollWidth / 2;
      if (setWidth > 0) setDurationSec(setWidth / TARGET_SPEED_PX_PER_SEC);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [setItems.length]);

  if (!items || items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No featured items to display
      </p>
    );
  }

  return (
    <div className="relative w-full overflow-hidden group/featured-slider">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent sm:w-20" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white to-transparent sm:w-20" />

      <div
        ref={trackRef}
        className="flex w-max gap-3 px-3 py-1 md:group-hover/featured-slider:[animation-play-state:paused] sm:gap-5 sm:px-0 touch-pan-x"
        style={{ animation: `featured-slider-scroll ${durationSec}s linear infinite` }}
      >
        {looped.map((item, index) => {
          const imageUrl = validImageUrl(item.image_url);
          const isPriority = index < 2; // Priority load first two images to optimize LCP

          if (item.type === "event") {
            return (
              <Link
                key={`${item.type}-${item.id}-${index}`}
                href={`/events/${item.slug}`}
                className="relative h-44 w-64 flex-shrink-0 overflow-hidden rounded-xl shadow-md transition-shadow hover:shadow-xl sm:h-52 sm:w-72 sm:rounded-2xl"
              >
                <SliderImage
                  src={imageUrl}
                  alt={item.title}
                  priority={isPriority}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/45 to-zinc-950/10" />
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white sm:right-3 sm:top-3 sm:gap-1.5 sm:px-3 sm:py-1 sm:text-[10px]">
                  <Ticket className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  Event
                </span>
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-wide text-orange-400 sm:mb-1 sm:text-xs">
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

          const pct = progress(item.raised_amount, item.goal_amount);

          return (
            <Link
              key={`${item.type}-${item.id}-${index}`}
              href={`/fundraisers/${item.slug}`}
              className="relative h-44 w-64 flex-shrink-0 overflow-hidden rounded-xl shadow-md transition-shadow hover:shadow-xl sm:h-52 sm:w-72 sm:rounded-2xl"
            >
              <SliderImage
                src={imageUrl}
                alt={item.title}
                priority={isPriority}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/50 to-zinc-950/10" />
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white sm:right-3 sm:top-3 sm:gap-1.5 sm:px-3 sm:py-1 sm:text-[10px]">
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
