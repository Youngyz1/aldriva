import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { getDashboardDonationDetail } from '@/lib/dashboard-data';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const donation = await getDashboardDonationDetail(auth.ctx.organizerIds, id);
  if (!donation) {
    return NextResponse.json({ error: 'Donation not found.' }, { status: 404 });
  }

  return NextResponse.json({ donation });
}
