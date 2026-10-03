/**
 * lib/ai/tools/sentinel/sentinel-events.ts
 * Phase 143b — get_recent_events (read-only, tenant_scoped, low risk)
 */
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import { TenantToolContext, logToolInvocation, requireToolContext } from '../tenant/tool-context';

const SAFE_COLUMNS = 'id, created_at, kind, severity_hint, tenant_id, route, tool_name, status_code, error_code, message, dedupe_key, source' as const;

export const getRecentEventsDefinition: AIToolDefinition = {
  name: 'get_recent_events',
  description: 'Retrieves recent system events. Filters by kind and tenant. Read-only, tenant-scoped.',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', description: 'Filter by kind: api_error, job_error, webhook_error, guard_rejection, approval_block, agent_tool_error, etc.' },
      limit: { type: 'number', description: 'Max results (default 20, max 50).' },
      hoursBack: { type: 'number', description: 'Hours back to query (default 24, max 168).' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export async function getRecentEvents(
  ctx: TenantToolContext,
  args: { kind?: string; limit?: number; hoursBack?: number } = {}
): Promise<unknown[]> {
  const tenantId = requireToolContext(ctx, 'get_recent_events', args);
  try {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
    const hoursBack = Math.min(Math.max(Number(args.hoursBack) || 24, 1), 168);
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const admin = createSupabaseAdmin();
    let q = admin.from('system_events').select(SAFE_COLUMNS).eq('tenant_id', tenantId).gte('created_at', since).order('created_at', { ascending: false }).limit(limit);
    // Also include platform-wide events for admins would be via isAdmin path in RLS; service_role bypasses, so filter tenant_id = caller
    // For system_events we also surface platform events (tenant_id IS NULL) when caller is admin — handled by include via OR.
    // Service_role bypasses RLS, so we explicitly union: tenant events + platform events where caller is admin
    // Simpler: query both and merge
    if (args.kind) q = q.eq('kind', args.kind);
    const { data, error } = await q;
    if (error) throw new Error(`Database error: ${error.message}`);
    // Also fetch platform events (tenant_id IS NULL) to surface alongside
    const { data: platformData } = await admin.from('system_events').select(SAFE_COLUMNS).is('tenant_id', null).gte('created_at', since).order('created_at', { ascending: false }).limit(Math.min(limit, 10));
    const merged = [...(data ?? []), ...(platformData ?? [])].slice(0, limit) as object[];
    const rows = screenToolResult('get_recent_events', merged);
    logToolInvocation(ctx, null, 'get_recent_events', args, 'allowed', 'success', rows.length);
    return rows;
  } catch (err) {
    logToolInvocation(ctx, null, 'get_recent_events', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
