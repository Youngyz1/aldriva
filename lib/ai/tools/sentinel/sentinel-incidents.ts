/**
 * lib/ai/tools/sentinel/sentinel-incidents.ts
 * Phase 143b — get_active_incidents (read-only, tenant_scoped, low risk)
 */
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import { TenantToolContext, logToolInvocation, requireToolContext } from '../tenant/tool-context';

const SAFE_COLUMNS = 'id, created_at, updated_at, status, severity, title, tenant_id, dedupe_key, event_count, first_seen_at, last_seen_at' as const;

export const getActiveIncidentsDefinition: AIToolDefinition = {
  name: 'get_active_incidents',
  description: 'Retrieves open/investigating incidents. Tenant-scoped. Read-only.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter: open, investigating, or all open/investigating (default).' },
      limit: { type: 'number', description: 'Max results (default 20, max 50).' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export async function getActiveIncidents(
  ctx: TenantToolContext,
  args: { status?: string; limit?: number } = {}
): Promise<unknown[]> {
  const tenantId = requireToolContext(ctx, 'get_active_incidents', args);
  try {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
    const admin = createSupabaseAdmin();
    let q = admin.from('incidents').select(SAFE_COLUMNS).eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(limit);
    if (args.status === 'open' || args.status === 'investigating') q = q.eq('status', args.status);
    else q = q.in('status', ['open', 'investigating']);
    const { data, error } = await q;
    if (error) throw new Error(`Database error: ${error.message}`);
    // Also include platform incidents (tenant_id IS NULL) — service_role bypasses RLS, so fetch small set and merge
    const { data: platformData } = await admin
      .from('incidents')
      .select(SAFE_COLUMNS)
      .is('tenant_id', null)
      .in('status', args.status === 'open' || args.status === 'investigating' ? [args.status] as never : (['open', 'investigating'] as unknown as never))
      .order('updated_at', { ascending: false })
      .limit(Math.min(limit, 10));
    const merged = [...(data ?? []), ...(platformData ?? [])].slice(0, limit) as object[];
    const rows = screenToolResult('get_active_incidents', merged);
    logToolInvocation(ctx, null, 'get_active_incidents', args, 'allowed', 'success', rows.length);
    return rows;
  } catch (err) {
    logToolInvocation(ctx, null, 'get_active_incidents', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
