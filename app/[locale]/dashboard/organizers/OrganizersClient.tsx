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
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";
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
        <ResponsiveDataTable
          columns={[
            {
              id: "select",
              header: (
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-zinc-300"
                  aria-label="Select all organizations"
                />
              ),
              width: "48px",
            },
            { id: "organization", header: "Organization" },
            { id: "followers", header: "Followers", align: "right", hideBelow: "lg" },
            { id: "events", header: "Events", align: "right" },
            { id: "fundraisers", header: "Fundraisers", align: "right", hideBelow: "lg" },
            { id: "revenue", header: "Revenue", align: "right" },
            { id: "status", header: "Status" },
            { id: "actions", header: "Actions", align: "right" },
          ]}
          isSelectable
        >
          {rows.map((row) => {
            const desktopCells = [
              <input
                key="select"
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => toggleOne(row.id)}
                className="rounded border-zinc-300"
                aria-label={`Select ${row.name}`}
              />,
              <div key="organization" className="flex items-center gap-3">
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
                <button
                  type="button"
                  onClick={() => openDrawer(row.id)}
                  className="font-black text-zinc-900 hover:text-orange-600 hover:underline text-left"
                >
                  {row.name}
                </button>
              </div>,
              <span key="followers" className="font-black text-zinc-900 tabular-nums">{row.follower_count}</span>,
              <span key="events" className="font-black text-zinc-900 tabular-nums">{row.event_count}</span>,
              <span key="fundraisers" className="font-black text-zinc-900 tabular-nums">{row.fundraiser_count}</span>,
              <span key="revenue" className="font-black text-emerald-700 tabular-nums">{formatAdminMoney(row.revenue)}</span>,
              <StatusBadge key="status" status={row.status} />,
              <div key="actions" className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => openDrawer(row.id)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                >
                  View
                </button>
                <Link
                  href={`/organizers/${row.id}/edit`}
                  className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-black text-orange-700 hover:bg-orange-50"
                >
                  Edit
                </Link>
              </div>,
            ];

            return (
              <ResponsiveDataRow
                key={row.id}
                id={row.id}
                desktopCells={desktopCells}
                selectionControl={
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    className="rounded border-zinc-300"
                    aria-label={`Select ${row.name}`}
                  />
                }
                identity={
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100">
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
                    <button
                      type="button"
                      onClick={() => openDrawer(row.id)}
                      className="font-bold text-zinc-950 hover:text-orange-600 text-left line-clamp-1"
                    >
                      {row.name}
                    </button>
                  </div>
                }
                primaryValue={
                  <span className="font-extrabold text-emerald-700 tabular-nums">
                    {formatAdminMoney(row.revenue)}
                  </span>
                }
                state={<StatusBadge status={row.status} />}
                secondary={[
                  `${row.event_count} event${row.event_count === 1 ? "" : "s"}`,
                  `${row.follower_count} follower${row.follower_count === 1 ? "" : "s"}`,
                  `${row.fundraiser_count} campaign${row.fundraiser_count === 1 ? "" : "s"}`,
                ]}
                expandedDetails={
                  <div className="space-y-2 py-1 text-xs text-zinc-600">
                    <div>
                      <span className="font-bold text-zinc-500">Activity:</span> {row.event_count} events · {row.fundraiser_count} fundraisers · {row.follower_count} followers
                    </div>
                    <div>
                      <span className="font-bold text-zinc-500">Total Revenue:</span> {formatAdminMoney(row.revenue)}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={() => openDrawer(row.id)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                      >
                        View Details
                      </button>
                      <Link
                        href={`/organizers/${row.id}/edit`}
                        className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-black text-orange-700 hover:bg-orange-50"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/organizers/${row.id}`}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                      >
                        Public Profile
                      </Link>
                    </div>
                  </div>
                }
              />
            );
          })}
        </ResponsiveDataTable>
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
