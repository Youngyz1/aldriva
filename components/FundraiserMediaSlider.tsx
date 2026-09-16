"use client";

import Image from "next/image";
import { Share2, Check, Copy, AlertCircle } from "lucide-react";
import { FaFacebookF, FaWhatsapp, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { copyTextToClipboard } from "@/lib/clipboard";
import { safeImageSrc } from "@/lib/image-url";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

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
  organizerName,
  organizerProfileUrl,
  variant = "default",
}: {
  media: FundraiserMediaSlide[];
  title: string;
  /** Optional category badge shown alongside the title, overlaid on the cover slide only. */
  category?: string;
  organizerName?: string | null;
  organizerProfileUrl?: string | null;
  variant?: "default" | "green";
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

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

  const hasMultiple = slides.length > 1;
  const isGreen = variant === "green";

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

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

  return (
    <div className="relative overflow-hidden bg-zinc-100 sm:rounded-2xl">
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: false, skipSnaps: false }}
        className="w-full"
      >
        <CarouselContent className="ml-0">
          {slides.map((slide, idx) => (
            <CarouselItem key={slide.id} className="basis-full pl-0">
              {/* Every slide fills the same fixed container — equal sizing */}
              {slide.type === "component" ? (
                <div className="relative flex aspect-[4/5] sm:aspect-[16/9] w-full flex-col items-center justify-between gap-2 bg-[#04342C] px-3 py-4 text-center sm:py-5 sm:pb-9 pb-8">
                  <h3 className="shrink-0 text-sm font-black tracking-tight text-white sm:text-base">
                    Ready for you to share
                  </h3>
                  <div className="w-full max-w-[280px] shrink-0 text-left sm:max-w-[320px]">
                    {slide.component}
                  </div>

                  <div className="relative z-20 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowShareMenu(!showShareMenu)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-1.5 text-xs font-black text-white shadow-lg transition hover:bg-brand-800 active:scale-95 sm:px-6 sm:py-2 sm:text-sm"
                    >
                      <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Share this campaign
                    </button>
                    {showShareMenu && (
                      <div className="fixed bottom-24 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl">
                        <button
                          type="button"
                          onClick={() => handleShare("copy")}
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#059669] text-white shadow-sm transition hover:scale-105 active:scale-95"
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
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:scale-105 active:scale-95"
                          title="Share on WhatsApp"
                        >
                          <FaWhatsapp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShare("facebook")}
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#1877F2] text-white shadow-sm transition hover:scale-105 active:scale-95"
                          title="Share on Facebook"
                        >
                          <FaFacebookF className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShare("twitter")}
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white shadow-sm transition hover:scale-105 active:scale-95"
                          title="Share on X"
                        >
                          <FaXTwitter className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShare("linkedin")}
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0077B5] text-white shadow-sm transition hover:scale-105 active:scale-95"
                          title="Share on LinkedIn"
                        >
                          <FaLinkedinIn className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : slide.type === "video" ? (
                <div className="relative aspect-[4/5] sm:aspect-[16/9] w-full overflow-hidden bg-black">
                  <video
                    src={slide.url || undefined}
                    controls
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : slide.story ? (
                isGreen ? (
                  <div className="relative flex aspect-[4/5] sm:aspect-[16/9] w-full items-center justify-center bg-lime-100 p-4 sm:p-6">
                    <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg sm:p-5">
                      <p className="line-clamp-2 text-sm leading-6 text-zinc-700 sm:text-base">
                        {slide.story.excerpt}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex -space-x-2">
                            {slide.story.donorNames.slice(0, 3).map((name, index) => (
                              <div
                                key={index}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-zinc-100 text-xs font-black text-zinc-700"
                              >
                                {initial(name)}
                              </div>
                            ))}
                          </div>
                          <span className="truncate text-sm font-bold text-zinc-700">
                            {slide.story.donorCount.toLocaleString()}{" "}
                            {slide.story.donorCount === 1 ? "donor" : "donors"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            document
                              .getElementById(slide.story!.scrollTargetId)
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          className="shrink-0 rounded-full bg-lime-400 px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-lime-300"
                        >
                          Read story
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-[4/5] sm:aspect-[16/9] w-full bg-brand-700">
                    <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white p-4 shadow-lg sm:inset-x-6 sm:bottom-6 sm:p-5">
                      <p className="line-clamp-2 text-sm leading-6 text-zinc-700 sm:text-base">
                        {slide.story.excerpt}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex -space-x-2">
                            {slide.story.donorNames.slice(0, 3).map((name, index) => (
                              <div
                                key={index}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-zinc-100 text-xs font-black text-zinc-700"
                              >
                                {initial(name)}
                              </div>
                            ))}
                          </div>
                          <span className="truncate text-sm font-bold text-zinc-700">
                            {slide.story.donorCount.toLocaleString()}{" "}
                            {slide.story.donorCount === 1 ? "donor" : "donors"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            document
                              .getElementById(slide.story!.scrollTargetId)
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          className="shrink-0 rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-800"
                        >
                          Read story
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="relative aspect-[4/5] sm:aspect-[16/9] w-full overflow-hidden bg-zinc-900">
                  {slide.url ? (
                    <>
                      <Image
                        src={slide.url}
                        alt=""
                        aria-hidden
                        fill
                        sizes="64px"
                        className="scale-110 object-cover blur-2xl sm:hidden"
                      />
                      <Image
                        src={slide.url}
                        alt={title}
                        fill
                        priority={idx === 0}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1200px"
                        className="object-contain sm:object-cover"
                      />
                    </>
                  ) : (
                    <LocalBrandedPlaceholder variant="fundraiser" title={title} />
                  )}
                  {idx === 0 && organizerName && (
                    <div className="absolute left-4 top-4 z-10 max-w-[calc(100%-2rem)] sm:left-6 sm:top-5">
                      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-md">
                        <span className="shrink-0 text-white/80">Organized by</span>
                        {organizerProfileUrl ? (
                          <Link
                            href={organizerProfileUrl}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-bold text-white underline decoration-white/30 underline-offset-2 hover:decoration-white"
                          >
                            {organizerName}
                          </Link>
                        ) : (
                          <span className="truncate font-bold text-white">{organizerName}</span>
                        )}
                      </span>
                    </div>
                  )}
                  {idx === 0 && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-4 pb-12 pt-16 sm:px-6 sm:pb-14">
                      {category && (
                        <span className="mb-2 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-white backdrop-blur-sm">
                          {category}
                        </span>
                      )}
                      <h1 className="break-words text-2xl font-bold leading-tight text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.7)] sm:text-3xl">
                        {title}
                      </h1>
                    </div>
                  )}
                </div>
              )}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {hasMultiple && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => api?.scrollTo(index)}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                index === current ? "w-6 bg-white" : "w-2 bg-white/60"
              }`}
              aria-label={`Show fundraiser media ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
