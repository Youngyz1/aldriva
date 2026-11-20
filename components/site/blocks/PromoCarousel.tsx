"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import type { ResolvedMenuPromotion } from "@/lib/website-embeds";
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
  // Single-slide split treatment: only the lone-slide-at-desktop-width case
  // (box aspect ratio > 3.4) gets the backdrop+foreground split. Two-slide
  // desktop (~3:1) and single-slide mobile (~2.3:1) measure under the
  // threshold and are untouched by construction, not by a breakpoint check.
  const singleSlideRef = useRef<HTMLDivElement>(null);
  const [splitTreatment, setSplitTreatment] = useState(false);

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

  // Measured via ResizeObserver, not a hardcoded breakpoint. Ratio uses the
  // slide's PRE-split height (150/200, matching the h-[150px] md:h-[200px]
  // classes below) rather than the currently-rendered height, so switching
  // to the split treatment's 240px height can't feed back into — and
  // destabilize — this same decision.
  useEffect(() => {
    if (totalSlides !== 1 || typeof ResizeObserver === "undefined") {
      setSplitTreatment(false);
      return;
    }
    const el = singleSlideRef.current;
    if (!el) return;
    const baseHeight = slidesPerPage >= 2 ? 200 : 150;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setSplitTreatment(width / baseHeight > 3.4);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [totalSlides, slidesPerPage]);

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
          const hasImage = Boolean(slide.imageUrl);
          const slideWidthClass = totalSlides === 1 ? "w-full" : "w-[88%] md:w-[calc(50%-8px)]";
          const isSplit = totalSlides === 1 && splitTreatment && hasImage;

          const textBlock = (
            <div className="max-w-[420px] text-[var(--tf-on-scrim)]">
              {/* Eyebrow pill: hidden on phone only — the 150px card is too
                  crowded for pill + headline + subtext + button there. */}
              <span className="mb-2 hidden rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold leading-none md:inline-block">
                {getOfferLabel(slide)}
              </span>

              {/* Headline: 20px mobile / 28px desktop, bold, max 2 lines */}
              <h3 className="showcase-promo-card-headline line-clamp-2">
                {slide.headline}
              </h3>

              {/* Subtext: one line, >=8px below the headline */}
              {slide.description ? (
                <p className="showcase-promo-subtext mt-2 line-clamp-1 opacity-90">
                  {slide.description}
                </p>
              ) : null}

              {/* Small CTA, natural width, >=8px below the subtext/headline */}
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
          );

          return (
            <div
              key={slide.id}
              ref={totalSlides === 1 ? singleSlideRef : undefined}
              role="group"
              aria-roledescription="slide"
              aria-label={labels.slideNofM.replace("{current}", String(idx + 1)).replace("{total}", String(totalSlides))}
              className={`relative flex-shrink-0 snap-start overflow-hidden rounded-[20px] ${isSplit ? "h-[240px]" : "h-[150px] md:h-[200px]"} ${slideWidthClass} bg-[var(--tf-soft)]`}
              data-promo-split={isSplit ? "true" : undefined}
            >
              {isSplit ? (
                <>
                  {/* Backdrop: same photo, blurred + darkened, scaled up so
                      the blur never shows a soft/transparent edge, filling
                      the whole card. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full scale-110 object-cover blur-[24px] brightness-[0.55]"
                    loading="lazy"
                    decoding="async"
                  />
                  {/* Foreground: same photo, sharp, right 45% at full height. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.imageUrl}
                    alt={slide.headline}
                    className="absolute right-0 top-0 h-full w-[45%] object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  {/* Same soft scrim as the non-split card, constrained to
                      the left (text) side so the sharp foreground photo
                      stays unobscured. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[55%]"
                    style={{
                      backgroundImage:
                        "linear-gradient(to top, rgba(var(--tf-scrim-rgb), 0.68) 0%, rgba(var(--tf-scrim-rgb), 0.4) 50%, transparent 78%)",
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-start justify-end px-4 py-3 md:px-6 md:py-4">
                    {textBlock}
                  </div>
                </>
              ) : (
                <>
                  {hasImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slide.imageUrl}
                      alt={slide.headline}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}

                  {/* Soft scrim under the text only. */}
                  {hasImage ? (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          "linear-gradient(to top, rgba(var(--tf-scrim-rgb), 0.68) 0%, rgba(var(--tf-scrim-rgb), 0.4) 50%, transparent 78%)",
                      }}
                    />
                  ) : null}

                  <div className="absolute inset-0 flex flex-col items-start justify-end px-4 py-3 md:px-6 md:py-4">
                    {textBlock}
                  </div>
                </>
              )}
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
