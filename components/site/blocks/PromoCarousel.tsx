"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IconPlayerPlay, IconPlayerPause, IconArrowRight } from "@tabler/icons-react";
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

  // Autoplay: advance every 5s, paused on hover or touch.
  useEffect(() => {
    if (!isMultiSlide || autoplaySetting === "off" || isPaused || isHovered || isTouched) {
      return;
    }

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      handleNext();
    }, 5000);

    return () => clearInterval(timer);
  }, [isMultiSlide, autoplaySetting, isPaused, isHovered, isTouched, handleNext]);

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
    <section aria-label={labels.promotionsLabel || "Promotions"} className="w-full">
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
        className={`flex w-full ${isMultiSlide ? "overflow-x-auto snap-x snap-mandatory scrollbar-none" : ""}`}
      >
        {slides.map((slide, idx) => {
          const hasImage = Boolean(slide.imageUrl);
          const isLongHeadline = slide.headline.length > 60;
          const slideTextClass = hasImage ? "text-[var(--tf-on-ink)]" : "text-[var(--tf-ink)]";

          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={labels.slideNofM.replace("{current}", String(idx + 1)).replace("{total}", String(totalSlides))}
              className={`w-full flex-shrink-0 snap-start relative overflow-hidden h-[320px] md:h-[520px] bg-[var(--tf-soft)]`}
            >
              {hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slide.imageUrl}
                  alt={slide.headline}
                  className="absolute inset-0 h-full w-full object-cover object-position-[70%_50%]"
                  style={{ objectPosition: "70% 50%" }}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}

              {/* Scrim behind the text only: horizontal on desktop, bottom-up on mobile.
                  No mask or fade is applied to the photo itself. */}
              {hasImage ? (
                <div
                  className="absolute inset-0 z-10"
                  style={{
                    backgroundImage:
                      "linear-gradient(to top, color-mix(in srgb, var(--tf-ink) 70%, transparent) 0%, color-mix(in srgb, var(--tf-ink) 60%, transparent) 55%, transparent 70%)",
                  }}
                />
              ) : null}

              <div className="absolute inset-0 z-20 px-4 sm:px-6 flex flex-col h-full items-start justify-end md:justify-center">
                <div className="max-w-[560px] pb-[20px] sm:pb-0">
                  {slide.id !== "fallback" ? (
                    <span className={`self-start inline-block rounded-full border border-[var(--tf-accent)] px-2 py-0.5 leading-none text-[12px] font-semibold ${slideTextClass}`}>
                      {getOfferLabel(slide)}
                    </span>
                  ) : null}

                  {/* Headline: 28px mobile / 48px desktop, bold, max 3 lines */}
                  <h2 className={`showcase-promo-headline leading-[1.15] line-clamp-3 text-[28px] md:text-[48px] font-bold ${slideTextClass}`}>
                    {slide.headline}
                  </h2>

                  {/* Subtext: one line, 14px mobile / 16px desktop */}
                  {slide.description ? (
                    <p className={`showcase-promo-subtext text-[14px] md:text-[16px] leading-[1.4] line-clamp-1 ${slideTextClass}`}>
                      {slide.description}
                    </p>
                  ) : null}

                  {/* CTA: pill, --tf-accent fill, 44px high, 20px horizontal padding */}
                  {slide.href && slide.buttonLabel ? (
                    <a
                      href={slide.href}
                      {...(slide.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="self-start inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[var(--tf-accent)] px-5 py-1.5 text-sm font-semibold text-[var(--tf-on-accent)] hover:opacity-90 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
                    >
                      {slide.buttonLabel}
                      <IconArrowRight size={15} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Dots centred at the bottom of the band, on top of the photo */}
              {isMultiSlide ? (
                <div
                  aria-label={labels.slideNavLabel || "Slide navigation"}
                  className="absolute z-30 left-1/2 -translate-x-1/2 bottom-3 flex h-10 min-h-[44px] items-center gap-2 px-1.5 py-0.5 rounded-full bg-[var(--tf-ink)]/20 backdrop-blur-sm"
                >
                  {slides.map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      type="button"
                      aria-current={dotIdx === currentIndex ? "true" : undefined}
                      aria-label={labels.slideNofM.replace("{current}", String(dotIdx + 1)).replace("{total}", String(totalSlides))}
                      onClick={() => goToSlide(dotIdx)}
                      className="flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
                    >
                      <span
                        className={`rounded-full transition-all ${
                          dotIdx === currentIndex ? "w-6 h-6 bg-[var(--tf-accent)] opacity-100" : "w-2.5 h-2.5 bg-[var(--tf-ink)]/40 hover:opacity-80"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Pause control centred below the carousel */}
      {isMultiSlide ? (
        <div className="mt-[var(--ps-space-3)] flex items-center justify-center gap-[var(--ps-space-2)]">
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? labels.resume : labels.pause}
            className="flex min-h-[44px] h-10 w-10 items-center justify-center rounded-full border border-[var(--tf-border)] bg-[var(--tf-card)] text-[var(--tf-ink)] hover:bg-[var(--tf-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
          >
            {isPaused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
          </button>
        </div>
      ) : null}
    </section>
  );
}
