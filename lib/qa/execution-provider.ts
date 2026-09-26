/**
 * lib/qa/execution-provider.ts — Stage 7 execution-plane abstraction.
 *
 * Backend-neutral contract between the control plane and QA workers.
 * Contains ZERO GitHub-specific concepts (no workflow names, dispatch,
 * Actions run IDs, refs, or artifact APIs) — those live exclusively in
 * github-actions-provider.ts. Pure data + interface: hermetically testable.
 */

export type QAEnvironment = 'staging';

export type QARunStatusValue =
  | 'requested'
  | 'approved'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'expired';

/** Suites the worker is ever allowed to run (closed — production suites unrepresentable). */
export const QA_SUITES: readonly string[] = ['smoke', 'auth', 'payments'];

/** Environments the worker is ever allowed to target (staging only). */
export const QA_ENVIRONMENTS: readonly string[] = ['staging'];

export function isQASuite(s: unknown): boolean {
  return typeof s === 'string' && (QA_SUITES as readonly string[]).includes(s);
}

export function isQAEnvironment(s: unknown): boolean {
  return typeof s === 'string' && (QA_ENVIRONMENTS as readonly string[]).includes(s);
}

/** Forward-only status machine. Terminal states accept no further transitions. */
const TRANSITIONS: Record<QARunStatusValue, readonly QARunStatusValue[]> = {
  requested: ['approved', 'cancelled', 'expired'],
  approved: ['running', 'cancelled', 'expired'],
  running: ['passed', 'failed', 'cancelled'],
  passed: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function canTransitionQAStatus(from: string, to: string): boolean {
  const allowed = (TRANSITIONS as Record<string, readonly string[]>)[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function isQATerminal(status: string): boolean {
  return status === 'passed' || status === 'failed' || status === 'cancelled' || status === 'expired';
}

export interface QARunRequest {
  suite: string;
  environment: QAEnvironment;
  tenantId: string | null;
  commitSha: string | null;
  idempotencyKey: string;
  requestedByAgentId: string | null;
  approvalId: string | null;
}

export interface QARunHandle {
  runId: string;
  status: QARunStatusValue;
}

export interface QARunStatus extends QARunHandle {
  startedAt: string | null;
  finishedAt: string | null;
  passed: number;
  failed: number;
  skipped: number;
}

export type QAArtifactKind = 'screenshot' | 'trace' | 'video' | 'log';

export interface QAArtifact {
  kind: QAArtifactKind;
  testName: string | null;
  url: string;
  bytes: number | null;
}

export type QAProviderError =
  | 'SuiteNotAllowlisted'
  | 'EnvironmentNotAllowlisted'
  | 'RunNotFound'
  | 'TerminalState'
  | 'DuplicateIdempotencyKey';

export interface QAExecutionProvider {
  requestRun(input: QARunRequest): Promise<QARunHandle>;
  getRunStatus(runId: string): Promise<QARunStatus>;
  getArtifacts(runId: string): Promise<QAArtifact[]>;
  cancelRun(runId: string, reason: string): Promise<{ accepted: boolean }>;
}
