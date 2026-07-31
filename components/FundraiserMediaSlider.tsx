"use client";

import { ChevronLeft, ChevronRight, Share2, Check, Copy } from "lucide-react";
import { FaFacebookF, FaWhatsapp, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { useMemo, useState } from "react";

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

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=1600&auto=format&fit=crop";

function safeUrl(value: string | null | undefined) {
  return value && value.trim().startsWith("http") ? value.trim() : FALLBACK_IMAGE;
}

function initial(value: string) {
  return (value.trim() || "A").charAt(0).toUpperCase();
}

export default function FundraiserMediaSlider({
  media,
  title,
}: {
  media: FundraiserMediaSlide[];
  title: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  // Swipe Gesture State
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchMove, setTouchMove] = useState<{ x: number; y: number } | null>(null);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState(false);

  const slides = useMemo(
    () =>
      (media.length > 0 ? media : [{ url: FALLBACK_IMAGE, type: "image" }]).map(
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

  function go(nextIndex: number) {
    setActiveIndex((nextIndex + slides.length) % slides.length);
    setShowShareMenu(false);
  }

  async function handleShare(target: "copy" | "whatsapp" | "facebook" | "twitter" | "linkedin") {
    if (target === "copy") {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
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
      className={`relative rounded-lg border border-zinc-200 bg-zinc-100 transition-all ${
        showShareMenu ? "overflow-visible" : "overflow-hidden"
      }`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {active.type === "component" ? (
        <div className="relative w-full bg-emerald-950 px-4 py-8 sm:px-8 flex flex-col justify-between items-center text-center min-h-[460px] sm:min-h-[420px]">
          <div className="w-full flex-1 flex flex-col justify-center items-center max-w-2xl mx-auto">
            <h3 className="text-white font-black text-lg sm:text-xl mb-4 tracking-tight">
              Ready for you to share
            </h3>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-1 text-left overflow-hidden">
              {active.component}
            </div>
          </div>

          {/* Single Share Button and Menu */}
          <div className="relative mt-5 z-20">
            <button
              type="button"
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="inline-flex items-center gap-2 rounded-full bg-orange-600 text-white px-8 py-3 text-sm font-black shadow-lg hover:bg-orange-700 transition active:scale-95 cursor-pointer"
            >
              <Share2 className="h-4 w-4" />
              Share this campaign
            </button>
            {showShareMenu && (
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-zinc-200 p-2 shadow-2xl flex items-center justify-center gap-2 z-30 max-w-[90vw] w-max">
                <button
                  type="button"
                  onClick={() => handleShare("copy")}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#059669] text-white transition hover:scale-105 active:scale-95 shadow-sm shrink-0 cursor-pointer"
                  title={copied ? "Copied!" : "Copy link"}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
          className="aspect-[16/9] w-full bg-black object-cover"
        />
      ) : active.story ? (
        <div className="relative aspect-[16/9] w-full bg-emerald-600">
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
                className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                Read story
              </button>
            </div>
          </div>
        </div>
      ) : (
        <img
          src={active.url || undefined}
          alt={title}
          fetchPriority="high"
          decoding="async"
          className="aspect-[16/9] w-full object-cover"
          onError={(event) => {
            event.currentTarget.src = FALLBACK_IMAGE;
          }}
        />
      )}

      {hasMultiple && (
        <>
          {/* On the story-overlay slide the bottom card owns that space, so
              nav controls pin to the top instead of vertically centering */}
          <button
            type="button"
            onClick={() => go(activeIndex - 1)}
            className={`absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-sm transition hover:bg-white z-20 ${
              active.story ? "top-3" : "top-1/2 -translate-y-1/2"
            }`}
            aria-label="Previous fundraiser media"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(activeIndex + 1)}
            className={`absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-sm transition hover:bg-white z-20 ${
              active.story ? "top-3" : "top-1/2 -translate-y-1/2"
            }`}
            aria-label="Next fundraiser media"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div
            className={`absolute left-1/2 flex -translate-x-1/2 gap-1.5 z-20 ${
              active.story ? "top-3" : "bottom-3"
            }`}
          >
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-2 rounded-full transition-all ${
                  index === activeIndex ? "w-6 bg-white" : "w-2 bg-white/60"
                }`}
                aria-label={`Show fundraiser media ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
