import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { supabaseAdmin } from '@/lib/dashboard-context';
import { deleteEventsWithoutPaymentRecords } from '@/lib/dashboard-delete';
import { ENTITY_ROLES_CONTENT_WRITE, ENTITY_ROLES_MANAGE } from '@/lib/entity-auth';

export async function POST(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { ids?: string[]; action?: string };
  const ids = body.ids ?? [];
  const action = body.action ?? '';

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No items selected.' }, { status: 400 });
  }

  // publish/unpublish are status toggles (content-write); delete needs the
  // higher manage tier — checked per-action, not once for the whole route,
  // since the two tiers differ.
  const requiredRoles = action === 'delete' ? ENTITY_ROLES_MANAGE : ENTITY_ROLES_CONTENT_WRITE;

  const { data: owned } = await supabaseAdmin
    .from('events')
    .select('id, organizer_id')
    .in('id', ids)
    .in('organizer_id', auth.ctx.organizerIds);

  const ownedIds = (owned ?? [])
    .filter((e) => {
      const role = auth.ctx.organizerRoles[e.organizer_id];
      return role && requiredRoles.includes(role);
    })
    .map((e) => e.id);

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
      console.error("[dashboard/events/bulk]", error);
      return NextResponse.json({ error: 'Unable to delete events.' }, { status: 500 });
    }
  } else if (action === 'publish') {
    const { error } = await supabaseAdmin
      .from('events')
      .update({ status: 'approved' })
      .in('id', ownedIds);
    if (error) {
      console.error("[dashboard/events/bulk]", error);
      return NextResponse.json({ error: 'Unable to publish events.' }, { status: 500 });
    }
  } else if (action === 'unpublish') {
    const { error } = await supabaseAdmin
      .from('events')
      .update({ status: 'pending' })
      .in('id', ownedIds);
    if (error) {
      console.error("[dashboard/events/bulk]", error);
      return NextResponse.json({ error: 'Unable to unpublish events.' }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  return NextResponse.json({ success: true, count: ownedIds.length });
}
