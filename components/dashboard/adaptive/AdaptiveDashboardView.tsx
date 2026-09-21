import Link from "next/link";
import {
  Building2,
  Plus,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Heart,
  Newspaper,
  ShoppingBag,
  Store,
  ArrowRight,
} from "lucide-react";
import OnboardingChoices from "./OnboardingChoices";
import AdaptiveActivityFeed from "./AdaptiveActivityFeed";
import OrganizationsPanel from "./OrganizationsPanel";
import { Button } from "@/components/ui/button";
import { VERTICAL_CONFIG, type AdaptiveDashboardData, type VerticalStat } from "@/lib/dashboard-activity";

type Organizer = {
  id: string;
  name: string;
  photo?: string | null;
  org_type?: string | null;
  status?: string | null;
  verified_at?: string | null;
  entityRole?: string;
};

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

  if (!hasAnyActivity && organizers.length === 0) {
    return (
      <div className="space-y-10">
        <PageHeader displayName={displayName} organizerCount={organizers.length} />
        <OnboardingChoices displayName={displayName} />
      </div>
    );
  }

  // Find dominant financial metric if present (fundraising total)
  const fundraiserStat = activeVerticals.find((s) => s.key === "fundraisers");
  const nonFundraiserStats = activeVerticals.filter((s) => s.key !== "fundraisers");

  // Determine ranked primary action
  const rankedActive = [...activeVerticals].sort((a, b) => b.count - a.count);
  const primaryVertical = rankedActive.length > 0 ? rankedActive[0] : null;

  return (
    <div className="space-y-10 pb-8">
      {/* Level 1: Page Header with Identity & Top-level CTAs */}
      <PageHeader displayName={displayName} organizerCount={organizers.length} />

      {/* Level 1 Dominant: Primary Outcome & Inline Supporting Numbers (Open, Unboxed) */}
      <PrimaryOutcomeSummary
        fundraiserStat={fundraiserStat}
        otherStats={nonFundraiserStats}
      />

      {/* Main Grid: Workspaces (Left 7-8 cols) + Actions & Discovery Rail (Right 4-5 cols) */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start pt-2">
        {/* Left Column: Core Workspaces & Activity Stream */}
        <div className="space-y-10 lg:col-span-8 min-w-0">
          {/* Primary Workspaces: Your Organizations */}
          <OrganizationsPanel organizers={organizers} />

          {/* Chronological Activity Feed */}
          <AdaptiveActivityFeed activities={activities} />
        </div>

        {/* Right Column: Quick Launch Actions & Platform Growth */}
        <div className="space-y-8 lg:col-span-4 min-w-0">
          {/* Quick Launch Panel */}
          <QuickLaunchRail
            primaryVertical={primaryVertical}
            untouchedVerticals={untouchedVerticals}
          />

          {/* Protected Payments Trust Note */}
          <AccountSecurityNote />
        </div>
      </div>
    </div>
  );
}

function PageHeader({
  displayName,
  organizerCount,
}: {
  displayName: string;
  organizerCount: number;
}) {
  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 pb-6">
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
          Overview
        </h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">
          Welcome back, <span className="font-semibold text-zinc-800">{displayName}</span> · {formattedDate}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm" className="h-9 px-3.5 text-xs font-semibold">
          <Link href="/dashboard/analytics">
            <TrendingUp className="mr-1.5 h-3.5 w-3.5 text-zinc-500" />
            Analytics
          </Link>
        </Button>
        <Button asChild size="sm" className="h-9 px-4 text-xs font-bold">
          <Link href="/create-fundraiser">
            <Plus className="mr-1.5 h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </div>
    </div>
  );
}

function PrimaryOutcomeSummary({
  fundraiserStat,
  otherStats,
}: {
  fundraiserStat?: VerticalStat;
  otherStats: VerticalStat[];
}) {
  return (
    <div className="border-b border-zinc-200/80 pb-8">
      {fundraiserStat ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Total Raised
            </span>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-950 tabular-nums">
                {fundraiserStat.value}
              </span>
              <span className="text-sm font-medium text-zinc-500">
                {fundraiserStat.subValue || "Across active fundraisers"}
              </span>
            </div>
          </div>

          <Link
            href={fundraiserStat.href}
            className="inline-flex items-center text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            View campaign performance <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Account Status
          </span>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
            Active Workspace Operations
          </h2>
        </div>
      )}

      {/* Inline Supporting Numbers (Clean text metadata, NO metric boxes) */}
      {otherStats.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600">
          {otherStats.map((stat, idx) => (
            <div key={stat.key} className="flex items-center gap-2">
              <Link
                href={stat.href}
                className="group inline-flex items-center gap-1.5 font-medium hover:text-brand-700 transition"
              >
                <span className="font-bold text-zinc-950 group-hover:text-brand-700 tabular-nums">
                  {stat.value}
                </span>
                <span>{stat.label}</span>
              </Link>
              {idx < otherStats.length - 1 && (
                <span className="text-zinc-300 select-none" aria-hidden>
                  ·
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickLaunchRail({
  primaryVertical,
  untouchedVerticals,
}: {
  primaryVertical: VerticalStat | null;
  untouchedVerticals: Array<{ key: string; label: string; cta: string; href: string }>;
}) {
  const primaryConfig = primaryVertical
    ? VERTICAL_CONFIG[primaryVertical.key]
    : VERTICAL_CONFIG.fundraisers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-950">
          Quick Actions
        </h3>
      </div>

      <div className="space-y-2.5">
        {/* Dominant Primary Action */}
        <Button asChild className="w-full justify-between h-11 px-4 text-sm font-bold shadow-xs">
          <Link href={primaryConfig.createHref}>
            <span>+ {primaryConfig.createAgainCta}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        {/* Secondary Action Links */}
        <div className="grid grid-cols-1 gap-1.5 pt-1">
          {Object.values(VERTICAL_CONFIG)
            .filter((v) => v.key !== primaryConfig.key)
            .map((vertical) => (
              <Link
                key={vertical.key}
                href={vertical.createHref}
                className="group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 transition"
              >
                <span>+ {vertical.createCta}</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}

function AccountSecurityNote() {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
        <div className="text-xs leading-relaxed text-zinc-600 min-w-0">
          <p className="font-bold text-zinc-950">Protected Payouts &amp; Identity</p>
          <p className="mt-0.5 text-zinc-500">
            Card and crypto transactions are verified through Aldriva Payment Rails.
          </p>
          <div className="mt-2.5 flex items-center gap-3 text-xs font-semibold">
            <Link href="/dashboard/settings" className="text-brand-700 hover:underline">
              Settings
            </Link>
            <span className="text-zinc-300">·</span>
            <Link href="/dashboard/finance/payouts" className="text-brand-700 hover:underline">
              Payouts
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
