/**
 * app/api/admin/organizers/route.ts
 * GET — paginated organizers with filters, stats, and search.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { parsePageParams, type DateFilter } from '@/lib/admin-query';
import { queryOrganizers } from '@/lib/admin-data';
import type { OrganizerSort } from '@/types/admin-management';

const VALID_SORTS: OrganizerSort[] = [
  'newest',
  'oldest',
  'alphabetical',
  'most_events',
  'most_fundraisers',
];

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const { page, perPage } = parsePageParams(sp);
  const status = sp.get('status') ?? sp.get('tab') ?? 'all';
  const sort = (sp.get('sort') ?? 'newest') as OrganizerSort;
  const date = (sp.get('date') ?? 'all') as DateFilter;
  const search = sp.get('search') ?? '';

  if (!VALID_SORTS.includes(sort)) {
    return NextResponse.json({ error: 'Invalid sort value.' }, { status: 400 });
  }

  try {
    const result = await queryOrganizers({
      search,
      status,
      date,
      sort,
      page,
      perPage,
    });

    return NextResponse.json({
      organizers: result.items,
      stats: result.stats,
      total: result.total,
      page: result.page,
      per_page: result.per_page,
      total_pages: result.total_pages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load organizers.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
