/**
 * lib/dashboard-data.ts
 * Data aggregation for dashboard management APIs — scoped to user's organizers.
 */

import { supabaseAdmin } from '@/lib/dashboard-context';
import {
  getDateRangeStart,
  slugify,
  toCsv,
  type DateFilter,
} from '@/lib/admin-query';
import type {
  DashboardAttendeeDetail,
  DashboardAttendeeRow,
  DashboardAttendeeStats,
  DashboardDonationDetail,
  DashboardDonationRow,
  DashboardDonationStats,
  DashboardEventDetail,
  DashboardEventRow,
  DashboardEventStats,
  DashboardFundraiserDetail,
  DashboardFundraiserRow,
  DashboardFundraiserStats,
  DashboardOrganizerDetail,
  DashboardOrganizerRow,
  DashboardOrganizerStats,
  PaginatedResult,
} from '@/types/dashboard-management';

function paginate<T>(items: T[], page: number, perPage: number): PaginatedResult<T, never> & { items: T[] } {
  const total = items.length;
  const total_pages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(page, 1), total_pages);
  const offset = (safePage - 1) * perPage;
  return {
    items: items.slice(offset, offset + perPage),
    stats: {} as never,
    total,
    page: safePage,
    per_page: perPage,
    total_pages,
  };
}

async function getEventTicketMap(eventIds: string[]) {
  const ticketMap: Record<string, { count: number; revenue: number }> = {};
  if (eventIds.length === 0) return ticketMap;

  const { data: orders } = await supabaseAdmin
    .from('ticket_orders')
    .select('event_id, quantity, total_amount')
    .eq('status', 'valid')
    .in('event_id', eventIds);

  for (const order of orders ?? []) {
    const prev = ticketMap[order.event_id] ?? { count: 0, revenue: 0 };
    ticketMap[order.event_id] = {
      count: prev.count + Number(order.quantity ?? 1),
      revenue: prev.revenue + Number(order.total_amount ?? 0),
    };
  }
  return ticketMap;
}

function matchesSearch(query: string, ...fields: (string | null | undefined)[]) {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}

