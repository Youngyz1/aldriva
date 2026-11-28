"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight, IconX as X } from "@tabler/icons-react";
import type { InvitationGalleryItem } from "@/types/invitation-template";
import { cn } from "@/lib/utils";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";

interface Props {
  images: InvitationGalleryItem[];
  captionClassName?: string;
  lightboxCaptionClassName?: string;
  /**
   * "large" enlarges the centre slide to ~75% of the shared content width
   * (used by minimalism-dark-blue). Defaults to the historical size.
   */
  slideSize?: "default" | "large";
}

export function BohoCoverflowGallery({
  images,
  captionClassName = "text-center text-xs text-[#6b533c]",
  lightboxCaptionClassName = "text-xs text-white/80",
  slideSize = "default",
}: Props) {
  const t = useTranslations("Events");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener?.("change", handler);
    return () => mediaQuery.removeEventListener?.("change", handler);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (images.length === 0) return;
      const normalized = ((index % images.length) + images.length) % images.length;
      setCurrentIndex(normalized);
    },
    [images.length]
  );

  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    stopAutoplay();
    if (images.length <= 1 || prefersReducedMotion) return;
    autoplayRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 1400);
  }, [images.length, prefersReducedMotion, stopAutoplay]);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay, images.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (lightboxOpen) {
        if (e.key === "Escape") {
          setLightboxOpen(false);
        } else if (e.key === "ArrowLeft") {
          goPrev();
        } else if (e.key === "ArrowRight") {
          goNext();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        stopAutoplay();
        goPrev();
        startAutoplay();
      } else if (e.key === "ArrowRight") {
        stopAutoplay();
        goNext();
        startAutoplay();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, lightboxOpen, startAutoplay, stopAutoplay]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 40) {
      stopAutoplay();
      goPrev();
      startAutoplay();
    }
    if (diff < -40) {
      stopAutoplay();
      goNext();
      startAutoplay();
    }
    touchStartX.current = null;
  }

  if (images.length === 0) return null;

  const getSlideStyle = (index: number) => {
    const total = images.length;
    let offset = index - currentIndex;
    if (offset > total / 2) offset -= total;
    if (offset < -total / 2) offset += total;

    const isCenter = offset === 0;
    const translateX = offset * 280;
    const scale = isCenter ? 1 : Math.max(0.7, 1 - Math.abs(offset) * 0.15);
    const rotateY = prefersReducedMotion ? 0 : offset * -35;
    const zIndex = isCenter ? 10 : 5 - Math.abs(offset);

    return {
      transform: `translateX(${translateX}px) scale(${scale}) rotateY(${rotateY}deg)`,
      zIndex,
      opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.25,
      transition: prefersReducedMotion ? "none" : "all 1.1s cubic-bezier(0.4,0,0.2,1)",
      pointerEvents: isCenter ? ("auto" as const) : ("none" as const),
    };
  };

  const currentImage = images[currentIndex];

  const slideSizeClasses = slideSize === "large"
    ? "h-[300px] w-[260px] sm:h-[340px] sm:w-[300px] md:h-[440px] md:w-[380px]"
    : "h-[260px] w-[200px] sm:h-[320px] sm:w-[240px] md:h-[360px] md:w-[280px]";

  return (
    <>
      <div className="relative w-full py-8">
        <div
          className="relative mx-auto h-[320px] w-full max-w-4xl overflow-hidden sm:h-[380px] md:h-[420px]"
          style={{ perspective: "1000px" }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={stopAutoplay}
          onMouseLeave={startAutoplay}
        >
          <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2" style={{ transformStyle: "preserve-3d" }}>
            {images.map((image, index) => (
              <div
                key={index}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={getSlideStyle(index)}
                onClick={() => {
                  if (index === currentIndex) {
                    setLightboxOpen(true);
                  }
                }}
              >
                <div className={`relative overflow-hidden rounded-lg shadow-lg ${slideSizeClasses}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt || image.caption || ""}
                    className={cn(invitationImageClassName("contained"), "h-full w-full object-cover object-center")}
                    loading={index === currentIndex || Math.abs(index - currentIndex) <= 1 ? "eager" : "lazy"}
                  />
                </div>
                {index === currentIndex && image.caption && (
                  <p className={cn("mt-3 max-w-[280px] text-center", captionClassName)}>{image.caption}</p>
                )}
              </div>
            ))}
          </div>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => {
                  stopAutoplay();
                  goPrev();
                  startAutoplay();
                }}
                className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white md:block"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5 text-[#4a2816]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAutoplay();
                  goNext();
                  startAutoplay();
                }}
                className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-md transition hover:bg-white md:block"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5 text-[#4a2816]" />
              </button>
            </>
          )}
        </div>
      </div>

      {lightboxOpen && currentImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("invitationGalleryDialogLabel", { index: currentIndex + 1, total: images.length })}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label={t("invitationGalleryClose")}
          >
            <X className="h-5 w-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 sm:left-6"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 sm:right-6"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="relative max-h-[70vh] w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentImage.url}
                alt={currentImage.alt || currentImage.caption || ""}
                className={cn(invitationImageClassName("contained"), "mx-auto max-h-[70vh] w-auto")}
              />
            </div>
            {currentImage.caption && (
              <p className={cn("text-center", lightboxCaptionClassName)}>{currentImage.caption}</p>
            )}
            <div className="flex items-center gap-2 text-xs tabular-nums text-white/80">
              <span>
                {currentIndex + 1}/{images.length}
              </span>
            </div>
            <div className="flex max-w-full flex-wrap justify-center gap-2 overflow-x-auto px-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "h-16 w-16 flex-shrink-0 overflow-hidden rounded border-2 transition",
                    idx === currentIndex ? "border-white" : "border-white/40"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
