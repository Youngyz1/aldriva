"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import type {
  DashboardAttendeeDetail,
  DashboardAttendeeRow,
  DashboardAttendeeStats,
} from "@/types/dashboard-management";

const BULK_ACTIONS = [
  { id: "resend_ticket", label: "Resend Ticket" },
  { id: "export", label: "Export" },
  { id: "check_in", label: "Mark Checked In" },
];

const statusBadge: Record<string, string> = {
  valid: "bg-emerald-100 text-emerald-700",
  used: "bg-zinc-100 text-zinc-500",
  cancelled: "bg-red-100 text-red-600",
  refunded: "bg-orange-100 text-orange-600",
};

type EventOption = { id: string; title: string };

function AttendeesClientInner() {
  const { page, perPage, search, updateParams, getParam, buildQueryString } = useDashboardParams();
  const { exporting, exportCsv } = useDashboardExport();

  const eventFilter = getParam("event");
  const status = getParam("status");
  const date = getParam("date");
  const sort = getParam("sort", "newest");

  const [rows, setRows] = useState<DashboardAttendeeRow[]>([]);
  const [stats, setStats] = useState<DashboardAttendeeStats | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerItem, setDrawerItem] = useState<DashboardAttendeeDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryString = useMemo(
    () =>
      buildQueryString({
        event: eventFilter !== "all" ? eventFilter : undefined,
        status: status !== "all" ? status : undefined,
        date: date !== "all" ? date : undefined,
        sort: sort !== "newest" ? sort : undefined,
      }),
    [buildQueryString, eventFilter, status, date, sort]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/attendees?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load attendees.");
      setRows(data.attendees ?? []);
      setStats(data.stats ?? null);
      setEvents(data.events ?? []);
      setTotalCount(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendees.");
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
      const res = await fetch(`/api/dashboard/attendees/${id}`);
      const data = await res.json();
      if (res.ok) setDrawerItem(data.attendee ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function bulkAction(action: string) {
    if (action === "export") {
      const params = new URLSearchParams(queryString);
      params.delete("page");
      params.delete("per_page");
      const ok = await exportCsv(`/api/dashboard/attendees/export?${params}`, "attendees-export.csv");
      if (!ok) setError("Failed to export CSV.");
      setConfirmAction(null);
      return;
    }

    setWorking("bulk");
    setError("");
    const res = await fetch("/api/dashboard/attendees/bulk", {
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
    const ok = await exportCsv(`/api/dashboard/attendees/export?${params}`, "attendees-export.csv");
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
        { label: "Total Attendees", value: stats.total_attendees },
        { label: "Tickets Sold", value: stats.tickets_sold },
        { label: "Revenue", value: formatAdminMoney(stats.revenue) },
        { label: "Checked In", value: stats.checked_in },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardPageHeader title="Attendees" description="Ticket buyers across all your events." />

      {stats && <DashboardStatsCards items={statItems} className="sm:grid-cols-2 lg:grid-cols-4" />}

      <DashboardToolbar
        search={search}
        searchPlaceholder="Search attendees..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        filters={[
          {
            id: "event",
            label: "Event",
            value: eventFilter,
            options: [
              { value: "all", label: "All Events" },
              ...events.map((e) => ({ value: e.id, label: e.title })),
            ],
            onChange: (v) => updateParams({ event: v === "all" ? null : v }),
          },
          {
            id: "status",
            label: "Status",
            value: status,
            options: [
              { value: "all", label: "All Statuses" },
              { value: "valid", label: "Valid" },
              { value: "used", label: "Checked In" },
              { value: "cancelled", label: "Cancelled" },
              { value: "refunded", label: "Refunded" },
            ],
            onChange: (v) => updateParams({ status: v === "all" ? null : v }),
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
        ]}
        sort={{
          id: "sort",
          label: "Sort",
          value: sort,
          options: [
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "amount_high", label: "Highest Paid" },
            { value: "name", label: "Name A–Z" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        selectedCount={selected.size}
        bulkActions={
          <>
            {BULK_ACTIONS.map((action) => (
              <DashboardBulkActionButton key={action.id} label={action.label} onClick={() => setConfirmAction(action.id)} />
            ))}
          </>
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
            title="No attendees yet"
            description="Attendees appear here once tickets are sold for your events."
            actionLabel="View Events"
            actionHref="/dashboard/events"
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-zinc-300" />
                </th>
                <th className="py-3 pr-4">Attendee</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Event</th>
                <th className="py-3 pr-4">Qty</th>
                <th className="py-3 pr-4">Paid</th>
                <th className="py-3 pr-4">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50/70">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} className="rounded border-zinc-300" />
                  </td>
                  <td className="py-3 pr-4">
                    <button type="button" onClick={() => openDrawer(row.id)} className="font-black text-zinc-900 hover:text-violet-700 hover:underline">
                      {row.attendee_name}
                    </button>
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">{row.email || "—"}</td>
                  <td className="py-3 pr-4 max-w-[160px] truncate text-zinc-700">{row.event_title}</td>
                  <td className="py-3 pr-4 font-black">{row.quantity}</td>
                  <td className="py-3 pr-4 font-black text-emerald-700">{formatAdminMoney(row.paid)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge[row.status] ?? statusBadge.valid}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{formatAdminDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardTableCard>

      <DashboardDrawer
        open={drawerItem !== null || drawerLoading}
        onClose={() => { setDrawerItem(null); setDrawerLoading(false); }}
        title={drawerItem?.attendee_name ?? "Attendee"}
        subtitle={drawerItem?.event_title}
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
        ) : drawerItem ? (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3">
              {[
                ["Email", drawerItem.email || "—"],
                ["Event", drawerItem.event_title],
                ["Quantity", drawerItem.quantity],
                ["Paid", formatAdminMoney(drawerItem.paid)],
                ["Status", drawerItem.status],
                ["Date", formatAdminDate(drawerItem.created_at)],
                ["Seat", drawerItem.seat_label ?? "—"],
                ["Checked In", drawerItem.checked_in_at ? formatAdminDate(drawerItem.checked_in_at) : "—"],
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

      <AdminConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Bulk ${BULK_ACTIONS.find((a) => a.id === confirmAction)?.label ?? "Action"}`}
        description={`Apply this action to ${selected.size} selected attendee(s)?`}
        confirmLabel={BULK_ACTIONS.find((a) => a.id === confirmAction)?.label ?? "Confirm"}
        onConfirm={() => confirmAction && bulkAction(confirmAction)}
        loading={working === "bulk"}
      />
    </div>
  );
}

export default function AttendeesClient() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
      <AttendeesClientInner />
    </Suspense>
  );
}
