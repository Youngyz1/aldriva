"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import type { ResolvedMenuPromotion } from "@/lib/website-embeds";
import { safeImageSrc } from "@/lib/image-url";
import { FramedImage } from "@/components/site/FramedImage";

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

/**
 * Compact, slidable promotions card — dashboard-managed Promotions only.
 * Lives inside the page container (not full-bleed): the hero band owns the
 * full-bleed, never-slidable treatment (see HeroBlockRenderer).
 *
 * Image is a FramedImage picture-mat (whole photo visible, no crop, no
 * fixed aspect ratio); the headline/subtext/button sit beside it on desktop
 * (>=768px) and below it on mobile — never overlaid on top, so there's no
 * scrim/legibility concern.
 */
export function PromoCarousel({
  promotions,
  autoplaySetting,
  labels,
}: PromoCarouselProps) {
  const slides: CarouselSlideData[] = promotions.map((p) => ({
    id: p.id,
    headline: trimHeadline(p.headline || p.name),
    description: trimDescription(p.description),
    imageUrl: p.image_url ? (safeImageSrc(p.image_url) ?? undefined) : undefined,
    buttonLabel: trimButton(p.cta_label),
    href: p.destination_href || undefined,
    external: p.destination_external,
    offerType: p.offer_type,
    percentOff: p.percent_off,
  }));

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Swiping or tapping a dot pauses autoplay; it resumes after 8s of no
  // further manual interaction (no visible pause/play button).
  const [isIdlePaused, setIsIdlePaused] = useState(false);
  const idleResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseForIdle = useCallback(() => {
    setIsIdlePaused(true);
    if (idleResumeTimeoutRef.current) clearTimeout(idleResumeTimeoutRef.current);
    idleResumeTimeoutRef.current = setTimeout(() => setIsIdlePaused(false), 8000);
  }, []);
  useEffect(() => () => {
    if (idleResumeTimeoutRef.current) clearTimeout(idleResumeTimeoutRef.current);
  }, []);
  // Desktop shows two cards per page; phone shows one. Dots/autoplay move a
  // whole page at a time. Starts at 1 (phone) and corrects after mount to
  // avoid depending on a server-rendered viewport width.
  const [slidesPerPage, setSlidesPerPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = slides.length;
  const isMultiSlide = totalSlides > 1;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 768px)");
    const update = () => setSlidesPerPage(mql.matches ? 2 : 1);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const pageCount = Math.max(1, Math.ceil(totalSlides / slidesPerPage));
  const currentPage = Math.min(pageCount - 1, Math.floor(currentIndex / slidesPerPage));
  const isMultiPage = pageCount > 1;

  const goToSlide = useCallback((index: number) => {
    const next = ((index % totalSlides) + totalSlides) % totalSlides;
    setCurrentIndex(next);
    if (containerRef.current) {
      const slideElem = containerRef.current.children[next] as HTMLElement | undefined;
      if (slideElem) {
        slideElem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }
    }
  }, [totalSlides]);

  const goToPage = useCallback((page: number) => {
    goToSlide(((page % pageCount) + pageCount) % pageCount * slidesPerPage);
  }, [goToSlide, pageCount, slidesPerPage]);

  const handleNextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const handlePrevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  // Autoplay: advance one page every 5s. Paused on hover, keyboard focus
  // within, or touch; also pauses after a swipe or a dot tap, resuming
  // after 8s idle (isIdlePaused).
  useEffect(() => {
    if (!isMultiPage || autoplaySetting === "off" || isHovered || isTouched || isFocused || isIdlePaused) {
      return;
    }

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      handleNextPage();
    }, 5000);

    return () => clearInterval(timer);
  }, [isMultiPage, autoplaySetting, isHovered, isTouched, isFocused, isIdlePaused, handleNextPage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isMultiPage) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrevPage();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNextPage();
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
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onTouchStart={() => setIsTouched(true)}
        onTouchEnd={() => { setIsTouched(false); pauseForIdle(); }}
        className={`flex w-full gap-4 ${isMultiSlide ? "overflow-x-auto snap-x snap-mandatory scrollbar-none" : ""}`}
      >
        {slides.map((slide, idx) => {
          const slideWidthClass = totalSlides === 1 ? "w-full" : "w-[88%] md:w-[calc(50%-8px)]";

          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={labels.slideNofM.replace("{current}", String(idx + 1)).replace("{total}", String(totalSlides))}
              className={`relative flex-shrink-0 snap-start ${slideWidthClass}`}
            >
              <div className={`flex flex-col gap-4 ${slide.imageUrl ? "md:flex-row md:items-center" : ""}`}>
                {slide.imageUrl ? (
                  <div className="md:w-1/2">
                    <FramedImage src={slide.imageUrl} alt={slide.headline} />
                  </div>
                ) : null}

                <div className={slide.imageUrl ? "md:w-1/2" : "w-full"}>
                  <span className="mb-1.5 inline-block rounded-full border border-[var(--tf-border)] px-2 py-0.5 text-[10px] font-semibold leading-none text-[var(--tf-accent-deep)]">
                    {getOfferLabel(slide)}
                  </span>

                  <h3 className="showcase-promo-card-headline line-clamp-2 text-[var(--tf-ink)]">
                    {slide.headline}
                  </h3>

                  {slide.description ? (
                    <p className="showcase-promo-subtext mt-1 line-clamp-2 text-[var(--tf-muted)]">
                      {slide.description}
                    </p>
                  ) : null}

                  {slide.href && slide.buttonLabel ? (
                    <a
                      href={slide.href}
                      {...(slide.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="mt-2 inline-flex min-h-[32px] items-center justify-center gap-1 rounded-full bg-[var(--tf-accent)] px-3.5 py-1 text-xs font-semibold text-[var(--tf-on-accent)] hover:opacity-90 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
                    >
                      {slide.buttonLabel}
                      <IconArrowRight size={12} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isMultiPage ? (
        <div className="mt-2.5 flex items-center justify-center gap-2.5">
          <div
            aria-label={labels.slideNavLabel || "Slide navigation"}
            className="flex h-6 items-center gap-1.5"
          >
            {Array.from({ length: pageCount }, (_, pageIdx) => (
              <button
                key={pageIdx}
                type="button"
                aria-current={pageIdx === currentPage ? "true" : undefined}
                aria-label={labels.slideNofM.replace("{current}", String(pageIdx + 1)).replace("{total}", String(pageCount))}
                onClick={() => { goToPage(pageIdx); pauseForIdle(); }}
                className="flex h-6 w-6 min-h-[24px] min-w-[24px] items-center justify-center p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
              >
                <span
                  className={`rounded-full transition-all ${
                    pageIdx === currentPage ? "w-5 h-2 bg-[var(--tf-accent)] opacity-100" : "w-2 h-2 bg-[var(--tf-ink)]/30 hover:opacity-80"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
