import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { supabaseAdmin } from '@/lib/dashboard-context';
import type { DailyPoint, NamedValue, TopEvent } from '@/app/dashboard/reports/DashboardCharts';

function buildDateRange(days: number): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function shortDate(iso: string) {
  const [, m, day] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}`;
}

function resolveRange(sp: URLSearchParams) {
  const range = sp.get('range') ?? '30';
  const now = new Date();
  const end = sp.get('to') ? new Date(sp.get('to')!) : now;
  end.setHours(23, 59, 59, 999);

  let start: Date;
  if (range === 'custom' && sp.get('from')) {
    start = new Date(sp.get('from')!);
  } else {
    const days = range === '7' ? 7 : range === '90' ? 90 : range === '365' ? 365 : 30;
    start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
  }
  start.setHours(0, 0, 0, 0);

  const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  const dateRange: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dateRange.push(d.toISOString().slice(0, 10));
  }

  return { sinceISO: start.toISOString(), dateRange };
}

export async function GET(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { organizerIds } = auth.ctx;
  if (organizerIds.length === 0) {
    return NextResponse.json({
      stats: { tickets: 0, revenue: 0, donations: 0 },
      tickets: [],
      revenue: [],
      donations: [],
      topEvents: [],
      revenueByEvent: [],
      ticketsByEvent: [],
      donationsByCampaign: [],
      topOrganizers: [],
    });
  }

  const { sinceISO, dateRange } = resolveRange(req.nextUrl.searchParams);

  const [eventsResult, fundraisersResult, organizersResult] = await Promise.all([
    supabaseAdmin.from('events').select('id, title, organizer_id').in('organizer_id', organizerIds),
    supabaseAdmin.from('fundraisers').select('id, title, organizer_id').in('organizer_id', organizerIds),
    supabaseAdmin.from('organizers').select('id, name').in('id', organizerIds),
  ]);

  const events = eventsResult.data ?? [];
  const fundraisers = fundraisersResult.data ?? [];
  const organizers = organizersResult.data ?? [];
  const eventIds = events.map((e) => e.id);
  const fundraiserIds = fundraisers.map((f) => f.id);
  const eventMap = Object.fromEntries(events.map((e) => [e.id, e.title as string]));
  const fundraiserMap = Object.fromEntries(fundraisers.map((f) => [f.id, f.title as string]));
  const organizerMap = Object.fromEntries(organizers.map((o) => [o.id, o.name as string]));
  const eventOrgMap = Object.fromEntries(events.map((e) => [e.id, e.organizer_id as string]));

  const [ordersResult, donationRowsResult] = await Promise.all([
    eventIds.length > 0
      ? supabaseAdmin
          .from('ticket_orders')
          .select('event_id, quantity, total_amount, created_at')
          .eq('status', 'valid')
          .in('event_id', eventIds)
          .gte('created_at', sinceISO)
      : Promise.resolve({ data: [] }),
    fundraiserIds.length > 0
      ? supabaseAdmin
          .from('donations')
          .select('fundraiser_id, amount, created_at')
          .in('status', ['succeeded', 'completed'])
          .in('fundraiser_id', fundraiserIds)
          .gte('created_at', sinceISO)
      : Promise.resolve({ data: [] }),
  ]);

  const orders = ordersResult.data ?? [];
  const donationRows = donationRowsResult.data ?? [];

  const ticketsByDay: Record<string, number> = {};
  const revenueByDay: Record<string, number> = {};
  const topEventsAgg: Record<string, number> = {};
  const ticketsByEventAgg: Record<string, number> = {};
  const revenueByEventAgg: Record<string, number> = {};
  const organizerRevenue: Record<string, number> = {};

  for (const o of orders) {
    const day = (o.created_at as string).slice(0, 10);
    ticketsByDay[day] = (ticketsByDay[day] ?? 0) + Number(o.quantity ?? 1);
    revenueByDay[day] = (revenueByDay[day] ?? 0) + Number(o.total_amount ?? 0);
    topEventsAgg[o.event_id] = (topEventsAgg[o.event_id] ?? 0) + Number(o.total_amount ?? 0);
    ticketsByEventAgg[o.event_id] = (ticketsByEventAgg[o.event_id] ?? 0) + Number(o.quantity ?? 1);
    revenueByEventAgg[o.event_id] = (revenueByEventAgg[o.event_id] ?? 0) + Number(o.total_amount ?? 0);
    const orgId = eventOrgMap[o.event_id];
    if (orgId) organizerRevenue[orgId] = (organizerRevenue[orgId] ?? 0) + Number(o.total_amount ?? 0);
  }

  const donationsByDay: Record<string, number> = {};
  const donationsByCampaignAgg: Record<string, number> = {};
  for (const d of donationRows) {
    const day = (d.created_at as string).slice(0, 10);
    donationsByDay[day] = (donationsByDay[day] ?? 0) + Number(d.amount ?? 0);
    donationsByCampaignAgg[d.fundraiser_id] =
      (donationsByCampaignAgg[d.fundraiser_id] ?? 0) + Number(d.amount ?? 0);
    const fr = fundraisers.find((f) => f.id === d.fundraiser_id);
    if (fr?.organizer_id) {
      organizerRevenue[fr.organizer_id] =
        (organizerRevenue[fr.organizer_id] ?? 0) + Number(d.amount ?? 0);
    }
  }

  const tickets: DailyPoint[] = dateRange.map((d) => ({
    date: shortDate(d),
    value: ticketsByDay[d] ?? 0,
  }));
  const revenue: DailyPoint[] = dateRange.map((d) => ({
    date: shortDate(d),
    value: +(revenueByDay[d] ?? 0).toFixed(2),
  }));
  const donations: DailyPoint[] = dateRange.map((d) => ({
    date: shortDate(d),
    value: +(donationsByDay[d] ?? 0).toFixed(2),
  }));

  const topEvents: TopEvent[] = Object.entries(topEventsAgg)
    .map(([id, rev]) => ({ title: eventMap[id] ?? 'Unknown', revenue: rev }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const toNamed = (agg: Record<string, number>, map: Record<string, string>): NamedValue[] =>
    Object.entries(agg)
      .map(([id, value]) => ({ name: map[id] ?? 'Unknown', value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

  const totalTickets = orders.reduce((s, o) => s + Number(o.quantity ?? 1), 0);
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const totalDonated = donationRows.reduce((s, d) => s + Number(d.amount ?? 0), 0);

  return NextResponse.json({
    stats: { tickets: totalTickets, revenue: totalRevenue, donations: totalDonated },
    tickets,
    revenue,
    donations,
    topEvents,
    revenueByEvent: toNamed(revenueByEventAgg, eventMap),
    ticketsByEvent: toNamed(ticketsByEventAgg, eventMap),
    donationsByCampaign: toNamed(donationsByCampaignAgg, fundraiserMap),
    topOrganizers: Object.entries(organizerRevenue)
      .map(([id, value]) => ({ name: organizerMap[id] ?? 'Unknown', value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
  });
}
