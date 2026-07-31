import type { ReactNode } from 'react';
import Link from 'next/link';
import DashboardStatsCards from '@/components/dashboard/DashboardStatsCards';
import DashboardEmptyState from '@/components/dashboard/DashboardEmptyState';
import { TicketsChart, RevenueChart, DonationsChart, type DailyPoint } from '@/app/dashboard/reports/DashboardCharts';

type Analytics = {
  events: number;
  fundraisers: number;
  ticketsSold: number;
  revenue: number;
  donations: number;
  organizerProfiles: number;
  totalRaised: number;
};

type EventItem = {
  id: string | number;
  title: string;
  slug?: string | null;
  event_date?: string | null;
  city?: string | null;
};

type Donation = {
  id: string | number;
  donor_name?: string | null;
  amount: number;
  created_at: string;
};

type TicketOrder = {
  id: string | number;
  buyer_name?: string | null;
  buyer_email?: string | null;
  quantity: number;
  total_amount: number;
  created_at?: string | null;
  events?: { title?: string | null } | { title?: string | null }[] | null;
};

function money(value: number) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function dateLabel(date?: string | null) {
  if (!date) return 'Date TBA';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function firstRelation<T>(value?: T | T[] | null) {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

const panelClass = 'rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-6';

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-black tracking-tight text-zinc-950 sm:text-lg">{title}</h2>
      {action}
    </div>
  );
}

function ViewAllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs font-black text-violet-700 hover:underline sm:text-sm">
      View All →
    </Link>
  );
}

export default function DashboardView({
  displayName,
  analytics,
  events,
  donations,
  ticketOrders,
  chartTickets,
  chartRevenue,
  chartDonations,
}: {
  displayName?: string;
  analytics: Analytics;
  events: EventItem[];
  donations: Donation[];
  ticketOrders: TicketOrder[];
  chartTickets: DailyPoint[];
  chartRevenue: DailyPoint[];
  chartDonations: DailyPoint[];
}) {
  const accountLabel = displayName?.trim() || 'Account';
  const hasOrganizers = analytics.organizerProfiles > 0;

  const statItems = [
    { label: 'Events', value: analytics.events },
    { label: 'Fundraisers', value: analytics.fundraisers },
    { label: 'Tickets Sold', value: analytics.ticketsSold },
    { label: 'Revenue', value: money(analytics.revenue) },
    { label: 'Donations', value: money(analytics.totalRaised) },
    { label: 'Organization Profiles', value: analytics.organizerProfiles },
  ];

  const quickActions = [
    { href: '/dashboard/events/new', label: 'Create Event', className: 'bg-orange-600 text-white hover:bg-orange-700' },
    { href: '/dashboard/fundraisers/new', label: 'Start Fundraiser', className: 'bg-emerald-600 text-white hover:bg-emerald-700' },
    { href: '/create-organizer', label: 'Create Organization', className: 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50' },
  ];

  if (!hasOrganizers) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <header className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:rounded-2xl sm:px-6">
          <p className="text-xs font-black uppercase tracking-wide text-violet-600">Dashboard</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Welcome, {accountLabel}</h1>
          <p className="mt-2 text-sm font-medium text-zinc-500">Get started by creating your first organization profile.</p>
        </header>
        <DashboardEmptyState
          title="No organization profile yet"
          description="Create an organization before launching events or fundraisers."
          actionLabel="Create Organization"
          actionHref="/create-organizer"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:rounded-2xl sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Dashboard</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Welcome back, {accountLabel}</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">Your overview — events, fundraisers, tickets, and donations at a glance.</p>
      </header>

      <section className={panelClass}>
        <h2 className="text-sm font-black uppercase tracking-wide text-zinc-400">Quick Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-xl px-4 py-2.5 text-xs font-black transition sm:text-sm ${action.className}`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </section>

      <DashboardStatsCards items={statItems} className="sm:grid-cols-3 lg:grid-cols-6" />

      <section className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className={panelClass}>
          <SectionHeader title="Recent Events" action={<ViewAllLink href="/dashboard/events" />} />
          {events.length === 0 ? (
            <p className="text-sm font-medium text-zinc-500">No events yet.</p>
          ) : (
            <ul className="space-y-3">
              {events.slice(0, 5).map((event) => (
                <li key={event.id} className="rounded-xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/70">
                  <p className="truncate font-black text-zinc-900">{event.title}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">{dateLabel(event.event_date)} · {event.city || 'Location TBA'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={panelClass}>
          <SectionHeader title="Recent Donations" action={<ViewAllLink href="/dashboard/donations" />} />
          {donations.length === 0 ? (
            <p className="text-sm font-medium text-zinc-500">No donations yet.</p>
          ) : (
            <ul className="space-y-3">
              {donations.slice(0, 5).map((donation) => (
                <li key={donation.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/70">
                  <div className="min-w-0">
                    <p className="truncate font-black">{donation.donor_name || 'Anonymous'}</p>
                    <p className="text-xs text-zinc-500">{dateLabel(donation.created_at)}</p>
                  </div>
                  <p className="shrink-0 font-black text-emerald-700">{money(donation.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={panelClass}>
          <SectionHeader title="Recent Ticket Sales" action={<ViewAllLink href="/dashboard/attendees" />} />
          {ticketOrders.length === 0 ? (
            <p className="text-sm font-medium text-zinc-500">No ticket sales yet.</p>
          ) : (
            <ul className="space-y-3">
              {ticketOrders.slice(0, 5).map((order) => {
                const event = firstRelation(order.events);
                return (
                  <li key={order.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50/80 p-3 ring-1 ring-zinc-200/70">
                    <div className="min-w-0">
                      <p className="truncate font-black">{order.buyer_name || order.buyer_email || 'Guest'}</p>
                      <p className="truncate text-xs text-zinc-500">{event?.title || 'Event'} · Qty {order.quantity}</p>
                    </div>
                    <p className="shrink-0 font-black text-emerald-700">{money(order.total_amount)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className={panelClass}>
          <SectionHeader title="Ticket Trend" action={<ViewAllLink href="/dashboard/reports" />} />
          <TicketsChart data={chartTickets} />
        </div>
        <div className={panelClass}>
          <SectionHeader title="Revenue Trend" action={<ViewAllLink href="/dashboard/reports" />} />
          <RevenueChart data={chartRevenue} />
        </div>
        <div className={panelClass}>
          <SectionHeader title="Donation Trend" action={<ViewAllLink href="/dashboard/reports" />} />
          <DonationsChart data={chartDonations} />
        </div>
      </section>
    </div>
  );
}
