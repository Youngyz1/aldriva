/**
 * lib/exec/binding.ts — Stage 10.3 six-way authorization binding.
 *
 * Called after claim, BEFORE any tool dispatch. Revalidates the live
 * authorization context against the stored envelope — possession of a claim
 * token is necessary but never sufficient. There is deliberately NO shortcut
 * of the form `if approval approved: execute()`: the six identities
 * (tenant, agent, approval, action, args, execution/job) must all agree,
 * and the tool must still pass the existing allowlist + safety pipeline at
 * dispatch time (enforced by the runner, not here).
 *
 * All failures are PERMANENT (never retryable): re-checking later cannot
 * make a forged tenant, changed args, or revoked approval valid. Retryable
 * execution failures belong to 10.5, never to binding.
 *
 * Pure module: callers load the rows (approval, agent, tool definition) and
 * pass them in. Hermetically tested.
 */

import { canonicalizeArgs, type ExecutionEnvelope } from './envelope';

export interface BindingApproval {
  id: string;
  action: string;
  risk: string;
  status: string;
  expires_at: string;
  tenant_id: string | null;
  proposed_outcome: unknown;
}

export interface BindingAgent {
  id: string;
  name: string;
  autonomy_level: string;
  status: string;
}

export interface BindingToolDef {
  name: string;
  scope: string;
  risk: string;
  approval_required: boolean;
}

export interface BindingJob {
  id: string;
  tenant_id: string | null;
  agent_id: string;
  approval_id: string | null;
  attempt_no: number;
}

export interface BindingInput {
  envelope: ExecutionEnvelope;
  job: BindingJob;
  approval: BindingApproval | null;
  agent: BindingAgent | null;
  toolDef: BindingToolDef | null;
  nowIso: string;
}

export interface BindingContext {
  tenantId: string | null;
  agentId: string;
  agentName: string;
  action: string;
  args: Record<string, unknown>;
  argsCanonical: string;
  approvalId: string | null;
  jobId: string;
  attemptNo: number;
  toolScope: string;
}

export type BindingResult =
  | { ok: true; context: BindingContext }
  | { ok: false; reason: string };

const HIGH_RISK = new Set(['high', 'critical']);

function needsApproval(toolDef: BindingToolDef): boolean {
  return toolDef.approval_required || HIGH_RISK.has(toolDef.risk);
}

/**
 * Verify the six-way bind. Order matters for audit clarity: identity and
 * tool existence first, then approval liveness, then exact-match drift
 * checks. First failure wins with a machine-readable reason.
 */
export function checkBinding(input: BindingInput): BindingResult {
  const { envelope, job, approval, agent, toolDef, nowIso } = input;

  // 1. Tool must exist in the registry (allowlist membership re-resolved).
  if (!toolDef) return { ok: false, reason: 'unknown tool' };

  // 2. Agent must exist, be active, and match the envelope exactly.
  if (!agent) return { ok: false, reason: 'agent missing' };
  if (agent.status !== 'active') return { ok: false, reason: 'agent not active' };
  if (agent.id !== envelope.agentId) return { ok: false, reason: 'agent changed' };
  if (agent.name !== envelope.agentName) return { ok: false, reason: 'agent name changed' };

  // 3. Action triple-match: envelope == registry == approval (when present).
  if (envelope.action !== toolDef.name) return { ok: false, reason: 'action changed' };

  // 4. Approval gate: required tools need a live, matching approval.
  if (needsApproval(toolDef)) {
    if (!approval && job.approval_id) return { ok: false, reason: 'approval missing' };
    if (!approval && !job.approval_id) return { ok: false, reason: 'approval required' };
    const ap = approval as BindingApproval;
    if (ap.id !== job.approval_id) return { ok: false, reason: 'approval changed' };
    if (ap.status !== 'approved') return { ok: false, reason: `approval ${ap.status}` };
    if (ap.expires_at <= nowIso) return { ok: false, reason: 'approval expired' };
    if (ap.action !== envelope.action) return { ok: false, reason: 'approval action mismatch' };
  } else if (job.approval_id) {
    // Non-required tools may still carry an approval link; when present it
    // must be live — a revoked link never silently becomes advisory.
    if (!approval) return { ok: false, reason: 'approval missing' };
    const ap = approval as BindingApproval;
    if (ap.id !== job.approval_id) return { ok: false, reason: 'approval changed' };
    if (ap.status !== 'approved') return { ok: false, reason: `approval ${ap.status}` };
    if (ap.expires_at <= nowIso) return { ok: false, reason: 'approval expired' };
  }

  // 5. Tenant triple-match: envelope == job == approval (nulls match exactly).
  if (envelope.tenantId !== job.tenant_id) return { ok: false, reason: 'tenant changed' };
  if (approval && approval.tenant_id !== job.tenant_id) return { ok: false, reason: 'approval tenant mismatch' };

  // 6. Args integrity: stored canonical form must reproduce, and the
  // approval-time envelope (when the approval carries one) must agree —
  // this is the drift check that makes "approved X, execute Y" impossible.
  if (canonicalizeArgs(envelope.args) !== envelope.argsCanonical) {
    return { ok: false, reason: 'args tampered' };
  }
  if (approval && approval.proposed_outcome !== null && approval.proposed_outcome !== undefined) {
    const outcome = approval.proposed_outcome as Record<string, unknown>;
    if (typeof outcome === 'object' && !Array.isArray(outcome) && typeof outcome['argsCanonical'] === 'string') {
      if (outcome['argsCanonical'] !== envelope.argsCanonical) {
        return { ok: false, reason: 'args changed since approval' };
      }
    }
  }

  return {
    ok: true,
    context: {
      tenantId: envelope.tenantId,
      agentId: envelope.agentId,
      agentName: envelope.agentName,
      action: envelope.action,
      args: envelope.args,
      argsCanonical: envelope.argsCanonical,
      approvalId: job.approval_id,
      jobId: job.id,
      attemptNo: job.attempt_no,
      toolScope: toolDef.scope,
    },
  };
}
