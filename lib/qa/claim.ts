/**
 * lib/qa/claim.ts — Stage 7 poll-and-claim core (pure-ish, injected client).
 *
 * Refinement of the design (§2) stated explicitly here: the worker polls
 * APPROVED `request_qa_run` approvals — not qa_runs rows — because the
 * approvals table is the only artifact the L0 request path produces (the
 * tool executor never runs for L0). On claim, THIS handler (service role,
 * server-side) materializes the qa_runs row and mints the per-run claim
 * token. The worker never writes approvals and never invents runs.
 *
 * Claim protocol per candidate (oldest first, up to 3 per poll):
 *  1. Parse approval.evidence.args (JSON string slice from the blocked tool
 *     call) → { suite, environment, tenantId, idempotencyKey, commitSha? }.
 *     Unparseable/invalid → stamp audit_ref='qa-invalid:*' (terminal,
 *     visible in Stage 4 UI) and move to the next candidate.
 *  2. Idempotency: qa_runs row with the same idempotency_key already
 *     exists → stamp audit_ref with the existing run id, no duplicate.
 *  3. Insert qa_runs (status approved). FK/type violations → stamp
 *     audit_ref='qa-error:*', move on (never spin forever on one row).
 *  4. Conditional stamp audit_ref=<qa_run_id> WHERE audit_ref IS NULL —
 *     lost races match zero rows and fall through to the next candidate.
 *  5. Mint claim token (hash + 2h expiry stored on the run), return
 *     plaintext ONCE.
 */

import { mintClaimToken } from './tokens';
import { isQASuite, isQAEnvironment } from './execution-provider';
import { randomUUID } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClaimOutcome {
  claimed: boolean;
  message: string;
  run?: {
    id: string;
    suite: string;
    environment: string;
    target_tenant_id: string | null;
    commit_sha: string | null;
    approval_id: string | null;
  };
  claimToken?: string;
  claimExpiresAt?: string;
}

interface ApprovalRow {
  id: string;
  tenant_id: string | null;
  action: string;
  status: string;
  expires_at: string;
  audit_ref: string | null;
  evidence: Record<string, unknown> | null;
}

interface RequestArgs {
  suite: string;
  environment: string;
  tenantId: string | null;
  idempotencyKey: string;
  commitSha: string | null;
}

