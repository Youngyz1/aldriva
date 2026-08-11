import { NextRequest, NextResponse } from 'next/server';
import { getDashboardApiContext } from '@/lib/dashboard-api';
import { getDashboardFundraiserDetail } from '@/lib/dashboard-data';
import { supabaseAdmin } from '@/lib/dashboard-context';
import { deleteFundraisersWithoutPaymentRecords } from '@/lib/dashboard-delete';
import { ENTITY_ROLES_MANAGE } from '@/lib/entity-auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const fundraiser = await getDashboardFundraiserDetail(auth.ctx.userId, auth.ctx.organizerIds, id);
  if (!fundraiser) {
    return NextResponse.json({ error: 'Fundraiser not found.' }, { status: 404 });
  }

  return NextResponse.json({ fundraiser });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const auth = await getDashboardApiContext();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { data: existing } = await supabaseAdmin
    .from('fundraisers')
    .select('id, organizer_id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Fundraiser not found.' }, { status: 404 });
  }

  // Two distinct authorization paths, kept separate: direct personal
  // ownership (user_id) never goes through entity_members; organizer
  // affiliation (organizer_id) requires MANAGE-tier entity access, same
  // as before. Same 404 for "doesn't exist" and "exists but not yours" —
  // no enumeration signal either way.
  const isOwner = existing.user_id === auth.ctx.userId;
  const role = existing.organizer_id ? auth.ctx.organizerRoles[existing.organizer_id] : undefined;
  const isEntityManager = !!role && ENTITY_ROLES_MANAGE.includes(role);

  if (!isOwner && !isEntityManager) {
    return NextResponse.json({ error: 'Fundraiser not found.' }, { status: 404 });
  }

  try {
    const result = await deleteFundraisersWithoutPaymentRecords([id]);
    if (result.blocked) {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete fundraiser.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
