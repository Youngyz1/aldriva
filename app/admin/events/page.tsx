"use client";

/**
 * app/admin/events/page.tsx
 * Event moderation — approve, reject, feature/unfeature events.
 */

import { useEffect, useState, useMemo } from 'react';
import { EVENT_CATEGORIES } from '@/lib/event-taxonomy';
import { formatAdminDate } from '@/lib/admin-query';
import AdminTable from "@/components/admin/table/AdminTable";
import TableToolbar from "@/components/admin/table/TableToolbar";
import type { AdminColumn, RowActionsConfig } from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { adminPageCopy, buildStats } from "@/components/admin/page-strings";

type EventRow = {
  id: string;
  title: string;
  organizer_name: string;
  visibility: string;
  status: string;
  is_featured: boolean;
  created_at: string;
  category?: string | null;
  subcategory?: string | null;
};

export default function AdminEventsPage() {
  const [events, setEvents]   = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError]     = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    fetch('/api/admin/events')
      .then((r) => r.json())
      .then((d) => { setEvents(d.events ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load events.'); setLoading(false); });
  }, []);

  async function updateEvent(id: string, payload: Record<string, unknown>) {
    setWorking(id);
    setError('');
    const res = await fetch(`/api/admin/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, ...updated.event } : e
        )
      );
    } else {
      const d = await res.json();
      setError(d.error ?? 'Update failed.');
    }
    setWorking(null);
  }

  const filteredEvents = useMemo(() => {
    if (categoryFilter === "all") return events;
    return events.filter((e) => e.category === categoryFilter);
  }, [events, categoryFilter]);

  const columns: AdminColumn[] = [
    { id: "title", header: "Title", role: "title" },
    { id: "organization", header: "Organization", role: "meta" },
    { id: "category", header: "Category", role: "detail", hideBelow: "lg" },
    { id: "visibility", header: "Visibility", role: "meta", hideBelow: "md" },
    { id: "status", header: "Status", role: "value", width: "110px" },
    { id: "featured", header: "Featured", role: "meta" },
  ];

  /** Menu-only actions (no detail view exists for events): approve, reject
      (destructive), feature/unfeature. Endpoints: PATCH /api/admin/events/[id]
      with { status } or { is_featured } — same calls as before. */
  function buildRowActions(ev: EventRow): RowActionsConfig {
    const menu: RowActionsConfig["menu"] = [];
    if (ev.status !== "approved") {
      menu.push({
        key: "approve",
        label: "Approve",
        onSelect: () => updateEvent(ev.id, { status: "approved" }),
        disabled: working === ev.id,
      });
    }
    if (ev.status !== "rejected") {
      menu.push({
        key: "reject",
        label: "Reject",
        onSelect: () => updateEvent(ev.id, { status: "rejected" }),
        disabled: working === ev.id,
        destructive: true,
      });
    }
    menu.push({
      key: "feature",
      label: ev.is_featured ? "Unfeature" : "Feature",
      onSelect: () => updateEvent(ev.id, { is_featured: !ev.is_featured }),
      disabled: working === ev.id,
    });
    return { menu };
  }

  const eventStats = useMemo(() => {
    const approved = events.filter((e) => e.status === "approved").length;
    const rejected = events.filter((e) => e.status === "rejected").length;
    return {
      total: events.length,
      approved,
      pending: events.length - approved - rejected,
      featured: events.filter((e) => e.is_featured).length,
    };
  }, [events]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={adminPageCopy.events.eyebrow}
        title={adminPageCopy.events.title}
        description={adminPageCopy.events.description}
      />
      <StatStrip items={buildStats(adminPageCopy.events.stats, eventStats)} />
      <TableToolbar
        filters={[
          {
            id: "category",
            label: "Category",
            value: categoryFilter,
            options: [
              { value: "all", label: "All categories" },
              ...EVENT_CATEGORIES.map((c) => ({ value: c, label: c })),
            ],
            onChange: (v) => setCategoryFilter(v),
          },
        ]}
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      ) : (
        <AdminTable
          columns={columns}
          rows={filteredEvents.map((ev) => ({
            id: ev.id,
            cells: [
              <span key="title" className="block max-w-[180px] truncate">{ev.title}</span>,
              <span key="org" className="block max-w-[120px] truncate text-zinc-500">{ev.organizer_name}</span>,
              <span key="category" className="block max-w-[140px] truncate text-zinc-600">
                {ev.category || "—"}{ev.subcategory ? ` · ${ev.subcategory}` : ""}
              </span>,
              <span key="visibility" className="capitalize">{ev.visibility}</span>,
              <span key="status" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    ev.status === "approved"
                      ? "bg-emerald-500"
                      : ev.status === "rejected"
                        ? "bg-red-500"
                        : "bg-amber-500"
                  }`}
                />
                <span className="capitalize">{ev.status}</span>
              </span>,
              <span key="featured">{ev.is_featured ? "Yes" : "No"}</span>,
            ],
            detailExtra: [
              { label: "Created", value: formatAdminDate(ev.created_at) },
            ],
            actions: buildRowActions(ev),
          }))}
          emptyMessage={adminPageCopy.events.empty}
        />
      )}

      {!loading && (
        <p className="text-xs font-semibold text-zinc-400">
          {filteredEvents.length === 0
            ? tableStrings.showingNone(0)
            : tableStrings.showingResults(1, filteredEvents.length, filteredEvents.length)}
        </p>
      )}
    </div>
  );
}
