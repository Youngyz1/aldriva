/**
 * lib/workforce/qa.ts — Stage 8 (QA runs list + run detail).
 *
 * Same fetch + pure view-model shape as Stages 1–7. Reads PERSISTED
 * qa_runs / qa_test_results rows from migration 145
 * (db/migration_145_qa_execution.sql — mapped, not invented):
 *   qa_runs(id, suite, environment, target_tenant_id, commit_sha,
 *   triggered_by, requested_by_agent_id, approval_id, status,
 *   idempotency_key, passed, failed, skipped, external_run_id,
 *   artifact_base_url, error, claim_token_hash, claim_expires_at,
 *   metadata, started_at, finished_at, claimed_at, created_at).
 * Actual status CHECK: requested/approved/running/passed/failed/
 * cancelled/expired (no other values — the filter chips use exactly
 * these). Suites: smoke/auth/payments. Environments: staging only.
 *
 * Tenant contract (explicit — differs from tasks/reports on purpose):
 * qa_runs.target_tenant_id is NULLABLE and null means platform-level
 * (smoke suites run against staging, not a tenant). tenantId === null →
 * platform-wide admin view (no filter). tenantId set → runs for that
 * tenant PLUS platform-level (null) runs via .or(), so a tenant filter
 * can never hide legitimate platform-level runs (the currently-failing
 * donate-spec smoke runs are null-tenant and must stay visible).
 * Agents/approvals lookups are never tenant-filtered (platform
 * registries, same as Stages 2–4).
 *
 * Secret hygiene (tested): claim_token_hash, claim_expires_at,
 * idempotency_key, and metadata are NEVER selected (credential-adjacent
 * or unbounded JSONB — nothing on this surface needs them). Run/test
 * error text is truncated (300ch) and passed through redactQaError(),
 * because Playwright output can echo page snapshots that theoretically
 * contain tokens/keys. Artifact URLs render as links only when https
 * (ingest already host-allowlists; this is defense in depth), and null
 * artifact columns render as honest "not uploaded" states — never
 * fabricated links.
 */

import type { CommandCenterClient } from './command-center';

/** Actual qa_runs.status CHECK values (migration 145) — display order. */
export const QA_STATUSES = [
  'requested',
  'approved',
  'running',
  'failed',
  'passed',
  'cancelled',
  'expired',
] as const;

export function isQaStatusValue(s: string): boolean {
  return (QA_STATUSES as readonly string[]).includes(s);
}

/** Display-only suite values (migration 145 CHECK) — no invented suites. */
export const QA_SUITES = ['smoke', 'auth', 'payments'] as const;

