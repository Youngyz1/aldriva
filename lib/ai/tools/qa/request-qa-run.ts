/**
 * lib/ai/tools/qa/request-qa-run.ts — Stage 7 QA run-request tool.
 *
 * Scope transactional, risk medium, approval_required=true (seeded in
 * migration_145): for L0 agents checkApprovalRequired() ALWAYS blocks, so
 * the orchestrator mints an approvals row (action='request_qa_run') and the
 * human decides in the Stage 4 surface. The external worker later consumes
 * the approved row via poll-and-claim — the agent runtime never executes
 * anything here.
 *
 * This executor therefore validates the request and returns a receipt. It
 * performs NO database writes, NO network calls, NO execution of any kind
 * (verified: no supabase/network imports in this file). It exists so the
 * registry has a total dispatch target for future autonomy levels; today
 * it is unreachable for L0 by construction (proven by the hermetic test
 * asserting the approval gate blocks before dispatch).
 */
import { AIToolDefinition } from '../../types';
import { TenantToolContext, logToolInvocation, requireToolContext } from '../tenant/tool-context';
import { isQASuite, isQAEnvironment } from '../../../qa/execution-provider';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requestQaRunDefinition: AIToolDefinition = {
  name: 'request_qa_run',
  description:
    'Proposes a QA test-suite run on staging (smoke/auth/payments). Records a human approval request only — never executes tests itself. A human must approve in the Workforce Approvals surface before any worker acts.',
  parameters: {
    type: 'object',
    properties: {
      suite: { type: 'string', description: 'Test suite: smoke, auth, or payments.' },
      environment: { type: 'string', description: 'Must be staging. Production is not a valid target.' },
      tenantId: { type: 'string', description: 'Staging tenant UUID under test (optional).' },
      commitSha: { type: 'string', description: 'App revision under test, 7-40 hex chars (optional).' },
      idempotencyKey: { type: 'string', description: 'Client-generated UUID so retries are safe (required).' },
    },
    required: ['suite', 'environment', 'idempotencyKey'],
  },
  scope: 'transactional',
};

export interface RequestQaRunArgs {
  suite?: string;
  environment?: string;
  tenantId?: string | null;
  commitSha?: string | null;
  idempotencyKey?: string;
}

export interface RequestQaRunReceipt {
  recorded: boolean;
  message: string;
  suite: string | null;
  environment: string | null;
}

function problem(args: RequestQaRunArgs): string | null {
  if (!isQASuite(args.suite)) return 'suite must be one of: smoke, auth, payments.';
  if (!isQAEnvironment(args.environment)) return 'environment must be staging — production is never a QA target.';
  if (!args.idempotencyKey || !UUID_RE.test(args.idempotencyKey)) return 'idempotencyKey must be a UUID.';
  if (args.tenantId !== undefined && args.tenantId !== null && !UUID_RE.test(args.tenantId)) {
    return 'tenantId must be a UUID when provided.';
  }
  if (args.commitSha !== undefined && args.commitSha !== null && !/^[0-9a-f]{7,40}$/.test(args.commitSha)) {
    return 'commitSha must be 7-40 hex chars when provided.';
  }
  return null;
}

export async function requestQaRun(ctx: TenantToolContext, args: RequestQaRunArgs = {}): Promise<RequestQaRunReceipt> {
  requireToolContext(ctx, 'request_qa_run', args);
  const err = problem(args);
  if (err) {
    logToolInvocation(ctx, null, 'request_qa_run', args, 'denied', 'error', 0, err);
    return { recorded: false, message: err, suite: null, environment: null };
  }
  // Receipt only. No DB write, no dispatch, no execution — the approval
  // gate upstream (or a future autonomy level) decides what happens next.
  logToolInvocation(ctx, null, 'request_qa_run', args, 'allowed', 'success', 0);
  return {
    recorded: true,
    message:
      'QA run request recorded for human approval. Nothing has been executed: approve it in Workforce → Approvals before any worker acts.',
    suite: args.suite ?? null,
    environment: (args.environment as RequestQaRunReceipt['environment']) ?? null,
  };
}
