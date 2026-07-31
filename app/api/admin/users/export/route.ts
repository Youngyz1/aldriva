/**
 * app/api/admin/users/export/route.ts
 * GET — export filtered users as CSV.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { toCsv, type DateFilter } from '@/lib/admin-query';
import { queryUsers } from '@/lib/admin-data';
import type { UserActivity, UserSort } from '@/types/admin-management';

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const role = sp.get('role') ?? 'all';
  const status = sp.get('status') ?? 'all';
  const activity = (sp.get('activity') ?? 'all') as UserActivity;
  const sort = (sp.get('sort') ?? 'newest') as UserSort;
  const date = (sp.get('date') ?? 'all') as DateFilter;
  const search = sp.get('search') ?? '';
  const currentUser = await getCurrentUser();

  try {
    const result = await queryUsers({
      search,
      role,
      status,
      activity,
      date,
      sort,
      page: 1,
      perPage: 10000,
      currentUserId: currentUser?.id ?? null,
    });

    const headers = [
      'id',
      'full_name',
      'username',
      'email',
      'role',
      'status',
      'organizers',
      'events',
      'fundraisers',
      'revenue',
      'joined',
      'last_login',
    ];

    const rows = result.items.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      organizers: u.organizer_count,
      events: u.event_count,
      fundraisers: u.fundraiser_count,
      revenue: u.revenue,
      joined: u.created_at,
      last_login: u.last_login ?? '',
    }));

    const csv = toCsv(rows, headers);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="users-export.csv"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
