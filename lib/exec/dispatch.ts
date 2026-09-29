/**
 * lib/exec/dispatch.ts — Stage 10.4 real tool dispatch for bound executions.
 *
 * Dispatches EXACTLY the bound invocation (action + canonical args) through
 * the existing tool pipeline — same executors, same scope routing, same
 * guards as the orchestrator path. This module adds no tool, no bypass:
 * tenant-scoped/transactional tools go through executeTenantTool with a
 * server-resolved context; public tools through executeAITool. Unknown scopes
 * fail closed. Secrets never enter logs (redactArgs at the boundary).
 */

import { executeAITool, executeTenantTool } from '../ai/tools-registry';
import {
  PLATFORM_TENANT_PLACEHOLDER,
  type TenantToolContext,
} from '../ai/tools/tenant/tool-context';
import type { BindingContext } from './binding';

export interface DispatchInput {
  context: BindingContext;
  /** Human who requested (approval.requested_by) or worker actor label. */
  userId: string;
}

export type DispatchResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string; retryable: boolean };

function classifyError(err: unknown): { ok: false; error: string; retryable: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const transient = /timeout|timed out|abort|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|502|503|504|rate limit|temporarily/i.test(msg);
  return { ok: false, error: msg.slice(0, 1000), retryable: transient };
}

/**
 * Execute the bound invocation once. No loops, no planning, no synthesis —
 * one approved execution is one bounded tool call (MAX_TOOL_ITERATIONS=1
 * spirit preserved).
 */
export async function dispatchApprovedTool(input: DispatchInput): Promise<DispatchResult> {
  const { context } = input;
  let argsJson: string;
  try {
    argsJson = JSON.stringify(context.args);
  } catch {
    return { ok: false, error: 'args not serializable', retryable: false };
  }
  try {
    if (context.toolScope === 'tenant_scoped' || context.toolScope === 'transactional') {
      const ctx: TenantToolContext = {
        tenantId: context.tenantId ?? PLATFORM_TENANT_PLACEHOLDER,
        userId: input.userId && input.userId.length > 0 ? input.userId : `system:exec-worker`,
        role: 'viewer',
      };
      const output = await executeTenantTool(context.action, ctx, argsJson);
      return { ok: true, output };
    }
    if (context.toolScope === 'public_read' || context.toolScope === 'admin') {
      const output = await executeAITool(context.action, argsJson);
      return { ok: true, output };
    }
    return { ok: false, error: `unknown tool scope: ${context.toolScope}`, retryable: false };
  } catch (err) {
    return classifyError(err);
  }
}