export interface QaRunListItem {
  id: string;
  suite: string;
  environment: string;
  target_tenant_id: string | null;
  status: string;
  triggered_by: string;
  passed: number;
  failed: number;
  skipped: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface QaRunDetail extends QaRunListItem {
  commit_sha: string | null;
  requested_by_agent_id: string | null;
  approval_id: string | null;
  external_run_id: string | null;
  artifact_base_url: string | null;
  error: string | null;
  started_at: string | null;
  claimed_at: string | null;
}

export interface QaAgentRef {
  id: string;
  name: string;
  display_name: string;
}

export interface QaApprovalRef {
  id: string;
  action: string;
  status: string;
}

export interface QaTestResultView {
  id: string;
  name: string;
  file: string;
  status: string;
  duration_ms: number | null;
  /** Truncated + redacted — never raw Playwright output. */
  error: string | null;
  screenshot_url: string | null;
  trace_url: string | null;
  logs_url: string | null;
  /** True when at least one displayable artifact link exists. */
  hasArtifacts: boolean;
}

export interface QaRunDetailRaw {
  run: QaRunDetail;
  agent: QaAgentRef | null;
  approval: QaApprovalRef | null;
  results: QaTestResultView[];
}

export interface QaApprovalRunLink {
  id: string;
  suite: string;
  status: string;
  created_at: string;
}

const QA_ERROR_LEN = 300;

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce QA read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

/**
 * Tenant scoping for qa_runs. Platform-wide (null) → no filter.
 * Tenant-scoped → that tenant's runs PLUS platform-level (null
 * target_tenant_id) runs, via .or(), so smoke suites are never hidden.
 */
function scopedQaTenant<T>(q: T, tenantId: string | null): T {
  if (tenantId === null) return q;
  return (q as unknown as { or(cond: string): T }).or(
    `target_tenant_id.eq.${tenantId},target_tenant_id.is.null`
  );
}

function truncate(s: string | null, n: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > n ? `${s.slice(0, n)}…[truncated]` : s;
}

/**
 * Redact secret-looking material from worker error text before render.
 * Playwright failures can echo page snapshots / env dumps; the patterns
 * below cover key=value pairs, Stripe-style secret keys, bearer tokens,
 * and PEM blocks. Anything unrecognized still passes through truncated —
 * this is a screen, not a proof — so the view model is additionally
 * scanned by the hermetic no-secrets test.
 */
export function redactQaError(s: string | null): string | null {
  if (s === null || s === undefined) return null;
  let out = s;
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-key-block]');
  out = out.replace(/sk_(live|test)_[A-Za-z0-9]+/g, '[redacted]');
  out = out.replace(
    /(api[_-]?key|secret|token|passwd|password|authorization|bearer)\s*[:=]\s*['"]?[^'"\s,}]+['"]?/gi,
    '$1=[redacted]'
  );
  return out;
}

/** Artifact links render only over https (ingest host-allowlists; belt and suspenders). */
export function isDisplayableArtifactUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Columns ever read from qa_runs — claim_token_hash, claim_expires_at,
 *  idempotency_key, and metadata are deliberately absent (see header). */
const QA_RUN_COLS =
  'id,suite,environment,target_tenant_id,commit_sha,triggered_by,requested_by_agent_id,approval_id,' +
  'status,passed,failed,skipped,external_run_id,artifact_base_url,error,started_at,finished_at,claimed_at,created_at';

const QA_RESULT_COLS =
  'id,run_id,name,file,status,duration_ms,error,screenshot_url,trace_url,logs_url,created_at';

export async function fetchQaRunList(
  client: CommandCenterClient,
  tenantId: string | null = null,
  status: string | null = null
): Promise<QaRunListItem[]> {
  let q = scopedQaTenant(
    client.from('qa_runs').select('id,suite,environment,target_tenant_id,status,triggered_by,passed,failed,skipped,created_at,started_at,finished_at'),
    tenantId
  );
  if (status !== null) q = q.eq('status', status);
  return selectAll<QaRunListItem>(q.order('created_at', { ascending: false }).limit(50), 'qa_runs');
}

