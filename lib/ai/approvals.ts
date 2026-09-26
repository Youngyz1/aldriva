/**
 * lib/ai/approvals.ts
 * Phase 142 — Approval enforcement (application code, not prompt).
 * Any tool with tool_definitions.risk high/critical or approval_required = true
 * must have an approvals row in 'approved' state before execution.
 * L0 agents cannot execute such tools at all in this phase; high-risk is rejected.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';

export interface ApprovalRow {
  id: string;
  requested_by: string | null;
  requested_by_agent_id: string | null;
  tenant_id: string | null;
  action: string;
  reason: string;
  evidence: Record<string, unknown>;
  risk: string;
  proposed_outcome: Record<string, unknown> | null;
  status: string;
  approver_id: string | null;
  decided_at: string | null;
  expires_at: string;
  created_at: string;
}

const HIGH_RISK = new Set(['high', 'critical']);

export interface ApprovalCheckResult {
  required: boolean;
  blocked: boolean;
  reason: string;
  approvalId?: string;
}

/**
 * Checks whether tool execution requires an approved approval row.
 * In Phase 142, L0 agents are never allowed to execute high/critical tools —
 * this function blocks them even if a stale approval existed.
 */
export async function checkApprovalRequired(
  agentId: string | null,
  agentName: string,
  autonomyLevel: string,
  toolName: string,
  toolRisk: string,
  toolApprovalRequired: boolean
): Promise<ApprovalCheckResult> {
  const isHighRisk = HIGH_RISK.has(toolRisk);
  const requiresApproval = toolApprovalRequired || isHighRisk;

  if (!requiresApproval) {
    return { required: false, blocked: false, reason: 'no approval required' };
  }

  // L0 agents cannot execute approval-required tools at all in Phase 142
  if (autonomyLevel === 'L0') {
    return {
      required: true,
      blocked: true,
      reason: `Tool "${toolName}" requires approval (risk=${toolRisk}) but agent "${agentName}" is L0 read-only — blocked without approval`,
    };
  }

  // For L1+ (future), check for an existing approved row (not expired)
  // Even in future, stale approval never auto-grants; we check DB live
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from('approvals')
      .select('id')
      .eq('action', toolName)
      .eq('status', 'approved')
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (data) {
      return { required: true, blocked: false, reason: 'approved', approvalId: (data as { id: string }).id };
    }
  } catch {
    // fall through to blocked
  }

  return {
    required: true,
    blocked: true,
    reason: `Tool "${toolName}" requires human approval (risk=${toolRisk}) — no active approved approval found`,
  };
}

/**
 * Create a pending approval request (fail-safe audit). Does not grant execution.
 * Called by orchestrator when a tool is blocked by approval gate.
 */
export async function createApprovalRequest(params: {
  requestedBy: string | null;
  requestedByAgentId: string | null;
  tenantId: string | null;
  action: string;
  reason: string;
  evidence?: Record<string, unknown>;
  risk: string;
  proposedOutcome?: Record<string, unknown> | null;
}): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from('approvals')
      .insert({
        requested_by: params.requestedBy,
        requested_by_agent_id: params.requestedByAgentId,
        tenant_id: params.tenantId,
        action: params.action.slice(0, 200),
        reason: params.reason.slice(0, 2000),
        evidence: params.evidence ?? {},
        risk: params.risk,
        proposed_outcome: params.proposedOutcome ?? null,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) {
      console.error('[approvals] createApprovalRequest failed:', error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error('[approvals] createApprovalRequest threw:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Resolve agent row's autonomy_level and id by name (for approval check).
 * Falls back to L0 when DB unavailable.
 */
export async function getAgentAutonomy(agentName: string): Promise<{ id: string | null; level: string }> {
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin.from('agents').select('id, autonomy_level').eq('name', agentName.toLowerCase()).maybeSingle();
    if (data) return { id: (data as { id: string }).id, level: (data as { autonomy_level: string }).autonomy_level };
  } catch {
    // fall through
  }
  return { id: null, level: 'L0' };
}
