import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { getDashboardAttendeeDetail } from '@/lib/dashboard-data';
import { supabaseAdmin } from '@/lib/dashboard-context';
import { ENTITY_ROLES_CONTENT_WRITE } from '@/lib/entity-auth';

export async function POST(req: NextRequest) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { ids?: string[]; action?: string };
  const ids = body.ids ?? [];
  const action = body.action ?? '';

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No items selected.' }, { status: 400 });
  }

  const orgScopedIds: string[] = [];
  for (const id of ids) {
    const detail = await getDashboardAttendeeDetail(auth.ctx.organizerIds, id);
    if (detail) orgScopedIds.push(id);
  }

  if (orgScopedIds.length === 0) {
    return NextResponse.json({ error: 'No matching attendees.' }, { status: 404 });
  }

  // check_in and resend_ticket are both operational, non-destructive
  // actions — content-write tier for both, filtered per-order by the
  // owning event's organizer_id role.
  const { data: orders } = await supabaseAdmin
    .from('ticket_orders')
    .select('id, events(organizer_id)')
    .in('id', orgScopedIds);

  const validIds = (orders ?? [])
    .filter((order) => {
      const events = order.events as { organizer_id?: string } | { organizer_id?: string }[] | null;
      const orgId = Array.isArray(events) ? events[0]?.organizer_id : events?.organizer_id;
      const role = orgId ? auth.ctx.organizerRoles[orgId] : undefined;
      return role && ENTITY_ROLES_CONTENT_WRITE.includes(role);
    })
    .map((order) => order.id);

  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No matching attendees.' }, { status: 404 });
  }

  if (action === 'check_in') {
    const { error } = await supabaseAdmin
      .from('ticket_orders')
      .update({ status: 'used', checked_in_at: new Date().toISOString() })
      .in('id', validIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === 'resend_ticket') {
    for (const id of validIds) {
      const detail = await getDashboardAttendeeDetail(auth.ctx.organizerIds, id);
      if (!detail?.email) continue;
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/send-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerEmail: detail.email,
          buyerName: detail.attendee_name,
          eventTitle: detail.event_title,
          eventSlug: detail.event_slug,
          qrCode: detail.qr_code,
          seatLabel: detail.seat_label,
          isFree: detail.paid === 0,
        }),
      });
    }
  } else {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  return NextResponse.json({ success: true, count: validIds.length });
}
