"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardStatsCards from "@/components/dashboard/DashboardStatsCards";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardTableCard from "@/components/dashboard/DashboardTableCard";
import DashboardDrawer from "@/components/dashboard/DashboardDrawer";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";
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
                  aria-label="Select all attendees"
                />
              ),
              width: "48px",
            },
            { id: "attendee", header: "Attendee" },
            { id: "email", header: "Email", hideBelow: "lg" },
            { id: "event", header: "Event" },
            { id: "qty", header: "Qty", align: "right", hideBelow: "lg" },
            { id: "paid", header: "Paid", align: "right" },
            { id: "status", header: "Status" },
            { id: "date", header: "Date", align: "right", hideBelow: "lg" },
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
                aria-label={`Select ${row.attendee_name}`}
              />,
              <button
                key="name"
                type="button"
                onClick={() => openDrawer(row.id)}
                className="font-black text-zinc-900 hover:text-orange-600 hover:underline text-left"
              >
                {row.attendee_name}
              </button>,
              <span key="email" className="text-zinc-500">{row.email || "—"}</span>,
              <span key="event" className="max-w-[160px] truncate text-zinc-700 font-medium">{row.event_title}</span>,
              <span key="qty" className="font-black tabular-nums">{row.quantity}</span>,
              <span key="paid" className="font-black text-emerald-700 tabular-nums">{formatAdminMoney(row.paid)}</span>,
              <span key="status" className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge[row.status] ?? statusBadge.valid}`}>
                {row.status}
              </span>,
              <span key="date" className="text-zinc-500">{formatAdminDate(row.created_at)}</span>,
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
                    aria-label={`Select ${row.attendee_name}`}
                  />
                }
                identity={
                  <button
                    type="button"
                    onClick={() => openDrawer(row.id)}
                    className="font-bold text-zinc-950 hover:text-orange-600 text-left line-clamp-1"
                  >
                    {row.attendee_name}
                  </button>
                }
                primaryValue={
                  <span className="font-extrabold text-emerald-700 tabular-nums">
                    {formatAdminMoney(row.paid)}
                  </span>
                }
                state={
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusBadge[row.status] ?? statusBadge.valid}`}>
                    {row.status}
                  </span>
                }
                secondary={[
                  row.event_title,
                  `${row.quantity} ticket${row.quantity === 1 ? "" : "s"}`,
                  formatAdminDate(row.created_at),
                ]}
                expandedDetails={
                  <div className="space-y-1.5 py-1 text-xs text-zinc-600">
                    <div>
                      <span className="font-bold text-zinc-500">Email:</span> {row.email || "No email provided"}
                    </div>
                    <div>
                      <span className="font-bold text-zinc-500">Event:</span> {row.event_title}
                    </div>
                    <div>
                      <span className="font-bold text-zinc-500">Tickets Purchased:</span> {row.quantity}
                    </div>
                    <div>
                      <span className="font-bold text-zinc-500">Order Date:</span> {formatAdminDate(row.created_at)}
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => openDrawer(row.id)}
                        className="rounded-lg bg-orange-50 text-orange-700 font-bold px-3 py-1.5 text-xs hover:bg-orange-100 transition"
                      >
                        View Attendee Details →
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
