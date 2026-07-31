"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardStatsCards from "@/components/dashboard/DashboardStatsCards";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardTableCard from "@/components/dashboard/DashboardTableCard";
import DashboardDrawer from "@/components/dashboard/DashboardDrawer";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import { formatAdminDate, formatAdminMoney } from "@/lib/admin-query";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { useDashboardExport } from "@/hooks/use-dashboard-export";
import type {
  DashboardOrganizerDetail,
  DashboardOrganizerRow,
  DashboardOrganizerStats,
} from "@/types/dashboard-management";

function OrganizersClientInner() {
  const { page, perPage, search, updateParams, getParam, buildQueryString } = useDashboardParams();
  const { exporting, exportCsv } = useDashboardExport();

  const status = getParam("status");
  const verification = getParam("verification");
  const sort = getParam("sort", "newest");

  const [rows, setRows] = useState<DashboardOrganizerRow[]>([]);
  const [stats, setStats] = useState<DashboardOrganizerStats | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerOrg, setDrawerOrg] = useState<DashboardOrganizerDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryString = useMemo(
    () =>
      buildQueryString({
        status: status !== "all" ? status : undefined,
        verification: verification !== "all" ? verification : undefined,
        sort: sort !== "newest" ? sort : undefined,
      }),
    [buildQueryString, status, verification, sort]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/organizers?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load organizers.");
      setRows(data.organizers ?? []);
      setStats(data.stats ?? null);
      setTotalCount(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizers.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function openDrawer(id: string) {
    setDrawerLoading(true);
    setDrawerOrg(null);
    try {
      const res = await fetch(`/api/dashboard/organizers/${id}`);
      const data = await res.json();
      if (res.ok) setDrawerOrg(data.organizer ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleExport() {
    const params = new URLSearchParams(queryString);
    params.delete("page");
    params.delete("per_page");
    const ok = await exportCsv(`/api/dashboard/organizers/export?${params}`, "organizers-export.csv");
    if (!ok) setError("Failed to export CSV.");
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const statItems = stats
    ? [
        { label: "Total Organizations", value: stats.total },
        { label: "Verified", value: stats.verified },
        { label: "Pending", value: stats.pending },
        { label: "Followers", value: stats.followers },
        { label: "Revenue", value: formatAdminMoney(stats.revenue) },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardPageHeader
        title="Organizations"
        description="Public organization profiles behind your events and fundraisers."
        action={
          <Link href="/create-organizer" className="shrink-0 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white hover:bg-orange-700">
            + Create Organization
          </Link>
        }
      />

      {stats && <DashboardStatsCards items={statItems} />}

      <DashboardToolbar
        search={search}
        searchPlaceholder="Search organizers..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        filters={[
          {
            id: "status",
            label: "Status",
            value: status,
            options: [
              { value: "all", label: "All Statuses" },
              { value: "pending", label: "Pending" },
              { value: "verified", label: "Verified" },
              { value: "suspended", label: "Suspended" },
              { value: "rejected", label: "Rejected" },
            ],
            onChange: (v) => updateParams({ status: v === "all" ? null : v }),
          },
          {
            id: "verification",
            label: "Verification",
            value: verification,
            options: [
              { value: "all", label: "All" },
              { value: "verified", label: "Verified" },
              { value: "pending", label: "Pending Review" },
            ],
            onChange: (v) => updateParams({ verification: v === "all" ? null : v }),
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
            { value: "most_followers", label: "Most Followers" },
            { value: "most_events", label: "Most Events" },
            { value: "most_revenue", label: "Most Revenue" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        selectedCount={selected.size}
        bulkActions={
          selected.size > 0 ? (
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
            >
              Export Selected
            </button>
          ) : undefined
        }
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
            title="No organizations yet"
            description="Create an organization profile before launching events or fundraisers."
            actionLabel="Create Organization"
            actionHref="/create-organizer"
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-zinc-300" />
                </th>
                <th className="py-3 pr-4">Organization</th>
                <th className="py-3 pr-4">Followers</th>
                <th className="py-3 pr-4">Events</th>
                <th className="py-3 pr-4">Fundraisers</th>
                <th className="py-3 pr-4">Revenue</th>
                <th className="py-3 pr-4">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50/70">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} className="rounded border-zinc-300" />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100">
                        {row.photo ? (
                          <img src={row.photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <LocalBrandedPlaceholder
                            variant="avatar"
                            title={row.name}
                            initials={row.name.charAt(0)}
                            className="from-transparent to-transparent text-xs text-zinc-500"
                          />
                        )}
                      </div>
                      <button type="button" onClick={() => openDrawer(row.id)} className="font-black text-zinc-900 hover:text-violet-700 hover:underline">
                        {row.name}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-black">{row.follower_count}</td>
                  <td className="py-3 pr-4 font-black">{row.event_count}</td>
                  <td className="py-3 pr-4 font-black">{row.fundraiser_count}</td>
                  <td className="py-3 pr-4 font-black text-emerald-700">{formatAdminMoney(row.revenue)}</td>
                  <td className="py-3 pr-4"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => openDrawer(row.id)} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50">View</button>
                      <Link href={`/organizers/${row.id}/edit`} className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-black text-orange-700 hover:bg-orange-50">Edit</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardTableCard>

      <DashboardDrawer
        open={drawerOrg !== null || drawerLoading}
        onClose={() => { setDrawerOrg(null); setDrawerLoading(false); }}
        title={drawerOrg?.name ?? "Organization"}
        subtitle={drawerOrg?.status}
        footer={
          drawerOrg && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/organizers/${drawerOrg.id}`} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-white">Public Profile</Link>
              <Link href={`/organizers/${drawerOrg.id}/edit`} className="rounded-xl border border-orange-200 px-4 py-2 text-sm font-black text-orange-700 hover:bg-orange-50">Edit</Link>
            </div>
          )
        }
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
        ) : drawerOrg ? (
          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Profile</h3>
              <p className="mt-2 text-sm font-semibold text-zinc-700">{drawerOrg.bio || "No bio provided."}</p>
              {drawerOrg.website && (
                <a href={drawerOrg.website} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-violet-700 hover:underline">{drawerOrg.website}</a>
              )}
            </section>
            <section className="grid grid-cols-2 gap-3">
              {[
                ["Followers", drawerOrg.follower_count],
                ["Events", drawerOrg.event_count],
                ["Fundraisers", drawerOrg.fundraiser_count],
                ["Revenue", formatAdminMoney(drawerOrg.revenue)],
                ["Visibility", drawerOrg.visibility],
                ["Created", formatAdminDate(drawerOrg.created_at)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-black capitalize text-zinc-950">{value}</p>
                </div>
              ))}
            </section>
          </div>
        ) : null}
      </DashboardDrawer>
    </div>
  );
}

export default function OrganizersClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
      <OrganizersClientInner />
    </Suspense>
  );
}
