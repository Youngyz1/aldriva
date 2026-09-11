/**
 * lib/tenant-context.ts
 *
 * Server-side tenant context for the Aldriva multi-tenant AI architecture.
 * Tenant = organizers.id (canonical Entity table per migration_58).
 *
 * This module WRAPS and COMPOSES existing resolution logic — it never
 * reimplements membership:
 *   - user -> tenant: delegates to lib/entity-auth.ts
 *     (getEntityRole / hasEntityAccess, ENTITY_ROLES_* tiers).
 *   - channel path: resolves channel_asset_id -> channel_assets.tenant_id
 *     -> connected_accounts.tenant_id, verified to match, never from user
 *     text or model output.
 *
 * The model must never supply the authoritative tenant_id. Any tool
 * receiving a tenant_id derived it from an authenticated session +
 * entity_members check, or from a verified channel_asset chain.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import {
  ENTITY_ROLES_ALL,
  ENTITY_ROLES_CONTENT_WRITE,
  ENTITY_ROLES_MANAGE,
  EntityRole,
  getEntityRole,
  hasEntityAccess,
} from '@/lib/entity-auth';

export { ENTITY_ROLES_ALL, ENTITY_ROLES_CONTENT_WRITE, ENTITY_ROLES_MANAGE };
export type { EntityRole };

export interface TenantContext {
  /** Authoritative tenant — organizers.id, never model-supplied. */
  tenantId: string;
  /** Authenticated user's id (session path) or 'channel' provenance marker. */
  userId: string;
  /** Caller's entity_members role on this tenant. */
  role: EntityRole;
  /** How the tenant was derived — never 'model'. */
  provenance: 'session' | 'channel_asset';
}

export interface ChannelToolContext extends TenantContext {
  channelAssetId: string;
  connectedAccountId: string;
  conversationId?: string | null;
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

/**
 * Resolve tenant context for an authenticated user + organizer_id.
 * Delegates membership to lib/entity-auth.ts; returns null on any failure
 * (unknown user, malformed id, no membership row, missing organizer).
 */
export async function resolveTenantContext(
  userId: string | null | undefined,
  organizerId: string | null | undefined,
  minRoles: EntityRole[] = ENTITY_ROLES_ALL
): Promise<TenantContext | null> {
  if (!userId || !isUuid(userId)) return null;
  if (!organizerId || !isUuid(organizerId)) return null;

  const supabaseAdmin = createSupabaseAdmin();
  const { data: organizer } = await supabaseAdmin
    .from('organizers')
    .select('id')
    .eq('id', organizerId)
    .maybeSingle();
  if (!organizer) return null;

  const role = await getEntityRole(userId, organizerId);
  if (!role) return null;
  if (!minRoles.includes(role)) return null;

  return { tenantId: organizerId, userId, role, provenance: 'session' };
}

/** Same as resolveTenantContext but throws on failure (fail closed). */
export async function requireTenantContext(
  userId: string | null | undefined,
  organizerId: string | null | undefined,
  minRoles: EntityRole[] = ENTITY_ROLES_ALL
): Promise<TenantContext> {
  const ctx = await resolveTenantContext(userId, organizerId, minRoles);
  if (!ctx) {
    throw new Error(
      '[tenant-context] Tenant resolution failed: unknown tenant or no membership'
    );
  }
  return ctx;
}

/**
 * Assert the user holds one of requiredRoles on tenantId.
 * Delegates to hasEntityAccess() (is_entity_member() semantics).
 */
export async function assertTenantAccess(
  userId: string,
  tenantId: string,
  requiredRoles: EntityRole[] = ENTITY_ROLES_ALL
): Promise<void> {
  if (!isUuid(userId) || !isUuid(tenantId)) {
    throw new Error('[tenant-context] Access denied: malformed ids');
  }
  const ok = await hasEntityAccess(userId, tenantId, requiredRoles);
  if (!ok) {
    throw new Error('[tenant-context] Access denied: no membership for tenant');
  }
}

/**
 * Resolve the conversation/channel path: channel_asset_id ->
 * channel_assets.tenant_id -> connected_accounts.tenant_id (must match) ->
 * organizers.id. Never from user text or model output — the asset id must
 * be a server-held value (e.g. webhook-verified mapping).
 *
 * userId must be a real authenticated user id: membership is ALWAYS
 * verified via entity_members (fail closed). There is no anonymous or
 * marker-based path — channel-ingested traffic without a user must be
 * attributed by its own verified webhook layer in Phase 1B, not here.
 */
export async function createToolContext(
  channelAssetId: string,
  userId: string,
  opts?: { conversationId?: string | null; minRoles?: EntityRole[] }
): Promise<ChannelToolContext> {
  if (!isUuid(channelAssetId)) {
    throw new Error('[tenant-context] Unknown channel asset');
  }

  const supabaseAdmin = createSupabaseAdmin();
  const { data: asset, error: assetError } = await supabaseAdmin
    .from('channel_assets')
    .select('id, tenant_id, connected_account_id')
    .eq('id', channelAssetId)
    .maybeSingle();
  if (assetError || !asset) {
    throw new Error('[tenant-context] Unknown channel asset');
  }

  const { data: account } = await supabaseAdmin
    .from('connected_accounts')
    .select('id, tenant_id')
    .eq('id', asset.connected_account_id)
    .maybeSingle();
  if (!account || account.tenant_id !== asset.tenant_id) {
    throw new Error('[tenant-context] Channel asset chain broken');
  }

  const { data: organizer } = await supabaseAdmin
    .from('organizers')
    .select('id')
    .eq('id', asset.tenant_id)
    .maybeSingle();
  if (!organizer) {
    throw new Error('[tenant-context] Unknown tenant for channel asset');
  }

  // Membership is mandatory: the caller must be a member of the
  // asset-derived tenant. No marker/anonymous path exists (fail closed).
  if (!isUuid(userId)) {
    throw new Error('[tenant-context] Access denied: unknown user');
  }
  const role = await getEntityRole(userId, asset.tenant_id);
  const minRoles = opts?.minRoles ?? ENTITY_ROLES_ALL;
  if (!role || !minRoles.includes(role)) {
    throw new Error('[tenant-context] Access denied: no membership for tenant');
  }

  let conversationId: string | null = opts?.conversationId ?? null;
  if (conversationId !== null) {
    if (!isUuid(conversationId)) {
      throw new Error('[tenant-context] Unknown conversation');
    }
    const { data: convo } = await supabaseAdmin
      .from('conversations')
      .select('id, tenant_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!convo || convo.tenant_id !== asset.tenant_id) {
      throw new Error('[tenant-context] Conversation does not belong to tenant');
    }
  }

  return {
    tenantId: asset.tenant_id as string,
    userId,
    role,
    provenance: 'channel_asset',
    channelAssetId: asset.id as string,
    connectedAccountId: asset.connected_account_id as string,
    conversationId,
  };
}