export async function fetchQaStatusCounts(
  client: CommandCenterClient,
  tenantId: string | null = null
): Promise<Record<string, number>> {
  // Bounded window counts (recent 200) — honest "recent" grouping, not a
  // table-wide census (same convention as fetchTaskStatusCounts).
  const rows = await selectAll<{ status: string }>(
    scopedQaTenant(client.from('qa_runs').select('status'), tenantId)
      .order('created_at', { ascending: false })
      .limit(200),
    'qa_run_counts'
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export async function fetchQaRunDetail(
  client: CommandCenterClient,
  runId: string,
  tenantId: string | null = null
): Promise<QaRunDetailRaw | null> {
  const runs = await selectAll<QaRunDetail>(
    scopedQaTenant(client.from('qa_runs').select(QA_RUN_COLS).eq('id', runId).limit(1), tenantId),
    'qa_run'
  );
  const run = runs[0] ?? null;
  if (!run) return null;
  // Error text is worker output: truncate + redact at the boundary, same
  // as task step content (tasks.ts) — the page never sees raw text.
  run.error = redactQaError(truncate(run.error, QA_ERROR_LEN));

  const agentRows = run.requested_by_agent_id
    ? await selectAll<QaAgentRef>(
        client.from('agents').select('id,name,display_name').eq('id', run.requested_by_agent_id).limit(1),
        'qa_agent'
      )
    : [];
  const approvalRows = run.approval_id
    ? await selectAll<QaApprovalRef>(
        client.from('approvals').select('id,action,status').eq('id', run.approval_id).limit(1),
        'qa_approval'
      )
    : [];

  const resultRows = await selectAll<{
    id: string;
    name: string;
    file: string;
    status: string;
    duration_ms: number | null;
    error: string | null;
    screenshot_url: string | null;
    trace_url: string | null;
    logs_url: string | null;
  }>(
    client.from('qa_test_results').select(QA_RESULT_COLS).eq('run_id', runId).order('created_at', { ascending: true }).limit(500),
    'qa_results'
  );
  const results: QaTestResultView[] = resultRows.map((r) => ({
    id: r.id,
    name: r.name,
    file: r.file,
    status: r.status,
    duration_ms: r.duration_ms,
    error: redactQaError(truncate(r.error, QA_ERROR_LEN)),
    screenshot_url: isDisplayableArtifactUrl(r.screenshot_url) ? r.screenshot_url : null,
    trace_url: isDisplayableArtifactUrl(r.trace_url) ? r.trace_url : null,
    logs_url: isDisplayableArtifactUrl(r.logs_url) ? r.logs_url : null,
    hasArtifacts:
      isDisplayableArtifactUrl(r.screenshot_url) ||
      isDisplayableArtifactUrl(r.trace_url) ||
      isDisplayableArtifactUrl(r.logs_url),
  }));

  return { run, agent: agentRows[0] ?? null, approval: approvalRows[0] ?? null, results };
}

/**
 * Reverse linkage for the approval detail page: QA runs created from an
 * approval (qa_runs.approval_id). Kept in qa.ts (not approvals.ts) so the
 * Stage 4 module and its tests stay untouched.
 */
export async function fetchQaRunsByApproval(
  client: CommandCenterClient,
  approvalId: string
): Promise<QaApprovalRunLink[]> {
  return selectAll<QaApprovalRunLink>(
    client.from('qa_runs').select('id,suite,status,created_at').eq('approval_id', approvalId).order('created_at', { ascending: false }).limit(10),
    'qa_runs_by_approval'
  );
}

export interface QaRunDetailViewModel {
  run: QaRunDetail;
  agent: QaAgentRef | null;
  approval: QaApprovalRef | null;
  results: QaTestResultView[];
  /** Wall-clock run duration in ms (null when start/finish missing). */
  durationMs: number | null;
  counts: { passed: number; failed: number; skipped: number; total: number };
  empty: { results: boolean; agent: boolean; approval: boolean; artifacts: boolean; error: boolean };
}

/** Pure detail view-model: duration math + honest empty flags. No I/O. */
export function buildQaRunDetailViewModel(raw: QaRunDetailRaw): QaRunDetailViewModel {
  let durationMs: number | null = null;
  if (raw.run.started_at && raw.run.finished_at) {
    const ms = Date.parse(raw.run.finished_at) - Date.parse(raw.run.started_at);
    durationMs = Number.isFinite(ms) && ms >= 0 ? ms : null;
  }
  const passed = raw.results.filter((r) => r.status === 'passed' || r.status === 'flaky').length;
  const failed = raw.results.filter((r) => r.status === 'failed').length;
  const skipped = raw.results.filter((r) => r.status === 'skipped').length;
  return {
    run: raw.run,
    agent: raw.agent,
    approval: raw.approval,
    results: raw.results,
    durationMs,
    counts: { passed, failed, skipped, total: raw.results.length },
    empty: {
      results: raw.results.length === 0,
      agent: raw.agent === null,
      approval: raw.approval === null,
      artifacts: !raw.results.some((r) => r.hasArtifacts),
      error: raw.run.error === null,
    },
  };
}

/** Human duration between two ISO timestamps (null when either is missing). Pure. */
export function qaDurationLabel(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isQaRunIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
