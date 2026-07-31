"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardStatsCards from "@/components/dashboard/DashboardStatsCards";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardTableCard from "@/components/dashboard/DashboardTableCard";
import DashboardDrawer from "@/components/dashboard/DashboardDrawer";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";
import { formatAdminMoney } from "@/lib/admin-query";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { useDashboardExport } from "@/hooks/use-dashboard-export";
import type {
  DashboardDonationDetail,
  DashboardDonationRow,
  DashboardDonationStats,
} from "@/types/dashboard-management";

const statusBadge: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-600",
};

function formatDonationDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type CampaignOption = { id: string; title: string };

function DonationsClientInner() {
  const { page, perPage, search, updateParams, getParam, buildQueryString } = useDashboardParams();
  const { exporting, exportCsv } = useDashboardExport();

  const campaign = getParam("campaign");
  const status = getParam("status");
  const date = getParam("date");
  const sort = getParam("sort", "newest");

  const [rows, setRows] = useState<DashboardDonationRow[]>([]);
  const [stats, setStats] = useState<DashboardDonationStats | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerItem, setDrawerItem] = useState<DashboardDonationDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryString = useMemo(
    () =>
      buildQueryString({
        campaign: campaign !== "all" ? campaign : undefined,
        status: status !== "all" ? status : undefined,
        date: date !== "all" ? date : undefined,
        sort: sort !== "newest" ? sort : undefined,
      }),
    [buildQueryString, campaign, status, date, sort]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/donations?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load donations.");
      setRows(data.donations ?? []);
      setStats(data.stats ?? null);
      setCampaigns(data.campaigns ?? []);
      setTotalCount(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load donations.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function openDrawer(id: string) {
    setDrawerLoading(true);
    setDrawerItem(null);
    try {
      const res = await fetch(`/api/dashboard/donations/${id}`);
      const data = await res.json();
      if (res.ok) setDrawerItem(data.donation ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleExport() {
    const params = new URLSearchParams(queryString);
    params.delete("page");
    params.delete("per_page");
    const ok = await exportCsv(`/api/dashboard/donations/export?${params}`, "donations-export.csv");
    if (!ok) setError("Failed to export CSV.");
  }

  const statItems = stats
    ? [
        { label: "Total Raised", value: formatAdminMoney(stats.total_raised) },
        { label: "Donations", value: stats.donations },
        { label: "Average Gift", value: formatAdminMoney(stats.average_gift) },
        { label: "Largest Gift", value: formatAdminMoney(stats.largest_gift) },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardPageHeader title="Donations" description="All donations received across your fundraising campaigns." />

      {stats && <DashboardStatsCards items={statItems} className="sm:grid-cols-2 lg:grid-cols-4" />}

      <DashboardToolbar
        search={search}
        searchPlaceholder="Search donor..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        filters={[
          {
            id: "campaign",
            label: "Campaign",
            value: campaign,
            options: [
              { value: "all", label: "All Campaigns" },
              ...campaigns.map((c) => ({ value: c.id, label: c.title })),
            ],
            onChange: (v) => updateParams({ campaign: v === "all" ? null : v }),
          },
          {
            id: "date",
            label: "Date Range",
            value: date,
            options: [
              { value: "all", label: "All Time" },
              { value: "today", label: "Today" },
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" },
              { value: "year", label: "This Year" },
            ],
            onChange: (v) => updateParams({ date: v === "all" ? null : v }),
          },
          {
            id: "status",
            label: "Status",
            value: status,
            options: [
              { value: "all", label: "All Statuses" },
              { value: "succeeded", label: "Succeeded" },
              { value: "completed", label: "Completed" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Failed" },
            ],
            onChange: (v) => updateParams({ status: v === "all" ? null : v }),
          },
        ]}
        sort={{
          id: "sort",
          label: "Sort",
          value: sort,
          options: [
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "amount_high", label: "Amount: High to Low" },
            { value: "amount_low", label: "Amount: Low to High" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        onExport={handleExport}
        exporting={exporting}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div>
      )}

      <DashboardTableCard
        loading={loading}
        page={page}
        totalPages={totalPages}
        perPage={perPage}
        total={totalCount}
        onPageChange={(p) => updateParams({ page: String(p) })}
        onPerPageChange={(n) => updateParams({ per_page: String(n), page: "1" })}
        isEmpty={rows.length === 0}
        empty={
          <DashboardEmptyState
            title="No donations yet"
            description="Share your fundraiser links to start collecting donations."
            actionLabel="View Fundraisers"
            actionHref="/dashboard/fundraisers"
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="py-3 pr-4 pl-4">Donor</th>
                <th className="py-3 pr-4">Campaign</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer hover:bg-zinc-50/70" onClick={() => openDrawer(row.id)}>
                  <td className="py-3 pr-4 pl-4">
                    <p className="font-black text-zinc-900">{row.donor_name}</p>
                    {row.donor_email && <p className="text-xs text-zinc-500">{row.donor_email}</p>}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600">
                    {row.campaign_slug ? (
                      <Link href={`/fundraisers/${row.campaign_slug}`} onClick={(e) => e.stopPropagation()} className="hover:text-violet-700 hover:underline">
                        {row.campaign_title}
                      </Link>
                    ) : row.campaign_title}
                  </td>
                  <td className="py-3 pr-4 font-black text-emerald-700">{formatAdminMoney(row.amount)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge[row.status] ?? statusBadge.pending}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{formatDonationDateTime(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardTableCard>

      <DashboardDrawer
        open={drawerItem !== null || drawerLoading}
        onClose={() => { setDrawerItem(null); setDrawerLoading(false); }}
        title={drawerItem?.donor_name ?? "Donation"}
        subtitle={drawerItem ? formatAdminMoney(drawerItem.amount) : undefined}
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
        ) : drawerItem ? (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3">
              {[
                ["Campaign", drawerItem.campaign_title],
                ["Amount", formatAdminMoney(drawerItem.amount)],
                ["Status", drawerItem.status],
                ["Date", formatDonationDateTime(drawerItem.created_at)],
                ["Email", drawerItem.donor_email || "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-black capitalize text-zinc-950">{value}</p>
                </div>
              ))}
            </section>
            {drawerItem.message && (
              <section>
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Message</h3>
                <p className="mt-2 text-sm font-semibold text-zinc-700">{drawerItem.message}</p>
              </section>
            )}
          </div>
        ) : null}
      </DashboardDrawer>
    </div>
  );
}

export default function DonationsClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
      <DonationsClientInner />
    </Suspense>
  );
}
