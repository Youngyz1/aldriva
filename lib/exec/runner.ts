/**
 * lib/exec/runner.ts — Stage 10.4 budgeted attempt runner.
 *
 * Executes ONE claimed job attempt: lease check → six-way binding → single
 * bounded tool dispatch. No loops, no planning, no synthesis — one approved
 * execution is one bounded execution unit (MAX_TOOL_ITERATIONS=1 spirit).
 *
 * Side-effect discipline: the runner itself writes nothing. Dispatch is
 * injected (real `dispatchApprovedTool` in routes, fakes in tests), so all
 * outcomes — including timeouts and binding refusals — are pure return
 * values the ingest layer (10.6) persists. Retryability is classified here:
 * binding failures are PERMANENT; timeouts and thrown errors are retryable;
 * tool-reported failures carry the executor's own retryable flag.
 */

import { checkBinding, type BindingApproval, type BindingAgent, type BindingToolDef, type BindingContext } from './binding';
import type { ClaimedJob } from './claim';
import type { DispatchResult } from './dispatch';

export type AttemptOutcome =
  | 'succeeded'
  | 'tool-failed'
  | 'timeout'
  | 'error'
  | 'binding-failed'
  | 'lease-expired';

export interface RunnerRows {
  approval: BindingApproval | null;
  agent: BindingAgent | null;
  toolDef: BindingToolDef | null;
}

export interface RunnerInput {
  job: ClaimedJob;
  workerId: string;
  /** Identity recorded as the dispatch user (approval.requested_by or worker label). */
  userId: string;
  rows: RunnerRows;
  nowIso: string;
  execute: (ctx: BindingContext, userId: string) => Promise<DispatchResult>;
}

export interface RunnerResult {
  outcome: AttemptOutcome;
  /** True when the attempt may re-enter the queue under budget. */
  retryable: boolean;
  context?: BindingContext;
  output?: unknown;
  error?: string;
  durationMs: number;
}

function truncateOutput(output: unknown, maxChars: number): unknown {
  let s: string;
  try {
    s = JSON.stringify(output) ?? 'null';
  } catch {
    return '[unserializable output]';
  }
  return s.length > maxChars ? `${s.slice(0, maxChars)}…[truncated]` : JSON.parse(s) as unknown;
}

export async function runAttempt(input: RunnerInput): Promise<RunnerResult> {
  const started = Date.now();
  const done = (partial: Omit<RunnerResult, 'durationMs'>): RunnerResult => ({
    ...partial,
    durationMs: Date.now() - started,
  });
  const { job } = input;

  // 1. Lease must be live — a stale worker never dispatches.
  if (input.nowIso > job.leaseExpiresAt) {
    return done({ outcome: 'lease-expired', retryable: false });
  }

  // 2. Six-way binding against live rows.
  const bound = checkBinding({
    envelope: job.envelope,
    job: {
      id: job.jobId,
      tenant_id: job.tenantId,
      agent_id: job.agentId,
      approval_id: job.approvalId,
      attempt_no: job.attemptNo,
    },
    approval: input.rows.approval,
    agent: input.rows.agent,
    toolDef: input.rows.toolDef,
    nowIso: input.nowIso,
  });
  if (!bound.ok) {
    return done({ outcome: 'binding-failed', retryable: false, error: bound.reason });
  }

  // 3. Single bounded dispatch. The timeout wins the race; the dispatch
  // promise gets a noop catch so a late rejection is never unhandled. Note:
  // the tool call itself cannot be aborted mid-flight — at-least-once
  // semantics apply and idempotent ingest (10.6) converges duplicates.
  const timeoutMs = job.envelope.budget.attemptTimeoutMs;
  const pending = input.execute(bound.context, input.userId);
  pending.catch(() => {});
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('attempt timeout')), timeoutMs);
    const unref = (timer as unknown as { unref?: () => void }).unref;
    if (typeof unref === 'function') unref.call(timer);
  });
  let dispatched: DispatchResult;
  try {
    dispatched = await Promise.race([pending, timeout]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return done({ outcome: msg === 'attempt timeout' ? 'timeout' : 'error', retryable: true, context: bound.context, error: msg.slice(0, 1000) });
  }

  if (!dispatched.ok) {
    return done({
      outcome: 'tool-failed',
      retryable: dispatched.retryable,
      context: bound.context,
      error: dispatched.error,
    });
  }
  return done({
    outcome: 'succeeded',
    retryable: false,
    context: bound.context,
    output: truncateOutput(dispatched.output, job.envelope.budget.maxOutputChars),
  });
}

export type { DispatchResult };
