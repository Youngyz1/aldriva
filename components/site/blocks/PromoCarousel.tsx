"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IconPlayerPlay, IconPlayerPause } from "@tabler/icons-react";
import type { ResolvedMenuPromotion } from "@/lib/website-embeds";
import type { PromotionFallback } from "@/lib/website-blocks";
import { safeImageSrc } from "@/lib/image-url";

export interface PromoCarouselLabels {
  pause: string;
  resume: string;
  slideNofM: string;
  percentOff: string;
  specialPrice: string;
  freeDelivery: string;
  defaultOffer: string;
  promotionsLabel?: string;
  slideNavLabel?: string;
}

export interface PromoCarouselProps {
  promotions: ResolvedMenuPromotion[];
  fallback?: PromotionFallback;
  autoplaySetting?: string;
  labels: PromoCarouselLabels;
}

interface CarouselSlideData {
  id: string;
  headline: string;
  description: string;
  imageUrl?: string;
  buttonLabel?: string;
  href?: string;
  external?: boolean;
  offerType?: string;
  percentOff?: number | null;
}

function trimHeadline(text?: string | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

function trimDescription(text?: string | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed;
}

function trimButton(text?: string | null): string {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.length > 40 ? trimmed.slice(0, 40) : trimmed;
}

export function PromoCarousel({
  promotions,
  fallback,
  autoplaySetting,
  labels,
}: PromoCarouselProps) {
  const slides: CarouselSlideData[] =
    promotions.length > 0
      ? promotions.map((p) => ({
          id: p.id,
          headline: trimHeadline(p.headline || p.name),
          description: trimDescription(p.description),
          imageUrl: p.image_url ? (safeImageSrc(p.image_url) ?? undefined) : undefined,
          buttonLabel: trimButton(p.cta_label),
          href: p.destination_href || undefined,
          external: p.destination_external,
          offerType: p.offer_type,
          percentOff: p.percent_off,
        }))
      : fallback
      ? [
          {
            id: "fallback",
            headline: trimHeadline(fallback.headline || "Featured promotion"),
            description: trimDescription(fallback.subtext),
            imageUrl: fallback.image ? (safeImageSrc(fallback.image) ?? undefined) : undefined,
            buttonLabel: trimButton(fallback.buttonLabel || "Explore"),
            href: fallback.href || undefined,
            external: false,
          },
        ]
      : [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = slides.length;
  const isMultiSlide = totalSlides > 1;

  const goToSlide = useCallback((index: number) => {
    const next = (index + totalSlides) % totalSlides;
    setCurrentIndex(next);
    if (containerRef.current) {
      const slideElem = containerRef.current.children[next] as HTMLElement | undefined;
      if (slideElem) {
        slideElem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [totalSlides]);

  const handleNext = useCallback(() => {
    goToSlide(currentIndex + 1);
  }, [currentIndex, goToSlide]);

  const handlePrev = useCallback(() => {
    goToSlide(currentIndex - 1);
  }, [currentIndex, goToSlide]);

  // Autoplay effect
  useEffect(() => {
    if (!isMultiSlide || autoplaySetting === "off" || isPaused || isHovered || isTouched) {
      return;
    }

    // Check prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      handleNext();
    }, 6000);

    return () => clearInterval(timer);
  }, [isMultiSlide, autoplaySetting, isPaused, isHovered, isTouched, handleNext]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isMultiSlide) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    }
  };

  const getOfferLabel = (slide: CarouselSlideData): string => {
    if (slide.offerType === "percent_off" && slide.percentOff) {
      return labels.percentOff.replace("{percent}", String(slide.percentOff));
    }
    if (slide.offerType === "special_price") {
      return labels.specialPrice;
    }
    if (slide.offerType === "free_delivery") {
      return labels.freeDelivery;
    }
    return labels.defaultOffer;
  };

  if (slides.length === 0) return null;

  return (
    <section
      aria-label={labels.promotionsLabel || "Promotions"}
      className="mx-auto w-full max-w-7xl px-[var(--ps-space-4)] sm:px-[var(--ps-space-6)] py-[var(--ps-space-4)]"
    >
      <div
        ref={containerRef}
        role="region"
        aria-roledescription="carousel"
        tabIndex={isMultiSlide ? 0 : undefined}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsTouched(true)}
        onTouchEnd={() => setIsTouched(false)}
        className={`flex w-full ${isMultiSlide ? "overflow-x-auto snap-x snap-mandatory scrollbar-none gap-[var(--ps-space-4)]" : ""}`}
      >
        {slides.map((slide, idx) => {
          const isLongHeadline = slide.headline.length > 60;
          const isLongDesc = slide.description.length > 180;
          const hasImage = Boolean(slide.imageUrl);

          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={labels.slideNofM.replace("{current}", String(idx + 1)).replace("{total}", String(totalSlides))}
              className={`${
                isMultiSlide ? "w-[88%] md:w-full flex-shrink-0 snap-center md:snap-start" : "w-full"
              } rounded-xl overflow-hidden border border-[var(--ps-border)]`}
            >
              <div
                className={`flex flex-col-reverse md:grid ${
                  hasImage ? "md:grid-cols-2" : "grid-cols-1"
                } min-h-[380px]`}
              >
                {/* Text panel: solid --tf-accent fill, --tf-on-accent text */}
                <div className="flex flex-col justify-center p-[var(--ps-space-6)] sm:p-[var(--ps-space-8)] md:p-[var(--ps-space-12)] bg-[var(--tf-accent)] text-[var(--tf-on-accent)]">
                  {/* Offer chip (only for real promotions, never on fallback) */}
                  {slide.id !== "fallback" ? (
                    <div className="mb-[var(--ps-space-3)]">
                      <span className="inline-block rounded-full border border-[var(--tf-on-accent)] px-[var(--ps-space-3)] py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--tf-on-accent)]">
                        {getOfferLabel(slide)}
                      </span>
                    </div>
                  ) : null}

                  {/* Headline */}
                  <h2
                    className={`${
                      isLongHeadline
                        ? "text-xl sm:text-2xl font-bold leading-tight"
                        : "text-2xl sm:text-3xl md:text-4xl font-bold leading-tight"
                    } mb-[var(--ps-space-3)]`}
                  >
                    {slide.headline}
                  </h2>

                  {/* Description */}
                  {slide.description ? (
                    <p
                      className={`${
                        isLongDesc
                          ? "text-xs sm:text-sm leading-relaxed"
                          : "text-sm sm:text-base leading-relaxed"
                      } mb-[var(--ps-space-6)] opacity-90`}
                    >
                      {slide.description}
                    </p>
                  ) : null}

                  {/* CTA button (inverse: --tf-on-accent fill, accent text) */}
                  {slide.href && slide.buttonLabel ? (
                    <div className="pt-[var(--ps-space-2)]">
                      <a
                        href={slide.href}
                        {...(slide.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="inline-flex items-center justify-center rounded-lg px-[var(--ps-space-5)] py-[var(--ps-space-2)] text-sm font-semibold transition-opacity hover:opacity-90 bg-[var(--tf-on-accent)] text-[var(--tf-accent)]"
                      >
                        {slide.buttonLabel}
                      </a>
                    </div>
                  ) : null}

                  {/* Controls (dots + pause) inside panel when multi-slide */}
                  {isMultiSlide && idx === currentIndex ? (
                    <div
                      className="mt-[var(--ps-space-6)] flex items-center gap-[var(--ps-space-2)] pt-[var(--ps-space-2)]"
                      aria-label={labels.slideNavLabel || "Slide navigation"}
                    >
                      {slides.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          type="button"
                          aria-current={dotIdx === currentIndex ? "true" : undefined}
                          aria-label={labels.slideNofM.replace("{current}", String(dotIdx + 1)).replace("{total}", String(totalSlides))}
                          onClick={() => goToSlide(dotIdx)}
                          className="flex h-6 min-h-[24px] min-w-[24px] items-center justify-center p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-on-accent)]"
                        >
                          <span
                            className={`h-2.5 rounded-full transition-all bg-[var(--tf-on-accent)] ${
                              dotIdx === currentIndex ? "w-6 opacity-100" : "w-2.5 opacity-40 hover:opacity-75"
                            }`}
                          />
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setIsPaused((prev) => !prev)}
                        aria-label={isPaused ? labels.resume : labels.pause}
                        className="ml-[var(--ps-space-2)] flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded-full border border-[var(--tf-on-accent)] text-[var(--tf-on-accent)] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-on-accent)]"
                      >
                        {isPaused ? <IconPlayerPlay size={12} /> : <IconPlayerPause size={12} />}
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Photo panel: object-contain on --tf-card surface */}
                {hasImage ? (
                  <div className="relative flex aspect-[4/3] md:aspect-auto items-center justify-center bg-[var(--tf-card)] p-[var(--ps-space-4)] md:p-[var(--ps-space-8)] min-h-[240px] md:min-h-[380px]">
                    <img
                      src={slide.imageUrl}
                      alt={slide.headline}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
