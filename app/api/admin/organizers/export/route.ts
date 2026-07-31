/**
 * app/api/admin/organizers/export/route.ts
 * GET — export filtered organizers as CSV.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { toCsv, type DateFilter } from '@/lib/admin-query';
import { queryOrganizers } from '@/lib/admin-data';
import type { OrganizerSort } from '@/types/admin-management';

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? sp.get('tab') ?? 'all';
  const sort = (sp.get('sort') ?? 'newest') as OrganizerSort;
  const date = (sp.get('date') ?? 'all') as DateFilter;
  const search = sp.get('search') ?? '';

  try {
    const result = await queryOrganizers({
      search,
      status,
      date,
      sort,
      page: 1,
      perPage: 10000,
    });

    const headers = [
      'id',
      'name',
      'slug',
      'owner_email',
      'owner_name',
      'status',
      'events',
      'fundraisers',
      'revenue',
      'created_at',
    ];

    const rows = result.items.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      owner_email: o.email,
      owner_name: o.owner_name,
      status: o.status,
      events: o.event_count,
      fundraisers: o.fundraiser_count,
      revenue: o.revenue,
      created_at: o.created_at,
    }));

    const csv = toCsv(rows, headers);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="organizers-export.csv"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
