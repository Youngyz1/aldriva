/**
 * app/api/admin/organizers/[id]/route.ts
 * GET — organizer detail for admin drawer.
 * PATCH — update organizer status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getOrganizerDetail, supabaseAdmin } from '@/lib/admin-data';

const VALID_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const organizer = await getOrganizerDetail(id);
    if (!organizer) {
      return NextResponse.json({ error: 'Organizer not found.' }, { status: 404 });
    }
    return NextResponse.json({ organizer });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load organizer.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { status } = (await req.json()) as { status?: string };

  if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
  }

  const update: Record<string, unknown> = { status };
  if (status === 'verified') {
    update.verified_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('organizers')
    .update(update)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id, status });
}
