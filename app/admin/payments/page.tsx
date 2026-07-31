/**
 * app/admin/payments/page.tsx
 * Read-only view of all ticket orders and donations across the platform.
 */

import { createClient } from '@supabase/supabase-js';

// Service role: bypasses RLS — admin operations only
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function money(n: number | null) {
  return `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function dateLabel(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const statusClasses: Record<string, string> = {
  valid:     'bg-emerald-100 text-emerald-700',
  used:      'bg-zinc-100 text-zinc-500',
  cancelled: 'bg-red-100 text-red-600',
  refunded:  'bg-orange-100 text-orange-600',
  succeeded: 'bg-emerald-100 text-emerald-700',
  pending:   'bg-amber-100 text-amber-700',
  failed:    'bg-red-100 text-red-600',
};

export default async function AdminPaymentsPage() {
  const [{ data: orders }, { data: donations }] = await Promise.all([
    supabaseAdmin
      .from('ticket_orders')
      .select('id, buyer_name, buyer_email, total_amount, status, created_at, events(title)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('donations')
      .select('id, donor_name, donor_email, amount, status, created_at, fundraisers(title)')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Payments</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">Most recent 50 ticket orders and donations. Read only.</p>
      </header>

      {/* Ticket Orders */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-black tracking-tight text-zinc-950">Ticket Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs font-black uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="py-3 pr-4">Buyer</th>
                <th className="py-3 pr-4">Event</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(orders ?? []).map((o) => {
                const ev = Array.isArray(o.events) ? o.events[0] : o.events;
                return (
                  <tr key={o.id}>
                    <td className="py-3 pr-4 font-semibold">{o.buyer_name || o.buyer_email || 'Guest'}</td>
                    <td className="py-3 pr-4 text-zinc-500 max-w-[160px] truncate">
                      {(ev as { title?: string } | null)?.title ?? '—'}
                    </td>
                    <td className="py-3 pr-4 font-black">{money(o.total_amount)}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusClasses[o.status] ?? statusClasses.pending}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 text-zinc-500">{dateLabel(o.created_at)}</td>
                  </tr>
                );
              })}
              {(orders ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-zinc-400">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Donations */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-black tracking-tight text-zinc-950">Donations</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs font-black uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="py-3 pr-4">Donor</th>
                <th className="py-3 pr-4">Fundraiser</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(donations ?? []).map((d) => {
                const fr = Array.isArray(d.fundraisers) ? d.fundraisers[0] : d.fundraisers;
                return (
                  <tr key={d.id}>
                    <td className="py-3 pr-4 font-semibold">{d.donor_name || d.donor_email || 'Anonymous'}</td>
                    <td className="py-3 pr-4 text-zinc-500 max-w-[160px] truncate">
                      {(fr as { title?: string } | null)?.title ?? '—'}
                    </td>
                    <td className="py-3 pr-4 font-black text-emerald-700">{money(d.amount)}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusClasses[d.status ?? 'succeeded'] ?? statusClasses.succeeded}`}>
                        {d.status ?? 'succeeded'}
                      </span>
                    </td>
                    <td className="py-3 text-zinc-500">{dateLabel(d.created_at)}</td>
                  </tr>
                );
              })}
              {(donations ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-zinc-400">No donations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
