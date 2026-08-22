import { CheckCircle2, Clock, AlertTriangle, TrendingUp, type LucideIcon } from "lucide-react";
import type { CampaignStatus } from "@/lib/fund4good-data";

export interface StatusMeta {
  label: string;
  emoji: string;
  icon: LucideIcon;
  color: string; // text + bg + border, for pill badges
  dot: string; // solid bg, for small status dots
}

// Single source of truth for how a campaign's status renders across the
// selector dropdown, the header badge, and the health card — keeps them from
// drifting out of sync as the status set evolves.
export const statusMeta: Record<CampaignStatus, StatusMeta> = {
  ahead: {
    label: "On Track",
    emoji: "\u{1F7E2}",
    icon: TrendingUp,
    color: "text-brand-700 bg-brand-50 border-brand-200",
    dot: "bg-brand-600",
  },
  on_track: {
    label: "On Track",
    emoji: "\u{1F7E2}",
    icon: CheckCircle2,
    color: "text-brand-700 bg-brand-50 border-brand-200",
    dot: "bg-brand-600",
  },
  behind: {
    label: "Slightly Behind",
    emoji: "\u{1F7E1}",
    icon: AlertTriangle,
    color: "text-amber-600 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  completed: {
    label: "Completed",
    emoji: "\u{1F3C6}",
    icon: CheckCircle2,
    color: "text-violet-600 bg-violet-50 border-violet-200",
    dot: "bg-violet-500",
  },
  paused: {
    label: "Paused",
    emoji: "⚪",
    icon: Clock,
    color: "text-slate-600 bg-slate-50 border-slate-200",
    dot: "bg-slate-400",
  },
};

/** "behind" with a low health score reads as critical, not just slightly off pace. */
export function getStatusMeta(status: CampaignStatus, healthScore?: number): StatusMeta {
  if (status === "behind" && typeof healthScore === "number" && healthScore < 35) {
    return {
      label: "Critical",
      emoji: "\u{1F534}",
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50 border-red-200",
      dot: "bg-red-500",
    };
  }
  return statusMeta[status];
}
