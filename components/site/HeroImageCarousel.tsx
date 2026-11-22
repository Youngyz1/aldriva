"use client";

import { useCallback, useRef, useState } from "react";
import { FramedImage } from "./FramedImage";

export interface HeroImageCarouselProps {
  images: Array<{ src: string; alt: string }>;
}

/**
 * Showcase hero picture-mat: up to 6 photos swipe inside the frame with
 * dots, no autoplay. Native horizontal scroll-snap drives the swipe so it
 * works the same on touch and with the dot buttons.
 */
export function HeroImageCarousel({ images }: HeroImageCarouselProps) {
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
    <div className="w-full">
      <div
        ref={containerRef}
        onScroll={multi ? handleScroll : undefined}
        className={`flex w-full ${multi ? "overflow-x-auto snap-x snap-mandatory scrollbar-none" : ""}`}
      >
        {images.map((image, i) => (
          <div key={i} className="w-full flex-shrink-0 snap-start">
            <FramedImage src={image.src} alt={image.alt} />
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
