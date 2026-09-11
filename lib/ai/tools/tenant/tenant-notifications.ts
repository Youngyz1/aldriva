/**
 * lib/ai/tools/tenant/tenant-notifications.ts
 *
 * Transactional tenant tools: createNotification / notifyOwner.
 * These CALL the existing lib/notifications.ts createNotification() —
 * they do not reimplement notification inserts or email sending.
 * notifyOwner resolves recipients from the tenant (entity_members
 * owner-role holders, falling back to organizers.user_id) and honors the
 * tenant-scoped notification_preferences table (channel/event_type
 * enabled flag). profiles.preferences (user-scoped) is intentionally NOT
 * consulted here — separate system, Phase 1+ reconciliation.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { createNotification } from '@/lib/notifications';
import { AIToolDefinition } from '../../types';
import { screenModelOutput } from '../../output-guard';
import {
  TenantToolContext,
  logToolInvocation,
  requireToolContext,
} from './tool-context';

export const createTenantNotificationDefinition: AIToolDefinition = {
  name: 'createNotification',
  description:
    'Creates an in-app notification for one user of the current tenant (e.g. order update). Delegates to the existing notification service.',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'Recipient user id (must belong to the tenant audience).' },
      type: {
        type: 'string',
        description: 'One of: donation, comment, like, fundraiser_approved, fundraiser_rejected, follow, ticket_purchase.',
      },
      title: { type: 'string', description: 'Notification title.' },
      body: { type: 'string', description: 'Optional body.' },
      link: { type: 'string', description: 'Optional deep link.' },
    },
    required: ['userId', 'type', 'title'],
  },
  scope: 'transactional',
};

export const notifyOwnerDefinition: AIToolDefinition = {
  name: 'notifyOwner',
  description:
    'Notifies the current tenant\'s owners (entity owner-role holders). Honors tenant notification_preferences; skipped when disabled.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'One of: donation, comment, like, fundraiser_approved, fundraiser_rejected, follow, ticket_purchase.',
      },
      title: { type: 'string', description: 'Notification title.' },
      body: { type: 'string', description: 'Optional body.' },
      link: { type: 'string', description: 'Optional deep link.' },
      channel: { type: 'string', description: 'Preference channel key (default "in_app").' },
      eventType: { type: 'string', description: 'Preference event key (default mirrors type).' },
    },
    required: ['type', 'title'],
  },
  scope: 'transactional',
};

const ALLOWED_TYPES = new Set([
  'donation',
  'comment',
  'like',
  'fundraiser_approved',
  'fundraiser_rejected',
  'follow',
  'ticket_purchase',
]);

/**
 * Screens model-supplied notification copy through the SAME output guard
 * as every other tool (screenModelOutput). Rejected copy throws (fail
 * closed); flagged copy uses the sanitised text. Returns the safe title/body.
 */
function screenNotificationCopy(
  toolName: string,
  title: string,
  body?: string
): { title: string; body?: string; flagged: boolean } {
  let safeTitle = title;
  let flagged = false;
  const titleResult = screenModelOutput(title, `${toolName}.title`);
  if (titleResult.verdict === 'rejected') {
    throw new Error(`[${toolName}] Notification title rejected by output guard`);
  }
  if (titleResult.verdict === 'flagged') {
    if (titleResult.sanitised === undefined) {
      throw new Error(`[${toolName}] Notification title flagged without sanitisation`);
    }
    safeTitle = titleResult.sanitised;
    flagged = true;
  }
  let safeBody = body;
  if (body) {
    const bodyResult = screenModelOutput(body, `${toolName}.body`);
    if (bodyResult.verdict === 'rejected') {
      throw new Error(`[${toolName}] Notification body rejected by output guard`);
    }
    if (bodyResult.verdict === 'flagged') {
      if (bodyResult.sanitised === undefined) {
        throw new Error(`[${toolName}] Notification body flagged without sanitisation`);
      }
      safeBody = bodyResult.sanitised;
      flagged = true;
    }
  }
  return { title: safeTitle, body: safeBody, flagged };
}

async function isPreferenceEnabled(
  tenantId: string,
  channel: string,
  eventType: string
): Promise<boolean> {
  const { data } = await createSupabaseAdmin()
    .from('notification_preferences')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('channel', channel)
    .eq('event_type', eventType)
    .maybeSingle();
  // Absent row = default enabled (opt-out model).
  if (!data) return true;
  return (data as { enabled: boolean }).enabled === true;
}

