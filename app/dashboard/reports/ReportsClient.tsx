"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardStatsCards from "@/components/dashboard/DashboardStatsCards";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardExportButton from "@/components/dashboard/DashboardExportButton";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { useDashboardExport } from "@/hooks/use-dashboard-export";
import {
  ChartsGrid,
  type DailyPoint,
  type NamedValue,
  type TopEvent,
} from "./DashboardCharts";

type ReportsPayload = {
  stats: { tickets: number; revenue: number; donations: number };
  tickets: DailyPoint[];
  revenue: DailyPoint[];
  donations: DailyPoint[];
  topEvents: TopEvent[];
  revenueByEvent: NamedValue[];
  ticketsByEvent: NamedValue[];
  donationsByCampaign: NamedValue[];
  topOrganizers: NamedValue[];
};

function ReportsClientInner() {
  const { getParam, updateParams } = useDashboardParams();
  const { exporting, exportCsv } = useDashboardExport();

  const range = getParam("range", "30");
  const customFrom = getParam("from", "");
  const customTo = getParam("to", "");

  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("range", range);
    if (range === "custom" && customFrom) params.set("from", customFrom);
    if (range === "custom" && customTo) params.set("to", customTo);
    return params.toString();
  }, [range, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/reports?${queryString}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load reports.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function exportReport(format: "csv" | "pdf" | "xlsx") {
    const ok = await exportCsv(
      `/api/dashboard/reports/export?${queryString}&format=${format}`,
      `reports-export.${format === "xlsx" ? "csv" : format}`
    );
    if (!ok) setError(`Failed to export ${format.toUpperCase()}.`);
  }

  const statItems = data
    ? [
        { label: "Tickets Sold", value: data.stats.tickets },
        { label: "Ticket Revenue", value: `$${data.stats.revenue.toLocaleString()}` },
        { label: "Donations", value: `$${data.stats.donations.toLocaleString()}` },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardPageHeader
        title="Reports"
        description="Performance analytics scoped to your organizer account."
      />

      <DashboardToolbar
        showSearch={false}
        search=""
        searchPlaceholder=""
        onSearchChange={() => {}}
        filters={[
          {
            id: "range",
            label: "Date Range",
            value: range,
            options: [
              { value: "7", label: "7 Days" },
              { value: "30", label: "30 Days" },
              { value: "90", label: "90 Days" },
              { value: "365", label: "Year" },
              { value: "custom", label: "Custom" },
            ],
            onChange: (v) => updateParams({ range: v === "30" ? null : v }),
          },
        ]}
        trailing={
          range === "custom" ? (
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => updateParams({ from: e.target.value || null })}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => updateParams({ to: e.target.value || null })}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold"
              />
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <DashboardExportButton onExport={() => exportReport("pdf")} exporting={exporting} label="Export PDF" />
        <DashboardExportButton onExport={() => exportReport("csv")} exporting={exporting} label="Export CSV" />
        <DashboardExportButton onExport={() => exportReport("xlsx")} exporting={exporting} label="Export Excel" />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      ) : data ? (
        <>
          <DashboardStatsCards items={statItems} className="sm:grid-cols-3" />
          <ChartsGrid
            tickets={data.tickets}
            revenue={data.revenue}
            donations={data.donations}
            topEvents={data.topEvents}
            revenueByEvent={data.revenueByEvent}
            ticketsByEvent={data.ticketsByEvent}
            donationsByCampaign={data.donationsByCampaign}
            topOrganizers={data.topOrganizers}
          />
        </>
      ) : null}
    </div>
  );
}

export default function ReportsClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
      <ReportsClientInner />
    </Suspense>
  );
}
