import Link from "next/link";
import Image from "next/image";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeImageSrc } from "@/lib/image-url";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type FundraiserCardProps = {
  title: string;
  raised: number;
  goal: number;
  image: string;
  slug: string;
  donorCount?: number;
  daysLeft?: number | null;
  featured?: boolean;
  category?: string | null;
  organizer?: string | null;
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
}: FundraiserCardProps) {
  const progress = goal ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  const imageSrc = safeImageSrc(image);

  return (
    <Link href={`/fundraisers/${slug}`}>
      <article
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
          featured ? "border-emerald-200 ring-1 ring-emerald-100" : "border-zinc-200"
        )}
      >
        <div className="relative h-44 w-full bg-gradient-to-br from-emerald-50 via-teal-50 to-zinc-100 sm:h-52">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <LocalBrandedPlaceholder
              variant="fundraiser"
              label={category || "Fundraiser"}
              className="absolute inset-0 from-transparent to-transparent p-4 text-center text-emerald-700/80"
              iconClassName="h-10 w-10 text-emerald-400/80 mb-1"
            />
          )}
          {featured && (
            <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
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
          {organizer && (
            <p className="mt-1 truncate text-xs font-semibold text-zinc-500">
              by {organizer}
            </p>
          )}

          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-lg font-black text-emerald-700">${raised.toLocaleString()}</p>
              <p className="text-xs font-semibold text-zinc-500">of ${goal.toLocaleString()}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-bold text-zinc-500">
              <span>{progress}% funded</span>
              {donorCount !== undefined && donorCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {donorCount} donors
                </span>
              )}
            </div>
          </div>

          <span className="mt-4 block w-full rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-black text-white transition group-hover:bg-emerald-700">
            Donate now
          </span>
        </div>
      </article>
    </Link>
  );
}
