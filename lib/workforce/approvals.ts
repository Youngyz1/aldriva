/**
 * lib/workforce/approvals.ts — Stage 4 (Approvals list + review surface).
 *
 * Same fetch + pure view-model shape as Stages 1–3. Tenant contract: the
 * approvals table carries tenant_id and is filtered when a tenant is given;
 * agent names resolve from the platform registry (never tenant-filtered).
 *
 * HAND-OFF STATUS (verified, not assumed): the sole consumer of approval
 * state is checkApprovalRequired() (lib/ai/approvals.ts), called once per
 * tool call inside orchestrate() (lib/ai/orchestrator.ts:292). All current
 * agents are L0, for which it ALWAYS blocks without reading the table, and
 * the blocked run then ends (single synchronous iteration — nothing
 * re-polls, resumes, or re-executes). Deciding here therefore flips ONLY
 * the approval record (auditable; meaningful to future L1+ runs that check
 * live) and never performs the underlying agent action. No pickup worker
 * exists and none is invented here — see the Stage 4 report.
 *
 * Secret hygiene (tested): evidence/proposed_outcome JSONB surface as KEY
 * lists only (evidence embeds a raw args slice at write time); reason text
 * is app-generated and safe to show; approver/requester user ids render
 * truncated to 8 chars.
 */

import type { CommandCenterClient } from './command-center';

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;

export function isApprovalStatusValue(s: string): boolean {
  return (APPROVAL_STATUSES as readonly string[]).includes(s);
}

export interface ApprovalListItem {
  id: string;
  requested_by_agent_id: string | null;
  tenant_id: string | null;
  action: string;
  reason: string;
  risk: string;
  status: string;
  expires_at: string;
  created_at: string;
  decided_at: string | null;
}

export interface ApprovalDetail extends ApprovalListItem {
  requested_by: string | null;
  approver_id: string | null;
  evidence: Record<string, unknown>;
  proposed_outcome: Record<string, unknown> | null;
  audit_ref: string | null;
}

export interface ApprovalAgentRef {
  id: string;
  name: string;
  display_name: string;
}

export interface ApprovalLink {
  id: string;
  kind: 'task' | 'run';
  status: string;
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce approvals read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

function scopedTenant<T>(q: T, tenantId: string | null): T {
  if (tenantId === null) return q;
  return (q as unknown as { eq(col: string, val: unknown): T }).eq('tenant_id', tenantId);
}

export async function fetchApprovalList(
  client: CommandCenterClient,
  tenantId: string | null = null,
  status: string | null = null
): Promise<ApprovalListItem[]> {
  let q = scopedTenant(
    client.from('approvals').select('id,requested_by_agent_id,tenant_id,action,reason,risk,status,expires_at,created_at,decided_at'),
    tenantId
  );
  if (status !== null) q = q.eq('status', status);
  return selectAll<ApprovalListItem>(q.order('created_at', { ascending: false }).limit(50), 'approvals');
}

export async function fetchApprovalAgents(client: CommandCenterClient): Promise<ApprovalAgentRef[]> {
  return selectAll<ApprovalAgentRef>(
    client.from('agents').select('id,name,display_name').limit(100),
    'agents'
  );
}

/** Tasks/runs pointing at an approval (via their approval_id columns). */
export async function fetchApprovalLinks(
  client: CommandCenterClient,
  approvalId: string
): Promise<ApprovalLink[]> {
  const tasks = await selectAll<{ id: string; status: string }>(
    client.from('agent_tasks').select('id,status').eq('approval_id', approvalId).limit(5),
    'approval_tasks'
  );
  const runs = await selectAll<{ id: string; status: string }>(
    client.from('agent_runs').select('id,status').eq('approval_id', approvalId).limit(5),
    'approval_runs'
  );
  return [
    ...tasks.map((t) => ({ id: t.id, kind: 'task' as const, status: t.status })),
    ...runs.map((r) => ({ id: r.id, kind: 'run' as const, status: r.status })),
  ];
}

export async function fetchApprovalDetail(
  client: CommandCenterClient,
  approvalId: string,
  tenantId: string | null = null
): Promise<ApprovalDetail | null> {
  const rows = await selectAll<ApprovalDetail>(
    scopedTenant(
      client.from('approvals').select('id,requested_by,requested_by_agent_id,tenant_id,action,reason,evidence,risk,proposed_outcome,status,approver_id,decided_at,expires_at,audit_ref,created_at').eq('id', approvalId).limit(1),
      tenantId
    ),
    'approval'
  );
  return rows[0] ?? null;
}

export type Decision = 'approved' | 'rejected';

export function isDecisionValue(s: unknown): s is Decision {
  return s === 'approved' || s === 'rejected';
}

export interface DecideInput {
  approvalId: string;
  decision: unknown;
  approverId: string;
  /** Acting scope: null = platform admin view; set = must exactly match row tenant. */
  tenantScope: string | null;
  nowIso: string;
}

export interface DecideResult {
  ok: boolean;
  message: string;
  approvalId?: string;
  decision?: Decision;
}

/**
 * Server-enforced decision. Re-reads the row and rejects unless it is still
 * pending, unexpired, and (when scoped) exactly in-scope. The client supplies
 * ONLY id + decision — action/risk come from the DB row, never the request,
 * so tampered parameters are structurally impossible. The conditional update
 * (.eq status pending) makes double-decision atomic: second writer matches
 * zero rows and is rejected. Flips the record ONLY — never executes anything.
 */
export async function decideApproval(
  client: CommandCenterClient,
  input: DecideInput
): Promise<DecideResult> {
  if (!isDecisionValue(input.decision)) {
    return { ok: false, message: 'Decision must be approved or rejected.' };
  }
  const current = await selectAll<{ id: string; tenant_id: string | null; action: string; risk: string; status: string; expires_at: string }>(
    client.from('approvals').select('id,tenant_id,action,risk,status,expires_at').eq('id', input.approvalId).limit(1),
    'approval_reread'
  );
  const row = current[0] ?? null;
  if (!row) return { ok: false, message: 'Approval not found.' };
  if (input.tenantScope !== null && row.tenant_id !== input.tenantScope) {
    return { ok: false, message: 'Approval is outside the acting tenant scope.' };
  }
  if (row.status !== 'pending') {
    return { ok: false, message: `Approval already decided (${row.status}).` };
  }
  if (row.expires_at <= input.nowIso) {
    return { ok: false, message: 'Approval has expired.' };
  }
  const updated = await selectAll<{ id: string }>(
    client
      .from('approvals')
      .update({ status: input.decision, approver_id: input.approverId, decided_at: input.nowIso })
      .eq('id', input.approvalId)
      .eq('status', 'pending')
      .select('id'),
    'approval_decide'
  );
  if (updated.length === 0) {
    return { ok: false, message: 'Approval was decided concurrently.' };
  }
  return { ok: true, message: `Approval ${input.decision}.`, approvalId: input.approvalId, decision: input.decision };
}

export function shortId(id: string | null): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function evidenceKeys(evidence: Record<string, unknown> | null | undefined): string[] {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [];
  return Object.keys(evidence);
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isApprovalIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