async function selectAll<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`QA claim ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

/** Parse + validate the blocked-tool-call args slice. Null = invalid. */
export function parseRequestArgs(evidence: Record<string, unknown> | null | undefined): RequestArgs | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const raw = (evidence as Record<string, unknown>)['args'];
  if (typeof raw !== 'string') return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!isQASuite(parsed['suite']) || !isQAEnvironment(parsed['environment'])) return null;
  if (typeof parsed['idempotencyKey'] !== 'string' || !UUID_RE.test(parsed['idempotencyKey'] as string)) return null;
  const tenantId = parsed['tenantId'] ?? null;
  if (tenantId !== null && (typeof tenantId !== 'string' || !UUID_RE.test(tenantId))) return null;
  const commitSha = parsed['commitSha'] ?? null;
  if (commitSha !== null && (typeof commitSha !== 'string' || !/^[0-9a-f]{7,40}$/.test(commitSha))) return null;
  return {
    suite: parsed['suite'] as string,
    environment: 'staging',
    tenantId: tenantId as string | null,
    idempotencyKey: parsed['idempotencyKey'] as string,
    commitSha: commitSha as string | null,
  };
}

export async function pollAndClaim(
  client: { from(table: string): any },
  workerRunId: string,
  nowIso: string = new Date().toISOString()
): Promise<ClaimOutcome> {
  const candidates = await selectAll<ApprovalRow>(
    client
      .from('approvals')
      .select('id,tenant_id,action,status,expires_at,audit_ref,evidence')
      .eq('action', 'request_qa_run')
      .eq('status', 'approved')
      .is('audit_ref', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(3),
    'poll approvals'
  );

  for (const approval of candidates) {
    const stamp = async (ref: string): Promise<void> => {
      await client.from('approvals').update({ audit_ref: ref }).eq('id', approval.id).is('audit_ref', null);
    };

    const args = parseRequestArgs(approval.evidence);
    if (!args) {
      await stamp('qa-invalid-evidence');
      continue;
    }

    // Idempotency: a run for this key already exists (e.g. claimed before
    // a crash) → link it, create nothing.
    const existing = await selectAll<{ id: string }>(
      client.from('qa_runs').select('id').eq('idempotency_key', args.idempotencyKey).limit(1),
      'idempotency check'
    );
    if (existing[0]) {
      await stamp(`qa-run:${existing[0].id}`);
      continue;
    }

    let runId: string | null = null;
    try {
      const inserted = await selectAll<{ id: string }>(
        client
          .from('qa_runs')
          .insert({
            suite: args.suite,
            environment: args.environment,
            target_tenant_id: args.tenantId,
            commit_sha: args.commitSha,
            triggered_by: 'qa',
            approval_id: approval.id,
            status: 'approved',
            idempotency_key: args.idempotencyKey,
            external_run_id: workerRunId,
          })
          .select('id'),
        'materialize run'
      );
      runId = inserted[0]?.id ?? null;
    } catch {
      runId = null;
    }
    if (!runId) {
      await stamp('qa-error-materialize');
      continue;
    }

    // Conditional link: lost race (approval decided/revoked concurrently)
    // matches zero rows → abandon this candidate WITHOUT a token.
    const linked = await selectAll<{ id: string }>(
      client.from('approvals').update({ audit_ref: `qa-run:${runId}` }).eq('id', approval.id).is('audit_ref', null).select('id'),
      'link approval'
    );
    if (linked.length === 0) continue;

    const minted = mintClaimToken(Date.parse(nowIso));
    await client
      .from('qa_runs')
      .update({
        status: 'running',
        claimed_at: nowIso,
        started_at: nowIso,
        claim_token_hash: minted.hash,
        claim_expires_at: minted.expiresAtIso,
      })
      .eq('id', runId);

    return {
      claimed: true,
      message: 'Claimed.',
      run: {
        id: runId,
        suite: args.suite,
        environment: args.environment,
        target_tenant_id: args.tenantId,
        commit_sha: args.commitSha,
        approval_id: approval.id,
      },
      claimToken: minted.token,
      claimExpiresAt: minted.expiresAtIso,
    };
  }

  // Standing fallback (refinement, reported in Stage 7): when no approved
  // on-demand request exists, the nightly schedule still needs a claimable
  // unit so its results can be ingested under a token. Materialize at most
  // one smoke run per 20h window — any recent smoke run (scheduled or
  // on-demand) satisfies freshness, so bursts never duplicate. Never
  // duplicates within the window, never spins on invalid approvals.
  return materializeStandingRun(client, workerRunId, nowIso);
}

/** Window (ms) inside which an existing standing run suppresses a new one. */
export const STANDING_RUN_WINDOW_MS = 20 * 60 * 60 * 1000;

export async function materializeStandingRun(
  client: { from(table: string): any },
  workerRunId: string,
  nowIso: string
): Promise<ClaimOutcome> {
  const nowMs = Date.parse(nowIso);
  const recent = await selectAll<{ id: string; created_at: string }>(
    client
      .from('qa_runs')
      .select('id,created_at')
      .eq('suite', 'smoke')
      .order('created_at', { ascending: false })
      .limit(1),
    'standing recency'
  );
  if (recent[0] && nowMs - Date.parse(recent[0].created_at) < STANDING_RUN_WINDOW_MS) {
    return { claimed: false, message: 'Standing run already active this window.' };
  }

  const inserted = await selectAll<{ id: string }>(
    client
      .from('qa_runs')
      .insert({
        suite: 'smoke',
        environment: 'staging',
        target_tenant_id: null,
        commit_sha: null,
        triggered_by: 'schedule',
        requested_by_agent_id: null,
        approval_id: null,
        status: 'approved',
        idempotency_key: randomUUID(),
        external_run_id: workerRunId,
      })
      .select('id'),
    'standing insert'
  );
  const runId = inserted[0]?.id ?? null;
  if (!runId) return { claimed: false, message: 'Standing run materialization failed.' };

  const minted = mintClaimToken(nowMs);
  await client
    .from('qa_runs')
    .update({
      status: 'running',
      claimed_at: nowIso,
      started_at: nowIso,
      claim_token_hash: minted.hash,
      claim_expires_at: minted.expiresAtIso,
    })
    .eq('id', runId);

  return {
    claimed: true,
    message: 'Standing run claimed.',
    run: { id: runId, suite: 'smoke', environment: 'staging', target_tenant_id: null, commit_sha: null, approval_id: null },
    claimToken: minted.token,
    claimExpiresAt: minted.expiresAtIso,
  };
}
