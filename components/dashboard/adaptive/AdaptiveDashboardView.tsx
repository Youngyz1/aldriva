import Link from "next/link";
import { Building2 } from "lucide-react";
import { StatCard } from "@/components/dashboard/fund4good/StatCard";
import GetStartedPromptCard from "./GetStartedPromptCard";
import OnboardingChoices from "./OnboardingChoices";
import AdaptiveActivityFeed from "./AdaptiveActivityFeed";
import AdaptiveQuickActions from "./AdaptiveQuickActions";
import OrganizationsPanel from "./OrganizationsPanel";
import type { AdaptiveDashboardData } from "@/lib/dashboard-activity";

type Organizer = { id: string; name: string; photo?: string | null };

interface AdaptiveDashboardViewProps {
  displayName: string;
  organizers: Organizer[];
  data: AdaptiveDashboardData;
}

export default function AdaptiveDashboardView({
  displayName,
  organizers,
  data,
}: AdaptiveDashboardViewProps) {
  const { activeVerticals, untouchedVerticals, activities, hasAnyActivity } = data;

  if (!hasAnyActivity) {
    return (
      <div className="space-y-6">
        <PageHeading displayName={displayName} organizerCount={organizers.length} />
        <OnboardingChoices displayName={displayName} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeading displayName={displayName} organizerCount={organizers.length} />

      {/* KPI grid — real stats, then a lower-priority "explore more" row for
          verticals this user hasn't touched yet. The row is omitted entirely
          once every vertical is active. */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {activeVerticals.map((stat) => (
            <Link key={stat.key} href={stat.href} className="block">
              <StatCard
                label={stat.label}
                value={stat.value}
                subValue={stat.subValue}
                icon={stat.icon}
                iconBg={stat.iconBg}
                iconColor={stat.iconColor}
              />
            </Link>
          ))}
        </div>

        {untouchedVerticals.length > 0 && (
          <div>
            <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Explore more
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {untouchedVerticals.map((prompt) => (
                <GetStartedPromptCard key={prompt.key} prompt={prompt} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main content (wide) + utility rail (narrow) — same split as
          event-platform's Fund4GoodDashboardView. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-6 lg:col-start-1">
          <OrganizationsPanel organizers={organizers} />
          <AdaptiveActivityFeed activities={activities} />
        </div>

        <AdaptiveQuickActions
          activeVerticals={activeVerticals}
          untouchedVerticals={untouchedVerticals}
          className="lg:col-start-2"
        />
      </div>
    </div>
  );
}

function PageHeading({
  displayName,
  organizerCount,
}: {
  displayName: string;
  organizerCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-slate-500">
        Welcome back, {displayName} ·{" "}
        {new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {organizerCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-600">
          <Building2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
          {organizerCount} {organizerCount === 1 ? "organization" : "organizations"}
        </span>
      )}
    </div>
  );
}
