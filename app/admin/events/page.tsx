"use client";

/**
 * app/admin/events/page.tsx
 * Event moderation — approve, reject, feature/unfeature events.
 */

import { useEffect, useState } from 'react';

type EventRow = {
  id: string;
  title: string;
  organizer_name: string;
  visibility: string;
  status: string;
  is_featured: boolean;
  created_at: string;
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

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Events</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">Moderate and feature events.</p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div>
      )}

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs font-black uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="py-3 pr-4">Title</th>
                  <th className="py-3 pr-4">Organization</th>
                  <th className="py-3 pr-4">Visibility</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Featured</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-3 pr-4 font-semibold max-w-[180px] truncate">{ev.title}</td>
                    <td className="py-3 pr-4 text-zinc-500 max-w-[120px] truncate">{ev.organizer_name}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${visibilityBadge[ev.visibility] ?? visibilityBadge.public}`}>
                        {ev.visibility}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge[ev.status] ?? statusBadge.pending}`}>
                        {ev.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${ev.is_featured ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-500'}`}>
                        {ev.is_featured ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {ev.status !== 'approved' && (
                          <button disabled={working === ev.id} onClick={() => updateEvent(ev.id, { status: 'approved' })}
                            className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                            {working === ev.id ? '…' : 'Approve'}
                          </button>
                        )}
                        {ev.status !== 'rejected' && (
                          <button disabled={working === ev.id} onClick={() => updateEvent(ev.id, { status: 'rejected' })}
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-50">
                            {working === ev.id ? '…' : 'Reject'}
                          </button>
                        )}
                        <button
                          disabled={working === ev.id}
                          onClick={() => updateEvent(ev.id, { is_featured: !ev.is_featured })}
                          className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-black text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                        >
                          {working === ev.id ? '…' : ev.is_featured ? 'Unfeature' : 'Feature'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-sm text-zinc-400">No events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
