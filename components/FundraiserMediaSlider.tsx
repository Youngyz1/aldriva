"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Share2, Check, Copy, AlertCircle } from "lucide-react";
import { FaFacebookF, FaWhatsapp, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { useMemo, useState } from "react";
import { copyTextToClipboard } from "@/lib/clipboard";

export type FundraiserMediaSlide = {
  id?: string | null;
  url?: string | null;
  type?: "image" | "video" | "component" | string | null;
  component?: React.ReactNode;
  /**
   * When present, renders a solid brand-color slide with a story-excerpt
   * overlay card instead of a photo — `url` is ignored for this slide.
   */
  story?: {
    excerpt: string;
    donorCount: number;
    /** Display names for the stacked avatar cluster (initials only, no fetching here). */
    donorNames: string[];
    /** Element id to smooth-scroll to when "Read story" is clicked. */
    scrollTargetId: string;
  };
};

import { safeImageSrc } from "@/lib/image-url";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

function safeUrl(value: string | null | undefined) {
  return safeImageSrc(value);
}

function initial(value: string) {
  return (value.trim() || "A").charAt(0).toUpperCase();
}

export default function FundraiserMediaSlider({
  media,
  title,
  category,
}: {
  media: FundraiserMediaSlide[];
  title: string;
  /** Optional category badge shown alongside the title, overlaid on the cover slide only. */
  category?: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [showShareMenu, setShowShareMenu] = useState(false);

  // Swipe Gesture State
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchMove, setTouchMove] = useState<{ x: number; y: number } | null>(null);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState(false);

  const slides = useMemo(
    () =>
      (media.length > 0 ? media : [{ url: null, type: "image" }]).map(
        (item, index) => ({
          ...item,
          id: item.id || `${item.url || index}-${index}`,
          url: item.type === "component" ? null : safeUrl(item.url),
          type: item.type || "image",
        })
      ),
    [media]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const active = slides[activeIndex] || slides[0];
  const hasMultiple = slides.length > 1;
  // Both the story-overlay slide and the share-artwork slide have their own
  // content occupying the lower/middle area, so nav controls pin to the top
  // on those instead of vertically centering (which would otherwise overlap
  // the floating card on narrow screens).
  const navControlsAtTop = Boolean(active.story) || active.type === "component";

  function go(nextIndex: number) {
    setActiveIndex((nextIndex + slides.length) % slides.length);
    setShowShareMenu(false);
  }

  async function handleShare(target: "copy" | "whatsapp" | "facebook" | "twitter" | "linkedin") {
    if (target === "copy") {
      const url = window.location.href;
      const succeeded = await copyTextToClipboard(url);
      setCopyStatus(succeeded ? "copied" : "failed");
      window.setTimeout(() => setCopyStatus("idle"), succeeded ? 1800 : 3000);
    } else {
      const encodedUrl = encodeURIComponent(window.location.href);
      const encodedTitle = encodeURIComponent(title);
      const links = {
        whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      };

      window.open(links[target], "_blank", "noopener,noreferrer");
    }
    setShowShareMenu(false);
  }

  // Swipe Gesture Handlers
  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    setShowShareMenu(false);
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchMove(null);
    setIsHorizontalSwipe(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStart) return;
    const touch = e.touches[0];
    const currentX = touch.clientX;
    const currentY = touch.clientY;

    const diffX = currentX - touchStart.x;
    const diffY = currentY - touchStart.y;

    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    if (absX > 10 || absY > 10) {
      if (absX > absY) {
        setIsHorizontalSwipe(true);
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    }
    setTouchMove({ x: currentX, y: currentY });
  }

  // Handle touch end with swipe action
  function handleTouchEnd() {
    if (!touchStart || !touchMove || !isHorizontalSwipe) {
      setTouchStart(null);
      setTouchMove(null);
      setIsHorizontalSwipe(false);
      return;
    }

    const diffX = touchMove.x - touchStart.x;
    const swipeThreshold = 50;

    if (Math.abs(diffX) > swipeThreshold) {
      if (diffX > 0) {
        // Swipe right -> Previous slide
        go(activeIndex - 1);
      } else {
        // Swipe left -> Next slide
        go(activeIndex + 1);
      }
    }

    setTouchStart(null);
    setTouchMove(null);
    setIsHorizontalSwipe(false);
  }

  return (
    <div
      className="relative overflow-hidden bg-zinc-100 sm:rounded-2xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {active.type === "component" ? (
        // The artwork (active.component) is intentionally reused as-is — it
        // already carries its own compact "hero" card styling (rounded,
        // bordered, white). This slide just needs to let it float — no
        // second wrapper card around it, and a width small enough that it
        // reads as promotional artwork inside the carousel rather than a
        // separate boxed-in screen.
        <div className="relative min-h-[420px] sm:min-h-[460px] w-full bg-[#04342C] px-3 py-4 sm:py-5 flex flex-col items-center justify-between gap-2 text-center pb-8 sm:pb-9">
          <h3 className="text-white font-black text-sm sm:text-base tracking-tight shrink-0">
            Ready for you to share
          </h3>
          <div className="w-full max-w-[280px] sm:max-w-[320px] text-left shrink-0">
            {active.component}
          </div>

          {/* Single Share Button and Menu */}
          <div className="relative z-20 shrink-0">
            <button
              type="button"
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 text-white px-4 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-sm font-black shadow-lg hover:bg-brand-800 transition active:scale-95 cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Share this campaign
            </button>
            {showShareMenu && (
              <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-zinc-200 p-2 shadow-2xl flex items-center justify-center gap-2 z-50 max-w-[90vw]">
                <button
                  type="button"
                  onClick={() => handleShare("copy")}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#059669] text-white transition hover:scale-105 active:scale-95 shadow-sm shrink-0 cursor-pointer"
                  title={
                    copyStatus === "copied"
                      ? "Copied!"
                      : copyStatus === "failed"
                        ? "Copy failed — long-press the link to copy manually"
                        : "Copy link"
                  }
                >
                  {copyStatus === "copied" ? (
                    <Check className="h-4 w-4" />
                  ) : copyStatus === "failed" ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleShare("whatsapp")}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white transition hover:scale-105 active:scale-95 shadow-sm shrink-0 cursor-pointer"
                  title="Share on WhatsApp"
                >
                  <FaWhatsapp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleShare("facebook")}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877F2] text-white transition hover:scale-105 active:scale-95 shadow-sm shrink-0 cursor-pointer"
                  title="Share on Facebook"
                >
                  <FaFacebookF className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleShare("twitter")}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition hover:scale-105 active:scale-95 shadow-sm shrink-0 cursor-pointer"
                  title="Share on X"
                >
                  <FaXTwitter className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleShare("linkedin")}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0077B5] text-white transition hover:scale-105 active:scale-95 shadow-sm shrink-0 cursor-pointer"
                  title="Share on LinkedIn"
                >
                  <FaLinkedinIn className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : active.type === "video" ? (
        <video
          src={active.url || undefined}
          controls
          className="aspect-[4/5] sm:aspect-[16/9] w-full bg-black object-cover"
        />
      ) : active.story ? (
        <div className="relative aspect-[4/5] sm:aspect-[16/9] w-full bg-brand-700">
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white p-4 shadow-lg sm:inset-x-6 sm:bottom-6 sm:p-5">
            <p className="line-clamp-2 text-sm leading-6 text-zinc-700 sm:text-base">
              {active.story.excerpt}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex -space-x-2">
                  {active.story.donorNames.slice(0, 3).map((name, index) => (
                    <div
                      key={index}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-zinc-100 text-xs font-black text-zinc-700"
                    >
                      {initial(name)}
                    </div>
                  ))}
                </div>
                <span className="truncate text-sm font-bold text-zinc-700">
                  {active.story.donorCount.toLocaleString()}{" "}
                  {active.story.donorCount === 1 ? "donor" : "donors"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  document
                    .getElementById(active.story!.scrollTargetId)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="shrink-0 rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-800"
              >
                Read story
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative aspect-[4/5] sm:aspect-[16/9] w-full bg-zinc-900 overflow-hidden">
          {active.url ? (
            <>
              {/* Blurred backdrop (mobile only). The photo itself is contained
                  on mobile so nothing gets cropped out of frame — campaign
                  photos arrive both as 4:5 (this platform's upload crop) and
                  3:2 landscape (imported/synced campaigns), and covering a
                  landscape shot in the tall 4:5 frame chopped subjects off.
                  A scaled, blurred copy of the same photo fills the leftover
                  space so it reads as a soft colour-matched surround rather
                  than hard black bars. Deliberately requested at a tiny size —
                  it is blurred beyond recognition, so a full-resolution second
                  fetch would be pure waste. */}
              <Image
                src={active.url}
                alt=""
                aria-hidden
                fill
                sizes="64px"
                className="scale-110 object-cover blur-2xl sm:hidden"
              />
              <Image
                src={active.url}
                alt={title}
                fill
                priority={activeIndex === 0}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1200px"
                // Desktop's 16/9 frame already matches landscape photos
                // closely, so it keeps covering — unchanged there.
                className="object-contain sm:object-cover"
              />
            </>
          ) : (
            <LocalBrandedPlaceholder variant="fundraiser" title={title} />
          )}
          {/* Title overlay — cover slide only (index 0), matching the
              GoFundMe-style "title lives on the hero photo" treatment.
              Gradient scrim keeps white text legible over any photo, and
              bottom padding keeps the text clear of the dot indicators. */}
          {activeIndex === 0 && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-4 pb-12 pt-16 sm:px-6 sm:pb-14">
              {category && (
                <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-white backdrop-blur-sm mb-2">
                  {category}
                </span>
              )}
              <h1 className="text-2xl font-bold leading-tight text-white drop-shadow-sm sm:text-3xl break-words">
                {title}
              </h1>
            </div>
          )}
        </div>
      )}

      {hasMultiple && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 z-20">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                index === activeIndex ? "w-6 bg-white" : "w-2 bg-white/60"
              }`}
              aria-label={`Show fundraiser media ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