async function tenantOwnerUserIds(tenantId: string): Promise<string[]> {
  const admin = createSupabaseAdmin();
  const { data: members } = await admin
    .from('entity_members')
    .select('user_id')
    .eq('organizer_id', tenantId)
    .eq('role', 'owner');
  const ids = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
  if (ids.length > 0) return [...new Set(ids)];
  const { data: organizer } = await admin
    .from('organizers')
    .select('user_id')
    .eq('id', tenantId)
    .maybeSingle();
  const fallback = (organizer as { user_id: string | null } | null)?.user_id;
  return fallback ? [fallback] : [];
}

export async function createTenantNotification(
  ctx: TenantToolContext,
  args: { userId: string; type: string; title: string; body?: string; link?: string }
): Promise<{ delivered: boolean }> {
  const tenantId = requireToolContext(ctx, 'createNotification', args);
  try {
    if (!ALLOWED_TYPES.has(args.type)) {
      throw new Error('[createNotification] Unsupported notification type');
    }
    if (!args.title || !args.title.trim()) {
      throw new Error('[createNotification] title is required');
    }
    // The recipient must be a member of this tenant — never an arbitrary id
    // supplied by the model without a membership check.
    const { data: membership } = await createSupabaseAdmin()
      .from('entity_members')
      .select('user_id')
      .eq('organizer_id', tenantId)
      .eq('user_id', args.userId)
      .maybeSingle();
    if (!membership) {
      logToolInvocation(ctx, null, 'createNotification', args, 'denied', 'error', 0, 'recipient not in tenant');
      throw new Error('[createNotification] Recipient is not a member of this tenant');
    }
    let safe: { title: string; body?: string; flagged: boolean };
    try {
      safe = screenNotificationCopy('createNotification', args.title, args.body);
    } catch (guardErr) {
      logToolInvocation(ctx, null, 'createNotification', args, 'allowed', 'guard_rejected', 0, guardErr instanceof Error ? guardErr.message : String(guardErr));
      throw guardErr;
    }
    await createNotification({
      userId: args.userId,
      type: args.type as 'donation',
      title: safe.title,
      body: safe.body ?? null,
      link: args.link ?? null,
    });
    logToolInvocation(ctx, null, 'createNotification', args, 'allowed', safe.flagged ? 'guard_flagged' : 'success', 1);
    return { delivered: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes('not a member of this tenant')) throw err;
    logToolInvocation(ctx, null, 'createNotification', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function notifyOwner(
  ctx: TenantToolContext,
  args: { type: string; title: string; body?: string; link?: string; channel?: string; eventType?: string }
): Promise<{ delivered: number; skipped: boolean }> {
  const tenantId = requireToolContext(ctx, 'notifyOwner', args);
  try {
    if (!ALLOWED_TYPES.has(args.type)) {
      throw new Error('[notifyOwner] Unsupported notification type');
    }
    if (!args.title || !args.title.trim()) {
      throw new Error('[notifyOwner] title is required');
    }
    const channel = args.channel ?? 'in_app';
    const eventType = args.eventType ?? args.type;
    const enabled = await isPreferenceEnabled(tenantId, channel, eventType);
    if (!enabled) {
      logToolInvocation(ctx, null, 'notifyOwner', args, 'allowed', 'success', 0, 'preference disabled');
      return { delivered: 0, skipped: true };
    }
    const ownerIds = await tenantOwnerUserIds(tenantId);
    let safe: { title: string; body?: string; flagged: boolean };
    try {
      safe = screenNotificationCopy('notifyOwner', args.title, args.body);
    } catch (guardErr) {
      logToolInvocation(ctx, null, 'notifyOwner', args, 'allowed', 'guard_rejected', 0, guardErr instanceof Error ? guardErr.message : String(guardErr));
      throw guardErr;
    }
    for (const userId of ownerIds) {
      await createNotification({
        userId,
        type: args.type as 'donation',
        title: safe.title,
        body: safe.body ?? null,
        link: args.link ?? null,
      });
    }
    logToolInvocation(ctx, null, 'notifyOwner', args, 'allowed', safe.flagged ? 'guard_flagged' : 'success', ownerIds.length);
    return { delivered: ownerIds.length, skipped: false };
  } catch (err) {
    logToolInvocation(ctx, null, 'notifyOwner', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
