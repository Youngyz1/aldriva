"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Loader2 } from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardStatsCards from "@/components/dashboard/DashboardStatsCards";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardTableCard from "@/components/dashboard/DashboardTableCard";
import DashboardDrawer from "@/components/dashboard/DashboardDrawer";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import { formatAdminDate, formatAdminMoney } from "@/lib/admin-query";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { useDashboardExport } from "@/hooks/use-dashboard-export";
import { cn } from "@/lib/utils";
import type {
  DashboardFundraiserDetail,
  DashboardFundraiserRow,
  DashboardFundraiserStats,
} from "@/types/dashboard-management";
import { CAMPAIGN_CATEGORIES } from "@/lib/categories";

/** Owner-facing moderation badge — only shown while a campaign isn't public. */
function ReviewBadge({ status }: { status: string }) {
  if (status === "published") return null;
  const label = status === "rejected" ? "Rejected" : "Pending review";
  const style =
    status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
  return (
    <span
      className={cn(
        "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
        style
      )}
    >
      {label}
    </span>
  );
}

function FundraisersClientInner() {
  const { page, perPage, search, updateParams, getParam, buildQueryString } = useDashboardParams();
  const { exporting, exportCsv } = useDashboardExport();

  const status = getParam("status");
  const category = getParam("category");
  const sort = getParam("sort", "newest");
  const view = getParam("view", "table");

  const [rows, setRows] = useState<DashboardFundraiserRow[]>([]);
  const [stats, setStats] = useState<DashboardFundraiserStats | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<DashboardFundraiserDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DashboardFundraiserRow | DashboardFundraiserDetail | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryString = useMemo(
    () =>
      buildQueryString({
        status: status !== "all" ? status : undefined,
        category: category !== "all" ? category : undefined,
        sort: sort !== "newest" ? sort : undefined,
      }),
    [buildQueryString, status, category, sort]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/fundraisers?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load fundraisers.");
      setRows(data.fundraisers ?? []);
      setStats(data.stats ?? null);
      setTotalCount(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fundraisers.");
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
      const res = await fetch(`/api/dashboard/fundraisers/${id}`);
      const data = await res.json();
      if (res.ok) setDrawerItem(data.fundraiser ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleExport() {
    const params = new URLSearchParams(queryString);
    params.delete("page");
    params.delete("per_page");
    const ok = await exportCsv(`/api/dashboard/fundraisers/export?${params}`, "fundraisers-export.csv");
    if (!ok) setError("Failed to export CSV.");
  }

  async function deleteFundraiser() {
    if (!deleteTarget) return;

    setWorking(`delete:${deleteTarget.id}`);
    setError("");

    try {
      const res = await fetch(`/api/dashboard/fundraisers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }

      setDeleteTarget(null);
      if (drawerItem?.id === deleteTarget.id) {
        setDrawerItem(null);
      }
      await fetchData();
    } finally {
      setWorking(null);
    }
  }

  const statItems = stats
    ? [
        { label: "Total Campaigns", value: stats.total },
        { label: "Active", value: stats.active },
        { label: "Completed", value: stats.completed },
        { label: "Raised", value: formatAdminMoney(stats.raised) },
        { label: "Donors", value: stats.donors },
      ]
    : [];

  const viewToggle = (
    <div className="flex shrink-0 gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
      {[
        { id: "table", icon: List, label: "Table" },
        { id: "card", icon: LayoutGrid, label: "Cards" },
      ].map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => updateParams({ view: id === "table" ? null : id })}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition",
            view === id ? "bg-white text-violet-700 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardPageHeader
        title="Fundraisers"
        description="Campaign progress, donors, and fundraising performance."
        action={
          <Link href="/dashboard/fundraisers/new" className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">
            + Start Fundraiser
          </Link>
        }
      />

      {stats && <DashboardStatsCards items={statItems} />}

      <DashboardToolbar
        search={search}
        searchPlaceholder="Search campaigns..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        filters={[
          {
            id: "status",
            label: "Status",
            value: status,
            options: [
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
            ],
            onChange: (v) => updateParams({ status: v === "all" ? null : v }),
          },
          {
            id: "category",
            label: "Category",
            value: category,
            options: [
              { value: "all", label: "All Categories" },
              ...CAMPAIGN_CATEGORIES.map((c) => ({ value: c, label: c })),
            ],
            onChange: (v) => updateParams({ category: v === "all" ? null : v }),
          },
        ]}
        sort={{
          id: "sort",
          label: "Sort",
          value: sort,
          options: [
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "alphabetical", label: "Alphabetical" },
            { value: "most_raised", label: "Most Raised" },
            { value: "most_donors", label: "Most Donors" },
            { value: "progress", label: "Progress" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        onExport={handleExport}
        exporting={exporting}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        trailing={viewToggle}
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
            title="No fundraisers yet"
            description="Start a campaign to begin collecting donations."
            actionLabel="Start Fundraiser"
            actionHref="/dashboard/fundraisers/new"
          />
        }
      >
        {view === "card" ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4">
                <button type="button" onClick={() => openDrawer(row.id)} className="text-left w-full">
                  <h3 className="font-black text-zinc-950 line-clamp-1">{row.title}</h3>
                  <ReviewBadge status={row.review_status} />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-500 uppercase">{row.category || "Other"}</span>
                    <p className="text-sm font-medium text-emerald-700">{formatAdminMoney(row.raised)} raised</p>
                  </div>
                </button>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${row.progress}%` }} />
                </div>
                <p className="mt-2 text-xs font-bold text-zinc-500">{row.progress}% of {formatAdminMoney(row.goal)}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Link href={`/fundraisers/edit/${row.id}`} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">Edit</Link>
                  <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-700 hover:bg-red-50">Delete</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="py-3 pr-4 pl-4">Campaign</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Raised</th>
                  <th className="py-3 pr-4">Goal</th>
                  <th className="py-3 pr-4">Progress</th>
                  <th className="py-3 pr-4">Donors</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/70">
                    <td className="py-3 pr-4 pl-4">
                      <button type="button" onClick={() => openDrawer(row.id)} className="font-black text-zinc-900 hover:text-violet-700 hover:underline">
                        {row.title}
                      </button>
                      <ReviewBadge status={row.review_status} />
                    </td>
                    <td className="py-3 pr-4 text-xs font-bold text-zinc-500 uppercase">{row.category || "Other"}</td>
                    <td className="py-3 pr-4 font-black text-emerald-700">{formatAdminMoney(row.raised)}</td>
                    <td className="py-3 pr-4 font-black">{formatAdminMoney(row.goal)}</td>
                    <td className="py-3 pr-4 font-black text-violet-700">{row.progress}%</td>
                    <td className="py-3 pr-4 font-black">{row.donor_count}</td>
                    <td className="py-3 pr-4">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-black uppercase", row.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700")}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => openDrawer(row.id)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50">View</button>
                        <Link href={`/fundraisers/edit/${row.id}`} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">Edit</Link>
                        <button type="button" onClick={() => setDeleteTarget(row)} className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-700 hover:bg-red-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardTableCard>

      <DashboardDrawer
        open={drawerItem !== null || drawerLoading}
        onClose={() => { setDrawerItem(null); setDrawerLoading(false); }}
        title={drawerItem?.title ?? "Campaign"}
        subtitle={drawerItem?.organizer_name}
        footer={
          drawerItem && (
            <div className="flex flex-wrap gap-2">
              {drawerItem.slug && (
                <Link href={`/fundraisers/${drawerItem.slug}`} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-white">Public Page</Link>
              )}
              <Link href={`/fundraisers/edit/${drawerItem.id}`} className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-50">Edit</Link>
              <Link href={`/dashboard/fundraisers/${drawerItem.id}/updates`} className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-50">Updates ({drawerItem.update_count})</Link>
              <button type="button" onClick={() => setDeleteTarget(drawerItem)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50">Delete</button>
            </div>
          )
        }
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
        ) : drawerItem ? (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3">
              {[
                ["Raised", formatAdminMoney(drawerItem.raised)],
                ["Goal", formatAdminMoney(drawerItem.goal)],
                ["Donors", drawerItem.donor_count],
                ["Progress", `${drawerItem.progress}%`],
                ["Category", drawerItem.category ?? "—"],
                ["Created", formatAdminDate(drawerItem.created_at)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-black text-zinc-950">{value}</p>
                </div>
              ))}
            </section>
            {drawerItem.short_description && (
              <section>
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Summary</h3>
                <p className="mt-2 text-sm font-semibold text-zinc-700">{drawerItem.short_description}</p>
              </section>
            )}
          </div>
        ) : null}
      </DashboardDrawer>

      <AdminConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Fundraiser"
        description={`Delete "${deleteTarget?.title ?? "this fundraiser"}"? Fundraisers with donation payment records are blocked to preserve payment history.`}
        confirmLabel="Delete"
        onConfirm={deleteFundraiser}
        loading={deleteTarget ? working === `delete:${deleteTarget.id}` : false}
        variant="danger"
      />
    </div>
  );
}

export default function FundraisersClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
      <FundraisersClientInner />
    </Suspense>
  );
}
