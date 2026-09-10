import { NextRequest, NextResponse } from 'next/server';
import { parsePageParams, type DateFilter } from '@/lib/admin-query';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { queryDashboardAttendees } from '@/lib/dashboard-data';
import { supabaseAdmin } from '@/lib/dashboard-context';

export async function GET(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const { page, perPage } = parsePageParams(sp);

  try {
    const result = await queryDashboardAttendees({
      organizerIds: auth.ctx.organizerIds,
      search: sp.get('search') ?? '',
      event: sp.get('event') ?? 'all',
      status: sp.get('status') ?? 'all',
      date: (sp.get('date') ?? 'all') as DateFilter,
      sort: sp.get('sort') ?? 'newest',
      page,
      perPage,
    });

    const { data: events } = await supabaseAdmin
      .from('events')
      .select('id, title')
      .in('organizer_id', auth.ctx.organizerIds);

    return NextResponse.json({
      attendees: result.items,
      stats: result.stats,
      events: events ?? [],
      total: result.total,
      page: result.page,
      per_page: result.per_page,
      total_pages: result.total_pages,
    });
  } catch (err) {
    console.error("[dashboard/attendees]", err);
    return NextResponse.json({ error: 'Failed to load attendees.' }, { status: 500 });
  }
}
