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
  imageStyle?: "contain" | "cover";
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
  imageStyle = "contain",
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
              } relative overflow-hidden rounded-xl border border-[var(--tf-border)] bg-gradient-to-r from-[var(--tf-soft)] to-[var(--tf-base)] min-h-[190px] h-[210px] md:h-auto md:min-h-[280px]`}
            >
              <div className="flex h-full w-full">
                {/* Left text column: --tf-ink text */}
                <div
                  className={`flex flex-col justify-center z-10 p-[var(--ps-space-4)] sm:p-[var(--ps-space-6)] md:p-[var(--ps-space-8)] ${
                    hasImage ? "w-[62%] sm:w-[58%] md:w-1/2" : "w-full max-w-2xl"
                  }`}
                >
                  {/* Offer chip (only for real promotions, never on fallback) */}
                  {slide.id !== "fallback" ? (
                    <div className="mb-[var(--ps-space-2)] md:mb-[var(--ps-space-3)]">
                      <span className="inline-block rounded-full border border-[var(--tf-accent)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--tf-accent)]">
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
                    } mb-1.5 md:mb-[var(--ps-space-2)] text-[var(--tf-ink)]`}
                  >
                    {slide.headline}
                  </h2>

                  {/* Description: one line of subtext */}
                  {slide.description ? (
                    <p
                      className={`${
                        isLongDesc
                          ? "text-xs sm:text-sm leading-relaxed"
                          : "text-sm sm:text-base leading-relaxed"
                      } mb-[var(--ps-space-3)] md:mb-[var(--ps-space-4)] text-[var(--tf-ink)] opacity-85 line-clamp-1`}
                    >
                      {slide.description}
                    </p>
                  ) : null}

                  {/* CTA button: filled --tf-accent, --tf-on-accent text, arrow icon */}
                  {slide.href && slide.buttonLabel ? (
                    <div>
                      <a
                        href={slide.href}
                        {...(slide.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="inline-flex min-h-[38px] md:min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 md:px-[var(--ps-space-5)] py-1.5 md:py-[var(--ps-space-2)] text-xs md:text-sm font-semibold font-sans transition-opacity hover:opacity-90 bg-[var(--tf-accent)] text-[var(--tf-on-accent)]"
                      >
                        <span>{slide.buttonLabel}</span>
                        <IconArrowRight size={15} aria-hidden="true" />
                      </a>
                    </div>
                  ) : null}
                </div>

                {/* Right photo: NO frame, bottom-aligned, soft edge fade via mask */}
                {hasImage ? (
                  <div className="relative flex-1 flex items-end justify-end self-stretch overflow-hidden">
                    <img
                      src={slide.imageUrl}
                      alt={slide.headline}
                      className={`h-full w-full object-bottom ${
                        imageStyle === "cover" ? "object-cover" : "object-contain"
                      }`}
                      style={{
                        maskImage: "radial-gradient(ellipse at 80% 85%, black 45%, transparent 100%)",
                        WebkitMaskImage: "radial-gradient(ellipse at 80% 85%, black 45%, transparent 100%)",
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls (dots + pause) centered at the bottom when multi-slide */}
      {isMultiSlide ? (
        <div
          className="mt-[var(--ps-space-3)] flex items-center justify-center gap-[var(--ps-space-2)]"
          aria-label={labels.slideNavLabel || "Slide navigation"}
        >
          {slides.map((_, dotIdx) => (
            <button
              key={dotIdx}
              type="button"
              aria-current={dotIdx === currentIndex ? "true" : undefined}
              aria-label={labels.slideNofM.replace("{current}", String(dotIdx + 1)).replace("{total}", String(totalSlides))}
              onClick={() => goToSlide(dotIdx)}
              className="flex h-6 min-h-[24px] min-w-[24px] items-center justify-center p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
            >
              <span
                className={`h-2.5 rounded-full transition-all bg-[var(--tf-accent)] ${
                  dotIdx === currentIndex ? "w-6 opacity-100" : "w-2.5 opacity-35 hover:opacity-70"
                }`}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? labels.resume : labels.pause}
            className="ml-[var(--ps-space-2)] flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center rounded-full border border-[var(--tf-border)] text-[var(--tf-ink)] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
          >
            {isPaused ? <IconPlayerPlay size={12} /> : <IconPlayerPause size={12} />}
          </button>
        </div>
      ) : null}
    </section>
  );
}
