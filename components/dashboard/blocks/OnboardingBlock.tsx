import Link from "next/link";
import {
  IconCalendar as Calendar,
  IconHeart as Heart,
  IconBuilding as Building2,
  IconBuildingStore as Store,
  IconArrowRight as ArrowRight,
  IconSparkles as Sparkles,
} from "@tabler/icons-react";

interface OnboardingBlockProps {
  displayName: string;
}

const ONBOARDING_STARTERS = [
  {
    title: "Host an Event",
    description: "Sell tickets, track RSVPs, or design digital invitations",
    href: "/dashboard/events/new",
    icon: Calendar,
  },
  {
    title: "Start a Campaign",
    description: "Raise donations for a personal cause or nonprofit project",
    href: "/create-fundraiser",
    icon: Heart,
  },
  {
    title: "Create an Organization",
    description: "Set up a shared team workspace for staff and operations",
    href: "/create-organizer",
    icon: Building2,
  },
  {
    title: "List a Business",
    description: "Launch online orders, table bookings, or retail products",
    href: "/dashboard/businesses/new",
    icon: Store,
  },
];

export function OnboardingBlock({ displayName }: OnboardingBlockProps) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-6 sm:p-8 shadow-xs">
      <div className="max-w-xl">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-xl font-black tracking-tight text-zinc-950 sm:text-2xl">
          Welcome to Aldriva, {displayName}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 leading-relaxed">
          Your account is ready. Choose what you want to launch first, and your dashboard will automatically adapt to show your workspaces, events, and metrics.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ONBOARDING_STARTERS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              href={item.href}
              className="group flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/50 p-4 transition hover:border-orange-300 hover:bg-white hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition group-hover:border-orange-200 group-hover:text-orange-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-zinc-900 group-hover:text-orange-700 transition">
                    {item.title}
                  </h3>
                  <p className="text-xs text-zinc-500 line-clamp-1">{item.description}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-orange-600 transition" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
