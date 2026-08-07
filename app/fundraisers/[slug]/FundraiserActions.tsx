"use client";

import { AlertCircle, Check, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { copyTextToClipboard } from "@/lib/clipboard";
import ProgressRing from "@/components/ui/ProgressRing";

export function ShareFundraiserButton({
  title,
  className = "",
  tabIndex,
}: {
  title: string;
  className?: string;
  tabIndex?: number;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleShare() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fall back to copy if the native share sheet is cancelled or unavailable.
      }
    }

    const succeeded = await copyTextToClipboard(url);
    setStatus(succeeded ? "copied" : "failed");
    window.setTimeout(() => setStatus("idle"), succeeded ? 1800 : 3000);
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
      tabIndex={tabIndex}
      aria-label={
        status === "failed"
          ? "Copy failed — long-press the link to copy manually"
          : "Share this fundraiser"
      }
    >
      {status === "copied" ? (
        <Check className="h-4 w-4 text-[#c0f269]" />
      ) : status === "failed" ? (
        <AlertCircle className="h-4 w-4 text-red-500" />
      ) : (
        <Share2 className="h-4 w-4 text-[#c0f269]" />
      )}
      <span>{status === "copied" ? "Link copied!" : status === "failed" ? "Failed to copy" : "Share"}</span>
    </button>
  );
}

export default function FundraiserFloatingActions({
  title,
  slug,
  raised,
  goal,
  percentage,
  donationCount,
  donationCardId = "main-donation-card",
}: {
  title: string;
  slug: string;
  raised: number;
  goal: number;
  percentage: number;
  donationCount?: number;
  donationCardId?: string;
}) {
  const [isFloatingVisible, setIsFloatingVisible] = useState(false);

  useEffect(() => {
    const donationCard = document.getElementById(donationCardId);
    if (!donationCard || !("IntersectionObserver" in window)) {
      setIsFloatingVisible(false);
      return;
    }

    let hasSeenDonationCard = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasSeenDonationCard = true;
          setIsFloatingVisible(false);
          return;
        }

        const donationCardIsAboveViewport = entry.boundingClientRect.bottom <= 0;
        setIsFloatingVisible(hasSeenDonationCard && donationCardIsAboveViewport);
      },
      { threshold: 0 }
    );

    observer.observe(donationCard);

    return () => observer.disconnect();
  }, [donationCardId]);

  return (
    <div
      data-campaign-floating-actions
      data-visible={isFloatingVisible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur transition-[transform,opacity] duration-300 ease-out will-change-transform motion-reduce:transition-none ${
        isFloatingVisible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-full opacity-0 pointer-events-none"
      }`}
      style={{
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
      aria-hidden={!isFloatingVisible}
    >
      <div className="mx-auto max-w-xl flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <ProgressRing
              percentage={percentage}
              size={44}
              strokeWidth={4.5}
              showDetails={true}
              animated={false}
              textColor="text-brand-900"
              trackColor="#d1fae5"
              progressColor="#059669"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-black text-zinc-950 truncate leading-tight">
              {money(raised)} raised
              <span className="font-semibold text-zinc-500 text-xs ml-1">of {money(goal)}</span>
            </p>
            {donationCount !== undefined && (
              <p className="text-[11px] font-semibold text-zinc-500 leading-tight">
                {donationCount.toLocaleString()} donation{donationCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2.5">
          <ShareFundraiserButton
            title={title}
            tabIndex={isFloatingVisible ? 0 : -1}
            className="flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#1c3a27] px-4 text-xs sm:text-sm font-black text-[#c0f269] shadow-sm transition hover:bg-[#152f1e] active:scale-[0.98]"
          />
          <a
            href={`/fundraisers/${slug}/donate`}
            tabIndex={isFloatingVisible ? 0 : -1}
            className="flex flex-1 min-h-[44px] items-center justify-center rounded-full bg-[#c0f269] px-4 text-xs sm:text-sm font-black text-[#1b3e10] shadow-sm transition hover:bg-[#b5eb57] active:scale-[0.98]"
          >
            Donate now
          </a>
        </div>
      </div>
    </div>
  );
}
