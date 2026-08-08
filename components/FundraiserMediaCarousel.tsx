"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { safeImageSrc } from "@/lib/image-url";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export type FundraiserMediaItem = {
  id?: string;
  image_url: string;
  caption?: string | null;
};

export default function FundraiserMediaCarousel({
  items,
  title,
}: {
  items: FundraiserMediaItem[];
  title: string;
}) {
  const slides = useMemo(() => {
    return (items || [])
      .map((item, index) => {
        const safe = safeImageSrc(item.image_url);
        if (!safe) return null;
        return {
          ...item,
          id: item.id ?? `${safe}-${index}`,
          image_url: safe,
        };
      })
      .filter((item): item is FundraiserMediaItem & { id: string } => item !== null);
  }, [items]);

  const [active, setActive] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [imgError, setImgError] = useState(false);
  const hasMultiple = slides.length > 1;

  useEffect(() => {
    if (!hasMultiple) return;

    const timer = window.setInterval(() => {
      setActive((index) => (index + 1) % slides.length);
    }, 5200);

    return () => window.clearInterval(timer);
  }, [hasMultiple, slides.length]);

  function go(next: number) {
    setActive((next + slides.length) % slides.length);
  }

  function handleTouchEnd(x: number) {
    if (touchStart === null) return;
    const delta = touchStart - x;
    setTouchStart(null);

    if (Math.abs(delta) < 35) return;
    go(active + (delta > 0 ? 1 : -1));
  }

  const slide = slides[active];
  const activeSrc = !imgError && slide ? safeImageSrc(slide.image_url) : null;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl bg-zinc-900 sm:rounded-3xl"
      onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
    >
      <div className="relative h-[260px] w-full sm:h-[440px] lg:h-[520px]">
        {activeSrc && slide ? (
          <Image
            src={activeSrc}
            alt={slide.caption || title}
            fill
            priority={active === 0}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1200px"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LocalBrandedPlaceholder variant="fundraiser" title={title} />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />

      {slide?.caption && (
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <p className="max-w-3xl text-sm font-bold leading-6 text-white drop-shadow sm:text-lg">
            {slide.caption}
          </p>
        </div>
      )}

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={() => go(active - 1)}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 sm:h-11 sm:w-11"
            aria-label="Previous fundraiser photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 sm:h-11 sm:w-11"
            aria-label="Next fundraiser photo"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 right-3 flex gap-1.5 sm:bottom-5 sm:right-5">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setImgError(false);
                  setActive(index);
                }}
                className={`h-2 rounded-full transition-all ${
                  active === index ? "w-6 bg-white" : "w-2 bg-white/50"
                }`}
                aria-label={`Show fundraiser photo ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
