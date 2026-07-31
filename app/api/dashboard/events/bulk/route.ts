import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { supabaseAdmin } from '@/lib/dashboard-context';
import { deleteEventsWithoutPaymentRecords } from '@/lib/dashboard-delete';

export async function POST(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { ids?: string[]; action?: string };
  const ids = body.ids ?? [];
  const action = body.action ?? '';

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No items selected.' }, { status: 400 });
  }

  const { data: owned } = await supabaseAdmin
    .from('events')
    .select('id')
    .in('id', ids)
    .in('organizer_id', auth.ctx.organizerIds);

  const ownedIds = (owned ?? []).map((e) => e.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: 'No matching events.' }, { status: 404 });
  }

  if (action === 'delete') {
    try {
      const result = await deleteEventsWithoutPaymentRecords(ownedIds);
      if (result.blocked) {
        return NextResponse.json({ error: result.message }, { status: 409 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete events.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else if (action === 'publish') {
    const { error } = await supabaseAdmin
      .from('events')
      .update({ status: 'approved' })
      .in('id', ownedIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === 'unpublish') {
    const { error } = await supabaseAdmin
      .from('events')
      .update({ status: 'pending' })
      .in('id', ownedIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  return NextResponse.json({ success: true, count: ownedIds.length });
}
