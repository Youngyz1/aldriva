/**
 * lib/event-auth.ts
 * Event-level team role resolution and permission authorization.
 *
 * Scoped specifically to individual events (event_team_members & event_team_invitations).
 * Composes cleanly with lib/entity-auth.ts (organizer-wide roles) and lib/auth.ts (platform admin).
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { hasEntityAccess, ENTITY_ROLES_CONTENT_WRITE } from '@/lib/entity-auth';

export type EventTeamRole = 'event_manager' | 'ticket_scanner';

export const EVENT_TEAM_ROLES_ALL: EventTeamRole[] = ['event_manager', 'ticket_scanner'];
export const EVENT_TEAM_ROLES_MANAGE: EventTeamRole[] = ['event_manager'];
export const EVENT_TEAM_ROLES_SCANNER: EventTeamRole[] = ['event_manager', 'ticket_scanner'];

const supabaseAdmin = createSupabaseAdmin();

/**
 * Returns the caller's active event_team_members role for one specific event, or null if none.
 */
export async function getEventTeamRole(userId: string, eventId: string): Promise<EventTeamRole | null> {
  const { data } = await supabaseAdmin
    .from('event_team_members')
    .select('role')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return (data?.role as EventTeamRole | undefined) ?? null;
}

/**
 * True if the caller's active event-team role for this event is included in minRoles.
 */
export async function hasEventTeamAccess(
  userId: string,
  eventId: string,
  minRoles: EventTeamRole[]
): Promise<boolean> {
  const role = await getEventTeamRole(userId, eventId);
  return role !== null && minRoles.includes(role);
}

/**
 * Composite authorization check for an event:
 * Returns true if the user is:
 * 1. The direct event creator (events.user_id = userId), OR
 * 2. The direct owner or an authorized entity member of the event's organizer (organizers.user_id = userId OR entity_members role in ENTITY_ROLES_CONTENT_WRITE), OR
 * 3. An active event_team_members row matching minEventRoles.
 */
export async function hasEventOrOrganizerAccess(
  userId: string,
  eventId: string,
  minEventRoles: EventTeamRole[] = EVENT_TEAM_ROLES_SCANNER
): Promise<boolean> {
  if (!userId || !eventId) return false;

  // 1. Fetch event and linked organizer info
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, user_id, organizer_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) return false;

  // Direct event creator check
  if (event.user_id === userId) return true;

  // Direct organizer owner check
  if (event.organizer_id) {
    const { data: organizer } = await supabaseAdmin
      .from('organizers')
      .select('user_id')
      .eq('id', event.organizer_id)
      .maybeSingle();

    if (organizer?.user_id === userId) return true;

    // Organizer-wide entity_members check (owners, admins, managers, editors)
    const isEntityMember = await hasEntityAccess(userId, event.organizer_id, ENTITY_ROLES_CONTENT_WRITE);
    if (isEntityMember) return true;
  }

  // 3. Per-event team member role check
  return await hasEventTeamAccess(userId, eventId, minEventRoles);
}

/**
 * Auto-binds any pending event team invitations matching a user's verified email.
 * Lightweight, indexed, and idempotent: return 0 immediately if 0 pending invitations exist.
 */
export async function bindPendingEventInvitations(userId: string, email: string): Promise<number> {
  if (!userId || !email) return 0;
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Indexed lookup on (email, status)
  const { data: pendingInvites } = await supabaseAdmin
    .from('event_team_invitations')
    .select('id, event_id, role, entrance_id, invited_by')
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (!pendingInvites || pendingInvites.length === 0) {
    return 0;
  }

  let boundCount = 0;
  const now = new Date().toISOString();

  for (const invite of pendingInvites) {
    // Atomic update of invitation status
    const { data: updatedInvite } = await supabaseAdmin
      .from('event_team_invitations')
      .update({
        status: 'accepted',
        accepted_at: now,
        updated_at: now,
      })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (updatedInvite) {
      // Upsert into event_team_members as active
      await supabaseAdmin.from('event_team_members').upsert(
        {
          event_id: invite.event_id,
          user_id: userId,
          role: invite.role,
          entrance_id: invite.entrance_id,
          status: 'active',
          invited_by: invite.invited_by,
          accepted_at: now,
          updated_at: now,
        },
        { onConflict: 'event_id,user_id' }
      );
      boundCount++;
    }
  }

  return boundCount;
}
