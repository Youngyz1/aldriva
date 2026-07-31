/**
 * Auth helpers for dashboard API routes — scoped to the current user's organizers.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, getCurrentUserProfile } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/dashboard-context';

export type DashboardApiContext = {
  userId: string;
  organizerIds: string[];
};

export async function getDashboardApiContext(): Promise<
  | { ok: true; ctx: DashboardApiContext }
  | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const profile = await getCurrentUserProfile();
  if (profile?.status === 'suspended') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Your account is suspended.' }, { status: 403 }),
    };
  }

  const { data: organizers } = await supabaseAdmin
    .from('organizers')
    .select('id')
    .eq('user_id', user.id);

  return {
    ok: true,
    ctx: {
      userId: user.id,
      organizerIds: (organizers ?? []).map((o) => o.id),
    },
  };
}

export function emptyPaginated<T, S>(stats: S, perPage = 25) {
  return {
    items: [] as T[],
    stats,
    total: 0,
    page: 1,
    per_page: perPage,
    total_pages: 1,
  };
}
