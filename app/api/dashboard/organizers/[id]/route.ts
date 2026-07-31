import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { getDashboardOrganizerDetail } from '@/lib/dashboard-data';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const organizer = await getDashboardOrganizerDetail(auth.ctx.organizerIds, id);
  if (!organizer) {
    return NextResponse.json({ error: 'Organizer not found.' }, { status: 404 });
  }

  return NextResponse.json({ organizer });
}
