/**
 * app/api/ai/gateway/route.ts
 * Phase 142 — AI Gateway (admin-only since Stage 22B, tenant-aware, agent-allowlisted).
 * Flow: authenticate -> resolve tenant -> resolve agent -> load tools -> provider -> guards -> audit.
 * Reuses: lib/auth, lib/rate-limit, lib/ai/orchestrator, lib/ai/provider factory.
 * Never bypasses guards or tenant isolation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { orchestrate } from '@/lib/ai/orchestrator';
import { getAgentByName, listAgents } from '@/lib/ai/agent-registry';
import { insertSystemEvent } from '@/lib/observability/system-events';

/**
 * Stage 22B: admin-only gate. Runs FIRST in every handler, before body
 * parsing, rate limiting, or any data access.
 *
 * NOTE: this deliberately does NOT call requireAdmin() from lib/auth —
 * that helper throws a Next.js navigation redirect to '/' (a 307 with no
 * JSON body), which is wrong for an API route. isAdmin() IS the same check
 * (active admin profile); here it returns the API convention instead:
 * 401 unauthenticated, 403 authenticated non-admin (matches app/api/admin/*
 * identity-verifications 401/403 split).
 */
async function requireAdminUser(): Promise<{ id: string; email?: string } | NextResponse> {
  const u = await getCurrentUser().catch(() => null);
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return { id: u.id, email: (u as { email?: string }).email };
}

// GET — list agents (for Workforce UI wiring; no provider call)
export async function GET() {
  const gate = await requireAdminUser();
  if (gate instanceof NextResponse) return gate;
  const agents = await listAgents();
  return NextResponse.json({ success: true, agents });
}

export async function POST(req: NextRequest) {
  try {
    // Admin gate first: before parsing, rate limiting, or data access.
    const gate = await requireAdminUser();
    if (gate instanceof NextResponse) return gate;
    const user = gate;

    // Rate limit: reuse articleAi tier (same AI budget as Growth Studio chat)
    const limited = await enforceRateLimit('articleAi', req, user.id);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const { agent, prompt, tenantId, history } = body as {
      agent?: string;
      prompt?: string;
      tenantId?: string | null;
      history?: Array<{ role: string; content: string }>;
    };

    if (!agent || typeof agent !== 'string') {
      return NextResponse.json({ error: 'agent is required (dylan|sentinel|qa)' }, { status: 400 });
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const allowedAgents = new Set(['dylan', 'sentinel', 'qa']);
    const agentKey = agent.toLowerCase().trim();
    if (!allowedAgents.has(agentKey)) {
      return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
    }

    const agentRow = await getAgentByName(agentKey);
    if (!agentRow) {
      return NextResponse.json({ error: `Agent not found: ${agentKey}` }, { status: 404 });
    }

    // Tenant tenancy is enforced inside orchestrate via resolveTenantContext fail-closed.
    // We pre-validate: if tenantId supplied it must be a valid UUID shape.
    if (tenantId !== undefined && tenantId !== null && tenantId !== '') {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(String(tenantId))) {
        return NextResponse.json({ error: 'tenantId must be a valid UUID' }, { status: 400 });
      }
    }

    const result = await orchestrate({
      agent: agentKey,
      prompt: prompt.trim(),
      tenantId: tenantId ?? null,
      userId: user.id,
      history: Array.isArray(history) ? (history as never) : undefined,
    });

    // Approval-gated response (207 Multi-Status to allow UI to distinguish)
    if (result.approvalRequired) {
      void insertSystemEvent({
        kind: 'approval_block',
        severity_hint: 'warn',
        tenant_id: tenantId ?? null,
        actor_id: user.id,
        agent_id: agentRow?.id ?? null,
        route: 'POST /api/ai/gateway',
        tool_name: null,
        status_code: 403,
        error_code: 'approval_required',
        message: (result.error ?? 'Approval required').slice(0, 2000),
        metadata: { agent: result.agent, approvalId: result.approvalId ?? null, runId: result.runId, taskId: result.taskId },
        source: 'aldriva',
      });
      return NextResponse.json(
        {
          success: false,
          approvalRequired: true,
          approvalId: result.approvalId ?? null,
          reason: result.error,
          agent: result.agent,
          runId: result.runId,
          taskId: result.taskId,
          toolCalls: result.toolCalls,
        },
        { status: 403 }
      );
    }

    if (!result.success && result.guardVerdict === 'rejected') {
      void insertSystemEvent({
        kind: 'guard_rejection',
        severity_hint: 'warn',
        tenant_id: tenantId ?? null,
        actor_id: user.id,
        agent_id: agentRow?.id ?? null,
        route: 'POST /api/ai/gateway',
        tool_name: null,
        status_code: 422,
        error_code: result.guardVerdict,
        message: (result.error ?? 'Content rejected by output guard').slice(0, 2000),
        metadata: { agent: result.agent, runId: result.runId, taskId: result.taskId, guardVerdict: result.guardVerdict },
        source: 'aldriva',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Content rejected by output guard',
          guardVerdict: result.guardVerdict,
          agent: result.agent,
          runId: result.runId,
          taskId: result.taskId,
          toolCalls: result.toolCalls,
        },
        { status: 422 }
      );
    }

    if (!result.success && result.error) {
      void insertSystemEvent({
        kind: 'api_error',
        severity_hint: 'error',
        tenant_id: tenantId ?? null,
        actor_id: user.id,
        agent_id: agentRow?.id ?? null,
        route: 'POST /api/ai/gateway',
        status_code: 500,
        error_code: 'orchestrator_error',
        message: result.error.slice(0, 2000),
        metadata: { agent: result.agent, runId: result.runId, taskId: result.taskId },
        source: 'aldriva',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Agent run failed',
          agent: result.agent,
          runId: result.runId,
          taskId: result.taskId,
          toolCalls: result.toolCalls,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: result.agent,
      text: result.guardedText,
      rawText: result.text,
      guardVerdict: result.guardVerdict,
      toolCalls: result.toolCalls,
      knowledgeUsed: result.knowledgeUsed,
      provider: result.provider,
      runId: result.runId,
      taskId: result.taskId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/ai/gateway]', msg);
    void insertSystemEvent({
      kind: 'api_error',
      severity_hint: 'error',
      route: 'POST /api/ai/gateway',
      status_code: 500,
      error_code: 'unhandled',
      message: msg.slice(0, 2000),
      metadata: {},
      source: 'aldriva',
    });
    return NextResponse.json({ error: 'AI gateway error' }, { status: 500 });
  }
}
