/**
 * app/api/admin/organizers/bulk/route.ts
 * POST — bulk update organizer statuses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/admin-data';

const VALID_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;
const VALID_ACTIONS = ['verify', 'reject', 'suspend', 'restore'] as const;

const ACTION_TO_STATUS: Record<(typeof VALID_ACTIONS)[number], (typeof VALID_STATUSES)[number]> = {
  verify: 'verified',
  reject: 'rejected',
  suspend: 'suspended',
  restore: 'verified',
};

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as { ids?: string[]; action?: string };
  const ids = body.ids ?? [];
  const action = body.action as (typeof VALID_ACTIONS)[number];

  if (!ids.length) {
    return NextResponse.json({ error: 'No organizers selected.' }, { status: 400 });
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Invalid bulk action.' }, { status: 400 });
  }

  const status = ACTION_TO_STATUS[action];
  const update: Record<string, unknown> = { status };
  if (status === 'verified') {
    update.verified_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('organizers')
    .update(update)
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: ids.length, status });
}
