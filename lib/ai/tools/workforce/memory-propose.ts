/**
 * lib/ai/tools/workforce/memory-propose.ts
 * Stage 12 — agent memory proposal tool (proposal ONLY, never persistence).
 *
 * The orchestrator L0 gate intercepts calls (approval_required=true in DB)
 * and creates the action='memory_propose' approval; this executor runs only
 * when the gate does not intercept (fallback path, L1+ with a live
 * approval, or post-approval worker dispatch). In every reachable path it
 * validates the proposal and records it as an approval request — it NEVER
 * writes agent_memory. The applier (lib/workforce/memory-apply.ts) is the
 * sole memory writer.
 *
 * The model supplies NO ids: tenant/agent/run/task are resolved from
 * server-trusted context (ctx + orchestrator envelope), never from args.
 * Scope/agent travel as aliases ('own-tenant-shared', 'self', …) and are
 * resolved to ids at apply time from the trusted envelope.
 */

import type { AIToolDefinition } from '../../types';
import { requireToolContext, logToolInvocation, type TenantToolContext } from '../tenant/tool-context';
import { createApprovalRequest } from '../../approvals';

export const MEMORY_PROPOSE_OPS = ['CREATE', 'UPDATE', 'REVOKE', 'EXPIRE'] as const;
export const MEMORY_PROPOSE_SCOPES = ['own-tenant-shared', 'own-tenant-self', 'platform-shared'] as const;
export const MEMORY_PROPOSE_AGENTS = ['self', 'shared'] as const;

export interface MemoryProposalArgs {
  op?: unknown;
  scope?: unknown;
  agent?: unknown;
  fact_key?: unknown;
  fact_value?: unknown;
  base_version?: unknown;
  expires_at?: unknown;
  reason?: unknown;
}

export interface ValidMemoryProposal {
  op: 'CREATE' | 'UPDATE' | 'REVOKE' | 'EXPIRE';
  scope: 'own-tenant-shared' | 'own-tenant-self' | 'platform-shared';
  agent: 'self' | 'shared';
  fact_key: string;
  fact_value: string | null;
  base_version: number;
  expires_at: string | null;
  reason: string;
}

/**
 * Secret-pattern detector (mirrors redactSentinelMessage pairs — detect,
 * then reject). Covers: PEM private-key headers, Stripe-style sk_live_ /
 * sk_test_ keys, OpenAI/Anthropic hyphen keys (sk-live/test/ant/proj-),
 * Google AIza keys, GitHub tokens (ghp_/github_pat_), Supabase sbp_ keys,
 * Stripe whsec_ webhook secrets, space-separated Bearer tokens, bare JWTs
 * (eyJ header . payload . signature), postgres connection strings carrying
 * a password, and labelled key/secret/token/password assignments. Bare
 * ordinary words never match: every unlabelled pattern demands a
 * provider-specific prefix plus token-shaped characters (or, for Bearer,
 * a 10+ character token), so prose like "Bearer shares rose" stays clean.
 */
export function containsSecretPattern(v: string): boolean {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----/.test(v)) return true;
  if (/sk_(live|test)_[A-Za-z0-9]+/.test(v)) return true;
  if (/\bsk-(live|test|ant|proj)-[A-Za-z0-9\-_]+/.test(v)) return true;
  if (/\bAIza[0-9A-Za-z\-_]{30,}\b/.test(v)) return true;
  if (/\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(v)) return true;
  if (/\b(sbp_[A-Za-z0-9\-_]{12,}|whsec_[A-Za-z0-9\-_]{16,})\b/.test(v)) return true;
  if (/\bBearer\s+[A-Za-z0-9\-._~+/]{10,}={0,2}\b/i.test(v)) return true;
  if (/\beyJ[A-Za-z0-9\-_]{8,}\.[A-Za-z0-9\-_]{8,}\.[A-Za-z0-9\-_.+/=]{8,}/.test(v)) return true;
  if (/\bpostgres(?:ql)?:\/\/[^/\s]*:[^@\s]+@[^\s]+/.test(v)) return true;
  return /(api[_-]?key|secret|token|passwd|password|authorization|bearer|session|cookie)\s*[:=]\s*['"]?[^'"\s,}]+['"]?/i.test(v);
}

/**
 * Validate raw model args into a canonical proposal. Returns {ok:false}
 * for ANY malformed input — callers must reject before creating approval.
 */
