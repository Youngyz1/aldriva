/**
 * app/[locale]/admin/payments/page.tsx
 * Read-only view of all ticket orders and donations across the platform.
 */

import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from "@/lib/auth";
import { ResponsiveDataTable } from '@/components/dashboard/ResponsiveDataTable';
import { ResponsiveDataRow } from '@/components/dashboard/ResponsiveDataRow';

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
  // Explicit gate (F-10): do not rely solely on the layout header shortcut.
  await requireAdmin();
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
      <header className="pb-1">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Payments</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">Most recent 50 ticket orders and donations. Read only.</p>
      </header>

      {/* Ticket Orders */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-black tracking-tight text-zinc-950">Ticket Orders</h2>
        <ResponsiveDataTable
          totalCount={(orders ?? []).length}
          emptyMessage="No orders yet."
          columns={[
            { id: "buyer", header: "Buyer" },
            { id: "event", header: "Event", hideBelow: "md" },
            { id: "amount", header: "Amount" },
            { id: "status", header: "Status" },
            { id: "date", header: "Date", hideBelow: "lg" },
          ]}
        >
          {(orders ?? []).map((o) => {
            const ev = Array.isArray(o.events) ? o.events[0] : o.events;
            const buyer = o.buyer_name || o.buyer_email || 'Guest';
            const eventTitle = (ev as { title?: string } | null)?.title ?? '—';
            return (
              <ResponsiveDataRow
                key={o.id}
                id={o.id}
                desktopCells={[
                  <span key="buyer" className="font-semibold block">{buyer}</span>,
                  <span key="event" className="text-zinc-500 max-w-[160px] truncate block">{eventTitle}</span>,
                  <span key="amount" className="font-black text-zinc-900 block">{money(o.total_amount)}</span>,
                  <span key="status">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusClasses[o.status] ?? statusClasses.pending}`}>
                      {o.status}
                    </span>
                  </span>,
                  <span key="date" className="text-zinc-500 block">{dateLabel(o.created_at)}</span>,
                ]}
                identity={<span className="font-bold text-zinc-950 text-left line-clamp-1">{buyer}</span>}
                primaryMeta={<span className="text-xs text-zinc-500">{eventTitle} · {dateLabel(o.created_at)}</span>}
                statusBadge={
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusClasses[o.status] ?? statusClasses.pending}`}>
                    {o.status}
                  </span>
                }
                numericMetric={<span className="font-black text-zinc-950">{money(o.total_amount)}</span>}
                mobileDetails={
                  <div className="space-y-1 text-xs text-zinc-600">
                    <div><span className="font-bold text-zinc-500">Event:</span> {eventTitle}</div>
                    {o.buyer_email && <div><span className="font-bold text-zinc-500">Email:</span> {o.buyer_email}</div>}
                    <div><span className="font-bold text-zinc-500">Date:</span> {dateLabel(o.created_at)}</div>
                  </div>
                }
              />
            );
          })}
        </ResponsiveDataTable>
      </div>

      {/* Donations */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-black tracking-tight text-zinc-950">Donations</h2>
        <ResponsiveDataTable
          totalCount={(donations ?? []).length}
          emptyMessage="No donations yet."
          columns={[
            { id: "donor", header: "Donor" },
            { id: "fundraiser", header: "Fundraiser", hideBelow: "md" },
            { id: "amount", header: "Amount" },
            { id: "status", header: "Status" },
            { id: "date", header: "Date", hideBelow: "lg" },
          ]}
        >
          {(donations ?? []).map((d) => {
            const fr = Array.isArray(d.fundraisers) ? d.fundraisers[0] : d.fundraisers;
            const donor = d.donor_name || d.donor_email || 'Anonymous';
            const fundraiserTitle = (fr as { title?: string } | null)?.title ?? '—';
            return (
              <ResponsiveDataRow
                key={d.id}
                id={d.id}
                desktopCells={[
                  <span key="donor" className="font-semibold block">{donor}</span>,
                  <span key="fundraiser" className="text-zinc-500 max-w-[160px] truncate block">{fundraiserTitle}</span>,
                  <span key="amount" className="font-black text-emerald-700 block">{money(d.amount)}</span>,
                  <span key="status">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusClasses[d.status ?? 'succeeded'] ?? statusClasses.succeeded}`}>
                      {d.status ?? 'succeeded'}
                    </span>
                  </span>,
                  <span key="date" className="text-zinc-500 block">{dateLabel(d.created_at)}</span>,
                ]}
                identity={<span className="font-bold text-zinc-950 text-left line-clamp-1">{donor}</span>}
                primaryMeta={<span className="text-xs text-zinc-500">{fundraiserTitle} · {dateLabel(d.created_at)}</span>}
                statusBadge={
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusClasses[d.status ?? 'succeeded'] ?? statusClasses.succeeded}`}>
                    {d.status ?? 'succeeded'}
                  </span>
                }
                numericMetric={<span className="font-black text-emerald-700">{money(d.amount)}</span>}
                mobileDetails={
                  <div className="space-y-1 text-xs text-zinc-600">
                    <div><span className="font-bold text-zinc-500">Fundraiser:</span> {fundraiserTitle}</div>
                    {d.donor_email && <div><span className="font-bold text-zinc-500">Email:</span> {d.donor_email}</div>}
                    <div><span className="font-bold text-zinc-500">Date:</span> {dateLabel(d.created_at)}</div>
                  </div>
                }
              />
            );
          })}
        </ResponsiveDataTable>
      </div>
    </div>
  );
}
