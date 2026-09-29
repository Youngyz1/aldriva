/**
 * lib/exec/emit.ts — Stage 10.7 terminal-failure emission to Sentinel.
 *
 * Failures reach Sentinel through the EXISTING event pipeline
 * (insertSystemEvent → dedupe → incidents → Stage 9 UI). No new kinds, no new
 * coupling, no Sentinel changes. The payload is metadata-only by
 * construction — machine transition codes plus truncated identifiers — so
 * there is nothing secret to redact and nothing to scan: the detailed error
 * already lives in the run row (admin UI), never in the event.
 */

import { insertSystemEvent } from '../observability/system-events';

export interface ExecTerminalSignal {
  tenantId: string | null;
  action: string;
  transition: string;
  jobId: string;
  attemptNo: number;
  route: string;
}

/** Fire-and-forget terminal signal. Never throws into the caller. */
export function emitExecTerminal(signal: ExecTerminalSignal): void {
  const shortJob = signal.jobId.length > 8 ? signal.jobId.slice(0, 8) : signal.jobId;
  void insertSystemEvent({
    kind: 'job_error',
    severity_hint: 'error',
    tenant_id: signal.tenantId,
    route: signal.route,
    tool_name: signal.action.slice(0, 200),
    error_code: 'exec-terminal',
    message:
      `Background execution ${signal.transition} for ${signal.action.slice(0, 120)} (job ${shortJob}…, attempt ${signal.attemptNo})`.slice(0, 2000),
    source: 'aldriva',
  });
}
