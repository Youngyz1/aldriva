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
import { DashboardBulkActionButton } from "@/components/dashboard/DashboardBulkActions";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import { formatAdminDate, formatAdminMoney } from "@/lib/admin-query";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { useDashboardExport } from "@/hooks/use-dashboard-export";
import type { DashboardEventDetail, DashboardEventRow, DashboardEventStats } from "@/types/dashboard-management";

const BULK_ACTIONS = [
  { id: "publish", label: "Publish" },
  { id: "unpublish", label: "Unpublish" },
  { id: "delete", label: "Delete", variant: "danger" as const },
  { id: "export", label: "Export" },
];

const statusBadge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};

const visibilityBadge: Record<string, string> = {
  public: "bg-blue-100 text-blue-700",
  private: "bg-zinc-100 text-zinc-600",
};

function statusLabel(status: string) {
  if (status === "approved") return "Published";
  if (status === "pending") return "Draft";
  return status;
}

function EventsClientInner() {
  const { page, perPage, search, updateParams, getParam, buildQueryString } = useDashboardParams();
  const { exporting, exportCsv } = useDashboardExport();

  const status = getParam("status");
  const visibility = getParam("visibility");
  const date = getParam("date");
  const sort = getParam("sort", "newest");

  const [rows, setRows] = useState<DashboardEventRow[]>([]);
  const [stats, setStats] = useState<DashboardEventStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerEvent, setDrawerEvent] = useState<DashboardEventDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardEventRow | DashboardEventDetail | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryString = useMemo(
    () =>
      buildQueryString({
        status: status !== "all" ? status : undefined,
        visibility: visibility !== "all" ? visibility : undefined,
        date: date !== "all" ? date : undefined,
        sort: sort !== "newest" ? sort : undefined,
      }),
    [buildQueryString, status, visibility, date, sort]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/events?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load events.");
      setRows(data.events ?? []);
      setStats(data.stats ?? null);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function openDrawer(id: string) {
    setDrawerLoading(true);
    setDrawerEvent(null);
    try {
      const res = await fetch(`/api/dashboard/events/${id}`);
      const data = await res.json();
      if (res.ok) setDrawerEvent(data.event ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function bulkAction(action: string) {
    if (action === "export") {
      const params = new URLSearchParams(queryString);
      params.delete("page");
      params.delete("per_page");
      const ok = await exportCsv(`/api/dashboard/events/export?${params}`, "events-export.csv");
      if (!ok) setError("Failed to export CSV.");
      setConfirmAction(null);
      return;
    }

    setWorking("bulk");
    setError("");
    const res = await fetch("/api/dashboard/events/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Bulk action failed.");
    else {
      setConfirmAction(null);
      await fetchData();
    }
    setWorking(null);
  }

  async function handleExport() {
    const params = new URLSearchParams(queryString);
    params.delete("page");
    params.delete("per_page");
    const ok = await exportCsv(`/api/dashboard/events/export?${params}`, "events-export.csv");
    if (!ok) setError("Failed to export CSV.");
  }

  async function deleteEvent() {
    if (!deleteTarget) return;

    setWorking(`delete:${deleteTarget.id}`);
    setError("");

    try {
      const res = await fetch(`/api/dashboard/events/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }

      setDeleteTarget(null);
      if (drawerEvent?.id === deleteTarget.id) {
        setDrawerEvent(null);
      }
      await fetchData();
    } finally {
      setWorking(null);
    }
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
        { label: "Total Events", value: stats.total },
        { label: "Published", value: stats.published },
        { label: "Draft", value: stats.draft },
        { label: "Tickets Sold", value: stats.tickets_sold },
        { label: "Revenue", value: formatAdminMoney(stats.revenue) },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardPageHeader
        title="Events"
        description="Manage events, tickets sold, and revenue across your organizer profiles."
        action={
          <Link
            href="/dashboard/events/new"
            className="shrink-0 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white hover:bg-orange-700"
          >
            + Create Event
          </Link>
        }
      />

      {stats && <DashboardStatsCards items={statItems} />}

      <DashboardToolbar
        search={search}
        searchPlaceholder="Search events..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        filters={[
          {
            id: "status",
            label: "Status",
            value: status,
            options: [
              { value: "all", label: "All Statuses" },
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
              { value: "rejected", label: "Rejected" },
            ],
            onChange: (v) => updateParams({ status: v === "all" ? null : v }),
          },
          {
            id: "visibility",
            label: "Visibility",
            value: visibility,
            options: [
              { value: "all", label: "All" },
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
            ],
            onChange: (v) => updateParams({ visibility: v === "all" ? null : v }),
          },
          {
            id: "date",
            label: "Date",
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
        ]}
        sort={{
          id: "sort",
          label: "Sort",
          value: sort,
          options: [
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "alphabetical", label: "Alphabetical" },
            { value: "event_date", label: "Event Date" },
            { value: "most_tickets", label: "Most Tickets" },
            { value: "most_revenue", label: "Most Revenue" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        selectedCount={selected.size}
        bulkActions={
          <>
            {BULK_ACTIONS.map((action) => (
              <DashboardBulkActionButton
                key={action.id}
                label={action.label}
                variant={action.variant}
                onClick={() => setConfirmAction(action.id)}
              />
            ))}
          </>
        }
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
        total={total}
        onPageChange={(p) => updateParams({ page: String(p) })}
        onPerPageChange={(n) => updateParams({ per_page: String(n), page: "1" })}
        isEmpty={rows.length === 0}
        empty={
          <DashboardEmptyState
            title="No events yet"
            description="Create your first event to start selling tickets."
            actionLabel="Create Event"
            actionHref="/dashboard/events/new"
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
                <th className="py-3 pr-4">Title</th>
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Visibility</th>
                <th className="py-3 pr-4">Tickets</th>
                <th className="py-3 pr-4">Revenue</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50/70">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      className="rounded border-zinc-300"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => openDrawer(row.id)}
                      className="font-black text-zinc-900 hover:text-violet-700 hover:underline"
                    >
                      {row.title}
                    </button>
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">{formatAdminDate(row.event_date)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge[row.status] ?? statusBadge.pending}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${visibilityBadge[row.visibility] ?? visibilityBadge.public}`}>
                      {row.visibility}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-black text-zinc-900">{row.ticket_count}</td>
                  <td className="py-3 pr-4 font-black text-emerald-700">{formatAdminMoney(row.revenue)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openDrawer(row.id)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                      >
                        View
                      </button>
                      {row.slug && (
                        <Link href={`/events/${row.slug}`} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50">
                          Public
                        </Link>
                      )}
                      <Link href={`/events/edit/${row.id}`} className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-black text-orange-700 hover:bg-orange-50">
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardTableCard>

      <DashboardDrawer
        open={drawerEvent !== null || drawerLoading}
        onClose={() => { setDrawerEvent(null); setDrawerLoading(false); }}
        title={drawerEvent?.title ?? "Event"}
        subtitle={drawerEvent?.organizer_name}
        width="xl"
        footer={
          drawerEvent && (
            <div className="flex flex-wrap gap-2">
              {drawerEvent.slug && (
                <Link href={`/events/${drawerEvent.slug}`} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-white">
                  View Public Page
                </Link>
              )}
              <Link href={`/events/edit/${drawerEvent.id}`} className="rounded-xl border border-orange-200 px-4 py-2 text-sm font-black text-orange-700 hover:bg-orange-50">
                Edit Event
              </Link>
              <button
                type="button"
                onClick={() => setDeleteTarget(drawerEvent)}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-black text-red-700 hover:bg-red-50"
              >
                Delete Event
              </button>
            </div>
          )
        }
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : drawerEvent ? (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3">
              {[
                ["Status", statusLabel(drawerEvent.status)],
                ["Visibility", drawerEvent.visibility],
                ["Tickets", drawerEvent.ticket_count],
                ["Revenue", formatAdminMoney(drawerEvent.revenue)],
                ["Date", formatAdminDate(drawerEvent.event_date)],
                ["Location", drawerEvent.city ?? "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-black capitalize text-zinc-950">{value}</p>
                </div>
              ))}
            </section>
            {drawerEvent.description && (
              <section>
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Description</h3>
                <p className="mt-2 text-sm font-semibold text-zinc-700">{drawerEvent.description}</p>
              </section>
            )}
          </div>
        ) : null}
      </DashboardDrawer>

      <AdminConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Bulk ${BULK_ACTIONS.find((a) => a.id === confirmAction)?.label ?? "Action"}`}
        description={`Apply this action to ${selected.size} selected event(s)?`}
        confirmLabel={BULK_ACTIONS.find((a) => a.id === confirmAction)?.label ?? "Confirm"}
        onConfirm={() => confirmAction && bulkAction(confirmAction)}
        loading={working === "bulk"}
        variant={confirmAction === "delete" ? "danger" : "default"}
      />

      <AdminConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Event"
        description={`Delete "${deleteTarget?.title ?? "this event"}"? Events with paid, pending, or refunded ticket orders are blocked to preserve payment history.`}
        confirmLabel="Delete"
        onConfirm={deleteEvent}
        loading={deleteTarget ? working === `delete:${deleteTarget.id}` : false}
        variant="danger"
      />
    </div>
  );
}

export default function EventsClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
      <EventsClientInner />
    </Suspense>
  );
}
