import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { getDashboardEventDetail } from '@/lib/dashboard-data';
import { supabaseAdmin } from '@/lib/dashboard-context';
import { deleteEventsWithoutPaymentRecords } from '@/lib/dashboard-delete';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const event = await getDashboardEventDetail(auth.ctx.organizerIds, id);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  return NextResponse.json({ event });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = (await req.json()) as { status?: string; visibility?: string };

  const { data: existing } = await supabaseAdmin
    .from('events')
    .select('id')
    .eq('id', id)
    .in('organizer_id', auth.ctx.organizerIds)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const updates: Record<string, string> = {};
  if (body.status) updates.status = body.status;
  if (body.visibility) updates.visibility = body.visibility;

  const { error } = await supabaseAdmin.from('events').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const event = await getDashboardEventDetail(auth.ctx.organizerIds, id);
  return NextResponse.json({ event });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { data: existing } = await supabaseAdmin
    .from('events')
    .select('id')
    .eq('id', id)
    .in('organizer_id', auth.ctx.organizerIds)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  try {
    const result = await deleteEventsWithoutPaymentRecords([id]);
    if (result.blocked) {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete event.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
