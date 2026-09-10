import { NextRequest, NextResponse } from 'next/server';
import { parsePageParams } from '@/lib/admin-query';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { queryDashboardOrganizers } from '@/lib/dashboard-data';

export async function GET(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const { page, perPage } = parsePageParams(sp);

  try {
    const result = await queryDashboardOrganizers({
      organizerIds: auth.ctx.organizerIds,
      search: sp.get('search') ?? '',
      status: sp.get('status') ?? 'all',
      verification: sp.get('verification') ?? 'all',
      sort: sp.get('sort') ?? 'newest',
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
    console.error("[dashboard/organizers]", err);
    return NextResponse.json({ error: 'Failed to load organizers.' }, { status: 500 });
  }
}
