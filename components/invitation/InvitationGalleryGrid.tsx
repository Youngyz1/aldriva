"use client";

/**
 * components/invitation/InvitationGalleryGrid.tsx
 *
 * Shared public gallery for all invitation page templates.
 *
 * Gallery honesty rules (see templates/AUTHORING.md):
 * - Never crop: every image renders at its natural aspect ratio
 *   (`h-auto w-full` in a masonry column layout: no fixed-ratio frames,
 *   no cover cuts).
 * - Caption (falling back to alt text) renders visibly BELOW each image,
 *   not only in the lightbox.
 * - The lightbox keeps the full uncropped image plus its caption, with
 *   keyboard (Escape/arrows) and touch-swipe navigation.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { InvitationGalleryItem } from "@/types/invitation-template";
import { cn } from "@/lib/utils";
import {
  invitationImageClassName,
  invitationMobileGalleryBleedClassName,
  invitationMobileGalleryCaptionClassName,
  type InvitationGalleryBleedGutter,
} from "@/lib/invitation-image-presentation";

interface Props {
  images: InvitationGalleryItem[];
  /** Caption text styling below each image. */
  captionClassName?: string;
  /** Caption styling inside the lightbox. */
  lightboxCaptionClassName?: string;
  /** Extra classes for the image element (e.g. per-template rounding). */
  imageClassName?: string;
  /** Mobile page-edge gutter; set only for unframed gallery photos. */
  mobileBleedGutter?: InvitationGalleryBleedGutter;
  /** Optional presentation classes used by the shared block renderer. */
  gridClassName?: string;
  figureClassName?: (index: number) => string;
}

export function InvitationGalleryGrid({
  images,
  captionClassName = "text-xs text-zinc-500",
  lightboxCaptionClassName = "text-xs text-white/80",
  imageClassName = "",
  mobileBleedGutter,
  gridClassName = "columns-1 gap-4 sm:columns-2 md:columns-3",
  figureClassName,
}: Props) {
  const t = useTranslations("Events");
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const handleNext = useCallback(() => {
    setActiveIdx((prev) => (prev !== null ? (prev < images.length - 1 ? prev + 1 : 0) : null));
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setActiveIdx((prev) => (prev !== null ? (prev > 0 ? prev - 1 : images.length - 1) : null));
  }, [images.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeIdx === null) return;
      if (e.key === "Escape") setActiveIdx(null);
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIdx, handleNext, handlePrev]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 40) handlePrev();
    if (diff < -40) handleNext();
    touchStartX.current = null;
  }

  if (images.length === 0) return null;

  return (
    <>
      <div className={cn(
        gridClassName,
        mobileBleedGutter ? invitationMobileGalleryBleedClassName(mobileBleedGutter) : "",
      )}>
        {images.map((img, idx) => {
          const visibleCaption = img.caption || img.alt || null;
          const fallbackAlt = t("invitationGalleryPhotoAlt", { index: idx + 1 });
          return (
            <figure key={idx} className={cn("mb-4 break-inside-avoid", figureClassName?.(idx))}>
              <button
                type="button"
                onClick={() => setActiveIdx(idx)}
                className="block w-full cursor-pointer text-left"
                aria-label={visibleCaption
                  ? t("invitationGalleryOpenPhotoCaption", { index: idx + 1, caption: visibleCaption })
                  : t("invitationGalleryOpenPhoto", { index: idx + 1 })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt || img.caption || fallbackAlt}
                  loading="lazy"
                  className={cn(invitationImageClassName("contained"), imageClassName)}
                />
              </button>
              {visibleCaption && (
                <figcaption className={cn(
                  "mt-1.5",
                  mobileBleedGutter ? invitationMobileGalleryCaptionClassName(mobileBleedGutter) : "",
                  captionClassName,
                )}>
                  {visibleCaption}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>

      {/* Lightbox: full uncropped image + caption */}
      {activeIdx !== null && images[activeIdx] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("invitationGalleryDialogLabel", { index: activeIdx + 1, total: images.length })}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm touch-none select-none"
          onClick={() => setActiveIdx(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={() => setActiveIdx(null)}
            className="absolute top-4 right-4 p-3 rounded-full text-white bg-white/10 hover:bg-white/20 z-50"
            aria-label={t("invitationGalleryClose")}
          >
            <X className="w-5 h-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className="absolute left-3 sm:left-6 p-3 rounded-full text-white bg-white/10 hover:bg-white/20 z-50 hidden sm:block"
                aria-label="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-3 sm:right-6 p-3 rounded-full text-white bg-white/10 hover:bg-white/20 z-50 hidden sm:block"
                aria-label="Next image"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          <div
            className="relative max-w-3xl max-h-[85vh] w-full h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[activeIdx].url}
              alt={images[activeIdx].alt || images[activeIdx].caption || t("invitationGalleryPhotoAlt", { index: activeIdx + 1 })}
              className={invitationImageClassName("contained", "max-h-[70vh] w-auto")}
            />
            {(images[activeIdx].caption || images[activeIdx].alt) && (
              <p className={cn("mt-3 text-center max-w-md", lightboxCaptionClassName)}>
                {images[activeIdx].caption || images[activeIdx].alt}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
