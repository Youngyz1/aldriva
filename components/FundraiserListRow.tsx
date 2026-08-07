"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { safeImageSrc } from "@/lib/image-url";
import { money, compactNumber } from "@/lib/format";
import ProgressBar from "@/components/ui/ProgressBar";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type FundraiserListRowProps = {
  title: string;
  raised: number;
  goal: number;
  image?: string | null;
  slug: string;
  donationCount?: number;
  /** Shown as a small metadata badge on the thumbnail — classification only,
   *  never what drives which campaigns appear in the list. */
  category?: string | null;
  /** Space here is tight, so only the beneficiary ("for Mary") is shown —
   *  the organizer is dropped rather than truncating both. */
  beneficiaryName?: string | null;
  /** Suppresses the "for …" line on self-beneficiary campaigns, where it
   *  would just repeat the organizer and add no information. */
  beneficiaryType?: string | null;
};

/**
 * Compact GoFundMe-style browse row for /fundraisers — no card container
 * (border/shadow/background), just a landscape thumbnail + info, separated
 * from neighboring rows by the parent list's divider. Distinct from
 * FundraiserCard (the big card used on the homepage/fundraiser detail
 * page) — do not use this for those contexts.
 */
export default function FundraiserListRow({
  title,
  raised,
  goal,
  image,
  slug,
  donationCount,
  category,
  beneficiaryName,
  beneficiaryType,
}: FundraiserListRowProps) {
  const [imgError, setImgError] = useState(false);
  const progress = calculateFundraisingPercentage(raised, goal);
  const hasDonations = donationCount !== undefined && donationCount > 0;
  const imageSrc = !imgError ? safeImageSrc(image) : null;

  return (
    <Link href={`/fundraisers/${slug}`} className="flex items-center gap-4 py-3">
      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
        {imageSrc ? (
          <Image
            src={imageSrc}
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
        {category && (
          <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-white backdrop-blur-sm">
            {category}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {hasDonations && (
          <p className="text-xs font-semibold text-zinc-400">
            {compactNumber(donationCount)} donation{donationCount === 1 ? "" : "s"}
          </p>
        )}
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-zinc-950">
          {title}
        </h3>
        {beneficiaryName && beneficiaryType !== "self" && (
          <p className="mt-0.5 truncate text-xs font-semibold text-zinc-500">
            for <span className="text-zinc-700">{beneficiaryName}</span>
          </p>
        )}
        <ProgressBar percentage={progress} height={6} className="mt-2" />
        <p className="mt-1 text-[15px] font-bold text-zinc-950">{money(raised)} raised</p>
      </div>
    </Link>
  );
}
