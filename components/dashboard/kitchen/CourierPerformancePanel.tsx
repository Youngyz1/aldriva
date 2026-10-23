"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Star, TrendingUp, ThumbsUp, MessageSquare } from "lucide-react";
import { getCourierPerformancePanelData } from "@/lib/actions/courier-performance-panel";
import type {
  CourierPerformanceRange,
  CourierPerformanceRow,
} from "@/lib/actions/courier-performance";

type Props = {
  organizerId: string;
  businessId: string;
};

const RANGES: Array<{ value: CourierPerformanceRange; label: "today" | "last7Days" | "last30Days" }> = [
  { value: "today", label: "today" },
  { value: "7-days", label: "last7Days" },
  { value: "30-days", label: "last30Days" },
];

function formatMedian(value: number | null, sampleCount: number, locale: string) {
  if (value === null || sampleCount < 3) return "–";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} min`;
}

function formatRating(value: number | null, count: number, locale: string) {
  if (value === null || count === 0) return "–";
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} ★`;
}

export function CourierPerformancePanel({ organizerId, businessId }: Props) {
  const t = useTranslations("Organizer.courierPerformance") as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const locale = useLocale();
  const [range, setRange] = useState<CourierPerformanceRange>("7-days");
  const [retryCount, setRetryCount] = useState(0);
  const [displayed, setDisplayed] = useState<{
    range: CourierPerformanceRange;
    rows: CourierPerformanceRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const displayedRange = displayed
    ? RANGES.find((option) => option.value === displayed.range)
    : undefined;
  const showingPreviousRange = Boolean(
    loading && displayed && displayed.range !== range,
  );

  useEffect(() => {
    let currentRequest = true;
    setLoading(true);
    setHasError(false);

    void (async () => {
      try {
        const result = await getCourierPerformancePanelData(organizerId, businessId, range);
        if (!currentRequest) return;
        if (!result.ok) {
          setDisplayed(null);
          setHasError(true);
          return;
        }
        setDisplayed({ range, rows: result.rows });
      } catch {
        if (currentRequest) {
          setDisplayed(null);
          setHasError(true);
        }
      } finally {
        if (currentRequest) setLoading(false);
      }
    })();

    return () => {
      currentRequest = false;
    };
  }, [organizerId, businessId, range, retryCount]);

  function metricValue(value: number | null, count: number) {
    return t("medianWithOrders", {
      value: formatMedian(value, count, locale),
      count,
    });
  }

  // Calculate summary metrics across all couriers
  const rows = displayed?.rows || [];
  let totalRatingSum = 0;
  let totalRatingCount = 0;
  let totalCompletedDeliveries = 0;

  for (const r of rows) {
    totalCompletedDeliveries += r.deliveries_completed;
    if (r.average_delivery_rating !== null && r.rating_count > 0) {
      totalRatingSum += r.average_delivery_rating * r.rating_count;
      totalRatingCount += r.rating_count;
    }
  }

  const overallAvgRating = totalRatingCount > 0 ? totalRatingSum / totalRatingCount : null;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-950 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50" aria-labelledby={`courier-performance-${businessId}`}>
      {/* ── Header & Range Tabs ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id={`courier-performance-${businessId}`} className="text-base font-bold text-zinc-950 dark:text-white">
            {t("title")}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {t("description")}
          </p>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label={t("dateRanges")}>
          {RANGES.map((option) => {
            const selected = range === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setRange(option.value)}
                className={`min-h-9 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  selected
                    ? "bg-orange-700 text-white shadow-2xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Help / Time Note ────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>{t("timeNote")} {t("creditNote")}</span>
        <span>•</span>
        <span>{t("medianSampleNote")}</span>
      </div>

      {loading && (
        <p role="status" aria-live="polite" className="mt-4 text-xs font-medium text-zinc-400">
          {t("loading")}
        </p>
      )}

      {showingPreviousRange && displayedRange && (
        <p className="mt-3 text-xs text-zinc-500">
          {t("showingRange", { range: t(displayedRange.label) })}
        </p>
      )}

      {hasError && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">{t("error")}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-800 shadow-2xs hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-200"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {!loading && !hasError && displayed?.rows.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
          {t("empty")}
        </div>
      )}

      {/* ── Performance Table (Desktop View) ────────────────────────────── */}
      {displayed && displayed.rows.length > 0 && (
        <div className={`mt-4 space-y-4 ${showingPreviousRange ? "opacity-60" : ""}`} aria-busy={showingPreviousRange}>
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs" aria-label={t("courierList")}>
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3">Courier</th>
                  <th scope="col" className="px-4 py-3 text-center">{t("deliveriesCompleted")}</th>
                  <th scope="col" className="px-4 py-3">{t("fullDeliveryTime")}</th>
                  <th scope="col" className="px-4 py-3">{t("transitTime")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("customerRating")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                {displayed.rows.map((courier) => (
                  <tr key={courier.courier_worker_id} data-courier-row className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400 flex items-center justify-center font-bold text-xs shrink-0">
                          {courier.courier_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p data-courier-name className="font-bold text-zinc-900 dark:text-zinc-100">
                            {courier.courier_name}
                          </p>
                          <span
                            className={`inline-block text-[10px] font-semibold rounded-md px-1.5 py-0.2 mt-0.5 ${
                              courier.courier_is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                                : "bg-zinc-100 text-zinc-500 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                            }`}
                          >
                            {courier.courier_is_active ? "Active" : t("inactive")}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-center font-extrabold text-sm text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {courier.deliveries_completed}
                    </td>

                    <td className="px-4 py-3.5 font-medium text-zinc-700 dark:text-zinc-300" title={courier.ready_to_delivered_n < 3 ? t("medianHidden") : undefined}>
                      {metricValue(courier.ready_to_delivered_median_minutes, courier.ready_to_delivered_n)}
                    </td>

                    <td className="px-4 py-3.5 font-medium text-zinc-700 dark:text-zinc-300" title={courier.picked_up_to_delivered_n < 3 ? t("medianHidden") : undefined}>
                      {metricValue(courier.picked_up_to_delivered_median_minutes, courier.picked_up_to_delivered_n)}
                    </td>

                    <td className="px-4 py-3.5 text-right font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {courier.average_delivery_rating !== null && courier.rating_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 inline" />
                          <span>{formatRating(courier.average_delivery_rating, courier.rating_count, locale)}</span>
                          <span className="text-[11px] font-normal text-zinc-400">({courier.rating_count})</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Card List View ────────────────────────────────────── */}
          <div className="sm:hidden space-y-3" aria-label={t("courierList")}>
            {displayed.rows.map((courier) => (
              <article
                key={courier.courier_worker_id}
                data-courier-row
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {courier.courier_name.charAt(0).toUpperCase()}
                    </div>
                    <h4 data-courier-name className="font-bold text-zinc-950 dark:text-white">
                      {courier.courier_name}
                    </h4>
                  </div>
                  <span
                    className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 border ${
                      courier.courier_is_active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-zinc-100 text-zinc-500 border-zinc-200"
                    }`}
                  >
                    {courier.courier_is_active ? "Active" : t("inactive")}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-800">
                    <dt className="text-[10px] uppercase font-bold text-zinc-400">{t("deliveriesCompleted")}</dt>
                    <dd className="font-extrabold text-sm text-zinc-900 dark:text-white mt-0.5">
                      {courier.deliveries_completed}
                    </dd>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-800">
                    <dt className="text-[10px] uppercase font-bold text-zinc-400">{t("customerRating")}</dt>
                    <dd className="font-extrabold text-sm text-amber-600 dark:text-amber-400 mt-0.5">
                      {formatRating(courier.average_delivery_rating, courier.rating_count, locale)}
                      {courier.rating_count > 0 && (
                        <span className="text-[10px] font-normal text-zinc-400 ml-1">({courier.rating_count})</span>
                      )}
                    </dd>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-800">
                    <dt className="text-[10px] uppercase font-bold text-zinc-400">{t("fullDeliveryTime")}</dt>
                    <dd className="font-medium text-zinc-700 dark:text-zinc-300 mt-0.5" title={courier.ready_to_delivered_n < 3 ? t("medianHidden") : undefined}>
                      {metricValue(courier.ready_to_delivered_median_minutes, courier.ready_to_delivered_n)}
                    </dd>
                  </div>

                  <div className="rounded-lg bg-zinc-50 p-2 border border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-800">
                    <dt className="text-[10px] uppercase font-bold text-zinc-400">{t("transitTime")}</dt>
                    <dd className="font-medium text-zinc-700 dark:text-zinc-300 mt-0.5" title={courier.picked_up_to_delivered_n < 3 ? t("medianHidden") : undefined}>
                      {metricValue(courier.picked_up_to_delivered_median_minutes, courier.picked_up_to_delivered_n)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* ── Summary KPI Cards (Matching Design Mockup) ───────────────── */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-orange-700" />
              <span>{t("customerRatingsSummary") || "Customer Delivery Ratings"}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Overall Average Rating */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  {t("overallAverageRating") || "Overall Average Rating"}
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-black text-zinc-950 dark:text-white">
                    {overallAvgRating !== null ? overallAvgRating.toFixed(1) : "–"}
                  </span>
                  {overallAvgRating !== null && (
                    <div className="flex items-center text-amber-400">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {totalRatingCount} {totalRatingCount === 1 ? "rating" : "ratings"}
                </p>
              </div>

              {/* High Satisfaction Share */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  {t("highRatingShare") || "High Satisfaction"}
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    {totalRatingCount > 0
                      ? `${Math.round(((overallAvgRating ?? 5) / 5) * 100)}%`
                      : "–"}
                  </span>
                  <ThumbsUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Across all active couriers
                </p>
              </div>

              {/* Total Deliveries in Period */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  {t("deliveriesCompleted")}
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-black text-orange-700 dark:text-orange-400">
                    {totalCompletedDeliveries}
                  </span>
                  <MessageSquare className="w-4 h-4 text-orange-700 dark:text-orange-400" />
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Completed in {t(displayedRange?.label || "last7Days")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
