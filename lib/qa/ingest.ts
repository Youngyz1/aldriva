/**
 * lib/qa/ingest.ts — Stage 7 poll/claim + result ingest core.
 *
 * All functions take an injected client + explicit now/env inputs so the
 * adversarial cases are hermetically testable. Thin routes in
 * app/api/qa/* supply process.env + service-role client.
 *
 * Credential split (addendum A2): the poll token authorizes listing and
 * requesting a claim ONLY; ingest requires the per-run claim token minted
 * at claim time (2h TTL, SHA-256 at rest). Validation containment (§4):
 * forward-only transitions, server-recomputed counters, closed
 * suite/environment enums (production unrepresentable), https + host
 * allowlisted artifact URLs (violations reject the payload), 2000-char
 * error caps, per-run result cap.
 *
 * Shadow mode (addendum A3): QA_SHADOW_MODE !== 'false' (default true)
 * suppresses the insertSystemEvent() call; the would-be emission is
 * recorded in qa_runs.metadata instead, for the go-live review.
 */

import { mintClaimToken } from './tokens';
import { canTransitionQAStatus, isQATerminal, QA_SUITES, QA_ENVIRONMENTS } from './execution-provider';
import { isAllowedArtifactUrl } from './github-actions-provider';

export const QA_RESULT_STATUSES = ['passed', 'failed', 'skipped', 'flaky'] as const;
export const MAX_RESULTS_PER_RUN = 500;

export interface ClaimResult {
  ok: boolean;
  message: string;
  run?: {
    id: string;
    suite: string;
    environment: string;
    target_tenant_id: string | null;
    commit_sha: string | null;
    approval_id: string | null;
  };
  /** Plaintext claim token — returned ONCE to the claimer, never stored. */
  claimToken?: string;
  claimExpiresAt?: string;
}

interface RunRow {
  id: string;
  suite: string;
  environment: string;
  target_tenant_id: string | null;
  commit_sha: string | null;
  approval_id: string | null;
  status: string;
}

