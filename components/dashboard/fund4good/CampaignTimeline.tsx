"use client";

import { memo, useMemo } from "react";
import { type TimelineEvent } from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import { Flag, Trophy, Megaphone, TrendingUp, GitCommitHorizontal } from "lucide-react";
import { EmptyState } from "./EmptyState";

const eventConfig = {
  campaign_start: {
    icon: Flag,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    badge: "Launch",
    badgeClass: "bg-violet-50 text-violet-600 border-violet-200",
  },
  milestone: {
    icon: Trophy,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    badge: "Milestone",
    badgeClass: "bg-amber-50 text-amber-600 border-amber-200",
  },
  update: {
    icon: Megaphone,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    badge: "Update",
    badgeClass: "bg-sky-50 text-sky-600 border-sky-200",
  },
  donation_spike: {
    icon: TrendingUp,
    iconBg: "bg-brand-100",
    iconColor: "text-brand-700",
    badge: "Surge",
    badgeClass: "bg-brand-50 text-brand-700 border-brand-200",
  },
};

interface CampaignTimelineProps {
  events?: TimelineEvent[];
  className?: string;
}

interface MonthGroup {
  label: string;
  events: TimelineEvent[];
}

function groupByMonth(events: TimelineEvent[]): MonthGroup[] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const key = new Date(event.date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }
  return [...groups.entries()].map(([label, evts]) => ({ label, events: evts }));
}

export const CampaignTimeline = memo(function CampaignTimeline({ events = [], className }: CampaignTimelineProps) {
  const grouped = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return groupByMonth(sorted);
  }, [events]);

  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <GitCommitHorizontal className="h-4 w-4 text-slate-400" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Campaign Timeline</h2>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={GitCommitHorizontal}
          title="No timeline yet"
          description="Launch, updates, and milestones will build a timeline here as they happen."
        />
      ) : (
        <div className="px-5 py-4">
          {grouped.map((group, groupIdx) => (
            <div key={group.label} className={groupIdx > 0 ? "mt-2" : undefined}>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              <ol className="relative space-y-0" aria-label={`Timeline events in ${group.label}`}>
                {group.events.map((event, idx) => {
                  const config = eventConfig[event.type];
                  const Icon = config.icon;
                  const isLast = idx === group.events.length - 1 && groupIdx === grouped.length - 1;
                  const dateFormatted = new Date(event.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <li key={event.id} className="group relative flex gap-3">
                      {/* Line */}
                      {!isLast && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-100" aria-hidden />
                      )}

                      {/* Icon */}
                      <div
                        className={cn(
                          "relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-150 group-hover:scale-105",
                          config.iconBg
                        )}
                        aria-hidden
                      >
                        <Icon className={cn("h-3.5 w-3.5", config.iconColor)} />
                      </div>

                      {/* Content */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg px-2 pb-5 pt-1 transition-colors group-hover:bg-slate-50/70">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 break-words">{event.title}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
                              config.badgeClass
                            )}
                          >
                            {config.badge}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-500">{event.description}</p>
                        <span className="mt-0.5 text-xs text-slate-400">{dateFormatted}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
