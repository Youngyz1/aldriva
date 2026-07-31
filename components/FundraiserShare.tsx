"use client";

import { Check, Copy } from "lucide-react";
import { FaFacebookF, FaWhatsapp, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=1200&auto=format&fit=crop";

type FundraiserShareProps = {
  title: string;
  imageUrl: string;
  organizerName: string;
  raised: number;
  goal: number;
  donateSlug?: string;
  hideButtons?: boolean;
};

function CircularProgress({ pct, size = 64 }: { pct: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e4e4e7" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="#22c55e" strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
    </svg>
  );
}

export default function FundraiserShare({
  title,
  imageUrl,
  organizerName,
  raised,
  goal,
  donateSlug,
  hideButtons = false,
}: FundraiserShareProps) {
  const [copied, setCopied] = useState(false);

  const percentage = goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  const raisedLabel = money(raised);
  const goalLabel = money(goal);

  async function copyLink() {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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

  const cardMarkup = (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white w-full">
      {/* Top Image Area */}
      <div className="relative w-full h-[220px] shrink-0 bg-zinc-150">
        {/* Logo Mark */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <img src="/logo.png" alt="Aldriva Logo" className="h-8 w-auto object-contain" />
        </div>

        <img
          src={imageUrl || FALLBACK_IMAGE}
          alt={title}
          className="w-full h-full object-cover"
          onError={(event) => {
            event.currentTarget.src = FALLBACK_IMAGE;
          }}
        />
      </div>

      {/* Bottom Content Area */}
      <div className="bg-[#062A22] text-white p-6 flex-1 flex flex-col justify-between relative pt-8">
        {/* Seam Overlaps */}
        {/* Rotated badge pills (top-left seam) */}
        <div className="absolute top-0 left-6 -translate-y-1/2 flex items-center gap-2">
          <div className="bg-[#059669] text-white px-3 py-1.5 rounded-full text-xs font-black shadow-md rotate-[-2deg] shrink-0">
            {raisedLabel} raised
          </div>
          {donateSlug && (
            <Link
              href={`/fundraisers/${donateSlug}/donate`}
              className="bg-orange-600 text-white px-3 py-1.5 rounded-full text-xs font-black shadow-md rotate-[2deg] shrink-0 hover:bg-orange-700 transition active:scale-95"
            >
              Donate now
            </Link>
          )}
        </div>

        {/* Progress Ring (top-right seam) */}
        <div className="absolute top-0 right-6 -translate-y-1/2 bg-white rounded-full p-1.5 shadow-lg flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <CircularProgress pct={percentage} size={64} />
            <span className="absolute text-[11px] font-black text-zinc-900">{percentage}%</span>
          </div>
        </div>

        {/* Title & Organizer Info */}
        <div className="space-y-1">
          <h3 className="text-xl font-black leading-snug break-words">
            {title}
          </h3>
          <p className="text-sm opacity-80 font-medium">
            Organised by {organizerName}
          </p>
          <p className="text-xs opacity-70 font-semibold pt-1">
            Goal: {goalLabel}
          </p>
        </div>
      </div>
    </div>
  );

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
          title={copied ? "Copied!" : "Copy link"}
        >
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
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
