"use client";

/**
 * app/admin/events/page.tsx
 * Event moderation — approve, reject, feature/unfeature events.
 */

import { useEffect, useState, useMemo } from 'react';
import { EVENT_CATEGORIES } from '@/lib/event-taxonomy';
import { ResponsiveDataTable } from '@/components/dashboard/ResponsiveDataTable';
import { ResponsiveDataRow } from '@/components/dashboard/ResponsiveDataRow';

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

const statusBadge: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
};

const visibilityBadge: Record<string, string> = {
  public:  'bg-blue-100 text-blue-700',
  private: 'bg-zinc-100 text-zinc-600',
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

  return (
    <div className="space-y-6">
      <header className="pb-1">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Events</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">Moderate and feature events. Category filter uses canonical event taxonomy.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold">
          <option value="all">All categories</option>
          {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div>
      )}

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
          </div>
        ) : (
          <ResponsiveDataTable
            totalCount={filteredEvents.length}
            emptyMessage="No events found."
            columns={[
              { id: 'title', header: 'Title' },
              { id: 'organization', header: 'Organization', hideBelow: 'md' },
              { id: 'category', header: 'Category', hideBelow: 'lg' },
              { id: 'visibility', header: 'Visibility', hideBelow: 'md' },
              { id: 'status', header: 'Status' },
              { id: 'featured', header: 'Featured', hideBelow: 'lg' },
              { id: 'actions', header: 'Actions', align: 'right' },
            ]}
          >
            {filteredEvents.map((ev) => {
              const actionButtons = (
                <div className="flex flex-wrap gap-1.5">
                  {ev.status !== 'approved' && (
                    <button
                      type="button"
                      disabled={working === ev.id}
                      onClick={() => updateEvent(ev.id, { status: 'approved' })}
                      className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {working === ev.id ? '…' : 'Approve'}
                    </button>
                  )}
                  {ev.status !== 'rejected' && (
                    <button
                      type="button"
                      disabled={working === ev.id}
                      onClick={() => updateEvent(ev.id, { status: 'rejected' })}
                      className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {working === ev.id ? '…' : 'Reject'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={working === ev.id}
                    onClick={() => updateEvent(ev.id, { is_featured: !ev.is_featured })}
                    className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-black text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                  >
                    {working === ev.id ? '…' : ev.is_featured ? 'Unfeature' : 'Feature'}
                  </button>
                </div>
              );

              return (
                <ResponsiveDataRow
                  key={ev.id}
                  id={ev.id}
                  desktopCells={[
                    <span key="title" className="font-semibold max-w-[180px] truncate block">{ev.title}</span>,
                    <span key="org" className="text-zinc-500 max-w-[120px] truncate block">{ev.organizer_name}</span>,
                    <span key="cat" className="text-xs font-semibold text-zinc-600 max-w-[140px] truncate block">
                      {ev.category || "—"}{ev.subcategory ? ` · ${ev.subcategory}` : ""}
                    </span>,
                    <span key="vis" className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${visibilityBadge[ev.visibility] ?? visibilityBadge.public}`}>
                      {ev.visibility}
                    </span>,
                    <span key="status" className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge[ev.status] ?? statusBadge.pending}`}>
                      {ev.status}
                    </span>,
                    <span key="feat" className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${ev.is_featured ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-500'}`}>
                      {ev.is_featured ? 'Yes' : 'No'}
                    </span>,
                    <div key="act" className="flex flex-wrap justify-end gap-1.5">
                      {actionButtons}
                    </div>
                  ]}
                  identity={<span className="font-bold text-zinc-950 text-left line-clamp-1">{ev.title}</span>}
                  primaryMeta={<span className="text-xs text-zinc-500">{ev.organizer_name} · {ev.category || "General"}</span>}
                  statusBadge={
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge[ev.status] ?? statusBadge.pending}`}>
                      {ev.status}
                    </span>
                  }
                  numericMetric={
                    ev.is_featured ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase bg-orange-100 text-orange-700">
                        Featured
                      </span>
                    ) : undefined
                  }
                  actions={actionButtons}
                  mobileDetails={
                    <div className="space-y-2 text-xs text-zinc-600">
                      <div><span className="font-bold text-zinc-500">Organization:</span> {ev.organizer_name}</div>
                      <div><span className="font-bold text-zinc-500">Category:</span> {ev.category || "—"}{ev.subcategory ? ` · ${ev.subcategory}` : ""}</div>
                      <div><span className="font-bold text-zinc-500">Visibility:</span> {ev.visibility}</div>
                      <div><span className="font-bold text-zinc-500">Featured:</span> {ev.is_featured ? "Yes" : "No"}</div>
                    </div>
                  }
                />
              );
            })}
          </ResponsiveDataTable>
        )}
      </div>
    </div>
  );
}
