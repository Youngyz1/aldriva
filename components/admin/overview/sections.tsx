/**
 * Server-rendered Overview sections. Each calls connection() so dynamic
 * admin data streams behind its Suspense boundary (see app/admin/page.tsx).
 * Unboxed by design: whitespace + 1px hairlines, no cards or shadows.
 */

import { connection } from "next/server";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { overviewStrings, type OverviewRange } from "./strings";
import {
  formatCompact,
  formatDelta,
  formatMoney,
  getAttentionQueue,
  getFiguresData,
  getGlanceData,
  getRangeBounds,
  getRecentSubmissions,
  getTopLists,
  timeAgo,
  type FigureDatum,
} from "./data";
import Sparkline from "./Sparkline";
import OverviewChart from "./OverviewChart";
import StatStrip, { type StatItem } from "../StatStrip";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-zinc-500">{children}</h2>
  );
}

const FIGURE_LABELS: Record<FigureDatum["id"], string> = {
  users: overviewStrings.newUsers,
  volume: overviewStrings.volume,
  fundraisers: overviewStrings.newFundraisers,
  events: overviewStrings.newEvents,
  organizations: overviewStrings.newOrganizations,
};

function figureDisplay(id: FigureDatum["id"], value: number, currency: string): string {
  if (id === "volume") return formatMoney(value, currency);
  return formatCompact(value);
}

function DeltaLine({ current, previous }: { current: number; previous: number }) {
  const delta = formatDelta(current, previous);
  return (
    <p
      title={delta.title}
      className={cn(
        "text-xs font-semibold tabular-nums",
        delta.tone === "up" && "text-emerald-700",
        delta.tone === "down" && "text-rose-700",
        delta.tone === "flat" && "text-zinc-400"
      )}
    >
      {delta.text}
    </p>
  );
}

/**
 * Key figures + main volume chart share one getFiguresData() call (8
 * bounded queries) so the chart costs no extra round-trips.
 */
