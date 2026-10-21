"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getCookPerformancePanelData } from "@/lib/actions/cook-performance-panel";
import type {
  CookPerformanceRange,
  CookPerformanceRow,
} from "@/lib/actions/cook-performance";

type Props = {
  organizerId: string;
  businessId: string;
};

const RANGES: Array<{ value: CookPerformanceRange; label: "today" | "last7Days" | "last30Days" }> = [
  { value: "today", label: "today" },
  { value: "7-days", label: "last7Days" },
  { value: "30-days", label: "last30Days" },
];

function formatMedian(value: number | null, sampleCount: number, locale: string) {
  if (value === null || sampleCount < 3) return "–";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} min`;
}

export function CookPerformancePanel({ organizerId, businessId }: Props) {
  const t = useTranslations("Organizer.cookPerformance") as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const locale = useLocale();
  const [range, setRange] = useState<CookPerformanceRange>("7-days");
  const [retryCount, setRetryCount] = useState(0);
  const [displayed, setDisplayed] = useState<{
    range: CookPerformanceRange;
    rows: CookPerformanceRow[];
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
        const result = await getCookPerformancePanelData(organizerId, businessId, range);
        if (!currentRequest) return;
        if (!result.ok) {
          setDisplayed(null);
          setHasError(true);
          return;
        }
        // Keep the prior period visible while the next range loads; replace it
        // only after a successful response. The loader preserves function order.
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

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5" aria-labelledby={`cook-performance-${businessId}`}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id={`cook-performance-${businessId}`} className="text-base font-semibold">{t("title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t("dateRanges")}>
          {RANGES.map((option) => {
            const selected = range === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setRange(option.value)}
                className={`min-h-10 whitespace-nowrap rounded-xl border border-input px-3 py-2 text-sm font-medium transition ${selected ? "bg-secondary text-secondary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
      </header>

      <p className="mt-3 text-xs text-muted-foreground">
        {t("timeNote")} {t("creditNote")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t("medianSampleNote")}</p>

      {loading && <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>}

      {showingPreviousRange && displayedRange && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("showingRange", { range: t(displayedRange.label) })}
        </p>
      )}

      {hasError && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
          <p className="text-sm">{t("error")}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="min-h-10 rounded-xl border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {!loading && !hasError && displayed?.rows.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
      )}

      {displayed && displayed.rows.length > 0 && (
        <div
          className={`mt-4 space-y-3 ${showingPreviousRange ? "opacity-60" : ""}`}
          aria-label={t("cookList")}
          aria-busy={showingPreviousRange}
        >
          {displayed.rows.map((cook) => (
            <article
              key={cook.cook_worker_id}
              data-cook-row
              className="rounded-xl border border-border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h4 data-cook-name className="font-semibold">{cook.cook_name}</h4>
                {!cook.cook_is_active && (
                  <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {t("inactive")}
                  </span>
                )}
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("ordersHandled")}</dt>
                  <dd className="mt-1 font-medium">{cook.orders_handled}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("waitBeforeStarting")}</dt>
                  <dd className="mt-1 font-medium" title={cook.accepted_to_preparing_n < 3 ? t("medianHidden") : undefined}>
                    {metricValue(cook.accepted_to_preparing_median_minutes, cook.accepted_to_preparing_n)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("prepTime")}</dt>
                  <dd className="mt-1 font-medium" title={cook.preparing_to_ready_n < 3 ? t("medianHidden") : undefined}>
                    {metricValue(cook.preparing_to_ready_median_minutes, cook.preparing_to_ready_n)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
