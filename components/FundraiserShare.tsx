"use client";

import { AlertCircle, Check, Copy } from "lucide-react";
import { FaFacebookF, FaWhatsapp, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import { copyTextToClipboard } from "@/lib/clipboard";
import { safeImageSrc } from "@/lib/image-url";
import FundraisingProgressRing from "@/components/ui/FundraisingProgressRing";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type FundraiserShareProps = {
  title: string;
  imageUrl?: string | null;
  organizerName: string;
  raised: number;
  goal: number;
  donateSlug?: string;
  hideButtons?: boolean;
  variant?: "default" | "hero";
};

export default function FundraiserShare({
  title,
  imageUrl,
  organizerName,
  raised,
  goal,
  donateSlug,
  hideButtons = false,
  variant = "default",
}: FundraiserShareProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [imgError, setImgError] = useState(false);

  const percentage = calculateFundraisingPercentage(raised, goal);
  const raisedLabel = money(raised);
  const goalLabel = money(goal);

  const safeSrc = !imgError ? safeImageSrc(imageUrl) : null;
  const isHero = variant === "hero";

  async function copyLink() {
    const url = window.location.href;
    const succeeded = await copyTextToClipboard(url);
    setCopyStatus(succeeded ? "copied" : "failed");
    window.setTimeout(() => setCopyStatus("idle"), succeeded ? 1800 : 3000);
  }

  function openShare(target: "whatsapp" | "facebook" | "twitter" | "linkedin") {
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

  // Hero variant (used inside the campaign-page carousel, see
  // FundraiserMediaSlider): phone-frame mockup rendering around the campaign card
  const heroCardMarkup = (
    <div className="mx-auto flex w-full max-w-[300px] sm:max-w-[340px] flex-col items-center">
      {/* Outer phone frame mockup outline */}
      <div className="relative w-full rounded-[26px] border border-brand-400/40 bg-[#02241e] p-2 shadow-lg">
        {/* Phone top notch */}
        <div className="mb-1 flex justify-center">
          <div className="h-1.5 w-8 rounded-full bg-brand-700/60" />
        </div>

        {/* Inner phone screen — clean, single container without nested card borders */}
        <div className="flex w-full flex-col overflow-hidden rounded-[18px] bg-[#062A22] text-white">
          {/* Fixed aspect rather than a fixed height — at ~284px wide, the old
              110px height was a 2.4:1 frame that cropped ~37% off a normal
              photo (heads/feet chopped). 3/2 shows the subject intact. */}
          <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden bg-zinc-900">
            {safeSrc ? (
              <img
                src={safeSrc}
                alt={title}
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <LocalBrandedPlaceholder variant="fundraiser" title={title} />
            )}
          </div>

          <div className="flex flex-col gap-2 p-2.5 sm:p-3 text-white">
            <div className="min-w-0">
              <h3 className="break-words text-xs sm:text-sm font-bold leading-snug text-white">{title}</h3>
              <p className="mt-0.5 truncate text-[11px] font-medium text-white/70">
                Organized for <span className="font-semibold text-white">{organizerName}</span>
              </p>
            </div>

            <div className="flex items-end justify-between gap-1.5 pt-1">
              <div className="flex flex-col gap-1 min-w-0">
                {donateSlug && (
                  <Link
                    href={`/fundraisers/${donateSlug}/donate`}
                    className="inline-flex items-center justify-center shrink-0 rounded-full bg-amber-400 hover:bg-amber-300 text-zinc-950 px-2.5 py-0.5 text-[10px] font-extrabold shadow-sm transition active:scale-95 text-center"
                  >
                    Donate now!
                  </Link>
                )}
                <div className="shrink-0 rounded-full bg-brand-900/80 text-brand-200 px-2 py-0.5 text-[10px] font-semibold text-center truncate">
                  {raisedLabel} raised
                </div>
              </div>

              {/* Readable Progress Ring with percentage centered inside */}
              <div className="shrink-0 rounded-full bg-black/20 p-0.5">
                <FundraisingProgressRing
                  percentage={percentage}
                  size={44}
                  strokeWidth={4.5}
                  showDetails={true}
                  animated={true}
                  textColor="text-white"
                  trackColor="#154D40"
                  progressColor="#F97316"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const defaultCardMarkup = (
    <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-zinc-200 bg-white">
      {/* Top Image Area — fixed aspect, not a fixed pixel height: a fixed
          height turns into an extreme letterbox (and crops the subject out)
          as the card gets wider on desktop. 3/2 matches typical photos, so
          the framing stays consistent at every width. */}
      <div className="relative aspect-[3/2] w-full shrink-0 overflow-hidden bg-zinc-100">
        {/* Logo Mark */}
        <div className="absolute left-1/2 -translate-x-1/2 z-10 top-3">
          <img
            src="/icons/icon-source.png"
            alt="Aldriva Logo"
            className="w-auto object-contain h-8"
          />
        </div>

        {safeSrc ? (
          <img
            src={safeSrc}
            alt={title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LocalBrandedPlaceholder variant="fundraiser" title={title} />
        )}
      </div>

      {/* Bottom Content Area */}
      <div className="bg-[#062A22] text-white flex-1 flex flex-col justify-between relative p-6 pt-8">
        {/* Seam — rotated badge pills + circle ring straddling image/dark boundary */}
        <div className="absolute top-0 left-2 right-2 sm:left-4 sm:right-4 -translate-y-1/2 flex items-center justify-between gap-1 sm:gap-2 z-10 max-w-full">
          <div className="flex items-center gap-1 sm:gap-1.5 shrink min-w-0 overflow-hidden">
            <div className="bg-[#059669] text-white font-black shadow-md rotate-[-2deg] shrink-0 truncate px-2.5 sm:px-3 py-1.5 text-xs">
              {raisedLabel} raised
            </div>
            {donateSlug && (
              <Link
                href={`/fundraisers/${donateSlug}/donate`}
                className="bg-brand-700 text-white font-black shadow-md rotate-[2deg] shrink-0 hover:bg-brand-800 transition active:scale-95 truncate px-2.5 sm:px-3 py-1.5 text-xs"
              >
                Donate now
              </Link>
            )}
          </div>
          {/* Circle progress ring on seam with percentage centered inside */}
          <div className="shrink-0 rounded-full bg-[#062A22] p-0.5 sm:p-1 shadow-lg">
            <FundraisingProgressRing
              percentage={percentage}
              size={64}
              strokeWidth={6}
              showDetails={true}
              animated={true}
              textColor="text-white"
              trackColor="#154D40"
              progressColor="#F97316"
            />
          </div>
        </div>

        {/* Title & Organizer Info */}
        <div className="space-y-1">
          <h3 className="font-black leading-snug break-words text-xl">
            {title}
          </h3>
          <p className="opacity-80 font-medium truncate text-sm">
            Organised by {organizerName}
          </p>
          <p className="opacity-70 font-semibold text-xs pt-1">
            Goal: {goalLabel}
          </p>
        </div>
      </div>
    </div>
  );

  const cardMarkup = isHero ? heroCardMarkup : defaultCardMarkup;

  if (hideButtons) {
    return cardMarkup;
  }

  return (
    <section className="border-b border-zinc-200 pb-8">
      <h2 className="text-2xl font-bold text-zinc-950 break-words mb-4">
        Sharing helps more than you think
      </h2>

      {cardMarkup}

      {/* Share Buttons Row — Row of icon-only circular brand stickers */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={copyLink}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#059669] text-white transition hover:scale-105 active:scale-95 shadow-md shrink-0 cursor-pointer"
          title={
            copyStatus === "copied"
              ? "Copied!"
              : copyStatus === "failed"
                ? "Copy failed — long-press the link to copy manually"
                : "Copy link"
          }
        >
          {copyStatus === "copied" ? (
            <Check className="h-5 w-5" />
          ) : copyStatus === "failed" ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <Copy className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => openShare("whatsapp")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white transition hover:scale-105 active:scale-95 shadow-md shrink-0 cursor-pointer"
          title="Share on WhatsApp"
        >
          <FaWhatsapp className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => openShare("facebook")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2] text-white transition hover:scale-105 active:scale-95 shadow-md shrink-0 cursor-pointer"
          title="Share on Facebook"
        >
          <FaFacebookF className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          onClick={() => openShare("twitter")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white transition hover:scale-105 active:scale-95 shadow-md shrink-0 cursor-pointer"
          title="Share on X"
        >
          <FaXTwitter className="h-4.5 w-4.5" />
        </button>
        <button
          type="button"
          onClick={() => openShare("linkedin")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0077B5] text-white transition hover:scale-105 active:scale-95 shadow-md shrink-0 cursor-pointer"
          title="Share on LinkedIn"
        >
          <FaLinkedinIn className="h-4.5 w-4.5" />
        </button>
      </div>
    </section>
  );
}
