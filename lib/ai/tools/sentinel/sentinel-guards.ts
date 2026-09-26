/**
 * lib/ai/tools/sentinel/sentinel-guards.ts
 * Phase 143b — get_guard_rejections (read-only, tenant_scoped via tenant_id, low risk)
 * Amendment 1: filters by ai_guard_rejections.tenant_id (real column, not context proxy)
 */
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from '../../types';
import { screenToolResult } from '../../output-guard';
import { TenantToolContext, logToolInvocation, requireToolContext } from '../tenant/tool-context';

const SAFE_COLUMNS = 'id, created_at, context, category, reason, excerpt, content_type, source_id, verdict, tenant_id' as const;

export const getGuardRejectionsDefinition: AIToolDefinition = {
  name: 'get_guard_rejections',
  description: 'Retrieves recent AI guard rejections (ai_guard_rejections). Tenant-scoped via tenant_id column. Read-only.',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Optional category filter (e.g. pii_email, system_prompt_echo, input_instruction_override).' },
      limit: { type: 'number', description: 'Max results (default 20, max 50).' },
      hoursBack: { type: 'number', description: 'Hours back (default 24, max 168).' },
    },
    required: [],
  },
  scope: 'tenant_scoped',
};

export async function getGuardRejections(
  ctx: TenantToolContext,
  args: { category?: string; limit?: number; hoursBack?: number } = {}
): Promise<unknown[]> {
  const tenantId = requireToolContext(ctx, 'get_guard_rejections', args);
  try {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
    const hoursBack = Math.min(Math.max(Number(args.hoursBack) || 24, 1), 168);
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const admin = createSupabaseAdmin();
    let q = admin.from('ai_guard_rejections').select(SAFE_COLUMNS).eq('tenant_id', tenantId).gte('created_at', since).order('created_at', { ascending: false }).limit(limit);
    if (args.category) q = q.eq('category', args.category);
    const { data, error } = await q;
    if (error) throw new Error(`Database error: ${error.message}`);
    // Also include platform rejections (tenant_id IS NULL) — service_role merge for admins
    const { data: platformData } = await admin
      .from('ai_guard_rejections')
      .select(SAFE_COLUMNS)
      .is('tenant_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 10));
    const merged = [...(data ?? []), ...(platformData ?? [])].slice(0, limit) as object[];
    const rows = screenToolResult('get_guard_rejections', merged);
    logToolInvocation(ctx, null, 'get_guard_rejections', args, 'allowed', 'success', rows.length);
    return rows;
  } catch (err) {
    logToolInvocation(ctx, null, 'get_guard_rejections', args, 'allowed', 'error', null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
