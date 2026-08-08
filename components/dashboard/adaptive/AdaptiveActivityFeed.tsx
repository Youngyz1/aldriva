import { Activity as ActivityIcon } from "lucide-react";
import { EmptyState } from "@/components/dashboard/fund4good/EmptyState";
import { getActivityIconConfig, getTimeAgo, type DashboardActivity } from "@/lib/dashboard-activity";
import Link from "next/link";

/**
 * Same visual shell as event-platform's ActivityFeed (vertical connecting
 * line between icon circles, header row) but sourced from the merged,
 * cross-vertical DashboardActivity[] instead of one campaign's own feed.
 */
export default function AdaptiveActivityFeed({
  activities,
  className,
}: {
  activities: DashboardActivity[];
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white ${className ?? ""}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-4">
        <ActivityIcon className="h-4 w-4 text-slate-400" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
      </div>

      {activities.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="No activity yet"
          description="Donations, new fundraisers, events, articles, listings, and products will show up here."
        />
      ) : (
        <ul className="space-y-0 px-5 py-3" role="list" aria-label="Recent activity">
          {activities.map((activity, idx) => {
            const config = getActivityIconConfig(activity.type);
            const Icon = config.icon;
            const isLast = idx === activities.length - 1;

            return (
              <li key={activity.id} className="relative flex gap-3">
                {!isLast && (
                  <div className="absolute bottom-0 left-[18px] top-9 w-px bg-slate-100" aria-hidden />
                )}
                <div
                  className={`relative z-10 mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}
                  aria-hidden
                >
                  <Icon className={`h-4 w-4 ${config.iconColor}`} />
                </div>
                <Link href={activity.href} className="flex min-w-0 flex-col gap-0.5 pb-4 pt-1.5 hover:opacity-80">
                  <p className="text-sm font-medium leading-snug text-slate-900">{activity.title}</p>
                  <p className="text-xs leading-relaxed text-slate-500">{activity.description}</p>
                  <span className="mt-1 text-xs text-slate-400">{getTimeAgo(activity.timestamp)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
