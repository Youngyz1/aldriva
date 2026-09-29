/**
 * lib/exec/envelope.ts — Stage 10.0: canonical background-execution envelope.
 *
 * Resolves the Stage 10 discovery §4 evidence mismatch (producer emits a JSON
 * string slice, sanitizer converts it to an object/descriptor, QA consumer
 * demands a string) by establishing ONE canonical representation for approved
 * tool arguments, minted from raw args BEFORE sanitization and stored in
 * `approvals.proposed_outcome` (column exists since migration 142; orchestrator
 * path always left it NULL until now).
 *
 * Shape (versioned — future changes must bump, never reinterpret):
 *   { version, idempotencyKey, tenantId, agentId, agentName, approvalId,
 *     taskId, runId, action, args, argsCanonical, budget, createdAt }
 * - `args` is the parsed plain-object form; `argsCanonical` is its stable
 *   stringify (sorted keys, recursive) used for byte-compare binding.
 * - `tenantId` is the SERVER-RESOLVED tenant (orchestrator resolvedTenantId),
 *   never model output — this also retires QA tenant self-assertion for new rows.
 * - `approvalId` is null at mint (row created after); populated when the
 *   envelope is materialized into a durable job record.
 * - `budget` bounds attempts/timeout/output; defaults are conservative.
 *
 * Pure module: no DB, no network, no secrets. All functions hermetically tested.
 */

export const EXEC_ENVELOPE_VERSION = 1 as const;

export interface ExecutionBudget {
  maxAttempts: number;
  attemptTimeoutMs: number;
  maxOutputChars: number;
}

export const EXEC_DEFAULT_BUDGET: ExecutionBudget = {
  maxAttempts: 3,
  attemptTimeoutMs: 60_000,
  maxOutputChars: 4_000,
};

export const EXEC_BUDGET_LIMITS = {
  maxAttempts: { min: 1, max: 5 },
  attemptTimeoutMs: { min: 5_000, max: 300_000 },
  maxOutputChars: { min: 500, max: 20_000 },
} as const;

export interface ExecutionEnvelope {
  version: typeof EXEC_ENVELOPE_VERSION;
  idempotencyKey: string;
  tenantId: string | null;
  agentId: string;
  agentName: string;
  approvalId: string | null;
  taskId: string | null;
  runId: string | null;
  action: string;
  args: Record<string, unknown>;
  argsCanonical: string;
  budget: ExecutionBudget;
  createdAt: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_RE = /^[A-Za-z][A-Za-z0-9_]{1,79}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Stable stringify: sorted keys, recursive. Returns null on non-JSON values. */
export function canonicalizeArgs(value: unknown): string | null {
  if (!isPlainObject(value) && !Array.isArray(value)) return null;
  try {
    return JSON.stringify(sortValue(value));
  } catch {
    return null;
  }
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
    return out;
  }
  return v;
}

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

function validBudget(b: unknown): b is ExecutionBudget {
  if (!isPlainObject(b)) return false;
  const { maxAttempts, attemptTimeoutMs, maxOutputChars } = b as Record<string, unknown>;
  return (
    typeof maxAttempts === 'number' &&
    Number.isInteger(maxAttempts) &&
    maxAttempts >= EXEC_BUDGET_LIMITS.maxAttempts.min &&
    maxAttempts <= EXEC_BUDGET_LIMITS.maxAttempts.max &&
    typeof attemptTimeoutMs === 'number' &&
    attemptTimeoutMs >= EXEC_BUDGET_LIMITS.attemptTimeoutMs.min &&
    attemptTimeoutMs <= EXEC_BUDGET_LIMITS.attemptTimeoutMs.max &&
    typeof maxOutputChars === 'number' &&
    maxOutputChars >= EXEC_BUDGET_LIMITS.maxOutputChars.min &&
    maxOutputChars <= EXEC_BUDGET_LIMITS.maxOutputChars.max
  );
}

export interface MintEnvelopeInput {
  /** Raw provider arguments string (JSON). Parsed BEFORE sanitization. */
  rawArgs: string | null | undefined;
  tenantId: string | null;
  agentId: string;
  agentName: string;
  taskId: string | null;
  runId: string | null;
  action: string;
  idempotencyKey?: string;
  budget?: Partial<ExecutionBudget>;
  nowIso?: string;
}

export type MintEnvelopeResult = { ok: true; envelope: ExecutionEnvelope } | { ok: false; reason: string };

/**
 * Mint a canonical envelope from raw tool-call args. Fails closed: unparseable
 * args, non-object args, bad identities, or bad action yield {ok:false} and the
 * caller must treat the approval as non-executable (same terminal stamp path
 * as invalid QA evidence — never a silent partial envelope).
 */
