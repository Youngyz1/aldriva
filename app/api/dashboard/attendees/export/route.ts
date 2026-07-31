import { NextRequest, NextResponse } from 'next/server';
import { type DateFilter } from '@/lib/admin-query';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { exportAttendeesCsv, queryDashboardAttendees } from '@/lib/dashboard-data';

export async function GET(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  try {
    const result = await queryDashboardAttendees({
      organizerIds: auth.ctx.organizerIds,
      search: sp.get('search') ?? '',
      event: sp.get('event') ?? 'all',
      status: sp.get('status') ?? 'all',
      date: (sp.get('date') ?? 'all') as DateFilter,
      sort: sp.get('sort') ?? 'newest',
      page: 1,
      perPage: 10000,
    });

    const csv = exportAttendeesCsv(result.items);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="attendees-export.csv"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
