/**
 * app/admin/payments/page.tsx
 * Read-only view of all ticket orders and donations across the platform.
 */

import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from "@/lib/auth";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { paymentsFooter, paymentsStrings as s, statusChips } from "./payments-strings";

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

/** Dot colors carry the old pill semantics; unknown statuses read as pending. */
const STATUS_DOT: Record<string, string> = {
  valid: 'bg-emerald-500',
  used: 'bg-zinc-400',
  cancelled: 'bg-red-500',
  refunded: 'bg-amber-500',
  succeeded: 'bg-emerald-500',
  pending: 'bg-amber-500',
  failed: 'bg-red-500',
};

const orderColumns: AdminColumn[] = [
  { id: "buyer", header: s.columns.buyer, role: "title" },
  { id: "event", header: s.columns.event, role: "meta" },
  { id: "amount", header: s.columns.amount, role: "value", align: "right" },
  { id: "status", header: s.columns.status, role: "meta" },
  { id: "date", header: s.columns.date, role: "detail", align: "right" },
];

const donationColumns: AdminColumn[] = [
  { id: "donor", header: s.columns.donor, role: "title" },
  { id: "fundraiser", header: s.columns.fundraiser, role: "meta" },
  { id: "amount", header: s.columns.amount, role: "value", align: "right" },
  { id: "status", header: s.columns.status, role: "meta" },
  { id: "date", header: s.columns.date, role: "detail", align: "right" },
];

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

  const orderRows = orders ?? [];
  const donationRows = donations ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={s.eyebrow}
        title={s.title}
        description={s.description}
      />

      <StatStrip
        items={[
          ...statusChips(orderRows, s.ordersNoun, "pending"),
          ...statusChips(donationRows, s.donationsNoun, "succeeded"),
        ]}
      />

      {/* Ticket Orders */}
      <section aria-label={s.ticketOrdersTitle}>
        <h2 className="mb-4 text-base font-black tracking-tight text-zinc-950">{s.ticketOrdersTitle}</h2>
        <AdminTable
          columns={orderColumns}
          rows={orderRows.map((o) => {
            const ev = Array.isArray(o.events) ? o.events[0] : o.events;
            return {
              id: o.id,
              cells: [
                <span key="buyer" className="block max-w-[200px] truncate">
                  {o.buyer_name || o.buyer_email || 'Guest'}
                </span>,
                <span key="event" className="block max-w-[160px] truncate text-zinc-500">
                  {(ev as { title?: string } | null)?.title ?? '—'}
                </span>,
                <span key="amount" className="font-black tabular-nums">
                  {money(o.total_amount)}
                </span>,
                <span key="status" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[o.status] ?? STATUS_DOT.pending}`}
                  />
                  <span>{o.status}</span>
                </span>,
                <span key="date" className="whitespace-nowrap text-zinc-500">
                  {dateLabel(o.created_at)}
                </span>,
              ],
            };
          })}
          emptyMessage={s.emptyOrders}
        />
      </section>

      {/* Donations */}
      <section aria-label={s.donationsTitle}>
        <h2 className="mb-4 text-base font-black tracking-tight text-zinc-950">{s.donationsTitle}</h2>
        <AdminTable
          columns={donationColumns}
          rows={donationRows.map((d) => {
            const fr = Array.isArray(d.fundraisers) ? d.fundraisers[0] : d.fundraisers;
            return {
              id: d.id,
              cells: [
                <span key="donor" className="block max-w-[200px] truncate">
                  {d.donor_name || d.donor_email || 'Anonymous'}
                </span>,
                <span key="fundraiser" className="block max-w-[160px] truncate text-zinc-500">
                  {(fr as { title?: string } | null)?.title ?? '—'}
                </span>,
                <span key="amount" className="font-black tabular-nums text-emerald-700">
                  {money(d.amount)}
                </span>,
                <span key="status" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[d.status ?? 'succeeded'] ?? STATUS_DOT.succeeded}`}
                  />
                  <span>{d.status ?? 'succeeded'}</span>
                </span>,
                <span key="date" className="whitespace-nowrap text-zinc-500">
                  {dateLabel(d.created_at)}
                </span>,
              ],
            };
          })}
          emptyMessage={s.emptyDonations}
        />
      </section>

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {paymentsFooter(orderRows.length, donationRows.length)}
          </p>
        </div>
      </div>
    </div>
  );
}