async function selectAll<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`QA ingest ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

/**
 * Find the oldest approved, unclaimed run and claim it atomically
 * (conditional on status=approved AND claimed_at NULL — a lost race
 * matches zero rows and reports already-claimed, never an error).
 * Mint + store the claim-token hash in the same conditional update.
 */
export async function pollAndClaim(
  client: { from(table: string): any },
  workerRunId: string,
  nowIso: string = new Date().toISOString()
): Promise<ClaimResult> {
  const candidates = await selectAll<RunRow>(
    client
      .from('qa_runs')
      .select('id,suite,environment,target_tenant_id,commit_sha,approval_id,status')
      .eq('status', 'approved')
      .is('claimed_at', null)
      .order('created_at', { ascending: true })
      .limit(1),
    'poll'
  );
  const candidate = candidates[0];
  if (!candidate) return { ok: false, message: 'No claimable runs.' };

  const minted = mintClaimToken(Date.parse(nowIso));
  const claimed = await selectAll<{ id: string }>(
    client
      .from('qa_runs')
      .update({
        status: 'running',
        claimed_at: nowIso,
        started_at: nowIso,
        external_run_id: workerRunId,
        claim_token_hash: minted.hash,
        claim_expires_at: minted.expiresAtIso,
      })
      .eq('id', candidate.id)
      .eq('status', 'approved')
      .is('claimed_at', null)
      .select('id'),
    'claim'
  );
  if (claimed.length === 0) {
    return { ok: false, message: 'Run was claimed concurrently.' };
  }
  return {
    ok: true,
    message: 'Claimed.',
    run: {
      id: candidate.id,
      suite: candidate.suite,
      environment: candidate.environment,
      target_tenant_id: candidate.target_tenant_id,
      commit_sha: candidate.commit_sha,
      approval_id: candidate.approval_id,
    },
    claimToken: minted.token,
    claimExpiresAt: minted.expiresAtIso,
  };
}

export interface IngestResultInput {
  name: string;
  file: string;
  status: string;
  duration_ms?: number | null;
  error?: string | null;
  screenshot_url?: string | null;
  trace_url?: string | null;
  logs_url?: string | null;
}

export interface IngestInput {
  runId: string;
  status: string;
  results: IngestResultInput[];
  error?: string | null;
}

export interface IngestOutcome {
  ok: boolean;
  message: string;
  duplicate?: boolean;
}

function validResult(r: IngestResultInput): string | null {
  if (!(QA_RESULT_STATUSES as readonly string[]).includes(r.status)) return `bad result status for ${r.name}`;
  if (!r.name || r.name.length > 300 || !r.file || r.file.length > 300) return 'bad result name/file';
  if (r.duration_ms !== undefined && r.duration_ms !== null && (r.duration_ms < 0 || !Number.isFinite(r.duration_ms))) return 'bad duration';
  for (const u of [r.screenshot_url, r.trace_url, r.logs_url]) {
    if (u !== undefined && u !== null && u !== '' && !isAllowedArtifactUrl(u)) return `disallowed artifact host for ${r.name}`;
  }
  return null;
}

/**
 * Ingest worker results for a claimed run. The caller (route) has ALREADY
 * verified the per-run claim token against the run's stored hash + TTL —
 * this function enforces everything else: run exists + non-terminal,
 * forward-only transition, closed enums (re-checked on the row), result
 * shape/host caps, natural-key upsert, server-side counters, terminal
 * finished_at. Returns duplicate:true when the exact terminal state was
 * already recorded (safe re-POST).
 */
export async function ingestRunResults(
  client: { from(table: string): any },
  input: IngestInput,
  nowIso: string = new Date().toISOString()
): Promise<IngestOutcome> {
  if (input.results.length > MAX_RESULTS_PER_RUN) {
    return { ok: false, message: `Too many results (cap ${MAX_RESULTS_PER_RUN}).` };
  }
  for (const r of input.results) {
    const problem = validResult(r);
    if (problem) return { ok: false, message: problem };
  }

  interface FullRun extends RunRow {
    suite: string;
    environment: string;
    passed: number;
    failed: number;
    skipped: number;
    finished_at: string | null;
  }
  const rows = await selectAll<FullRun>(
    client.from('qa_runs').select('id,suite,environment,status,passed,failed,skipped,finished_at').eq('id', input.runId).limit(1),
    'ingest read'
  );
  const run = rows[0];
  if (!run) return { ok: false, message: 'Run not found.' };
  if (!(QA_SUITES as readonly string[]).includes(run.suite)) return { ok: false, message: 'Run suite not allowlisted.' };
  if (!(QA_ENVIRONMENTS as readonly string[]).includes(run.environment)) return { ok: false, message: 'Run environment not allowlisted.' };
  if (!canTransitionQAStatus(run.status, input.status)) {
    // Idempotent re-POST of the recorded terminal state is a no-op success.
    if (isQATerminal(run.status) && run.status === input.status) {
      return { ok: true, message: 'Already recorded.', duplicate: true };
    }
    return { ok: false, message: `Illegal transition ${run.status} → ${input.status}.` };
  }

  for (const r of input.results) {
    const row = {
      run_id: input.runId,
      name: r.name,
      file: r.file,
      status: r.status,
      duration_ms: r.duration_ms ?? null,
      error: r.error ? String(r.error).slice(0, 2000) : null,
      screenshot_url: r.screenshot_url || null,
      trace_url: r.trace_url || null,
      logs_url: r.logs_url || null,
    };
    const res = (await client.from('qa_test_results').upsert(row, { onConflict: 'run_id,file,name' })) as unknown as { error?: { message: string } | null };
    if (res.error) return { ok: false, message: `Result upsert failed: ${res.error.message}` };
  }

  // Counters recomputed authoritatively — worker-supplied counts are ignored.
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const r of input.results) {
    if (r.status === 'passed' || r.status === 'flaky') counts.passed += 1;
    else if (r.status === 'failed') counts.failed += 1;
    else counts.skipped += 1;
  }
  const terminal = isQATerminal(input.status);
  const updated = await selectAll<{ id: string }>(
    client
      .from('qa_runs')
      .update({
        status: input.status,
        passed: counts.passed,
        failed: counts.failed,
        skipped: counts.skipped,
        error: input.error ? String(input.error).slice(0, 2000) : null,
        ...(terminal ? { finished_at: nowIso } : {}),
      })
      .eq('id', input.runId)
      .select('id'),
    'ingest write'
  );
  if (updated.length === 0) return { ok: false, message: 'Run update failed.' };
  return { ok: true, message: 'Recorded.' };
}

export interface IncidentDecision {
  emit: boolean;
  severity: 's2' | 's3';
  dedupeKey: string;
}

/**
 * Deterministic incident rule (§8 + A3): smoke-suite failures only, one
 * incident per suite per day, s3 first day → s2 third consecutive,
 * flaky-only runs never incident. Pure — consecutiveFailDays comes from
 * prior qa_failure events for the dedupe family (queried by the route).
 */
export function evaluateIncidentDecision(args: {
  suite: string;
  date: string;
  failed: number;
  flakyOnly: boolean;
  consecutiveFailDays: number;
}): IncidentDecision | null {
  if (args.suite !== 'smoke') return null;
  if (args.failed === 0 || args.flakyOnly) return null;
  const dedupeKey = `qa_failure:${args.suite}:${args.date}`;
  if (args.consecutiveFailDays >= 2) return { emit: true, severity: 's2', dedupeKey };
  return { emit: true, severity: 's3', dedupeKey };
}

/** Shadow gate (addendum A3): default ON (suppress), explicit 'false' goes live. */
export function isShadowMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QA_SHADOW_MODE !== 'false';
}