export async function queryDashboardEvents(params: {
  organizerIds: string[];
  search?: string;
  status?: string;
  visibility?: string;
  date?: DateFilter;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<DashboardEventRow, DashboardEventStats>> {
  const {
    organizerIds,
    search = '',
    status = 'all',
    visibility = 'all',
    date = 'all',
    sort = 'newest',
    page = 1,
    perPage = 25,
  } = params;

  const emptyStats: DashboardEventStats = {
    total: 0,
    published: 0,
    draft: 0,
    tickets_sold: 0,
    revenue: 0,
  };

  if (organizerIds.length === 0) {
    return { items: [], stats: emptyStats, total: 0, page: 1, per_page: perPage, total_pages: 1 };
  }

  const dateStart = getDateRangeStart(date);
  let query = supabaseAdmin
    .from('events')
    .select('id, title, slug, event_date, status, visibility, created_at')
    .in('organizer_id', organizerIds);

  if (dateStart) query = query.gte('created_at', dateStart);

  const { data: events, error } = await query;
  if (error) throw new Error(error.message);

  const eventIds = (events ?? []).map((e) => e.id);
  const ticketMap = await getEventTicketMap(eventIds);

  let rows: DashboardEventRow[] = (events ?? []).map((ev) => {
    const tickets = ticketMap[ev.id] ?? { count: 0, revenue: 0 };
    return {
      id: ev.id,
      title: ev.title,
      slug: ev.slug,
      event_date: ev.event_date,
      status: (ev.status ?? 'approved') as DashboardEventRow['status'],
      visibility: ev.visibility ?? 'public',
      ticket_count: tickets.count,
      revenue: tickets.revenue,
      created_at: ev.created_at,
    };
  });

  if (status === 'published') rows = rows.filter((r) => r.status === 'approved');
  else if (status === 'draft') rows = rows.filter((r) => r.status === 'pending');
  else if (status !== 'all') rows = rows.filter((r) => r.status === status);

  if (visibility !== 'all') rows = rows.filter((r) => r.visibility === visibility);

  if (search) {
    rows = rows.filter((r) => matchesSearch(search, r.title, r.slug ?? ''));
  }

  const stats: DashboardEventStats = {
    total: rows.length,
    published: rows.filter((r) => r.status === 'approved').length,
    draft: rows.filter((r) => r.status === 'pending').length,
    tickets_sold: rows.reduce((s, r) => s + r.ticket_count, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
  };

  switch (sort) {
    case 'oldest':
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'alphabetical':
      rows.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'most_tickets':
      rows.sort((a, b) => b.ticket_count - a.ticket_count || a.title.localeCompare(b.title));
      break;
    case 'most_revenue':
      rows.sort((a, b) => b.revenue - a.revenue || a.title.localeCompare(b.title));
      break;
    case 'event_date':
      rows.sort(
        (a, b) =>
          new Date(a.event_date ?? 0).getTime() - new Date(b.event_date ?? 0).getTime()
      );
      break;
    case 'newest':
    default:
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const paged = paginate(rows, page, perPage);
  return { ...paged, stats };
}

export async function getDashboardEventDetail(
  organizerIds: string[],
  eventId: string
): Promise<DashboardEventDetail | null> {
  if (organizerIds.length === 0) return null;

  const { data: ev } = await supabaseAdmin
    .from('events')
    .select('id, title, slug, event_date, status, visibility, created_at, category, city, description, organizer_id, organizers(name)')
    .eq('id', eventId)
    .in('organizer_id', organizerIds)
    .maybeSingle();

  if (!ev) return null;

  const ticketMap = await getEventTicketMap([ev.id]);
  const tickets = ticketMap[ev.id] ?? { count: 0, revenue: 0 };
  const org = Array.isArray(ev.organizers) ? ev.organizers[0] : ev.organizers;

  return {
    id: ev.id,
    title: ev.title,
    slug: ev.slug,
    event_date: ev.event_date,
    status: (ev.status ?? 'approved') as DashboardEventRow['status'],
    visibility: ev.visibility ?? 'public',
    ticket_count: tickets.count,
    revenue: tickets.revenue,
    created_at: ev.created_at,
    category: ev.category,
    city: ev.city,
    description: ev.description,
    organizer_name: (org as { name?: string } | null)?.name ?? '—',
  };
}

export async function queryDashboardFundraisers(params: {
  organizerIds: string[];
  search?: string;
  status?: string;
  category?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<DashboardFundraiserRow, DashboardFundraiserStats>> {
  const {
    organizerIds,
    search = '',
    status = 'all',
    category = 'all',
    sort = 'newest',
    page = 1,
    perPage = 25,
  } = params;

  const emptyStats: DashboardFundraiserStats = {
    total: 0,
    active: 0,
    completed: 0,
    raised: 0,
    donors: 0,
  };

  if (organizerIds.length === 0) {
    return { items: [], stats: emptyStats, total: 0, page: 1, per_page: perPage, total_pages: 1 };
  }

  const { data: fundraisers, error } = await supabaseAdmin
    .from('fundraisers')
    .select('id, title, slug, goal, raised, category, created_at, status')
    .in('organizer_id', organizerIds);

  if (error) throw new Error(error.message);

  const fundraiserIds = (fundraisers ?? []).map((f) => f.id);
  const donorMap: Record<string, number> = {};

  if (fundraiserIds.length > 0) {
    const { data: donations } = await supabaseAdmin
      .from('donations')
      .select('fundraiser_id')
      .in('fundraiser_id', fundraiserIds)
      .in('status', ['succeeded', 'completed']);

    for (const d of donations ?? []) {
      donorMap[d.fundraiser_id] = (donorMap[d.fundraiser_id] ?? 0) + 1;
    }
  }

  let rows: DashboardFundraiserRow[] = (fundraisers ?? []).map((fr) => {
    const goal = Number(fr.goal ?? 0);
    const raised = Number(fr.raised ?? 0);
    const progress = goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
    const campaignStatus: 'active' | 'completed' = goal > 0 && raised >= goal ? 'completed' : 'active';
    return {
      id: fr.id,
      title: fr.title,
      slug: fr.slug,
      category: fr.category ?? null,
      goal,
      raised,
      donor_count: donorMap[fr.id] ?? 0,
      progress,
      status: campaignStatus,
      review_status: (fr.status ?? 'published') as DashboardFundraiserRow['review_status'],
      created_at: fr.created_at,
    };
  });

  if (status === 'active') rows = rows.filter((r) => r.status === 'active');
  else if (status === 'completed') rows = rows.filter((r) => r.status === 'completed');
  if (category !== 'all') rows = rows.filter((r) => (r.category ?? '') === category);
  if (search) rows = rows.filter((r) => matchesSearch(search, r.title, r.slug ?? ''));

  const stats: DashboardFundraiserStats = {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    raised: rows.reduce((s, r) => s + r.raised, 0),
    donors: rows.reduce((s, r) => s + r.donor_count, 0),
  };

  switch (sort) {
    case 'oldest':
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'alphabetical':
      rows.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'most_raised':
      rows.sort((a, b) => b.raised - a.raised || a.title.localeCompare(b.title));
      break;
    case 'most_donors':
      rows.sort((a, b) => b.donor_count - a.donor_count || a.title.localeCompare(b.title));
      break;
    case 'progress':
      rows.sort((a, b) => b.progress - a.progress || a.title.localeCompare(b.title));
      break;
    case 'newest':
    default:
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const paged = paginate(rows, page, perPage);
  return { ...paged, stats };
}

export async function getDashboardFundraiserDetail(
  organizerIds: string[],
  fundraiserId: string
): Promise<DashboardFundraiserDetail | null> {
  if (organizerIds.length === 0) return null;

  const { data: fr } = await supabaseAdmin
    .from('fundraisers')
    .select('id, title, slug, goal, raised, category, status, created_at, story, organizer_id, organizers(name)')
    .eq('id', fundraiserId)
    .in('organizer_id', organizerIds)
    .maybeSingle();

  if (!fr) return null;

  const [{ count: donorCount }, { count: updateCount }] = await Promise.all([
    supabaseAdmin
      .from('donations')
      .select('id', { count: 'exact', head: true })
      .eq('fundraiser_id', fr.id)
      .in('status', ['succeeded', 'completed']),
    supabaseAdmin
      .from('fundraiser_updates')
      .select('id', { count: 'exact', head: true })
      .eq('fundraiser_id', fr.id),
  ]);

  const goal = Number(fr.goal ?? 0);
  const raised = Number(fr.raised ?? 0);
  const progress = goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  const org = Array.isArray(fr.organizers) ? fr.organizers[0] : fr.organizers;

  return {
    id: fr.id,
    title: fr.title,
    slug: fr.slug,
    category: fr.category ?? null,
    goal,
    raised,
    donor_count: donorCount ?? 0,
    progress,
    status: goal > 0 && raised >= goal ? 'completed' : 'active',
    review_status: ((fr as unknown as { status?: string }).status ?? 'published') as DashboardFundraiserRow['review_status'],
    created_at: fr.created_at,
    short_description: fr.story ? String(fr.story).slice(0, 200) : null,
    story: fr.story,
    organizer_name: (org as { name?: string } | null)?.name ?? '—',
    update_count: updateCount ?? 0,
  };
}

export async function queryDashboardOrganizers(params: {
  organizerIds: string[];
  search?: string;
  status?: string;
  verification?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<DashboardOrganizerRow, DashboardOrganizerStats>> {
  const {
    organizerIds,
    search = '',
    status = 'all',
    verification = 'all',
    sort = 'newest',
    page = 1,
    perPage = 25,
  } = params;

  const emptyStats: DashboardOrganizerStats = {
    total: 0,
    verified: 0,
    pending: 0,
    followers: 0,
    revenue: 0,
  };

  if (organizerIds.length === 0) {
    return { items: [], stats: emptyStats, total: 0, page: 1, per_page: perPage, total_pages: 1 };
  }

  const { data: organizers, error } = await supabaseAdmin
    .from('organizers')
    .select('id, name, photo, status, created_at')
    .in('id', organizerIds);

  if (error) throw new Error(error.message);

  const ids = (organizers ?? []).map((o) => o.id);

  const [eventsRes, fundraisersRes, followsRes, ordersRes] = await Promise.all([
    supabaseAdmin.from('events').select('id, organizer_id').in('organizer_id', ids),
    supabaseAdmin.from('fundraisers').select('id, organizer_id, raised').in('organizer_id', ids),
    supabaseAdmin.from('organizer_follows').select('organizer_id').in('organizer_id', ids),
    supabaseAdmin
      .from('events')
      .select('id, organizer_id')
      .in('organizer_id', ids),
  ]);

  const events = eventsRes.data ?? [];
  const fundraisers = fundraisersRes.data ?? [];
  const follows = followsRes.data ?? [];
  const eventIdToOrg = new Map(events.map((e) => [e.id, e.organizer_id]));
  const allEventIds = events.map((e) => e.id);

  const revenueMap = new Map<string, number>();
  for (const fr of fundraisers) {
    if (!fr.organizer_id) continue;
    revenueMap.set(
      fr.organizer_id,
      (revenueMap.get(fr.organizer_id) ?? 0) + Number(fr.raised ?? 0)
    );
  }

  if (allEventIds.length > 0) {
    const { data: orders } = await supabaseAdmin
      .from('ticket_orders')
      .select('event_id, total_amount')
      .eq('status', 'valid')
      .in('event_id', allEventIds);

    for (const order of orders ?? []) {
      const orgId = eventIdToOrg.get(order.event_id);
      if (!orgId) continue;
      revenueMap.set(orgId, (revenueMap.get(orgId) ?? 0) + Number(order.total_amount ?? 0));
    }
  }

  let rows: DashboardOrganizerRow[] = (organizers ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: slugify(org.name),
    photo: org.photo,
    status: org.status ?? 'pending',
    follower_count: follows.filter((f) => f.organizer_id === org.id).length,
    event_count: events.filter((e) => e.organizer_id === org.id).length,
    fundraiser_count: fundraisers.filter((f) => f.organizer_id === org.id).length,
    revenue: revenueMap.get(org.id) ?? 0,
    created_at: org.created_at,
  }));

  if (status !== 'all') rows = rows.filter((r) => r.status === status);
  if (verification === 'verified') rows = rows.filter((r) => r.status === 'verified');
  else if (verification === 'pending') rows = rows.filter((r) => r.status === 'pending');
  if (search) rows = rows.filter((r) => matchesSearch(search, r.name, r.id, r.slug));

  const stats: DashboardOrganizerStats = {
    total: rows.length,
    verified: rows.filter((r) => r.status === 'verified').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    followers: rows.reduce((s, r) => s + r.follower_count, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
  };

  switch (sort) {
    case 'oldest':
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'alphabetical':
      rows.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'most_followers':
      rows.sort((a, b) => b.follower_count - a.follower_count || a.name.localeCompare(b.name));
      break;
    case 'most_events':
      rows.sort((a, b) => b.event_count - a.event_count || a.name.localeCompare(b.name));
      break;
    case 'most_revenue':
      rows.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
      break;
    case 'newest':
    default:
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const paged = paginate(rows, page, perPage);
  return { ...paged, stats };
}

export async function getDashboardOrganizerDetail(
  organizerIds: string[],
  orgId: string
): Promise<DashboardOrganizerDetail | null> {
  if (!organizerIds.includes(orgId)) return null;

  const result = await queryDashboardOrganizers({
    organizerIds: [orgId],
    page: 1,
    perPage: 1,
  });
  const row = result.items[0];
  if (!row) return null;

  const { data: org } = await supabaseAdmin
    .from('organizers')
    .select('bio, website, visibility')
    .eq('id', orgId)
    .maybeSingle();

  return {
    ...row,
    bio: org?.bio ?? null,
    website: org?.website ?? null,
    visibility: org?.visibility ?? 'public',
  };
}

export async function queryDashboardDonations(params: {
  organizerIds: string[];
  search?: string;
  campaign?: string;
  status?: string;
  date?: DateFilter;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<DashboardDonationRow, DashboardDonationStats>> {
  const {
    organizerIds,
    search = '',
    campaign = 'all',
    status = 'all',
    date = 'all',
    sort = 'newest',
    page = 1,
    perPage = 25,
  } = params;

  const emptyStats: DashboardDonationStats = {
    total_raised: 0,
    donations: 0,
    average_gift: 0,
    largest_gift: 0,
  };

  if (organizerIds.length === 0) {
    return { items: [], stats: emptyStats, total: 0, page: 1, per_page: perPage, total_pages: 1 };
  }

  const { data: fundraisers } = await supabaseAdmin
    .from('fundraisers')
    .select('id, title, slug')
    .in('organizer_id', organizerIds);

  const frMap = Object.fromEntries((fundraisers ?? []).map((f) => [f.id, f]));
  const fundraiserIds = Object.keys(frMap);
  if (fundraiserIds.length === 0) {
    return { items: [], stats: emptyStats, total: 0, page: 1, per_page: perPage, total_pages: 1 };
  }

  const dateStart = getDateRangeStart(date);
  let donationQuery = supabaseAdmin
    .from('donations')
    .select('id, fundraiser_id, donor_name, donor_email, amount, status, created_at')
    .in('fundraiser_id', fundraiserIds);

  if (dateStart) donationQuery = donationQuery.gte('created_at', dateStart);

  const { data: donations, error } = await donationQuery;
  if (error) throw new Error(error.message);

  let rows: DashboardDonationRow[] = (donations ?? []).map((d) => {
    const fr = frMap[d.fundraiser_id];
    return {
      id: d.id,
      donor_name: d.donor_name || 'Anonymous',
      donor_email: d.donor_email || '',
      campaign_id: d.fundraiser_id,
      campaign_title: fr?.title ?? '—',
      campaign_slug: fr?.slug ?? null,
      amount: Number(d.amount ?? 0),
      status: d.status ?? 'succeeded',
      created_at: d.created_at,
    };
  });

  if (campaign !== 'all') rows = rows.filter((r) => r.campaign_id === campaign);
  if (status !== 'all') rows = rows.filter((r) => r.status === status);
  if (search) {
    rows = rows.filter((r) =>
      matchesSearch(search, r.donor_name, r.donor_email, r.campaign_title)
    );
  }

  const succeeded = rows.filter((r) => r.status === 'succeeded' || r.status === 'completed');
  const amounts = succeeded.map((r) => r.amount);
  const stats: DashboardDonationStats = {
    total_raised: amounts.reduce((s, n) => s + n, 0),
    donations: rows.length,
    average_gift: amounts.length ? amounts.reduce((s, n) => s + n, 0) / amounts.length : 0,
    largest_gift: amounts.length ? Math.max(...amounts) : 0,
  };

  switch (sort) {
    case 'oldest':
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'amount_high':
      rows.sort((a, b) => b.amount - a.amount);
      break;
    case 'amount_low':
      rows.sort((a, b) => a.amount - b.amount);
      break;
    case 'newest':
    default:
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const paged = paginate(rows, page, perPage);
  return { ...paged, stats };
}

export async function getDashboardDonationDetail(
  organizerIds: string[],
  donationId: string
): Promise<DashboardDonationDetail | null> {
  const { data: d } = await supabaseAdmin
    .from('donations')
    .select('id, fundraiser_id, donor_name, donor_email, amount, status, created_at, message, fundraisers(title, slug, organizer_id)')
    .eq('id', donationId)
    .maybeSingle();

  if (!d) return null;
  const fr = Array.isArray(d.fundraisers) ? d.fundraisers[0] : d.fundraisers;
  const orgId = (fr as { organizer_id?: string } | null)?.organizer_id;
  if (!orgId || !organizerIds.includes(orgId)) return null;

  return {
    id: d.id,
    donor_name: d.donor_name || 'Anonymous',
    donor_email: d.donor_email || '',
    campaign_id: d.fundraiser_id,
    campaign_title: (fr as { title?: string } | null)?.title ?? '—',
    campaign_slug: (fr as { slug?: string | null } | null)?.slug ?? null,
    amount: Number(d.amount ?? 0),
    status: d.status ?? 'succeeded',
    created_at: d.created_at,
    message: d.message ?? null,
  };
}

export async function queryDashboardAttendees(params: {
  organizerIds: string[];
  search?: string;
  event?: string;
  status?: string;
  date?: DateFilter;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<DashboardAttendeeRow, DashboardAttendeeStats>> {
  const {
    organizerIds,
    search = '',
    event: eventFilter = 'all',
    status = 'all',
    date = 'all',
    sort = 'newest',
    page = 1,
    perPage = 25,
  } = params;

  const emptyStats: DashboardAttendeeStats = {
    total_attendees: 0,
    tickets_sold: 0,
    revenue: 0,
    checked_in: 0,
  };

  if (organizerIds.length === 0) {
    return { items: [], stats: emptyStats, total: 0, page: 1, per_page: perPage, total_pages: 1 };
  }

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, title')
    .in('organizer_id', organizerIds);

  const eventMap = Object.fromEntries((events ?? []).map((e) => [e.id, e.title as string]));
  const eventIds = Object.keys(eventMap);
  if (eventIds.length === 0) {
    return { items: [], stats: emptyStats, total: 0, page: 1, per_page: perPage, total_pages: 1 };
  }

  const dateStart = getDateRangeStart(date);
  let orderQuery = supabaseAdmin
    .from('ticket_orders')
    .select('id, event_id, buyer_name, buyer_email, quantity, total_amount, status, created_at, qr_code')
    .in('event_id', eventIds);

  if (dateStart) orderQuery = orderQuery.gte('created_at', dateStart);

  const { data: orders, error } = await orderQuery;
  if (error) throw new Error(error.message);

  let rows: DashboardAttendeeRow[] = (orders ?? []).map((o) => ({
    id: o.id,
    attendee_name: o.buyer_name || 'Guest',
    email: o.buyer_email || '',
    event_id: o.event_id,
    event_title: eventMap[o.event_id] ?? '—',
    quantity: Number(o.quantity ?? 1),
    paid: Number(o.total_amount ?? 0),
    status: o.status ?? 'valid',
    created_at: o.created_at,
    qr_code: o.qr_code,
  }));

  if (eventFilter !== 'all') rows = rows.filter((r) => r.event_id === eventFilter);
  if (status !== 'all') rows = rows.filter((r) => r.status === status);
  if (search) {
    rows = rows.filter((r) => matchesSearch(search, r.attendee_name, r.email, r.event_title));
  }

  const stats: DashboardAttendeeStats = {
    total_attendees: rows.length,
    tickets_sold: rows.reduce((s, r) => s + r.quantity, 0),
    revenue: rows.reduce((s, r) => s + r.paid, 0),
    checked_in: rows.filter((r) => r.status === 'used').length,
  };

  switch (sort) {
    case 'oldest':
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      break;
    case 'amount_high':
      rows.sort((a, b) => b.paid - a.paid);
      break;
    case 'name':
      rows.sort((a, b) => a.attendee_name.localeCompare(b.attendee_name));
      break;
    case 'newest':
    default:
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const paged = paginate(rows, page, perPage);
  return { ...paged, stats };
}

export async function getDashboardAttendeeDetail(
  organizerIds: string[],
  orderId: string
): Promise<DashboardAttendeeDetail | null> {
  const { data: o } = await supabaseAdmin
    .from('ticket_orders')
    .select('id, event_id, buyer_name, buyer_email, quantity, total_amount, status, created_at, qr_code, seat_label, checked_in_at, events(title, slug, organizer_id)')
    .eq('id', orderId)
    .maybeSingle();

  if (!o) return null;
  const ev = Array.isArray(o.events) ? o.events[0] : o.events;
  const orgId = (ev as { organizer_id?: string } | null)?.organizer_id;
  if (!orgId || !organizerIds.includes(orgId)) return null;

  return {
    id: o.id,
    attendee_name: o.buyer_name || 'Guest',
    email: o.buyer_email || '',
    event_id: o.event_id,
    event_title: (ev as { title?: string } | null)?.title ?? '—',
    event_slug: (ev as { slug?: string | null } | null)?.slug ?? null,
    quantity: Number(o.quantity ?? 1),
    paid: Number(o.total_amount ?? 0),
    status: o.status ?? 'valid',
    created_at: o.created_at,
    qr_code: o.qr_code,
    seat_label: o.seat_label ?? null,
    checked_in_at: o.checked_in_at ?? null,
  };
}

export function exportEventsCsv(rows: DashboardEventRow[]) {
  return toCsv(
    rows.map((r) => ({
      title: r.title,
      date: r.event_date,
      status: r.status,
      visibility: r.visibility,
      tickets: r.ticket_count,
      revenue: r.revenue,
    })),
    ['title', 'date', 'status', 'visibility', 'tickets', 'revenue']
  );
}

export function exportFundraisersCsv(rows: DashboardFundraiserRow[]) {
  return toCsv(
    rows.map((r) => ({
      campaign: r.title,
      category: r.category || 'Other',
      raised: r.raised,
      goal: r.goal,
      progress: `${r.progress}%`,
      donors: r.donor_count,
      status: r.status,
    })),
    ['campaign', 'category', 'raised', 'goal', 'progress', 'donors', 'status']
  );
}

export function exportOrganizersCsv(rows: DashboardOrganizerRow[]) {
  return toCsv(
    rows.map((r) => ({
      name: r.name,
      followers: r.follower_count,
      events: r.event_count,
      fundraisers: r.fundraiser_count,
      revenue: r.revenue,
      status: r.status,
    })),
    ['name', 'followers', 'events', 'fundraisers', 'revenue', 'status']
  );
}

export function exportDonationsCsv(rows: DashboardDonationRow[]) {
  return toCsv(
    rows.map((r) => ({
      donor: r.donor_name,
      email: r.donor_email,
      campaign: r.campaign_title,
      amount: r.amount,
      status: r.status,
      date: r.created_at,
    })),
    ['donor', 'email', 'campaign', 'amount', 'status', 'date']
  );
}

export function exportAttendeesCsv(rows: DashboardAttendeeRow[]) {
  return toCsv(
    rows.map((r) => ({
      attendee: r.attendee_name,
      email: r.email,
      event: r.event_title,
      quantity: r.quantity,
      paid: r.paid,
      status: r.status,
      date: r.created_at,
    })),
    ['attendee', 'email', 'event', 'quantity', 'paid', 'status', 'date']
  );
}
