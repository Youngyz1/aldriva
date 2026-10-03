/**
 * lib/workforce/memory-apply.ts — Stage 12 applier, Stage 13 atomic path.
 *
 * The SOLE memory writer (with the human direct-create action). All fact +
 * history + stamp writes go through the transactional RPC
 * apply_agent_memory() (migration_150): approval verification, fact write,
 * history insert, and approval stamp commit or roll back together, so a
 * fact can never land without its history. Application logic here stays
 * dumb by design: extract the canonical proposal, resolve scopes from
 * server-trusted row data, translate to RPC params, map the result.
 * Hermetic via the injected client (tests emulate rpc faithfully,
 * including partial-unique enforcement and the append-only trigger).
 */

export interface ApplyClient {
  from(table: string): any;
  rpc?(fn: string, params: Record<string, unknown>): PromiseLike<unknown>;
}

export interface MemoryProposalState {
  op: 'CREATE' | 'UPDATE' | 'REVOKE' | 'EXPIRE';
  scope: 'own-tenant-shared' | 'own-tenant-self' | 'platform-shared';
  agent: 'self' | 'shared';
  fact_key: string;
  fact_value: string | null;
  base_version: number;
  expires_at: string | null;
}

export interface ApplyResult {
  applied: Array<{ approvalId: string; factId: string; version: number; duplicate?: boolean }>;
  skipped: Array<{ approvalId: string; reason: string }>;
  expired: string[];
}

interface ApprovalRow {
  id: string;
  action: string;
  status: string;
  tenant_id: string | null;
  requested_by_agent_id: string | null;
  approver_id: string | null;
  audit_ref: string | null;
  proposed_outcome: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
}

