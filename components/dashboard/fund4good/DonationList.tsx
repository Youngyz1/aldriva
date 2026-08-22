"use client";

import { memo } from "react";
import Link from "next/link";
import {
  formatCurrency,
  getTimeAgo,
  getDonorInitials,
  tierColors,
  tierLabels,
  type Donation,
} from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import { Heart } from "lucide-react";
import { EmptyState } from "./EmptyState";

interface DonationListProps {
  donations?: Donation[];
  className?: string;
  showAll?: boolean;
}

export const DonationList = memo(function DonationList({
  donations = [],
  className,
  showAll = false,
}: DonationListProps) {
  const displayed = showAll ? donations : donations.slice(0, 5);

  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-rose-500" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Recent Donations</h2>
        </div>
        <Link
          href="/dashboard/donations"
          className="text-xs font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded"
        >
          View all
        </Link>
      </div>

      {/* Donation Items */}
      {displayed.length > 0 ? (
        <ul className="divide-y divide-slate-50" role="list">
          {displayed.map((donation) => (
            <DonationItem key={donation.id} donation={donation} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Heart}
          title="No donations yet"
          description="They'll show up here the moment your first gift comes in."
        />
      )}
    </div>
  );
});

function DonationItem({ donation }: { donation: Donation }) {
  const initials = getDonorInitials(donation.donorName);
  const tierClass = tierColors[donation.tier];
  const timeAgo = getTimeAgo(donation.timestamp);

  return (
    <li className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/60">
      {/* Avatar */}
      <div
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          donation.isAnonymous
            ? "bg-slate-100 border-slate-200 text-slate-400"
            : "bg-violet-100 border-violet-200 text-violet-700"
        )}
        aria-hidden
      >
        {initials}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold tracking-tight text-slate-900 truncate">
            {donation.isAnonymous ? "Anonymous" : donation.donorName}
          </span>
          <span
            className={cn(
              "rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
              tierClass
            )}
            aria-label={`${tierLabels[donation.tier]} donor`}
          >
            {tierLabels[donation.tier]}
          </span>
        </div>
        {donation.message && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mt-0.5">
            &ldquo;{donation.message}&rdquo;
          </p>
        )}
      </div>

      {/* Amount + Time */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-base font-bold tracking-tight text-slate-900 tabular-nums">
          {formatCurrency(donation.amount, donation.currency)}
        </span>
        <span className="text-xs font-medium text-slate-400">{timeAgo}</span>
      </div>
    </li>
  );
}
