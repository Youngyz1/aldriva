"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeImageUrl } from "@/lib/image-url";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=1200&auto=format&fit=crop";

export interface CampaignShowcaseCardProps {
  slug: string;
  title: string;
  raised: number;
  /** Used only to compute the progress bar — the goal figure is not displayed. */
  goal: number;
  image: string;
  /** Overlay badge shown only when a real, positive count is available. */
  donorCount?: number;
  /** Featured pick: tall layout plus the emerald ring and "Featured" badge. */
  featured?: boolean;
  /** Tall layout without the featured ring/badge — used for the big slot on
   *  later carousel pages, which is prominent but not the featured campaign. */
  tall?: boolean;
}

/**
 * Simplified "discover" card for the CampaignShowcase grid: the whole card is a
 * single link to the campaign (no Donate button), with a donor-count badge
 * overlaid on the photo, the title, "$X raised", and a progress bar. Distinct
 * from the general-purpose FundraiserCard used elsewhere, which keeps its goal
 * figure and CTA.
 */
export default function CampaignShowcaseCard({
  slug,
  title,
  raised,
  goal,
  image,
  donorCount,
  featured = false,
  tall = false,
}: CampaignShowcaseCardProps) {
  const progress = goal ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  const hasDonors = donorCount !== undefined && donorCount > 0;
  const isTall = featured || tall;

  // A normalized, allowed-host URL can still fail to load at runtime (e.g. a
  // hotlink-protected host that 403s the optimizer). Swap to the fallback on
  // error so the grid never shows a broken frame, matching the hero's behavior.
  const [imageSrc, setImageSrc] = useState(() => normalizeImageUrl(image, FALLBACK_IMAGE));

  return (
    <Link href={`/fundraisers/${slug}`} className="group block h-full">
      <article
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
          featured ? "border-emerald-200 ring-1 ring-emerald-100" : "border-zinc-200"
        )}
      >
        <div
          className={cn(
            "relative w-full bg-zinc-100",
            isTall ? "min-h-[18rem] flex-1 sm:min-h-[22rem]" : "h-40 sm:h-44"
          )}
        >
          <Image
            src={imageSrc}
            alt={title}
            fill
            sizes={
              isTall
                ? "(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 40vw"
                : "(max-width: 640px) 85vw, (max-width: 1024px) 50vw, 30vw"
            }
            className="object-cover transition duration-500 group-hover:scale-105"
            onError={() => {
              if (imageSrc !== FALLBACK_IMAGE) setImageSrc(FALLBACK_IMAGE);
            }}
          />
          {featured && (
            <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
              Featured
            </span>
          )}
          {hasDonors && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
              <Users className="h-3.5 w-3.5" />
              {donorCount.toLocaleString()} donations
            </span>
          )}
        </div>

        <div className="flex flex-col p-4 sm:p-5">
          <h3
            className={cn(
              "line-clamp-2 font-black leading-snug text-zinc-950",
              isTall ? "text-lg sm:text-xl" : "text-base"
            )}
          >
            {title}
          </h3>

          <div className="mt-3">
            <p className="text-lg font-black text-emerald-700">
              ${raised.toLocaleString()}{" "}
              <span className="text-sm font-semibold text-zinc-500">raised</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
