"use client";

import { cn } from "@/lib/utils";

const BADGE_STYLES: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-700",
  top: "bg-violet-100 text-violet-700",
  revenue: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-600",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-600",
};

const BADGE_LABELS: Record<string, string> = {
  verified: "Verified Organization",
  top: "Top Organization",
  revenue: "High Revenue",
  suspended: "Suspended",
  pending: "Pending",
  rejected: "Rejected",
};

export function ModerationBadge({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
        BADGE_STYLES[type] ?? "bg-zinc-100 text-zinc-600",
        className
      )}
    >
      {BADGE_LABELS[type] ?? type}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    verified: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-600",
    suspended: "bg-zinc-200 text-zinc-600",
    active: "bg-emerald-100 text-emerald-700",
    approved: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-black uppercase",
        styles[status] ?? "bg-zinc-100 text-zinc-600",
        className
      )}
    >
      {status}
    </span>
  );
}

export function RoleBadge({
  role,
  className,
}: {
  role: string;
  className?: string;
}) {
  const styles: Record<string, string> = {
    admin: "bg-violet-100 text-violet-700",
    organizer: "bg-orange-100 text-orange-700",
    user: "bg-zinc-100 text-zinc-600",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-black uppercase",
        styles[role] ?? styles.user,
        className
      )}
    >
      {role}
    </span>
  );
}

export function getOrganizerBadges(row: {
  status: string;
  event_count: number;
  revenue: number;
}): string[] {
  const badges: string[] = [];
  if (row.status === "verified") badges.push("verified");
  if (row.status === "suspended") badges.push("suspended");
  if (row.status === "rejected") badges.push("rejected");
  if (row.status === "pending") badges.push("pending");
  if (row.event_count >= 10) badges.push("top");
  if (row.revenue >= 10000) badges.push("revenue");
  return [...new Set(badges)];
}
