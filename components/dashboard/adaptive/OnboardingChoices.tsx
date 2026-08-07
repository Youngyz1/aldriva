import Link from "next/link";
import { VERTICAL_CONFIG } from "@/lib/dashboard-activity";

const DESCRIPTIONS: Record<keyof typeof VERTICAL_CONFIG, string> = {
  fundraisers: "Raise money for a cause",
  events: "Sell tickets, organize an event",
  articles: "Share a story with the community",
  businesses: "Get discovered by local customers",
  products: "Sell physical or digital goods",
};

/**
 * Replaces the KPI grid + two-column body entirely for a brand-new user —
 * a focused onboarding choice, not a dashboard full of empty-state cards.
 * Each tile uses the SAME color its vertical will get once it becomes a
 * real StatCard, so there's visual continuity between onboarding and the
 * active dashboard.
 */
export default function OnboardingChoices({ displayName }: { displayName: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
        Welcome to Aldriva, {displayName}
      </h1>
      <p className="mt-2 text-sm font-medium text-zinc-500">
        Pick where you&apos;d like to start — you can always add more later.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(VERTICAL_CONFIG).map((vertical) => {
          const Icon = vertical.icon;
          return (
            <Link
              key={vertical.key}
              href={vertical.createHref}
              className="group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-brand-300 hover:shadow-md"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${vertical.iconBg} ${vertical.iconColor}`}
              >
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-base font-black text-zinc-950">{vertical.label}</p>
                <p className="mt-0.5 text-sm text-zinc-500">{DESCRIPTIONS[vertical.key]}</p>
              </div>
              <p className="mt-auto text-sm font-semibold text-brand-700 group-hover:text-brand-800">
                {vertical.createCta} →
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
