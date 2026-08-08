"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { safeImageSrc } from "@/lib/image-url";
import { money, compactNumber } from "@/lib/format";
import ProgressBar from "@/components/ui/ProgressBar";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export interface CampaignShowcaseMobileCardProps {
  slug: string;
  title: string;
  raised: number;
  /** Used only to compute the progress bar — the goal figure is not displayed. */
  goal: number;
  image?: string | null;
  donorCount?: number;
  featured?: boolean;
}

/**
 * Compact landscape row for the mobile campaign list (GoFundMe-style browse
 * layout): a small 96x96 thumbnail with the fundraiser info doing the heavy
 * lifting, not the photo. Row height is structural (96px image + 16px
 * padding = 128px), not a forced min-height, so it stays consistent whether
 * or not a card has a donor count. Whole row is the tap target.
 */
export default function CampaignShowcaseMobileCard({
  slug,
  title,
  raised,
  goal,
  image,
  donorCount,
  featured = false,
}: CampaignShowcaseMobileCardProps) {
  const [imgError, setImgError] = useState(false);
  const progress = calculateFundraisingPercentage(raised, goal);
  const hasDonors = donorCount !== undefined && donorCount > 0;
  const validSrc = !imgError ? safeImageSrc(image) : null;

  return (
    <Link
      href={`/fundraisers/${slug}`}
      className="flex gap-4 p-4 transition-colors active:bg-zinc-50"
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
        {validSrc ? (
          <Image
            src={validSrc}
            alt={title}
            fill
            sizes="96px"
            loading="lazy"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LocalBrandedPlaceholder variant="fundraiser" title={title} />
        )}

        {featured && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-700 px-1.5 py-0.5 text-[8px] font-black uppercase leading-none tracking-wide text-white">
            Featured
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        {hasDonors && (
          <p className="text-xs font-semibold text-zinc-400">
            {compactNumber(donorCount)} donation{donorCount === 1 ? "" : "s"}
          </p>
        )}
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-zinc-950">
          {title}
        </h3>
        <ProgressBar percentage={progress} height={6} className="mt-2" />
        <p className="mt-1 text-[15px] font-bold text-zinc-950">{money(raised)} raised</p>
      </div>
    </Link>
  );
}