export async function FiguresAndChartSection({
  range,
  compare,
}: {
  range: OverviewRange;
  compare: boolean;
}) {
  await connection();
  const data = await getFiguresData(range);

  const chartRows = data.volumeLabels.map((label, i) => ({
    label,
    current: data.volumeCurrent[i] ?? 0,
    previous: compare ? (data.volumePrevious[i] ?? 0) : null,
  }));
  const volumeFigure = data.figures.find((f) => f.id === "volume");
  const currency = data.volumeCurrency;
  const chartSummary = overviewStrings.chartSummary(
    formatMoney(volumeFigure?.value ?? 0, currency),
    formatMoney(volumeFigure?.prevValue ?? 0, currency)
  );
  const othersNote =
    data.volumeOthers.length > 0
      ? overviewStrings.otherCurrenciesNote(
          data.volumeOthers
            .map((m) => formatMoney(m.total, m.currency))
            .join(" · ")
        )
      : null;

  return (
    <>
      <section aria-label={overviewStrings.figuresTitle}>
        <SectionTitle>{overviewStrings.figuresTitle}</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-6 lg:grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          {data.figures.map((fig) => (
            <div key={fig.id}>
              <p className="text-[13px] font-medium text-zinc-500">
                {FIGURE_LABELS[fig.id]}
              </p>
              <p className="mt-1 text-[clamp(1.75rem,1.5rem+1vw,2.25rem)] font-bold tabular-nums tracking-tight text-zinc-950">
                {figureDisplay(fig.id, fig.value, currency)}
              </p>
              {compare && (
                <div className="mt-1">
                  <DeltaLine current={fig.value} previous={fig.prevValue} />
                </div>
              )}
              <div className="mt-2">
                <Sparkline
                  current={fig.sparkCurrent}
                  previous={fig.sparkPrevious}
                  compare={compare}
                  label={`${FIGURE_LABELS[fig.id]} trend`}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {(data.approximate || othersNote) && (
        <p className="mt-3 text-xs font-medium text-zinc-400">
          {data.approximate ? overviewStrings.approxNote : null}
          {data.approximate && othersNote ? " · " : null}
          {othersNote}
        </p>
      )}

      <section aria-label={overviewStrings.chartTitle} className="mt-10">
        <SectionTitle>{overviewStrings.chartTitle}</SectionTitle>
        <div className="mt-4">
          {chartRows.every((r) => r.current === 0) ? (
            <p className="py-16 text-center text-sm font-medium text-zinc-400">
              {overviewStrings.chartEmpty}
            </p>
          ) : (
            <OverviewChart
              data={chartRows}
              summary={chartSummary}
              compare={compare}
              currency={currency}
            />
          )}
        </div>
      </section>
    </>
  );
}

const ATTENTION_LABELS = {
  organizers: overviewStrings.pendingOrganizers,
  events: overviewStrings.pendingEvents,
  fundraisers: overviewStrings.pendingFundraisers,
  "businesses-review": overviewStrings.pendingBusinesses,
  businesses: overviewStrings.flaggedBusinesses,
  products: overviewStrings.pendingProducts,
  articles: overviewStrings.pendingArticles,
  reviews: overviewStrings.pendingReviews,
  identity: overviewStrings.pendingIdentity,
  payouts: overviewStrings.pendingPayouts,
} as const;

/** Queues whose list page has no URL filter — the link opens the full list. */
const UNFILTERED_QUEUES = new Set(["events", "reviews"]);

export async function AttentionSection() {
  await connection();
  const queue = (await getAttentionQueue()).filter((row) => row.count > 0);

  return (
    <section aria-label={overviewStrings.attentionTitle}>
      <SectionTitle>{overviewStrings.attentionTitle}</SectionTitle>
      {queue.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-zinc-500">
          {overviewStrings.attentionEmpty}
        </p>
      ) : (
        <ul className="mt-2">
          {queue.map((row) => (
            <li key={row.id} className="border-b border-zinc-200 last:border-b-0">
              <Link
                href={row.href}
                className="flex items-center gap-3 py-3"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    row.id === "businesses" ? "bg-red-600" : "bg-amber-500"
                  )}
                />
                <span className="text-sm font-medium text-zinc-700">
                  {ATTENTION_LABELS[row.id]}
                  {UNFILTERED_QUEUES.has(row.id) && (
                    <span className="text-zinc-400">
                      {" "}
                      · {overviewStrings.unfilteredHint}
                    </span>
                  )}
                  {row.id === "payouts" && (
                    <span className="text-zinc-400">
                      {" "}
                      · {overviewStrings.pendingPayoutsHint}
                    </span>
                  )}
                </span>
                <span className="ml-auto text-sm font-bold tabular-nums text-zinc-950">
                  {row.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RECENT_KINDS = overviewStrings.recentKinds;

export async function RecentSection() {
  await connection();
  const items = await getRecentSubmissions();

  return (
    <section aria-label={overviewStrings.recentTitle}>
      <SectionTitle>{overviewStrings.recentTitle}</SectionTitle>
      {items.length === 0 ? (
        <p className="mt-4 text-sm font-medium text-zinc-500">
          {overviewStrings.recentEmpty}
        </p>
      ) : (
        <ul className="mt-2">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="border-b border-zinc-200 last:border-b-0">
              <Link href={item.href} className="flex items-baseline gap-3 py-2.5">
                <span className="w-24 shrink-0 text-xs font-semibold text-zinc-400">
                  {RECENT_KINDS[item.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                  {item.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                  {timeAgo(item.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const GLANCE_LABELS = overviewStrings.glanceAreas;

export async function GlanceSection({
  range,
  compare,
}: {
  range: OverviewRange;
  compare: boolean;
}) {
  await connection();
  const bounds = getRangeBounds(range);
  const rows = await getGlanceData(bounds);

  return (
    <section aria-label={overviewStrings.glanceTitle}>
      <SectionTitle>{overviewStrings.glanceTitle}</SectionTitle>
      <div className="mt-2">
        {rows.map((row) => {
          const delta = formatDelta(row.rangeNew, row.rangePrev);
          const items: StatItem[] = [
            {
              label: overviewStrings.glanceTotal,
              value: row.total.toLocaleString("en-US"),
            },
            {
              label: overviewStrings.glanceNewInRange,
              value: (
                <span className="inline-flex items-baseline gap-1">
                  {row.rangeNew.toLocaleString("en-US")}
                  {compare && (
                    <span
                      title={delta.title}
                      className={cn(
                        delta.tone === "up" && "text-emerald-700",
                        delta.tone === "down" && "text-rose-700",
                        delta.tone === "flat" && "text-zinc-400"
                      )}
                    >
                      {delta.text}
                    </span>
                  )}
                </span>
              ),
            },
            ...row.states.map((chip) => ({
              label: chip.label,
              value: chip.value.toLocaleString("en-US"),
              ...(chip.value === 0 ? { accent: "text-zinc-400" } : {}),
            })),
          ];
          return (
            <div key={row.id} className="border-b border-zinc-200 py-3 last:border-b-0">
              <Link
                href={row.href}
                className="text-sm font-bold text-zinc-800 hover:underline"
              >
                {GLANCE_LABELS[row.id as keyof typeof GLANCE_LABELS] ?? row.id}
                <span aria-hidden="true"> →</span>
              </Link>
              <div className="mt-2">
                <StatStrip items={items} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export async function TopListsSection() {
  await connection();
  const { fundraisers, organizers } = await getTopLists();

  return (
    <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
      <section aria-label={overviewStrings.topFundraisersTitle}>
        <SectionTitle>{overviewStrings.topFundraisersTitle}</SectionTitle>
        {fundraisers.length === 0 ? (
          <p className="mt-4 text-sm font-medium text-zinc-500">
            {overviewStrings.emptyList}
          </p>
        ) : (
          <ul className="mt-2">
            {fundraisers.map((f) => (
              <li key={f.id} className="border-b border-zinc-200 last:border-b-0">
                <Link
                  href={`/admin/fundraisers/${f.id}`}
                  className="flex items-baseline gap-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                    {f.title}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-500">
                    {overviewStrings.raisedOf(
                      formatMoney(f.raised),
                      f.goal == null ? "—" : formatMoney(f.goal)
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={overviewStrings.newestOrganizersTitle}>
        <SectionTitle>{overviewStrings.newestOrganizersTitle}</SectionTitle>
        {organizers.length === 0 ? (
          <p className="mt-4 text-sm font-medium text-zinc-500">
            {overviewStrings.emptyList}
          </p>
        ) : (
          <ul className="mt-2">
            {organizers.map((o) => (
              <li key={o.id} className="border-b border-zinc-200 last:border-b-0">
                <Link href="/admin/organizers" className="flex items-baseline gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                    {o.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                    {timeAgo(o.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
