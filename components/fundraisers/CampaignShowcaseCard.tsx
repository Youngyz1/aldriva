"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeImageSrc } from "@/lib/image-url";
import ProgressBar from "@/components/ui/ProgressBar";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export interface CampaignShowcaseCardProps {
  slug: string;
  title: string;
  raised: number;
  /** Used only to compute the progress bar — the goal figure is not displayed. */
  goal: number;
  image?: string | null;
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
  const [imgError, setImgError] = useState(false);
  const progress = calculateFundraisingPercentage(raised, goal);
  const hasDonors = donorCount !== undefined && donorCount > 0;
  const isTall = featured || tall;

  const validSrc = !imgError ? safeImageSrc(image) : null;

  return (
    <Link href={`/fundraisers/${slug}`} className="group block h-full">
      <article
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
          featured ? "border-brand-200 ring-1 ring-brand-100" : "border-zinc-200"
        )}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden bg-zinc-100",
            isTall ? "min-h-[18rem] flex-1 sm:min-h-[22rem]" : "h-44 sm:h-52"
          )}
        >
          {validSrc ? (
            <Image
              src={validSrc}
              alt={title}
              fill
              sizes={
                isTall
                  ? "(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 40vw"
                  : "(max-width: 640px) 85vw, (max-width: 1024px) 50vw, 30vw"
              }
              className="object-cover transition duration-500 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <LocalBrandedPlaceholder variant="fundraiser" title={title} />
          )}

          {featured && (
            <span className="absolute left-3 top-3 rounded-full bg-brand-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
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
            <p className="text-lg font-black text-brand-800">
              ${raised.toLocaleString()}{" "}
              <span className="text-sm font-semibold text-zinc-500">raised</span>
            </p>
            <ProgressBar percentage={progress} height={8} className="mt-2" />
          </div>
        </div>
      </article>
    </Link>
  );
}
