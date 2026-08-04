"use client";

import { Check, Share2, Heart } from "lucide-react";
import { useState, useEffect } from "react";
import { money } from "@/lib/format";
import ProgressBar from "@/components/ui/ProgressBar";

export function ShareFundraiserButton({
  title,
  className = "",
}: {
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

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

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } finally {
      document.body.removeChild(textarea);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
      aria-label="Share this fundraiser"
    >
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      <span>{copied ? "Copied" : "Share"}</span>
    </button>
  );
}

export default function FundraiserFloatingActions({
  title,
  slug,
  raised,
  goal,
  percentage,
  targetElementId = "main-donation-card",
}: {
  title: string;
  slug: string;
  raised: number;
  goal: number;
  percentage: number;
  targetElementId?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetElementId);
    if (!target) {
      // If target element is not present, default to visible on mobile after slight scroll
      const handleScroll = () => {
        setVisible(window.scrollY > 300);
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Hide floating bar when original card is in view; show when scrolled out
        setVisible(!entry.isIntersecting);
      },
      {
        threshold: 0.1, // Trigger when 10% or less of the original card is visible
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [targetElementId]);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/80 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur-md transition-all duration-300 ease-in-out lg:hidden transform-gpu ${
        visible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-full opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      <div className="mx-auto max-w-md space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-700 mb-1">
          <span className="truncate">
            {money(raised)} raised of {money(goal)}
          </span>
          <span className="shrink-0 font-black text-zinc-950 ml-2">
            {percentage}%
          </span>
        </div>
        <ProgressBar percentage={percentage} height={4} />
        <div className="flex gap-2.5 pt-1">
          <ShareFundraiserButton
            title={title}
            className="flex flex-1 min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#1c3a27] px-4 text-sm font-black text-[#c0f269] shadow-sm transition hover:bg-[#152f1e] active:scale-[0.98]"
          />

          <a
            href={`/fundraisers/${slug}/donate`}
            className="flex flex-1 min-h-[48px] items-center justify-center gap-1.5 rounded-full bg-[#c0f269] px-4 text-sm font-black text-[#1b3e10] shadow-sm transition hover:bg-[#b5eb57] active:scale-[0.98]"
          >
            <Heart className="h-4 w-4 fill-[#1b3e10] text-[#1b3e10]" />
            <span>Donate</span>
          </a>
        </div>
      </div>
    </div>
  );
}