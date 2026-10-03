/**
 * lib/exec/materialize.ts — Stage 10.7 approval→job materialization.
 *
 * Closes the core Stage 10 gap (decided approvals are inert) WITHOUT a
 * trigger, poll loop, or scheduler: materialization runs inside the claim
 * route on every worker poll (bounded), exactly like QA's pollAndClaim
 * materializes qa_runs from approved request_qa_run approvals.
 *
 * Per candidate approval (oldest first, status approved, audit_ref NULL,
 * unexpired):
 *  1. Skip action='request_qa_run' — the QA plane owns it (claim.ts); a
 *     generic twin would double-materialize QA work.
 *  2. Parse proposed_outcome as an execution envelope. Invalid/missing →
 *     stamp audit_ref='exec-invalid-envelope' (terminal audit, never spun).
 *     Legacy pre-10.0 approvals have no envelope and CANNOT execute — this
 *     is fail-safe, not a migration: only canonical approved invocations
 *     become jobs.
 *  3. enqueueExecution with the envelope's idempotencyKey (same key returns
 *     the existing job — crash-safe re-materialization) + approval link.
 *  4. Conditional stamp audit_ref='exec-task:<jobId>' WHERE audit_ref IS NULL
 *     (lost race → skip). The stamp both links and excludes from future polls.
 */

import { parseExecutionEnvelope } from './envelope';
import { enqueueExecution, type ExecClient } from './claim';

export interface MaterializeInput {
  nowIso?: string;
  limit?: number;
}

export interface MaterializeResult {
  materialized: string[];
  skipped: string[];
}

interface ApprovalCandidate {
  id: string;
  action: string;
  requested_by: string | null;
  tenant_id: string | null;
  proposed_outcome: unknown;
}

async function selectAll<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`exec materialize ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

export async function materializeApproved(
  client: ExecClient,
  input: MaterializeInput
): Promise<MaterializeResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
  const out: MaterializeResult = { materialized: [], skipped: [] };

  const candidates = await selectAll<ApprovalCandidate>(
    client
      .from('approvals')
      .select('id,action,requested_by,tenant_id,proposed_outcome')
      .eq('status', 'approved')
      .is('audit_ref', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(limit),
    'materialize poll'
  );

  for (const approval of candidates) {
    if (approval.action === 'request_qa_run') {
      out.skipped.push(approval.id);
      continue;
    }
    const stamp = async (ref: string): Promise<boolean> => {
      const rows = await selectAll<{ id: string }>(
        client.from('approvals').update({ audit_ref: ref }).eq('id', approval.id).is('audit_ref', null).select('id'),
        'materialize stamp'
      );
      return rows.length > 0;
    };
    const parsed = parseExecutionEnvelope(approval.proposed_outcome);
    if (!parsed.ok) {
      await stamp('exec-invalid-envelope');
      out.skipped.push(approval.id);
      continue;
    }
    const envelope = parsed.envelope;
    const enqueued = await enqueueExecution(
      client,
      {
        agentId: envelope.agentId,
        tenantId: envelope.tenantId,
        requestedBy: approval.requested_by,
        title: `Execute ${envelope.action}`,
        action: envelope.action,
        envelope,
        approvalId: approval.id,
        maxAttempts: envelope.budget.maxAttempts,
        idempotencyKey: envelope.idempotencyKey,
      },
      nowIso
    );
    if (!enqueued.ok) {
      out.skipped.push(approval.id);
      continue;
    }
    if (await stamp(`exec-task:${enqueued.jobId}`)) {
      out.materialized.push(enqueued.jobId);
    } else {
      out.skipped.push(approval.id);
    }
  }
  return out;
}
