/**
 * app/api/admin/users/route.ts
 * GET — paginated users with filters, stats, and search.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { parsePageParams, type DateFilter } from '@/lib/admin-query';
import { queryUsers } from '@/lib/admin-data';
import type { UserActivity, UserSort } from '@/types/admin-management';

const VALID_SORTS: UserSort[] = [
  'newest',
  'oldest',
  'alphabetical',
  'most_events',
  'most_organizers',
  'most_fundraisers',
];

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const { page, perPage } = parsePageParams(sp);
  const role = sp.get('role') ?? 'all';
  const status = sp.get('status') ?? 'all';
  const activity = (sp.get('activity') ?? 'all') as UserActivity;
  const sort = (sp.get('sort') ?? 'newest') as UserSort;
  const date = (sp.get('date') ?? 'all') as DateFilter;
  const search = sp.get('search') ?? '';

  if (!VALID_SORTS.includes(sort)) {
    return NextResponse.json({ error: 'Invalid sort value.' }, { status: 400 });
  }

  const currentUser = await getCurrentUser();

  try {
    const result = await queryUsers({
      search,
      role,
      status,
      activity,
      date,
      sort,
      page,
      perPage,
      currentUserId: currentUser?.id ?? null,
    });

    return NextResponse.json({
      users: result.items,
      stats: result.stats,
      total: result.total,
      page: result.page,
      per_page: result.per_page,
      total_pages: result.total_pages,
      current_user_id: currentUser?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load users.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
