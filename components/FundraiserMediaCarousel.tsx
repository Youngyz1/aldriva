"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type FundraiserMediaItem = {
  id?: string;
  image_url: string;
  caption?: string | null;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=1600&auto=format&fit=crop";

function validImageUrl(url: string | null | undefined) {
  if (!url?.startsWith("http")) return FALLBACK_IMAGE;
  return url;
}

export default function FundraiserMediaCarousel({
  items,
  title,
}: {
  items: FundraiserMediaItem[];
  title: string;
}) {
  const slides = useMemo(
    () =>
      (items.length > 0 ? items : [{ image_url: FALLBACK_IMAGE, caption: null }])
        .filter((item) => item.image_url?.trim())
        .map((item, index) => ({
          ...item,
          id: item.id ?? `${item.image_url}-${index}`,
          image_url: validImageUrl(item.image_url),
        })),
    [items]
  );
  const [active, setActive] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
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

  const slide = slides[active] ?? slides[0];

  return (
    <div
      className="group relative overflow-hidden rounded-2xl bg-zinc-900 sm:rounded-3xl"
      onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
    >
      <img
        src={slide.image_url}
        alt={slide.caption || title}
        fetchPriority="high"
        decoding="async"
        className="h-[260px] w-full object-cover sm:h-[440px] lg:h-[520px]"
        onError={(event) => {
          event.currentTarget.src = FALLBACK_IMAGE;
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      {slide.caption && (
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
                onClick={() => setActive(index)}
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
