"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { money } from "@/lib/format";

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

    // Last-resort fallback for insecure contexts (e.g. http:// on a LAN IP)
    // or older browsers where the Clipboard API isn't available at all.
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
      {copied ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
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
}: {
  title: string;
  slug: string;
  raised: number;
  goal: number;
  percentage: number;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-3 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
      <div className="mx-auto max-w-md">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-zinc-700">
          <span>
            {money(raised)} raised of {money(goal)}
          </span>
          <span className="text-emerald-600">{percentage}% funded</span>
        </div>
        <div className="flex gap-3">
          <ShareFundraiserButton
            title={title}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-black text-zinc-800 shadow-sm"
          />

          <a
            href={`/fundraisers/${slug}/donate`}
            className="flex flex-1 items-center justify-center rounded-2xl bg-green-500 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-green-600"
          >
            Donate
          </a>
        </div>
      </div>
    </div>
  );
}