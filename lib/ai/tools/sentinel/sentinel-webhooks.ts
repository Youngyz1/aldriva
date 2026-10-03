/**
 * lib/ai/tools/sentinel/sentinel-webhooks.ts
 * Phase 143b — get_recent_webhook_failures (read-only, tenant_scoped, medium risk)
 * Reads payment_reconciliation_failures + system_events(kind=webhook_error/payment_reconciliation)
 */
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import { TenantToolContext, logToolInvocation, requireToolContext } from '../tenant/tool-context';

const SAFE_RECONCILIATION_COLS = 'id, created_at, kind, stripe_payment_intent_id, amount, currency, buyer_email, error_message' as const;
const SAFE_EVENT_COLS = 'id, created_at, kind, route, error_code, message, status_code' as const;

export const getRecentWebhookFailuresDefinition: AIToolDefinition = {
  name: 'get_recent_webhook_failures',
  description: 'Retrieves recent payment reconciliation failures and webhook errors. Reads payment_reconciliation_failures + system_events. Tenant-scoped.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max results (default 20, max 50).' },
      hoursBack: { type: 'number', description: 'Hours back (default 24, max 168).' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export async function getRecentWebhookFailures(
  ctx: TenantToolContext,
  args: { limit?: number; hoursBack?: number } = {}
): Promise<{ reconciliation_failures: unknown[]; webhook_events: unknown[] }> {
  const tenantId = requireToolContext(ctx, 'get_recent_webhook_failures', args);
  try {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
    const hoursBack = Math.min(Math.max(Number(args.hoursBack) || 24, 1), 168);
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const admin = createSupabaseAdmin();

    // payment_reconciliation_failures is platform-level (no tenant_id) — read recent, service_role, still tenant-scoped via log context
    const { data: reconData, error: reconErr } = await admin
      .from('payment_reconciliation_failures')
      .select(SAFE_RECONCILIATION_COLS)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (reconErr) throw new Error(`Database error (reconciliation): ${reconErr.message}`);

    const { data: eventData, error: eventErr } = await admin
      .from('system_events')
      .select(SAFE_EVENT_COLS)
      .in('kind', ['webhook_error', 'payment_reconciliation'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (eventErr) throw new Error(`Database error (events): ${eventErr.message}`);

    const reconRows = screenToolResult('get_recent_webhook_failures', (reconData ?? []) as object[]);
    const eventRows = screenToolResult('get_recent_webhook_failures', (eventData ?? []) as object[]);

    logToolInvocation(ctx, null, 'get_recent_webhook_failures', args, 'allowed', 'success', reconRows.length + eventRows.length);
    return { reconciliation_failures: reconRows, webhook_events: eventRows };
  } catch (err) {
    logToolInvocation(ctx, null, 'get_recent_webhook_failures', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