export function validateMemoryProposal(
  raw: Record<string, unknown> | null | undefined
): { ok: true; proposal: ValidMemoryProposal } | { ok: false; message: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: '[memory_propose] Args must be an object.' };
  }
  const op = (raw as MemoryProposalArgs).op;
  if (op !== 'CREATE' && op !== 'UPDATE' && op !== 'REVOKE' && op !== 'EXPIRE') {
    return { ok: false, message: '[memory_propose] op must be CREATE, UPDATE, REVOKE, or EXPIRE.' };
  }
  const scope = (raw as MemoryProposalArgs).scope ?? 'own-tenant-shared';
  if (scope !== 'own-tenant-shared' && scope !== 'own-tenant-self' && scope !== 'platform-shared') {
    return { ok: false, message: '[memory_propose] scope must be own-tenant-shared, own-tenant-self, or platform-shared.' };
  }
  const agent = (raw as MemoryProposalArgs).agent ?? 'shared';
  if (agent !== 'self' && agent !== 'shared') {
    return { ok: false, message: '[memory_propose] agent must be self or shared.' };
  }
  const factKey = (raw as MemoryProposalArgs).fact_key;
  if (typeof factKey !== 'string' || factKey.length < 1 || factKey.length > 120) {
    return { ok: false, message: '[memory_propose] fact_key must be 1–120 characters.' };
  }
  const needsValue = op === 'CREATE' || op === 'UPDATE';
  const factValue = (raw as MemoryProposalArgs).fact_value;
  if (needsValue) {
    if (typeof factValue !== 'string' || factValue.length < 1 || factValue.length > 4000) {
      return { ok: false, message: '[memory_propose] fact_value must be 1–4000 characters for CREATE/UPDATE.' };
    }
    if (containsSecretPattern(factValue)) {
      return { ok: false, message: '[memory_propose] fact_value looks like a secret — memory is not a secret store.' };
    }
  }
  const baseRaw = (raw as MemoryProposalArgs).base_version ?? 0;
  const baseVersion = typeof baseRaw === 'number' && Number.isInteger(baseRaw) && baseRaw >= 0 ? baseRaw : -1;
  if (baseVersion < 0) {
    return { ok: false, message: '[memory_propose] base_version must be an integer >= 0 (0 for CREATE).' };
  }
  if (op === 'CREATE' && baseVersion !== 0) {
    return { ok: false, message: '[memory_propose] CREATE requires base_version 0.' };
  }
  if (op !== 'CREATE' && baseVersion < 1) {
    return { ok: false, message: '[memory_propose] UPDATE/REVOKE/EXPIRE require the current version as base_version.' };
  }
  const expiresRaw = (raw as MemoryProposalArgs).expires_at ?? null;
  let expiresAt: string | null = null;
  if (expiresRaw !== null && expiresRaw !== undefined && expiresRaw !== '') {
    if (typeof expiresRaw !== 'string' || Number.isNaN(Date.parse(expiresRaw))) {
      return { ok: false, message: '[memory_propose] expires_at must be an ISO timestamp or omitted.' };
    }
    expiresAt = new Date(expiresRaw).toISOString();
  }
  const reasonRaw = (raw as MemoryProposalArgs).reason;
  const reason = typeof reasonRaw === 'string' ? reasonRaw.slice(0, 2000) : '';
  return {
    ok: true,
    proposal: {
      op, scope, agent, fact_key: factKey,
      fact_value: needsValue ? (factValue as string) : null,
      base_version: baseVersion, expires_at: expiresAt, reason,
    },
  };
}

export const memoryProposeDefinition: AIToolDefinition = {
  name: 'memory_propose',
  description:
    'Propose a durable memory fact for human approval. Calling this tool does not write memory: the platform intercepts the call and creates a pending human-approval request, and nothing is stored until a human approves. Give operation, scope, fact key and value (never secrets).',
  parameters: {
    type: 'object',
    properties: {
      op: { type: 'string', description: 'CREATE, UPDATE, REVOKE, or EXPIRE.' },
      scope: { type: 'string', description: 'own-tenant-shared, own-tenant-self, or platform-shared.' },
      agent: { type: 'string', description: 'self (calling agent) or shared.' },
      fact_key: { type: 'string', description: 'Stable key, 1-120 chars.' },
      fact_value: { type: 'string', description: 'Fact text, 1-4000 chars, never secrets. Required for CREATE/UPDATE.' },
      base_version: { type: 'integer', description: '0 for CREATE, current version otherwise.' },
      expires_at: { type: 'string', description: 'Optional ISO expiry timestamp.' },
      reason: { type: 'string', description: 'Why this fact should be remembered.' },
    },
    required: ['op', 'fact_key'],
  },
  scope: 'transactional',
};

/**
 * Direct-execution path (gate fallback / L1+ / worker dispatch). Validates
 * and records the proposal as an approval — NEVER writes agent_memory.
 */
export async function memoryPropose(
  ctx: TenantToolContext,
  args: MemoryProposalArgs
): Promise<{ proposed: boolean; approvalId: string | null }> {
  const tenantId = requireToolContext(ctx, 'memory_propose', args);
  const checked = validateMemoryProposal(args as Record<string, unknown>);
  if (!checked.ok) {
    logToolInvocation(ctx, null, 'memory_propose', args, 'denied', 'error', 0, checked.message);
    throw new Error(checked.message);
  }
  const p = checked.proposal;
  const approvalId = await createApprovalRequest({
    requestedBy: ctx.userId ?? null,
    requestedByAgentId: null,
    tenantId: p.scope === 'platform-shared' ? null : tenantId,
    action: 'memory_propose',
    reason: `Memory ${p.op}: ${p.fact_key}${p.reason ? ` — ${p.reason.slice(0, 500)}` : ''}`.slice(0, 2000),
    evidence: {
      tool: 'memory_propose',
      proposal: {
        op: p.op, scope: p.scope, agent: p.agent, fact_key: p.fact_key,
        fact_value: p.fact_value, base_version: p.base_version,
        expires_at: p.expires_at, reason: p.reason,
      },
    },
    risk: 'medium',
    proposedOutcome: {
      memory_proposal: {
        op: p.op, scope: p.scope, agent: p.agent, fact_key: p.fact_key,
        fact_value: p.fact_value, base_version: p.base_version,
        expires_at: p.expires_at,
      },
    },
  });
  logToolInvocation(ctx, null, 'memory_propose', args, 'allowed', 'success', 1);
  return { proposed: true, approvalId };
}
