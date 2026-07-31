import { NextRequest, NextResponse } from 'next/server';
import { parsePageParams, type DateFilter } from '@/lib/admin-query';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { queryDashboardDonations } from '@/lib/dashboard-data';
import { supabaseAdmin } from '@/lib/dashboard-context';

export async function GET(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const { page, perPage } = parsePageParams(sp);

  try {
    const result = await queryDashboardDonations({
      organizerIds: auth.ctx.organizerIds,
      search: sp.get('search') ?? '',
      campaign: sp.get('campaign') ?? 'all',
      status: sp.get('status') ?? 'all',
      date: (sp.get('date') ?? 'all') as DateFilter,
      sort: sp.get('sort') ?? 'newest',
      page,
      perPage,
    });

    const { data: campaigns } = await supabaseAdmin
      .from('fundraisers')
      .select('id, title')
      .in('organizer_id', auth.ctx.organizerIds);

    return NextResponse.json({
      donations: result.items,
      stats: result.stats,
      campaigns: campaigns ?? [],
      total: result.total,
      page: result.page,
      per_page: result.per_page,
      total_pages: result.total_pages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load donations.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