export function mintExecutionEnvelope(input: MintEnvelopeInput): MintEnvelopeResult {
  if (!input.action || !ACTION_RE.test(input.action)) return { ok: false, reason: 'bad action' };
  if (!isUuid(input.agentId)) return { ok: false, reason: 'bad agentId' };
  if (!input.agentName || typeof input.agentName !== 'string' || input.agentName.length > 80) {
    return { ok: false, reason: 'bad agentName' };
  }
  if (input.tenantId !== null && !isUuid(input.tenantId)) return { ok: false, reason: 'bad tenantId' };
  if (input.taskId !== null && input.taskId !== undefined && !isUuid(input.taskId)) {
    return { ok: false, reason: 'bad taskId' };
  }
  if (input.runId !== null && input.runId !== undefined && !isUuid(input.runId)) {
    return { ok: false, reason: 'bad runId' };
  }
  if (input.idempotencyKey !== undefined && !isUuid(input.idempotencyKey)) {
    return { ok: false, reason: 'bad idempotencyKey' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawArgs ?? '');
  } catch {
    return { ok: false, reason: 'args unparseable' };
  }
  if (!isPlainObject(parsed)) return { ok: false, reason: 'args not an object' };
  const argsCanonical = canonicalizeArgs(parsed);
  if (argsCanonical === null) return { ok: false, reason: 'args not canonicalizable' };
  if (argsCanonical.length > 20_000) return { ok: false, reason: 'args too large' };
  const budget: ExecutionBudget = {
    maxAttempts: input.budget?.maxAttempts ?? EXEC_DEFAULT_BUDGET.maxAttempts,
    attemptTimeoutMs: input.budget?.attemptTimeoutMs ?? EXEC_DEFAULT_BUDGET.attemptTimeoutMs,
    maxOutputChars: input.budget?.maxOutputChars ?? EXEC_DEFAULT_BUDGET.maxOutputChars,
  };
  if (!validBudget(budget)) return { ok: false, reason: 'bad budget' };
  // Idempotency continuity: adopt a valid caller-supplied key from args
  // (e.g. the QA tool's idempotencyKey) so the envelope preserves the
  // caller's dedupe identity; otherwise mint a fresh one.
  const keyFromArgs = typeof parsed['idempotencyKey'] === 'string' && isUuid(parsed['idempotencyKey'])
    ? (parsed['idempotencyKey'] as string)
    : null;
  const createdAt = input.nowIso ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) return { ok: false, reason: 'bad createdAt' };
  return {
    ok: true,
    envelope: {
      version: EXEC_ENVELOPE_VERSION,
      idempotencyKey: input.idempotencyKey ?? keyFromArgs ?? randomUuid(),
      tenantId: input.tenantId,
      agentId: input.agentId,
      agentName: input.agentName,
      approvalId: null,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      action: input.action,
      args: parsed,
      argsCanonical,
      budget,
      createdAt,
    },
  };
}

function randomUuid(): string {
  const c: { randomUUID?: () => string } | undefined =
    (globalThis as Record<string, unknown>)['crypto'] as { randomUUID?: () => string } | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  throw new Error('no secure random available for idempotency key');
}

export type ParseEnvelopeResult =
  | { ok: true; envelope: ExecutionEnvelope }
  | { ok: false; reason: string };

/**
 * Validate an envelope read back from storage (proposed_outcome / job record).
 * Rejects wrong versions explicitly — never silently reinterprets.
 */
export function parseExecutionEnvelope(value: unknown): ParseEnvelopeResult {
  if (!isPlainObject(value)) return { ok: false, reason: 'envelope not an object' };
  const e = value as Record<string, unknown>;
  if (e['version'] !== EXEC_ENVELOPE_VERSION) return { ok: false, reason: 'version mismatch' };
  if (!isUuid(e['idempotencyKey'])) return { ok: false, reason: 'bad idempotencyKey' };
  if (e['tenantId'] !== null && !isUuid(e['tenantId'])) return { ok: false, reason: 'bad tenantId' };
  if (!isUuid(e['agentId'])) return { ok: false, reason: 'bad agentId' };
  if (typeof e['agentName'] !== 'string' || (e['agentName'] as string).length === 0) {
    return { ok: false, reason: 'bad agentName' };
  }
  if (e['approvalId'] !== null && e['approvalId'] !== undefined && !isUuid(e['approvalId'])) {
    return { ok: false, reason: 'bad approvalId' };
  }
  if (e['taskId'] !== null && e['taskId'] !== undefined && !isUuid(e['taskId'])) {
    return { ok: false, reason: 'bad taskId' };
  }
  if (e['runId'] !== null && e['runId'] !== undefined && !isUuid(e['runId'])) {
    return { ok: false, reason: 'bad runId' };
  }
  if (typeof e['action'] !== 'string' || !ACTION_RE.test(e['action'])) return { ok: false, reason: 'bad action' };
  if (!isPlainObject(e['args'])) return { ok: false, reason: 'bad args' };
  if (typeof e['argsCanonical'] !== 'string') return { ok: false, reason: 'bad argsCanonical' };
  if (canonicalizeArgs(e['args']) !== e['argsCanonical']) return { ok: false, reason: 'args mismatch' };
  if (!validBudget(e['budget'])) return { ok: false, reason: 'bad budget' };
  if (typeof e['createdAt'] !== 'string' || Number.isNaN(Date.parse(e['createdAt']))) {
    return { ok: false, reason: 'bad createdAt' };
  }
  return { ok: true, envelope: value as unknown as ExecutionEnvelope };
}

export interface BindingCheck {
  tenantId: string | null;
  agentId: string;
  agentName: string;
  action: string;
  argsCanonical: string;
  approvalId: string | null;
}

export type BindingResult = { ok: true } | { ok: false; reason: string };

/**
 * Six-way binding verification: the stored envelope must exactly match the
 * live authorization context. ANY drift aborts — an approved action must never
 * become a reusable token for a different invocation.
 */
export function verifyEnvelopeBinding(envelope: ExecutionEnvelope, live: BindingCheck): BindingResult {
  if (live.tenantId !== envelope.tenantId) return { ok: false, reason: 'tenant changed' };
  if (live.agentId !== envelope.agentId) return { ok: false, reason: 'agent changed' };
  if (live.agentName !== envelope.agentName) return { ok: false, reason: 'agent name changed' };
  if (live.action !== envelope.action) return { ok: false, reason: 'action changed' };
  if (live.argsCanonical !== envelope.argsCanonical) return { ok: false, reason: 'args changed' };
  if (envelope.approvalId !== null && live.approvalId !== envelope.approvalId) {
    return { ok: false, reason: 'approval changed' };
  }
  return { ok: true };
}
