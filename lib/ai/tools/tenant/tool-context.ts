/**
 * lib/ai/tools/tenant/tool-context.ts
 *
 * Shared context + fail-closed audit logging for tenant-scoped AI tools.
 * The tenant_id is ALWAYS server-derived (TenantContext from
 * lib/tenant-context.ts) — never a model-supplied argument. Tools accept a
 * TenantToolContext and must never read tenant ids from caller args.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import type { EntityRole } from '@/lib/entity-auth';

export interface TenantToolContext {
  /** Authoritative tenant — organizers.id, server-derived only. */
  tenantId: string;
  /** Invoking identity (user id or channel provenance marker). */
  userId: string;
  role: EntityRole;
  channelAssetId?: string | null;
  connectedAccountId?: string | null;
  conversationId?: string | null;
}

export type InvocationDecision = 'allowed' | 'denied' | 'failed_closed';
export type InvocationResult =
  | 'success'
  | 'guard_rejected'
  | 'guard_flagged'
  | 'error';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a well-formed, server-derived tenant context. */
export function isValidToolContext(
  ctx: TenantToolContext | null | undefined
): ctx is TenantToolContext {
  return (
    !!ctx &&
    UUID_RE.test(ctx.tenantId) &&
    typeof ctx.userId === 'string' &&
    ctx.userId.length > 0
  );
}

const REDACT_KEYS = /(token|secret|api[_-]?key|password|passwd|pwd|private[_-]?key|signature|hmac)/i;

/**
 * Redact args for the audit log: drop secret-shaped keys, truncate long
 * strings. Never stores tokens, secrets, or raw message bodies.
 */
export function redactArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (REDACT_KEYS.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (typeof v === 'string') {
      out[k] = v.length > 200 ? `${v.slice(0, 200)}…[truncated]` : v;
      continue;
    }
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
      continue;
    }
    out[k] = '[complex]';
  }
  return out;
}

/**
 * Fail-closed audit writer. Best-effort, non-blocking: logging must never
 * become a DoS vector or mask the original error. tenant_id NULL rows are
 * written only for pre-resolution failures and are admin-readable only
 * (migration_113 RLS).
 */
export function logToolInvocation(
  ctx: TenantToolContext | null,
  provider: string | null,
  toolName: string,
  args: unknown,
  decision: InvocationDecision,
  result: InvocationResult,
  rowsAffected?: number | null,
  error?: string | null
): void {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const supabaseAdmin = createSupabaseAdmin();
    void supabaseAdmin
      .from('ai_tool_invocations')
      .insert({
        tenant_id: ctx?.tenantId ?? null,
        conversation_id: ctx?.conversationId ?? null,
        actor_type: 'ai',
        provider,
        tool_name: toolName,
        arguments_safe: redactArgs(args),
        authorization_decision: decision,
        rows_affected: rowsAffected ?? null,
        result_classification: result,
        error: error ? String(error).slice(0, 500) : null,
      })
      .then(({ error: insertError }) => {
        if (insertError) {
          console.error(
            '[tenant-tools] Failed to persist tool invocation log:',
            insertError.message
          );
        }
      });
  } catch (err) {
    console.error('[tenant-tools] Invocation logger failed:', err);
  }
}

/**
 * Guard a tenant tool entry: throws (fail closed) when ctx is invalid, and
 * logs the denial with tenant_id NULL. Returns the tenantId on success.
 */
export function requireToolContext(
  ctx: TenantToolContext | null | undefined,
  toolName: string,
  args: unknown,
  provider: string | null = null
): string {
  if (!isValidToolContext(ctx)) {
    logToolInvocation(null, provider, toolName, args, 'failed_closed', 'error', null, 'invalid tenant context');
    throw new Error(`[${toolName}] Access denied: invalid tenant context`);
  }
  return ctx.tenantId;
}
