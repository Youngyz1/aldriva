/**
 * Auth helpers for dashboard API routes — scoped to the current user's organizers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/dashboard-context';
import { getUserEntityMemberships, type EntityRole } from '@/lib/entity-auth';
import { bindPendingEventInvitations } from '@/lib/event-auth';

export type DashboardApiContext = {
  userId: string;
  organizerIds: string[];
  /**
   * organizerId -> the caller's role for that organizer. Directly-owned
   * organizers are always 'owner' here, even if resolving organizerIds
   * membership were ever to lag the seed trigger. organizerIds alone is
   * NOT sufficient to authorize a mutation — callers must check the role
   * here against the operation's minimum tier (see lib/entity-auth.ts).
   */
  organizerRoles: Record<string, EntityRole>;
};

export async function getDashboardApiContext(req?: NextRequest): Promise<
  | { ok: true; ctx: DashboardApiContext }
  | { ok: false; response: NextResponse }
> {
  let user: { id: string; email?: string } | null = null;

  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const { data: authData } = await supabaseAdmin.auth.getUser(token);
      if (authData?.user) {
        user = { id: authData.user.id, email: authData.user.email };
      }
    }
  }

  if (!user) {
    user = await getCurrentUser();
  }

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.status === 'suspended') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Your account is suspended.' }, { status: 403 }),
    };
  }

  // Auto-bind any pending event team invitations matching the user's verified email
  if (user.email) {
    await bindPendingEventInvitations(user.id, user.email);
  }

  const [{ data: organizers }, entityRoles] = await Promise.all([
    supabaseAdmin.from('organizers').select('id').eq('user_id', user.id),
    getUserEntityMemberships(user.id),
  ]);

  const organizerRoles: Record<string, EntityRole> = { ...entityRoles };
  for (const organizer of organizers ?? []) {
    organizerRoles[organizer.id] = 'owner';
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      organizerIds: Object.keys(organizerRoles),
      organizerRoles,
    },
  };
}
