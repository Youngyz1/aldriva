import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { getDashboardAttendeeDetail } from '@/lib/dashboard-data';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const attendee = await getDashboardAttendeeDetail(auth.ctx.organizerIds, id);
  if (!attendee) {
    return NextResponse.json({ error: 'Attendee not found.' }, { status: 404 });
  }

  return NextResponse.json({ attendee });
}
