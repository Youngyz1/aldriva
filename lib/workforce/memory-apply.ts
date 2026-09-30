/**
 * lib/workforce/memory-apply.ts — Stage 12 memory applier (sole memory writer).
 *
 * Applies EXACT approved memory_propose states: poll approved + unclaimed
 * approvals, re-validate the canonical proposal, optimistic version check,
 * write fact + history, conditional audit stamp (exactly-once). Any
 * mismatch aborts auditable without mutation. Also sweeps due expirations
 * (explicit transitions, history-preserving) when invoked.
 *
 * Invoked synchronously from decideWorkforceApproval after a successful
 * decide (no polling loop, no scheduler, no new worker). Hermetic via the
 * injected client.
 */

export interface ApplyClient {
  from(table: string): any;
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

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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

/** Canonical proposal: proposedOutcome.memory_proposal first, evidence.proposal fallback. */
export function extractProposal(row: ApprovalRow): MemoryProposalState | null {  const po = row.proposed_outcome as Record<string, unknown> | null;
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

async function stampApproval(
  client: ApplyClient,
  approvalId: string,
  ref: string
): Promise<boolean> {
  const { data, error } = (await client
    .from('approvals')
    .update({ audit_ref: ref })
    .eq('id', approvalId)
    .or('audit_ref.is.null,audit_ref.eq.exec-invalid-envelope')
    .select('id')) as unknown as { data: Array<{ id: string }> | null; error: { message: string } | null };
  if (error) throw new Error(`Memory applier stamp failed: ${error.message}`);
  return (data ?? []).length > 0;
}

async function insertHistory(
  client: ApplyClient,
  fact: { id: string; version: number; fact_value: string; status: string; expires_at: string | null },
  approval: ApprovalRow,
  approverId: string | null,
  nowIso: string,
  ctx: { runId: string | null; taskId: string | null }
): Promise<void> {
  const rows = await selectAll<{ id: string }>(
    client.from('agent_memory_versions').insert({
      fact_id: fact.id,
      version: fact.version,
      fact_value: fact.fact_value,
      status: fact.status,
      expires_at: fact.expires_at,
      approval_id: approval.id,
      proposed_by_agent_id: approval.requested_by_agent_id,
      proposed_run_id: ctx.runId,
      proposed_task_id: ctx.taskId,
      approved_by: approverId,
      approved_at: nowIso,
    }).select('id'),
    'memory history insert'
  );
  if (!rows[0]) throw new Error('Memory history insert returned no row.');
}

/**
 * Apply one approved memory_propose approval exactly once. Returns the
 * outcome; never throws for business rejections (conflicts stamp and
 * report as skipped). Throw only on infrastructure failure.
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
    await stampApproval(client, approval.id, 'memory-invalid-proposal');
    return { skipped: 'unparseable proposal' };
  }
  const scope = resolveProposalScope(proposal, approval);
  if (!scope) {
    await stampApproval(client, approval.id, 'memory-invalid-scope');
    return { skipped: 'unresolvable scope' };
  }
  const pctx = extractProposalContext(approval);
  const existing = await selectAll<FactRow>(
    client.from('agent_memory').select('id,tenant_id,agent_id,fact_key,fact_value,status,version,expires_at,approval_id')
      .eq('fact_key', proposal.fact_key)
      .limit(10),
    'memory current lookup'
  );
  const current = existing.find(
    (f) => (f.tenant_id ?? null) === scope.tenantId && (f.agent_id ?? null) === scope.agentId
  ) ?? null;

  // Idempotent re-entry: this approval already produced this exact version.
  if (
    current !== null &&
    current.approval_id === approval.id &&
    current.version === proposal.base_version + 1
  ) {
    await stampApproval(client, approval.id, `memory:applied:${current.id}:v${current.version}`);
    return { applied: { factId: current.id, version: current.version, duplicate: true } };
  }

  if (proposal.op === 'CREATE') {
    if (current !== null) {
      await stampApproval(client, approval.id, 'memory-version-conflict');
      return { skipped: 'fact already exists' };
    }
    if (proposal.base_version !== 0) {
      await stampApproval(client, approval.id, 'memory-version-conflict');
      return { skipped: 'CREATE requires base_version 0' };
    }
    const inserted = await selectAll<{ id: string }>(
      client.from('agent_memory').insert({
        tenant_id: scope.tenantId,
        agent_id: scope.agentId,
        fact_key: proposal.fact_key,
        fact_value: proposal.fact_value as string,
        status: 'active',
        version: 1,
        source: 'agent-proposed',
        proposed_by_agent_id: approval.requested_by_agent_id,
        proposed_run_id: pctx.runId,
        proposed_task_id: pctx.taskId,
        approved_by: null,
        approval_id: approval.id,
        effective_at: nowIso,
        expires_at: proposal.expires_at,
      }).select('id'),
      'memory fact insert'
    );
    const factId = inserted[0]?.id;
    if (!factId) throw new Error('Memory fact insert returned no row.');
    await insertHistory(client, { id: factId, version: 1, fact_value: proposal.fact_value as string, status: 'active', expires_at: proposal.expires_at }, approval, null, nowIso, pctx);
    await stampApproval(client, approval.id, `memory:applied:${factId}:v1`);
    return { applied: { factId, version: 1 } };
  }

  // UPDATE / REVOKE / EXPIRE require the exact base version (optimistic check).
  if (current === null) {
    await stampApproval(client, approval.id, 'memory-version-conflict');
    return { skipped: 'no current fact for non-CREATE op' };
  }
  if (current.version !== proposal.base_version) {
    await stampApproval(client, approval.id, 'memory-version-conflict');
    return { skipped: `stale base_version (proposal ${proposal.base_version}, current ${current.version})` };
  }
  const nextVersion = current.version + 1;
  const nextStatus = proposal.op === 'UPDATE' ? current.status : proposal.op === 'REVOKE' ? 'revoked' : 'expired';
  const nextValue = proposal.op === 'UPDATE' ? (proposal.fact_value as string) : current.fact_value;
  const nextExpires = proposal.op === 'UPDATE' ? (proposal.expires_at ?? current.expires_at) : current.expires_at;
  const updated = await selectAll<{ id: string }>(
    client.from('agent_memory').update({
      fact_value: nextValue,
      status: nextStatus,
      version: nextVersion,
      expires_at: nextExpires,
      approval_id: approval.id,
      effective_at: nowIso,
    }).eq('id', current.id).eq('version', current.version).select('id'),
    'memory fact update'
  );
  if (updated.length === 0) {
    await stampApproval(client, approval.id, 'memory-version-conflict');
    return { skipped: 'lost version race' };
  }
  await insertHistory(client, { id: current.id, version: nextVersion, fact_value: nextValue, status: nextStatus, expires_at: nextExpires }, approval, null, nowIso, pctx);
  await stampApproval(client, approval.id, `memory:applied:${current.id}:v${nextVersion}`);
  return { applied: { factId: current.id, version: nextVersion } };
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
        .select('id,action,status,tenant_id,requested_by_agent_id,audit_ref,proposed_outcome,evidence')
        .eq('id', input.approvalId).limit(1),
      'memory approval'
    );
  } else {
    candidates = await selectAll<ApprovalRow>(
      client.from('approvals')
        .select('id,action,status,tenant_id,requested_by_agent_id,audit_ref,proposed_outcome,evidence')
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
 * Explicit expiration transitions (audit-preserving). Active facts with
 * expires_at elapsed become a new 'expired' version + history row.
 * Conditional on the seen version: concurrent appliers cannot double-expire.
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
    const nextVersion = fact.version + 1;
    const updated = await selectAll<{ id: string }>(
      client.from('agent_memory').update({ status: 'expired', version: nextVersion, effective_at: nowIso })
        .eq('id', fact.id).eq('version', fact.version).eq('status', 'active').select('id'),
      'memory expiry update'
    );
    if (updated.length === 0) continue;
    await selectAll<{ id: string }>(
      client.from('agent_memory_versions').insert({
        fact_id: fact.id, version: nextVersion, fact_value: fact.fact_value,
        status: 'expired', expires_at: fact.expires_at, approval_id: null,
        proposed_by_agent_id: null, proposed_run_id: null, proposed_task_id: null,
        approved_by: null, approved_at: null,
      }).select('id'),
      'memory expiry history'
    );
    done.push(fact.id);
  }
  return done;
}
