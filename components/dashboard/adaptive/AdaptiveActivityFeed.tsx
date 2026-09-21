import Link from "next/link";
import {
  Activity as ActivityIcon,
  Heart,
  Calendar,
  Newspaper,
  Store,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { getTimeAgo, type DashboardActivity, type DashboardActivityType } from "@/lib/dashboard-activity";

const ACTIVITY_META: Record<
  DashboardActivityType,
  {
    icon: typeof Heart;
    badgeLabel: string;
    badgeClass: string;
  }
> = {
  donation_received: {
    icon: Heart,
    badgeLabel: "Donation",
    badgeClass: "text-emerald-700 bg-emerald-50 border-emerald-200/60",
  },
  fundraiser_created: {
    icon: Heart,
    badgeLabel: "Fundraiser",
    badgeClass: "text-brand-700 bg-brand-50 border-brand-200/60",
  },
  event_created: {
    icon: Calendar,
    badgeLabel: "Event",
    badgeClass: "text-zinc-800 bg-zinc-100 border-zinc-200",
  },
  article_published: {
    icon: Newspaper,
    badgeLabel: "Article",
    badgeClass: "text-zinc-800 bg-zinc-100 border-zinc-200",
  },
  business_listed: {
    icon: Store,
    badgeLabel: "Business",
    badgeClass: "text-zinc-800 bg-zinc-100 border-zinc-200",
  },
  product_added: {
    icon: ShoppingBag,
    badgeLabel: "Product",
    badgeClass: "text-zinc-800 bg-zinc-100 border-zinc-200",
  },
};

export default function AdaptiveActivityFeed({
  activities,
  className,
}: {
  activities: DashboardActivity[];
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {/* Section Header */}
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-zinc-950">Recent Activity</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Real-time feed of donations, events, registrations, and published items.
          </p>
        </div>
      </div>

      {/* Open Timeline Stream (NO Enclosing Card) */}
      {activities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
          <ActivityIcon className="mx-auto h-8 w-8 text-zinc-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-zinc-700">No activity recorded yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            When donations arrive or events are created, they will stream here in real time.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-200/70 border-b border-zinc-200/70" role="list" aria-label="Recent activity">
          {activities.map((activity) => {
            const meta = ACTIVITY_META[activity.type] || ACTIVITY_META.donation_received;
            const Icon = meta.icon;

            return (
              <div
                key={activity.id}
                className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3.5 transition hover:bg-zinc-50/60 rounded-lg px-2 -mx-2"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-50">
                    <Icon className="h-4 w-4 text-zinc-700" aria-hidden />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={activity.href}
                        className="text-sm font-bold text-zinc-950 hover:text-brand-700 transition truncate"
                      >
                        {activity.title}
                      </Link>
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}
                      >
                        {meta.badgeLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-600 line-clamp-1">
                      {activity.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 sm:pl-4">
                  <span className="text-xs font-medium text-zinc-400 tabular-nums">
                    {getTimeAgo(activity.timestamp)}
                  </span>
                  <Link
                    href={activity.href}
                    className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-brand-700 group-hover:text-brand-700 transition"
                  >
                    <span>View</span>
                    <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
