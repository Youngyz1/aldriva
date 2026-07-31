import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { exportOrganizersCsv, queryDashboardOrganizers } from '@/lib/dashboard-data';

export async function GET(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  try {
    const result = await queryDashboardOrganizers({
      organizerIds: auth.ctx.organizerIds,
      search: sp.get('search') ?? '',
      status: sp.get('status') ?? 'all',
      verification: sp.get('verification') ?? 'all',
      sort: sp.get('sort') ?? 'newest',
      page: 1,
      perPage: 10000,
    });

    const csv = exportOrganizersCsv(result.items);
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
