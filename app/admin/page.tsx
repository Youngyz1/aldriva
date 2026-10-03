/**
 * app/admin/page.tsx
 * Admin overview — Stripe-Home-style sheet of real platform metrics.
 * Unboxed sections stream behind Suspense; the range lives in the URL so
 * the page is server-rendered and shareable.
 */

import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import RangeControls from "@/components/admin/overview/RangeControls";
import {
  overviewStrings,
  parseCompare,
  parseRange,
} from "@/components/admin/overview/strings";
import {
  AttentionSection,
  FiguresAndChartSection,
  GlanceSection,
  RecentSection,
  TopListsSection,
} from "@/components/admin/overview/sections";
import {
  AttentionSkeleton,
  FiguresSkeleton,
  GlanceSkeleton,
  RecentSkeleton,
  TopListsSkeleton,
} from "@/components/admin/overview/skeletons";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Explicit gate (F-10): do not rely solely on the layout header shortcut.
  await requireAdmin();

  const params = await searchParams;
  const range = parseRange(params.range);
  const compare = parseCompare(params.compare);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-10">
      {/* Open header — plain text with right-aligned range controls. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {overviewStrings.eyebrow}
          </p>
          <h1 className="mt-1 text-[clamp(1.875rem,1.5rem+1.5vw,2.5rem)] font-bold tracking-tight text-zinc-950">
            {overviewStrings.title}
          </h1>
          <p className="mt-1 text-sm font-medium text-zinc-500">
            {overviewStrings.subtitle}
          </p>
        </div>
        <RangeControls range={range} compare={compare} />
      </header>

      {/* Key figures and the volume chart share one data fetch so the
          chart costs no extra round-trips; they stream in together. */}
      <Suspense fallback={<FiguresSkeleton />}>
        <FiguresAndChartSection range={range} compare={compare} />
      </Suspense>

      <div className="border-t border-zinc-200 pt-10">
        <Suspense fallback={<GlanceSkeleton />}>
          <GlanceSection range={range} compare={compare} />
        </Suspense>
      </div>

      <div className="border-t border-zinc-200 pt-10">
        <Suspense fallback={<AttentionSkeleton />}>
          <AttentionSection />
        </Suspense>
      </div>

      <div className="border-t border-zinc-200 pt-10">
        <Suspense fallback={<RecentSkeleton />}>
          <RecentSection />
        </Suspense>
      </div>

      <div className="border-t border-zinc-200 pt-10">
        <Suspense fallback={<TopListsSkeleton />}>
          <TopListsSection />
        </Suspense>
      </div>
    </div>
  );
}
