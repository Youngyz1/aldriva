"use client";

import { useCallback, useRef, useState } from "react";

export interface HeroImageCarouselProps {
  images: Array<{ src: string; alt: string }>;
  /** Sizing/appearance classes for each <img> — caller controls max-height per breakpoint. */
  imageClassName?: string;
}

const DEFAULT_IMAGE_CLASSNAME = "max-h-[min(70vh,560px)] max-w-[90%] rounded-xl object-contain shadow-lg";

/**
 * Showcase hero picture carousel: up to 6 photos swipe inside the panel with
 * dots, no autoplay. Native horizontal scroll-snap drives the swipe so it
 * works the same on touch and with the dot buttons. The panel's tint/border
 * treatment belongs to the caller — this component only lays out the photos.
 */
export function HeroImageCarousel({ images, imageClassName = DEFAULT_IMAGE_CLASSNAME }: HeroImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const total = images.length;
  const multi = total > 1;

  const goTo = useCallback((next: number) => {
    const clamped = ((next % total) + total) % total;
    setIndex(clamped);
    const el = containerRef.current?.children[clamped] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, [total]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    let closest = 0;
    let closestDist = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const dist = Math.abs((child as HTMLElement).offsetLeft - el.scrollLeft);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setIndex(closest);
  }, []);

  if (total === 0) return null;

  return (
    <div className="flex w-full flex-col items-center">
      <div
        ref={containerRef}
        onScroll={multi ? handleScroll : undefined}
        className={`flex w-full ${multi ? "overflow-x-auto snap-x snap-mandatory scrollbar-none" : ""}`}
      >
        {images.map((image, i) => (
          <div key={i} className="flex w-full flex-shrink-0 snap-start items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt={image.alt} loading="lazy" decoding="async" className={imageClassName} />
          </div>
        ))}
      </div>

      {multi ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-current={i === index ? "true" : undefined}
              aria-label={`Photo ${i + 1} of ${total}`}
              onClick={() => goTo(i)}
              className="flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
            >
              <span
                className={`rounded-full transition-all ${
                  i === index ? "h-2 w-5 bg-[var(--tf-accent)] opacity-100" : "h-2 w-2 bg-[var(--tf-ink)]/30 hover:opacity-80"
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const OVERLAP_TRANSFORMS: Record<2 | 3, Array<{ rotate: string; translateX: string; zClass: string }>> = {
  2: [
    { rotate: "rotate-[-3deg]", translateX: "translate-x-[-10%]", zClass: "z-10" },
    { rotate: "rotate-[3deg]", translateX: "translate-x-[10%]", zClass: "z-20" },
  ],
  3: [
    { rotate: "rotate-[-3deg]", translateX: "translate-x-[-70px]", zClass: "z-10" },
    { rotate: "rotate-[0deg]", translateX: "translate-x-0", zClass: "z-20" },
    { rotate: "rotate-[3deg]", translateX: "translate-x-[70px]", zClass: "z-10" },
  ],
};

export interface HeroOverlapImagesProps {
  images: Array<{ src: string; alt: string }>;
}

/**
 * Desktop-only treatment for exactly 2 or 3 hero photos: whole images (no
 * crop), overlapping with a slight CSS rotation and a hover lift — plain
 * Tailwind transforms, no animation library.
 */
export function HeroOverlapImages({ images }: HeroOverlapImagesProps) {
  const slots = OVERLAP_TRANSFORMS[images.length as 2 | 3];
  if (!slots) return null;
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {images.map((image, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={image.src}
          alt={image.alt}
          loading="lazy"
          decoding="async"
          className={`absolute max-h-[min(70vh,560px)] max-w-[90%] rounded-xl object-contain shadow-lg transition-transform duration-200 hover:-translate-y-2 hover:z-30 ${slots[i].rotate} ${slots[i].translateX} ${slots[i].zClass}`}
        />
      ))}
    </div>
  );
}
