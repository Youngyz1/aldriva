/**
 * lib/qa/github-actions-provider.ts — Stage 7 GHA adapter.
 *
 * THIS FILE (and only this file) may contain GitHub-specific concepts:
 * workflow path, dispatch shape, Actions artifact host conventions, and the
 * external run-id mapping. Everything else in lib/qa/ is backend-neutral.
 * The control plane depends on QAExecutionProvider, never on this class.
 *
 * Poll-model note: this adapter never triggers workflows itself. Scheduling
 * (nightly 03:17 UTC) and manual dispatch happen in GitHub; the adapter
 * records intent (requestRun → qa_runs row) and reads worker-reported state.
 * No GitHub credentials live in this codebase.
 */

import type {
  QAExecutionProvider,
  QARunRequest,
  QARunHandle,
  QARunStatus,
  QAArtifact,
  QAArtifactKind,
} from './execution-provider';
import { isQASuite, isQAEnvironment, isQATerminal } from './execution-provider';
import type { CommandCenterClient } from '../workforce/command-center';

/** The single workflow file this adapter knows about. */
export const QA_WORKFLOW_PATH = '.github/workflows/qa-sweep.yml';

/** Artifact URL hosts the ingest path will ever accept from workers. */
export const QA_ARTIFACT_HOSTS: readonly string[] = [
  'github.com',
  'objects.githubusercontent.com',
];

export function isAllowedArtifactUrl(url: string): boolean {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (new URL(url).protocol !== 'https:') return false;
  return QA_ARTIFACT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

async function one<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`QA provider ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

interface QARunRow {
  id: string;
  suite: string;
  environment: string;
  target_tenant_id: string | null;
  commit_sha: string | null;
  triggered_by: string;
  requested_by_agent_id: string | null;
  approval_id: string | null;
  status: string;
  idempotency_key: string;
  passed: number;
  failed: number;
  skipped: number;
  external_run_id: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export class GitHubActionsQAProvider implements QAExecutionProvider {
  constructor(private readonly client: CommandCenterClient) {}

  async requestRun(input: QARunRequest): Promise<QARunHandle> {
    if (!isQASuite(input.suite)) throw new Error('SuiteNotAllowlisted');
    if (!isQAEnvironment(input.environment)) throw new Error('EnvironmentNotAllowlisted');
    // Idempotent re-request: same key returns the original handle.
    const existing = await one<{ id: string; status: string }>(
      this.client.from('qa_runs').select('id,status').eq('idempotency_key', input.idempotencyKey).limit(1),
      'requestRun lookup'
    );
    if (existing[0]) {
      return { runId: existing[0].id, status: existing[0].status as QARunHandle['status'] };
    }
    const created = await one<{ id: string; status: string }>(
      this.client
        .from('qa_runs')
        .insert({
          suite: input.suite,
          environment: input.environment,
          target_tenant_id: input.tenantId,
          commit_sha: input.commitSha,
          triggered_by: 'manual',
          requested_by_agent_id: input.requestedByAgentId,
          approval_id: input.approvalId,
          status: 'requested',
          idempotency_key: input.idempotencyKey,
        })
        .select('id,status'),
      'requestRun insert'
    );
    if (!created[0]) throw new Error('RunNotFound');
    return { runId: created[0].id, status: created[0].status as QARunHandle['status'] };
  }

  async getRunStatus(runId: string): Promise<QARunStatus> {
    const rows = await one<QARunRow>(
      this.client.from('qa_runs').select('id,status,started_at,finished_at,passed,failed,skipped').eq('id', runId).limit(1),
      'getRunStatus'
    );
    const row = rows[0];
    if (!row) throw new Error('RunNotFound');
    return {
      runId: row.id,
      status: row.status as QARunStatus['status'],
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
    };
  }

  async getArtifacts(runId: string): Promise<QAArtifact[]> {
    const rows = await one<{
      name: string;
      status: string;
      screenshot_url: string | null;
      trace_url: string | null;
      logs_url: string | null;
    }>(
      this.client.from('qa_test_results').select('name,status,screenshot_url,trace_url,logs_url').eq('run_id', runId).limit(500),
      'getArtifacts'
    );
    const out: QAArtifact[] = [];
    for (const r of rows) {
      const push = (kind: QAArtifactKind, url: string | null) => {
        if (url && isAllowedArtifactUrl(url)) out.push({ kind, testName: r.name, url, bytes: null });
      };
      push('screenshot', r.screenshot_url);
      push('trace', r.trace_url);
      push('log', r.logs_url);
    }
    return out;
  }

  async cancelRun(runId: string, reason: string): Promise<{ accepted: boolean }> {
    void reason; // recorded by callers in audit trails; cancellation itself is unconditional
    const rows = await one<{ id: string; status: string }>(
      this.client.from('qa_runs').select('id,status').eq('id', runId).limit(1),
      'cancelRun read'
    );
    const row = rows[0];
    if (!row || isQATerminal(row.status)) return { accepted: false };
    const updated = await one<{ id: string }>(
      this.client
        .from('qa_runs')
        .update({ status: 'cancelled', finished_at: new Date().toISOString() })
        .eq('id', runId)
        .in('status', ['requested', 'approved', 'running'])
        .select('id'),
      'cancelRun write'
    );
    return { accepted: updated.length > 0 };
  }
}
