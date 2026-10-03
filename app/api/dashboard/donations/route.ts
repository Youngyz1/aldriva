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

  const mode = (sp.get('mode') ?? (auth.ctx.organizerIds.length > 0 ? 'organizer' : 'personal')) as 'personal' | 'organizer';

  try {
    const result = await queryDashboardDonations({
      organizerIds: auth.ctx.organizerIds,
      userId: auth.ctx.userId,
      mode,
      search: sp.get('search') ?? '',
      campaign: sp.get('campaign') ?? 'all',
      status: sp.get('status') ?? 'all',
      date: (sp.get('date') ?? 'all') as DateFilter,
      sort: sp.get('sort') ?? 'newest',
      page,
      perPage,
    });

    let campaigns: { id: string; title: string }[] = [];
    if (mode === 'organizer' && auth.ctx.organizerIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('fundraisers')
        .select('id, title')
        .in('organizer_id', auth.ctx.organizerIds);
      campaigns = data ?? [];
    } else {
      const { data } = await supabaseAdmin
        .from('fundraisers')
        .select('id, title')
        .eq('user_id', auth.ctx.userId);
      campaigns = data ?? [];
    }

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
    console.error("[dashboard/donations]", err);
    return NextResponse.json({ error: 'Failed to load donations.' }, { status: 500 });
  }
}
