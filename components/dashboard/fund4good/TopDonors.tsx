"use client";

import { memo } from "react";
import {
  formatCurrency,
  getDonorInitials,
  tierColors,
  tierLabels,
  type TopDonor,
} from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import { Medal } from "lucide-react";
import { EmptyState } from "./EmptyState";

interface TopDonorsProps {
  donors?: TopDonor[];
  className?: string;
}

const rankColors = ["text-amber-500", "text-slate-400", "text-amber-700"];

export const TopDonors = memo(function TopDonors({ donors = [], className }: TopDonorsProps) {
  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Medal className="h-4 w-4 text-amber-500" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Top Donors</h2>
      </div>

      {/* Donor List */}
      {donors.length === 0 ? (
        <EmptyState
          icon={Medal}
          title="No donors yet"
          description="Your top supporters will be ranked here once donations start coming in."
        />
      ) : (
        <ul className="divide-y divide-slate-50 px-2 py-2" role="list" aria-label="Top donors">
          {donors.map((donor, idx) => (
            <DonorRow key={donor.id} donor={donor} rank={idx + 1} rankColorClass={rankColors[idx] ?? "text-slate-300"} />
          ))}
        </ul>
      )}
    </div>
  );
});

function DonorRow({
  donor,
  rank,
  rankColorClass,
}: {
  donor: TopDonor;
  rank: number;
  rankColorClass: string;
}) {
  const initials = getDonorInitials(donor.name);

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-slate-50">
      {/* Rank */}
      <span
        className={cn("w-5 flex-shrink-0 text-center text-xs font-bold", rankColorClass)}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>

      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          donor.isAnonymous
            ? "bg-slate-100 text-slate-400"
            : "bg-indigo-100 text-indigo-700"
        )}
        aria-hidden
      >
        {initials}
      </div>

      {/* Name + Donations */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold text-slate-900 truncate">
          {donor.isAnonymous ? "Anonymous" : donor.name}
        </span>
        <span className="text-xs text-slate-400">
          {donor.donationCount} {donor.donationCount === 1 ? "donation" : "donations"}
        </span>
      </div>

      {/* Amount + Tier */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-sm font-bold text-slate-900 tabular-nums">
          {formatCurrency(donor.totalGiven, donor.currency)}
        </span>
        <span
          className={cn(
            "rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
            tierColors[donor.tier]
          )}
        >
          {tierLabels[donor.tier]}
        </span>
      </div>
    </li>
  );
}
