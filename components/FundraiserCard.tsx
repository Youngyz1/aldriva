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

type FundraiserCardProps = {
  title: string;
  raised: number;
  goal: number;
  image?: string | null;
  slug: string;
  donorCount?: number;
  daysLeft?: number | null;
  featured?: boolean;
  category?: string | null;
  organizer?: string | null;
  /** Who the fundraiser helps. Shown as a second attribution line where the
   *  card has room; falls back to organizer-only when absent. */
  beneficiaryName?: string | null;
  /** Suppresses the "for …" line for self-beneficiary campaigns, where the
   *  beneficiary is the organizer and the line carries no new information. */
  beneficiaryType?: string | null;
};

export default function FundraiserCard({
  title,
  raised,
  goal,
  image,
  slug,
  donorCount,
  daysLeft,
  featured = false,
  category,
  organizer,
  beneficiaryName,
  beneficiaryType,
}: FundraiserCardProps) {
  const [imgError, setImgError] = useState(false);
  const progress = calculateFundraisingPercentage(raised, goal);
  const imageSrc = !imgError ? safeImageSrc(image) : null;

  return (
    <Link href={`/fundraisers/${slug}`}>
      <article
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
          featured ? "border-brand-200 ring-1 ring-brand-100" : "border-zinc-200"
        )}
      >
        <div className="relative h-44 w-full overflow-hidden bg-zinc-100 sm:h-52">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
          {category && !featured && (
            <span className="absolute left-3 top-3 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-700 shadow-sm">
              {category}
            </span>
          )}
          {daysLeft !== null && daysLeft !== undefined && daysLeft >= 0 && (
            <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
              {daysLeft === 0 ? "Ends today" : `${daysLeft} days left`}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <h3 className="line-clamp-2 text-base font-black leading-snug text-zinc-950 sm:text-lg">{title}</h3>
          {/* Organizer then beneficiary, each on its own line so neither gets
              truncated into the other. The beneficiary line is suppressed when
              it would just repeat the organizer (self-beneficiary). */}
          {organizer && (
            <p className="mt-1 truncate text-xs font-semibold text-zinc-500">
              by {organizer}
            </p>
          )}
          {beneficiaryName && beneficiaryType !== "self" && (
            <p className="truncate text-xs font-semibold text-zinc-500">
              for <span className="text-zinc-700">{beneficiaryName}</span>
            </p>
          )}

          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <p className="text-sm font-semibold text-zinc-600 truncate">
                <span className="font-black text-zinc-950">${raised.toLocaleString()}</span> raised of ${goal.toLocaleString()}
              </p>
              <span className="shrink-0 text-xs font-black text-zinc-950">{progress}%</span>
            </div>
            <ProgressBar percentage={progress} height={8} />
            {donorCount !== undefined && donorCount > 0 && (
              <div className="mt-2 flex items-center justify-end text-xs font-semibold text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {donorCount} donors
                </span>
              </div>
            )}
          </div>

          <span className="mt-4 block w-full rounded-xl bg-brand-700 py-2.5 text-center text-sm font-black text-white transition group-hover:bg-brand-800">
            Donate now
          </span>
        </div>
      </article>
    </Link>
  );
}
