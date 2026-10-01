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
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";
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
  const mode = getParam("mode");

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
        mode: mode ? mode : undefined,
      }),
    [buildQueryString, campaign, status, date, sort, mode]
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
        { label: "Total Amount", value: formatAdminMoney(stats.total_raised) },
        { label: "Donations", value: stats.donations },
        { label: "Average Gift", value: formatAdminMoney(stats.average_gift) },
        { label: "Largest Gift", value: formatAdminMoney(stats.largest_gift) },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardPageHeader
        title="My Donations"
        description="Donation activity and contributions made on Aldriva."
      />

      {stats && <DashboardStatsCards items={statItems} className="sm:grid-cols-2 lg:grid-cols-4" />}

      <DashboardToolbar
        search={search}
        searchPlaceholder="Search campaign or donor..."
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
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
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
            title="No donations found"
            description="You haven't made any donations yet or no records matched your filter."
            actionLabel="Discover Fundraisers"
            actionHref="/fundraisers"
          />
        }
      >
        <ResponsiveDataTable
          columns={[
            { id: "donor", header: "Donor" },
            { id: "campaign", header: "Campaign" },
            { id: "amount", header: "Amount", align: "right" },
            { id: "status", header: "Status" },
            { id: "date", header: "Date", align: "right", hideBelow: "md" },
            { id: "actions", header: "Actions", align: "right" },
          ]}
        >
          {rows.map((row) => {
            const desktopCells = [
              <div key="donor">
                <button
                  type="button"
                  onClick={() => openDrawer(row.id)}
                  className="font-black text-zinc-900 hover:text-orange-600 hover:underline text-left"
                >
                  {row.donor_name || "Anonymous"}
                </button>
                {row.donor_email && <p className="text-xs text-zinc-500">{row.donor_email}</p>}
              </div>,
              <div key="campaign" className="text-zinc-600">
                {row.campaign_slug ? (
                  <Link
                    href={`/fundraisers/${row.campaign_slug}`}
                    className="font-bold text-orange-700 hover:underline"
                  >
                    {row.campaign_title}
                  </Link>
                ) : (
                  row.campaign_title
                )}
              </div>,
              <span key="amount" className="font-black text-emerald-700 tabular-nums">
                {formatAdminMoney(row.amount)}
              </span>,
              <span
                key="status"
                className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${
                  statusBadge[row.status] ?? statusBadge.pending
                }`}
              >
                {row.status}
              </span>,
              <span key="date" className="text-zinc-500">
                {formatDonationDateTime(row.created_at)}
              </span>,
              <div key="actions" className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => openDrawer(row.id)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                >
                  View
                </button>
              </div>,
            ];

            return (
              <ResponsiveDataRow
                key={row.id}
                id={row.id}
                desktopCells={desktopCells}
                identity={
                  <div>
                    <button
                      type="button"
                      onClick={() => openDrawer(row.id)}
                      className="font-bold text-zinc-950 hover:text-orange-600 text-left line-clamp-1"
                    >
                      {row.donor_name || "Anonymous Donor"}
                    </button>
                    {row.donor_email && <span className="text-xs text-zinc-400 block truncate">{row.donor_email}</span>}
                  </div>
                }
                primaryValue={
                  <span className="font-extrabold text-emerald-700 tabular-nums">
                    {formatAdminMoney(row.amount)}
                  </span>
                }
                state={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                      statusBadge[row.status] ?? statusBadge.pending
                    }`}
                  >
                    {row.status}
                  </span>
                }
                secondary={[
                  row.campaign_title,
                  formatDonationDateTime(row.created_at),
                ].filter(Boolean)}
                expandedDetails={
                  <div className="space-y-2 py-1 text-xs text-zinc-600">
                    <div>
                      <span className="font-bold text-zinc-500">Campaign:</span>{" "}
                      {row.campaign_slug ? (
                        <Link href={`/fundraisers/${row.campaign_slug}`} className="font-bold text-orange-700 hover:underline">
                          {row.campaign_title}
                        </Link>
                      ) : (
                        row.campaign_title
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-zinc-500">Donation Date:</span> {formatDonationDateTime(row.created_at)}
                    </div>
                    {row.donor_email && (
                      <div>
                        <span className="font-bold text-zinc-500">Email:</span> {row.donor_email}
                      </div>
                    )}
                    <div className="pt-2 border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={() => openDrawer(row.id)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                      >
                        View Full Details
                      </button>
                    </div>
                  </div>
                }
              />
            );
          })}
        </ResponsiveDataTable>
      </DashboardTableCard>

      <DashboardDrawer
        open={drawerItem !== null || drawerLoading}
        onClose={() => {
          setDrawerItem(null);
          setDrawerLoading(false);
        }}
        title={drawerItem?.donor_name ?? "Donation"}
        subtitle={drawerItem ? formatAdminMoney(drawerItem.amount) : undefined}
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
          </div>
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
                <div
                  key={String(label)}
                  className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70"
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    {label}
                  </p>
                  <p className="mt-1 font-black capitalize text-zinc-950">{value}</p>
                </div>
              ))}
            </section>
            {drawerItem.message && (
              <section>
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  Message
                </h3>
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
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        </div>
      }
    >
      <DonationsClientInner />
    </Suspense>
  );
}
