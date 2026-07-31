/**
 * lib/admin-data.ts
 * Shared data aggregation helpers for admin management APIs.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  formatAdminMoney,
  getDateRangeStart,
  getUserDisplayName,
  getUserUsername,
  matchesOrganizerSearch,
  matchesUserSearch,
  slugify,
  type DateFilter,
} from '@/lib/admin-query';
import type {
  AdminOrganizerDetail,
  AdminOrganizerRow,
  AdminOrganizerStats,
  AdminUserDetail,
  AdminUserRow,
  AdminUserStats,
  OrganizerSort,
  OrganizerStatus,
  UserActivity,
  UserRole,
  UserSort,
  UserStatus,
} from '@/types/admin-management';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function listAllAuthUsers(client: SupabaseClient = supabaseAdmin) {
  const perPage = 1000;
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) return { users: [], error: error.message };
    users.push(...(data.users ?? []));
    if ((data.users ?? []).length < perPage) break;
    page += 1;
  }

  return { users, error: null };
}

export async function getOrganizerStats(): Promise<AdminOrganizerStats> {
  const statuses: OrganizerStatus[] = ['pending', 'verified', 'suspended', 'rejected'];
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count } = await supabaseAdmin
        .from('organizers')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      return { status, count: count ?? 0 };
    })
  );

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count])) as Record<OrganizerStatus, number>;
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);

  return {
    pending: byStatus.pending ?? 0,
    verified: byStatus.verified ?? 0,
    suspended: byStatus.suspended ?? 0,
    rejected: byStatus.rejected ?? 0,
    total,
  };
}

export async function getUserStats(): Promise<AdminUserStats> {
  const [totalRes, activeRes, suspendedRes, adminsRes, organizersRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'organizer'),
  ]);

  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    suspended: suspendedRes.count ?? 0,
    admins: adminsRes.count ?? 0,
    organizers: organizersRes.count ?? 0,
  };
}

async function getOrganizerCountMaps(organizerIds: string[]) {
  const eventCounts = new Map<string, number>();
  const fundraiserCounts = new Map<string, number>();
  const followerCounts = new Map<string, number>();
  const revenueMap = new Map<string, number>();

  if (organizerIds.length === 0) {
    return { eventCounts, fundraiserCounts, followerCounts, revenueMap };
  }

  const [eventsRes, fundraisersRes, followsRes] = await Promise.all([
    supabaseAdmin.from('events').select('organizer_id').in('organizer_id', organizerIds),
    supabaseAdmin.from('fundraisers').select('organizer_id, raised').in('organizer_id', organizerIds),
    supabaseAdmin.from('organizer_follows').select('organizer_id').in('organizer_id', organizerIds),
  ]);

  for (const event of eventsRes.data ?? []) {
    if (!event.organizer_id) continue;
    eventCounts.set(event.organizer_id, (eventCounts.get(event.organizer_id) ?? 0) + 1);
  }

  for (const fundraiser of fundraisersRes.data ?? []) {
    if (!fundraiser.organizer_id) continue;
    fundraiserCounts.set(
      fundraiser.organizer_id,
      (fundraiserCounts.get(fundraiser.organizer_id) ?? 0) + 1
    );
    revenueMap.set(
      fundraiser.organizer_id,
      (revenueMap.get(fundraiser.organizer_id) ?? 0) + Number(fundraiser.raised ?? 0)
    );
  }

  for (const follow of followsRes.data ?? []) {
    if (!follow.organizer_id) continue;
    followerCounts.set(follow.organizer_id, (followerCounts.get(follow.organizer_id) ?? 0) + 1);
  }

  const { data: eventRows } = await supabaseAdmin
    .from('events')
    .select('id, organizer_id')
    .in('organizer_id', organizerIds);

  const eventIdToOrganizer = new Map((eventRows ?? []).map((e) => [e.id, e.organizer_id]));
  const allEventIds = (eventRows ?? []).map((e) => e.id);

  if (allEventIds.length > 0) {
    const { data: orders } = await supabaseAdmin
      .from('ticket_orders')
      .select('event_id, total_amount')
      .in('event_id', allEventIds);

    for (const order of orders ?? []) {
      const orgId = eventIdToOrganizer.get(order.event_id);
      if (!orgId) continue;
      revenueMap.set(orgId, (revenueMap.get(orgId) ?? 0) + Number(order.total_amount ?? 0));
    }
  }

  return { eventCounts, fundraiserCounts, followerCounts, revenueMap };
}

function sortOrganizers(rows: AdminOrganizerRow[], sort: OrganizerSort) {
  const copy = [...rows];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    case 'alphabetical':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'most_events':
      return copy.sort((a, b) => b.event_count - a.event_count || a.name.localeCompare(b.name));
    case 'most_fundraisers':
      return copy.sort((a, b) => b.fundraiser_count - a.fundraiser_count || a.name.localeCompare(b.name));
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export async function queryOrganizers(params: {
  search?: string;
  status?: string;
  date?: DateFilter;
  sort?: OrganizerSort;
  page?: number;
  perPage?: number;
}) {
  const {
    search = '',
    status = 'all',
    date = 'all',
    sort = 'newest',
    page = 1,
    perPage = 25,
  } = params;

  const dateStart = getDateRangeStart(date);
  let query = supabaseAdmin
    .from('organizers')
    .select('id, user_id, name, status, created_at, verified_at, bio, photo, website, follower_offset, events_offset');

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (dateStart) {
    query = query.gte('created_at', dateStart);
  }

  const { data: organizers, error } = await query;
  if (error) throw new Error(error.message);

  const authResult = await listAllAuthUsers();
  if (authResult.error) throw new Error(authResult.error);

  const emailMap = new Map(authResult.users.map((u) => [u.id, u.email ?? '']));
  const profileMap = new Map<string, { account_info?: Record<string, unknown> }>();

  const userIds = [...new Set((organizers ?? []).map((o) => o.user_id))];
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, account_info')
      .in('id', userIds);
    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, profile);
    }
  }

  const filtered = (organizers ?? []).filter((org) => {
    const email = emailMap.get(org.user_id) ?? '';
    return matchesOrganizerSearch(search, org, email);
  });

  const organizerIds = filtered.map((o) => o.id);
  const { eventCounts, fundraiserCounts, followerCounts, revenueMap } = await getOrganizerCountMaps(organizerIds);

  const rows: AdminOrganizerRow[] = filtered.map((org) => {
    const authUser = authResult.users.find((u) => u.id === org.user_id);
    const profile = profileMap.get(org.user_id);
    const ownerName = authUser
      ? getUserDisplayName(profile ?? null, authUser)
      : 'Unknown';
    const eventCount = eventCounts.get(org.id) ?? 0;
    const fundraiserCount = fundraiserCounts.get(org.id) ?? 0;
    const followerCount = followerCounts.get(org.id) ?? 0;
    const revenue = revenueMap.get(org.id) ?? 0;

    return {
      id: org.id,
      user_id: org.user_id,
      name: org.name,
      slug: slugify(org.name) || org.id.slice(0, 8),
      email: emailMap.get(org.user_id) ?? '',
      owner_name: ownerName,
      status: (org.status ?? 'pending') as OrganizerStatus,
      event_count: eventCount,
      fundraiser_count: fundraiserCount,
      follower_count: followerCount,
      follower_offset: org.follower_offset ?? 0,
      events_offset: org.events_offset ?? 0,
      revenue,
      created_at: org.created_at,
      verified_at: org.verified_at ?? null,
      badges: [],
    };
  });

  for (const row of rows) {
    row.badges = [];
    if (row.status === 'verified') row.badges.push('verified');
    if (row.status === 'suspended') row.badges.push('suspended');
    if (row.event_count >= 10) row.badges.push('top');
    if (row.revenue >= 10000) row.badges.push('revenue');
  }

  const sorted = sortOrganizers(rows, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const offset = (page - 1) * perPage;
  const items = sorted.slice(offset, offset + perPage);
  const stats = await getOrganizerStats();

  return { items, stats, total, page, per_page: perPage, total_pages: totalPages };
}

async function getUserActivityMaps() {
  const [organizersRes, eventsRes, fundraisersRes] = await Promise.all([
    supabaseAdmin.from('organizers').select('id, user_id'),
    supabaseAdmin.from('events').select('organizer_id'),
    supabaseAdmin.from('fundraisers').select('organizer_id'),
  ]);

  const organizerOwnerMap = new Map(
    (organizersRes.data ?? []).map((o) => [o.id, o.user_id])
  );

  const organizerCounts = new Map<string, number>();
  const eventCounts = new Map<string, number>();
  const fundraiserCounts = new Map<string, number>();
  const hasOrganizers = new Set<string>();
  const hasEvents = new Set<string>();
  const hasFundraisers = new Set<string>();

  for (const org of organizersRes.data ?? []) {
    organizerCounts.set(org.user_id, (organizerCounts.get(org.user_id) ?? 0) + 1);
    hasOrganizers.add(org.user_id);
  }

  for (const event of eventsRes.data ?? []) {
    const ownerId = event.organizer_id ? organizerOwnerMap.get(event.organizer_id) : undefined;
    if (ownerId) {
      eventCounts.set(ownerId, (eventCounts.get(ownerId) ?? 0) + 1);
      hasEvents.add(ownerId);
    }
  }

  for (const fundraiser of fundraisersRes.data ?? []) {
    const ownerId = fundraiser.organizer_id
      ? organizerOwnerMap.get(fundraiser.organizer_id)
      : undefined;
    if (ownerId) {
      fundraiserCounts.set(ownerId, (fundraiserCounts.get(ownerId) ?? 0) + 1);
      hasFundraisers.add(ownerId);
    }
  }

  return {
    organizerCounts,
    eventCounts,
    fundraiserCounts,
    hasOrganizers,
    hasEvents,
    hasFundraisers,
    organizerOwnerMap,
  };
}

function sortUsers(rows: AdminUserRow[], sort: UserSort) {
  const copy = [...rows];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    case 'alphabetical':
      return copy.sort((a, b) => a.full_name.localeCompare(b.full_name));
    case 'most_events':
      return copy.sort((a, b) => b.event_count - a.event_count || a.full_name.localeCompare(b.full_name));
    case 'most_organizers':
      return copy.sort((a, b) => b.organizer_count - a.organizer_count || a.full_name.localeCompare(b.full_name));
    case 'most_fundraisers':
      return copy.sort((a, b) => b.fundraiser_count - a.fundraiser_count || a.full_name.localeCompare(b.full_name));
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export async function queryUsers(params: {
  search?: string;
  role?: string;
  status?: string;
  activity?: UserActivity;
  date?: DateFilter;
  sort?: UserSort;
  page?: number;
  perPage?: number;
  currentUserId?: string | null;
}) {
  const {
    search = '',
    role = 'all',
    status = 'all',
    activity = 'all',
    date = 'all',
    sort = 'newest',
    page = 1,
    perPage = 25,
    currentUserId = null,
  } = params;

  const dateStart = getDateRangeStart(date);
  let profileQuery = supabaseAdmin
    .from('profiles')
    .select('id, role, status, created_at, account_info');

  if (role !== 'all') profileQuery = profileQuery.eq('role', role);
  if (status !== 'all') profileQuery = profileQuery.eq('status', status);
  if (dateStart) profileQuery = profileQuery.gte('created_at', dateStart);

  const { data: profiles, error: profileError } = await profileQuery;
  if (profileError) throw new Error(profileError.message);

  const authResult = await listAllAuthUsers();
  if (authResult.error) throw new Error(authResult.error);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const activityMaps = await getUserActivityMaps();

  let candidates = authResult.users.filter((authUser) => profileMap.has(authUser.id));

  if (activity === 'has_organizers') {
    candidates = candidates.filter((u) => activityMaps.hasOrganizers.has(u.id));
  } else if (activity === 'has_events') {
    candidates = candidates.filter((u) => activityMaps.hasEvents.has(u.id));
  } else if (activity === 'has_fundraisers') {
    candidates = candidates.filter((u) => activityMaps.hasFundraisers.has(u.id));
  }

  if (search) {
    candidates = candidates.filter((authUser) => {
      const profile = profileMap.get(authUser.id);
      return matchesUserSearch(search, profile ?? null, authUser);
    });
  }

  const userIds = candidates.map((u) => u.id);
  const revenueMap = new Map<string, number>();

  if (userIds.length > 0) {
    const { data: userOrganizers } = await supabaseAdmin
      .from('organizers')
      .select('id, user_id')
      .in('user_id', userIds);

    const orgIds = (userOrganizers ?? []).map((o) => o.id);
    if (orgIds.length > 0) {
      const { data: fundraisers } = await supabaseAdmin
        .from('fundraisers')
        .select('organizer_id, raised')
        .in('organizer_id', orgIds);

      const orgToUser = new Map((userOrganizers ?? []).map((o) => [o.id, o.user_id]));
      for (const fr of fundraisers ?? []) {
        const uid = fr.organizer_id ? orgToUser.get(fr.organizer_id) : undefined;
        if (!uid) continue;
        revenueMap.set(uid, (revenueMap.get(uid) ?? 0) + Number(fr.raised ?? 0));
      }
    }
  }

  const rows: AdminUserRow[] = candidates.map((authUser) => {
    const profile = profileMap.get(authUser.id)!;
    return {
      id: authUser.id,
      full_name: getUserDisplayName(profile, authUser),
      username: getUserUsername(profile, authUser),
      email: authUser.email ?? '',
      role: (profile.role ?? 'user') as UserRole,
      status: (profile.status ?? 'active') as UserStatus,
      organizer_count: activityMaps.organizerCounts.get(authUser.id) ?? 0,
      event_count: activityMaps.eventCounts.get(authUser.id) ?? 0,
      fundraiser_count: activityMaps.fundraiserCounts.get(authUser.id) ?? 0,
      revenue: revenueMap.get(authUser.id) ?? 0,
      created_at: profile.created_at ?? authUser.created_at,
      last_login: authUser.last_sign_in_at ?? null,
      is_current_user: currentUserId === authUser.id,
    };
  });

  const sorted = sortUsers(rows, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const offset = (page - 1) * perPage;
  const items = sorted.slice(offset, offset + perPage);
  const stats = await getUserStats();

  return { items, stats, total, page, per_page: perPage, total_pages: totalPages };
}

export async function getOrganizerDetail(id: string): Promise<AdminOrganizerDetail | null> {
  const { data: org, error } = await supabaseAdmin
    .from('organizers')
    .select('id, user_id, name, status, created_at, verified_at, bio, photo, website, follower_offset, events_offset')
    .eq('id', id)
    .maybeSingle();

  if (error || !org) return null;

  const [{ data: authResult }, { data: profile }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(org.user_id),
    supabaseAdmin
      .from('profiles')
      .select('account_info')
      .eq('id', org.user_id)
      .maybeSingle(),
  ]);

  const authUser = authResult?.user;
  const email = authUser?.email ?? '';
  const ownerName = authUser ? getUserDisplayName(profile, authUser) : 'Unknown';

  const { eventCounts, fundraiserCounts, followerCounts, revenueMap } = await getOrganizerCountMaps([org.id]);
  const eventCount = eventCounts.get(org.id) ?? 0;
  const fundraiserCount = fundraiserCounts.get(org.id) ?? 0;
  const followerCount = followerCounts.get(org.id) ?? 0;
  const revenue = revenueMap.get(org.id) ?? 0;

  // Fetch visibility audit history (newest first)
  const { data: auditRows } = await supabaseAdmin
    .from('organizer_visibility_audit')
    .select('id, admin_user_id, field_name, old_value, new_value, created_at')
    .eq('organizer_id', org.id)
    .order('created_at', { ascending: false })
    .limit(50);

  // Resolve admin display names
  const adminIds = [...new Set((auditRows ?? []).map((r) => r.admin_user_id))];
  const adminNames = new Map<string, string>();
  if (adminIds.length > 0) {
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, account_info')
      .in('id', adminIds);
    for (const ap of adminProfiles ?? []) {
      const info = ap.account_info as Record<string, string> | null;
      adminNames.set(ap.id, info?.full_name || info?.display_name || 'Admin');
    }
    // Also try auth.users for email fallback
    for (const adminId of adminIds) {
      if (!adminNames.has(adminId) || adminNames.get(adminId) === 'Admin') {
        const { data: adminAuthRes } = await supabaseAdmin.auth.admin.getUserById(adminId);
        if (adminAuthRes?.user?.email) {
          adminNames.set(adminId, adminAuthRes.user.email);
        }
      }
    }
  }

  const visibilityHistory = (auditRows ?? []).map((r) => ({
    id: r.id,
    admin_user_id: r.admin_user_id,
    field_name: r.field_name as 'follower_offset' | 'events_offset',
    old_value: r.old_value,
    new_value: r.new_value,
    created_at: r.created_at,
    admin_name: adminNames.get(r.admin_user_id) ?? 'Admin',
  }));

  const statusHistory: AdminOrganizerDetail['status_history'] = [
    { status: 'created', at: org.created_at, label: 'Profile created' },
  ];
  if (org.verified_at) {
    statusHistory.push({ status: 'verified', at: org.verified_at, label: 'Verified' });
  }
  statusHistory.push({
    status: org.status ?? 'pending',
    at: org.verified_at ?? org.created_at,
    label: `Current: ${org.status ?? 'pending'}`,
  });

  return {
    id: org.id,
    user_id: org.user_id,
    name: org.name,
    slug: slugify(org.name) || org.id.slice(0, 8),
    email,
    owner_name: ownerName,
    status: (org.status ?? 'pending') as OrganizerStatus,
    event_count: eventCount,
    fundraiser_count: fundraiserCount,
    follower_count: followerCount,
    follower_offset: org.follower_offset ?? 0,
    events_offset: org.events_offset ?? 0,
    revenue,
    created_at: org.created_at,
    verified_at: org.verified_at ?? null,
    badges: [],
    bio: org.bio ?? null,
    photo: org.photo ?? null,
    website: org.website ?? null,
    status_history: statusHistory,
    visibility_history: visibilityHistory,
  };
}

export async function getUserDetail(
  id: string,
  currentUserId?: string | null
): Promise<AdminUserDetail | null> {
  const [{ data: authResult }, { data: profile }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(id),
    supabaseAdmin
      .from('profiles')
      .select('id, role, status, created_at, account_info')
      .eq('id', id)
      .maybeSingle(),
  ]);

  const authUser = authResult?.user;
  if (!authUser) return null;

  const accountInfo = (profile?.account_info ?? {}) as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
    website?: string;
    city?: string;
    state?: string;
    country?: string;
  };

  const activityMaps = await getUserActivityMaps();

  const { data: organizers } = await supabaseAdmin
    .from('organizers')
    .select('id, name, status, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false });

  const organizerIds = (organizers ?? []).map((o) => o.id);
  let revenue = 0;
  const recentActivity: AdminUserDetail['recent_activity'] = [];

  if (organizerIds.length > 0) {
    const [eventsRes, fundraisersRes] = await Promise.all([
      supabaseAdmin
        .from('events')
        .select('id, title, slug, created_at, organizer_id')
        .in('organizer_id', organizerIds)
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('fundraisers')
        .select('id, title, slug, raised, created_at, organizer_id')
        .in('organizer_id', organizerIds)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    for (const event of eventsRes.data ?? []) {
      recentActivity.push({
        id: event.id,
        type: 'event',
        title: event.title,
        detail: 'Event created',
        at: event.created_at,
        href: event.slug ? `/events/${event.slug}` : undefined,
      });
    }

    for (const fr of fundraisersRes.data ?? []) {
      revenue += Number(fr.raised ?? 0);
      recentActivity.push({
        id: fr.id,
        type: 'fundraiser',
        title: fr.title,
        detail: `${formatAdminMoney(fr.raised)} raised`,
        at: fr.created_at,
        href: fr.slug ? `/fundraisers/${fr.slug}` : undefined,
      });
    }

    const fundraiserIds = (fundraisersRes.data ?? []).map((f) => f.id);
    if (fundraiserIds.length > 0) {
      const { data: donations } = await supabaseAdmin
        .from('donations')
        .select('id, amount, donor_name, created_at, fundraiser_id')
        .in('fundraiser_id', fundraiserIds)
        .order('created_at', { ascending: false })
        .limit(5);

      for (const donation of donations ?? []) {
        recentActivity.push({
          id: donation.id,
          type: 'donation',
          title: donation.donor_name || 'Anonymous donation',
          detail: formatAdminMoney(donation.amount),
          at: donation.created_at,
        });
      }
    }
  }

  recentActivity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    id,
    full_name: getUserDisplayName(profile, authUser),
    username: getUserUsername(profile, authUser),
    email: authUser.email ?? '',
    role: (profile?.role ?? 'user') as UserRole,
    status: (profile?.status ?? 'active') as UserStatus,
    organizer_count: activityMaps.organizerCounts.get(id) ?? 0,
    event_count: activityMaps.eventCounts.get(id) ?? 0,
    fundraiser_count: activityMaps.fundraiserCounts.get(id) ?? 0,
    revenue,
    created_at: profile?.created_at ?? authUser.created_at,
    last_login: authUser.last_sign_in_at ?? null,
    is_current_user: currentUserId === id,
    phone: accountInfo.phone ?? null,
    company: accountInfo.company ?? null,
    website: accountInfo.website ?? null,
    location: [accountInfo.city, accountInfo.state, accountInfo.country].filter(Boolean).join(', ') || null,
    organizers: (organizers ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status ?? 'pending',
      created_at: o.created_at,
    })),
    recent_activity: recentActivity.slice(0, 10),
  };
}
