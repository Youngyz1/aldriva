"use client";

import { memo } from "react";
import {
  type Activity,
  getTimeAgo,
} from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import {
  Heart,
  Megaphone,
  Share2,
  Trophy,
  CircleDollarSign,
  Flag,
  Activity as ActivityIcon,
  MessageCircle,
  UserPlus,
} from "lucide-react";
import { EmptyState } from "./EmptyState";

const activityConfig = {
  donation: {
    icon: Heart,
    iconBg: "bg-rose-50",
    iconColor: "text-rose-500",
  },
  update_posted: {
    icon: Megaphone,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  share: {
    icon: Share2,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
  },
  milestone: {
    icon: Trophy,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  withdrawal: {
    icon: CircleDollarSign,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-700",
  },
  campaign_started: {
    icon: Flag,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  comment: {
    icon: MessageCircle,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  follow: {
    icon: UserPlus,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
  },
};

interface ActivityFeedProps {
  activities?: Activity[];
  className?: string;
}

export const ActivityFeed = memo(function ActivityFeed({ activities = [], className }: ActivityFeedProps) {
  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <ActivityIcon className="h-4 w-4 text-slate-400" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
        </div>
      </div>

      {/* Timeline List */}
      {activities.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          description="Donations, updates, comments, and new followers will show up here."
        />
      ) : (
      <ul className="px-5 py-3 space-y-0" role="list" aria-label="Campaign activity feed">
        {activities.map((activity, idx) => {
          const config = activityConfig[activity.type];
          const Icon = config.icon;
          const isLast = idx === activities.length - 1;

          return (
            <li key={activity.id} className="flex gap-3 relative">
              {/* Vertical line */}
              {!isLast && (
                <div
                  className="absolute left-[18px] top-9 bottom-0 w-px bg-slate-100"
                  aria-hidden
                />
              )}

              {/* Icon */}
              <div
                className={cn(
                  "relative z-10 mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                  config.iconBg
                )}
                aria-hidden
              >
                <Icon className={cn("h-4 w-4", config.iconColor)} />
              </div>

              {/* Content */}
              <div className="flex flex-col gap-0.5 pb-4 pt-1.5 min-w-0">
                <p className="text-sm font-medium text-slate-900 leading-snug">
                  {activity.title}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {activity.description}
                </p>
                <span className="text-xs text-slate-400 mt-1">
                  {getTimeAgo(activity.timestamp)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
});
