/**
 * lib/entity-auth.ts
 * Entity-level (per-organizer) role resolution, built on migration_59's
 * entity_members table and gated live by migration_62's RLS extensions.
 * Layers on top of lib/auth.ts's platform role/status checks — this file
 * only ever answers "what role does this user have on this organizer,"
 * never platform-wide admin/suspended status.
 *
 * Uses its own service-role client (not lib/dashboard-context.ts's) to
 * avoid a circular import — lib/dashboard-context.ts itself needs to call
 * into this file to resolve delegated organizers.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';

export type EntityRole = 'owner' | 'admin' | 'manager' | 'editor' | 'finance' | 'viewer';

export const ENTITY_ROLES_ALL: EntityRole[] = ['owner', 'admin', 'manager', 'editor', 'finance', 'viewer'];
export const ENTITY_ROLES_CONTENT_WRITE: EntityRole[] = ['owner', 'admin', 'manager', 'editor'];
export const ENTITY_ROLES_MANAGE: EntityRole[] = ['owner', 'admin', 'manager'];

/**
 * Not yet consumed by any route or RLS policy as of Phase 4. Reserved for a
 * future finance dashboard/reports view that distinguishes "financial
 * detail" (exact donation amounts, payout figures) from the general
 * all-roles dashboard visibility every role already gets. Defined now so
 * that future work starts from an already-agreed role set instead of
 * inventing one ad hoc.
 */
export const ENTITY_ROLES_FINANCE_VIEW: EntityRole[] = ['owner', 'admin', 'manager', 'finance'];

const supabaseAdmin = createSupabaseAdmin();

/**
 * Returns the caller's entity_members role for one organizer, or null if
 * they have no membership row at all. Direct organizer ownership
 * (organizers.user_id) is intentionally not folded in here — the seed
 * trigger guarantees every organizer owner already has an 'owner' row in
 * entity_members, so this table alone is a complete answer for delegation
 * purposes.
 */
export async function getEntityRole(userId: string, organizerId: string): Promise<EntityRole | null> {
  const { data } = await supabaseAdmin
    .from('entity_members')
    .select('role')
    .eq('organizer_id', organizerId)
    .eq('user_id', userId)
    .maybeSingle();

  return (data?.role as EntityRole | undefined) ?? null;
}

/**
 * Returns every organizer_id -> role pair for the caller, across all
 * organizers they have any entity_members row on, optionally filtered to a
 * minimum role set. One query instead of one round-trip per organizer.
 */
export async function getUserEntityMemberships(
  userId: string,
  minRoles?: EntityRole[]
): Promise<Record<string, EntityRole>> {
  let query = supabaseAdmin.from('entity_members').select('organizer_id, role').eq('user_id', userId);

  if (minRoles) {
    query = query.in('role', minRoles);
  }

  const { data } = await query;

  const roles: Record<string, EntityRole> = {};
  for (const row of data ?? []) {
    roles[row.organizer_id as string] = row.role as EntityRole;
  }
  return roles;
}

/** True if the caller's role on this organizer is one of minRoles. */
export async function hasEntityAccess(
  userId: string,
  organizerId: string,
  minRoles: EntityRole[]
): Promise<boolean> {
  const role = await getEntityRole(userId, organizerId);
  return role !== null && minRoles.includes(role);
}
