/**
 * app/api/admin/users/bulk/route.ts
 * POST — bulk user moderation actions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/admin-data';

const VALID_ACTIONS = ['activate', 'suspend', 'promote', 'demote'] as const;

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  const body = (await req.json()) as { ids?: string[]; action?: string };
  const ids = (body.ids ?? []).filter((id) => id !== currentUser?.id);
  const action = body.action as (typeof VALID_ACTIONS)[number];

  if (!ids.length) {
    return NextResponse.json({ error: 'No eligible users selected.' }, { status: 400 });
  }

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Invalid bulk action.' }, { status: 400 });
  }

  const update: Record<string, string> = {};
  switch (action) {
    case 'activate':
      update.status = 'active';
      break;
    case 'suspend':
      update.status = 'suspended';
      break;
    case 'promote':
      update.role = 'admin';
      break;
    case 'demote':
      update.role = 'user';
      break;
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: ids.length, ...update });
}