interface FactRow {
  id: string;
  tenant_id: string | null;
  agent_id: string | null;
  fact_key: string;
  fact_value: string;
  status: string;
  version: number;
  expires_at: string | null;
  approval_id: string | null;
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Memory applier read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isProposalState(v: unknown): v is MemoryProposalState {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  if (p['op'] !== 'CREATE' && p['op'] !== 'UPDATE' && p['op'] !== 'REVOKE' && p['op'] !== 'EXPIRE') return false;
  if (p['scope'] !== 'own-tenant-shared' && p['scope'] !== 'own-tenant-self' && p['scope'] !== 'platform-shared') return false;
  if (p['agent'] !== 'self' && p['agent'] !== 'shared') return false;
  if (typeof p['fact_key'] !== 'string' || p['fact_key'].length < 1 || p['fact_key'].length > 120) return false;
  if ((p['op'] === 'CREATE' || p['op'] === 'UPDATE') && (typeof p['fact_value'] !== 'string' || (p['fact_value'] as string).length < 1 || (p['fact_value'] as string).length > 4000)) return false;
  if (typeof p['base_version'] !== 'number' || !Number.isInteger(p['base_version']) || (p['base_version'] as number) < 0) return false;
  return true;
}

/** Canonical proposal: proposedOutcome.memory_proposal first, evidence.proposal fallback. */
export function extractProposal(row: ApprovalRow): MemoryProposalState | null {
  const po = row.proposed_outcome as Record<string, unknown> | null;
  if (po && typeof po === 'object' && isProposalState((po as Record<string, unknown>)['memory_proposal'])) {
    return (po as Record<string, unknown>)['memory_proposal'] as MemoryProposalState;
  }
  const ev = row.evidence as Record<string, unknown> | null;
  if (ev && typeof ev === 'object' && isProposalState((ev as Record<string, unknown>)['proposal'])) {
    return (ev as Record<string, unknown>)['proposal'] as MemoryProposalState;
  }
  return null;
}

/** Resolve scope/agent aliases to ids using SERVER-TRUSTED row data only. */
export function resolveProposalScope(
  proposal: MemoryProposalState,
  row: ApprovalRow
): { tenantId: string | null; agentId: string | null } | null {
  const tenantId = proposal.scope === 'platform-shared' ? null : row.tenant_id;
  if (proposal.scope !== 'platform-shared' && tenantId === null) return null;
  const agentId = proposal.agent === 'shared' ? null : row.requested_by_agent_id;
  if (proposal.agent !== 'shared' && agentId === null) return null;
  return { tenantId, agentId };
}

/** Run/task linkage from evidence.proposal (orchestrator-attached, server-known). */
export function extractProposalContext(row: ApprovalRow): { runId: string | null; taskId: string | null } {
  const ev = row.evidence as Record<string, unknown> | null;
  const p = ev !== null && typeof ev === 'object' ? (ev as Record<string, unknown>)['proposal'] : null;
  const o = p !== null && typeof p === 'object' ? (p as Record<string, unknown>) : null;
  return {
    runId: isUuid(o?.['run_id']) ? (o?.['run_id'] as string) : null,
    taskId: isUuid(o?.['task_id']) ? (o?.['task_id'] as string) : null,
  };
}

interface RpcRow {
  applied: boolean;
  fact_id: string | null;
  version: number | null;
  reason: string;
}

async function callApplyRpc(
  client: ApplyClient,
  params: Record<string, unknown>,
  what: string
): Promise<RpcRow> {
  if (typeof client.rpc !== 'function') throw new Error(`Memory applier requires rpc support (${what}).`);
  const { data, error } = (await client.rpc('apply_agent_memory', params)) as unknown as {
    data: RpcRow[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(`Memory applier RPC failed (${what}): ${error.message}`);
  const row = (data ?? [])[0] ?? null;
  if (!row) throw new Error(`Memory applier RPC returned no row (${what}).`);
  return row;
}

/**
 * Apply one approved memory_propose approval exactly once. Returns the
 * outcome; never throws for business rejections. Throw only on
 * infrastructure failure.
 */
export async function applyOneApproval(
  client: ApplyClient,
  approval: ApprovalRow,
  nowIso: string
): Promise<{ applied?: { factId: string; version: number; duplicate?: boolean }; skipped?: string }> {
  if (approval.action !== 'memory_propose' || approval.status !== 'approved') {
    return { skipped: 'not an approved memory proposal' };
  }
  const proposal = extractProposal(approval);
  if (!proposal) {
    return { skipped: 'unparseable proposal' };
  }
  const scope = resolveProposalScope(proposal, approval);
  if (!scope) {
    return { skipped: 'unresolvable scope' };
  }
  const pctx = extractProposalContext(approval);
  const nextStatus = proposal.op === 'UPDATE' || proposal.op === 'CREATE' ? 'active' : proposal.op === 'REVOKE' ? 'revoked' : 'expired';
  const res = await callApplyRpc(
    client,
    {
      p_approval_id: approval.id,
      p_require_approval: true,
      p_op: proposal.op,
      p_tenant_id: scope.tenantId,
      p_agent_id: scope.agentId,
      p_fact_key: proposal.fact_key,
      p_fact_value: proposal.op === 'CREATE' || proposal.op === 'UPDATE' ? proposal.fact_value : null,
      p_next_status: nextStatus,
      p_expires_at: proposal.expires_at,
      p_source: 'agent-proposed',
      p_proposer_agent: approval.requested_by_agent_id,
      p_run_id: pctx.runId,
      p_task_id: pctx.taskId,
      p_approver: approval.approver_id ?? null,
      p_now: nowIso,
      p_expected_version: proposal.base_version,
    },
    'memory approval apply'
  );
  if (!res.applied || !res.fact_id || res.version === null) {
    return { skipped: res.reason };
  }
  // Idempotent re-entry surfaces as applied + version match: distinguish a
  // true duplicate (already stamped) from a fresh apply via the stamp the
  // RPC would have reused.
  const duplicate = res.reason === 'already applied';
  return { applied: { factId: res.fact_id, version: res.version, ...(duplicate ? { duplicate: true as const } : {}) } };
}

export async function applyApprovedMemory(
  client: ApplyClient,
  input: { approvalId?: string | null; nowIso?: string; limit?: number }
): Promise<ApplyResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const out: ApplyResult = { applied: [], skipped: [], expired: [] };
  let candidates: ApprovalRow[];
  if (input.approvalId) {
    candidates = await selectAll<ApprovalRow>(
      client.from('approvals')
        .select('id,action,status,tenant_id,requested_by_agent_id,approver_id,audit_ref,proposed_outcome,evidence')
        .eq('id', input.approvalId).limit(1),
      'memory approval'
    );
  } else {
    candidates = await selectAll<ApprovalRow>(
      client.from('approvals')
        .select('id,action,status,tenant_id,requested_by_agent_id,approver_id,audit_ref,proposed_outcome,evidence')
        .eq('action', 'memory_propose')
        .eq('status', 'approved')
        .or('audit_ref.is.null,audit_ref.eq.exec-invalid-envelope')
        .order('created_at', { ascending: true })
        .limit(limit),
      'memory approval poll'
    );
  }
  for (const approval of candidates) {
    const r = await applyOneApproval(client, approval, nowIso);
    if (r.applied) out.applied.push({ approvalId: approval.id, ...r.applied });
    else out.skipped.push({ approvalId: approval.id, reason: r.skipped ?? 'unknown' });
  }
  out.expired = await expireDueMemories(client, nowIso);
  return out;
}

/**
 * Explicit expiration transitions (audit-preserving) via the same atomic
 * RPC. Conditional on the seen version: concurrent appliers cannot
 * double-expire. Idempotent.
 */
export async function expireDueMemories(client: ApplyClient, nowIso: string): Promise<string[]> {
  const done: string[] = [];
  const due = await selectAll<FactRow>(
    client.from('agent_memory').select('id,tenant_id,agent_id,fact_key,fact_value,status,version,expires_at,approval_id')
      .eq('status', 'active')
      .lte('expires_at', nowIso)
      .limit(50),
    'memory expiry scan'
  );
  for (const fact of due) {
    if (fact.expires_at === null || fact.expires_at > nowIso) continue;
    const res = await callApplyRpc(
      client,
      {
        p_approval_id: null,
        p_require_approval: false,
        p_op: 'EXPIRE',
        p_tenant_id: fact.tenant_id,
        p_agent_id: fact.agent_id,
        p_fact_key: fact.fact_key,
        p_fact_value: null,
        p_next_status: 'expired',
        p_expires_at: fact.expires_at,
        p_source: 'system',
        p_proposer_agent: null,
        p_run_id: null,
        p_task_id: null,
        p_approver: null,
        p_now: nowIso,
        p_expected_version: fact.version,
      },
      'memory expiry'
    );
    if (res.applied) done.push(fact.id);
  }
  return done;
}
